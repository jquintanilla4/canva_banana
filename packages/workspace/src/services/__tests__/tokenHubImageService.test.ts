import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tool } from '../../types';
import type { GenerateImageEditParams } from '../fal/types';
import { DESKTOP_AUTH_TOKEN_HEADER } from '../secureBackendService';
import { resolveTokenHubGptImage25RunSettings } from '../tokenHubGptImage25RunSettings';
import { generateTokenHubImage, generateTokenHubImageEdit } from '../tokenHubImageService';
import { buildAnnotationCanvas } from '../fal/media';
import { TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL } from '../tokenHubNanoBananaConfig';
import { resolveTokenHubNanoBananaRunSettings } from '../tokenHubNanoBananaRunSettings';
import { generateTokenHubNanoBanana, generateTokenHubNanoBananaEdit } from '../tokenHubNanoBananaService';

vi.mock('../fal/media', () => ({
  imageToCanvas: vi.fn((image: HTMLImageElement) => ({
    toDataURL: () => `data:image/png;base64,${image.id}`,
  })),
  buildAnnotationCanvas: vi.fn(() => ({
    toDataURL: () => 'data:image/png;base64,bWFya3Vw',
  })),
}));

const originalFetch = global.fetch;
const response = (body: unknown, ok = true, status = 200): Response => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

describe('tokenHubImageService', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    delete window.canvaBananaDesktop;
    vi.clearAllMocks();
  });

  it('posts OpenAI generation fields to the secure TokenHub route and normalizes base64 images', async () => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({ isDesktop: true, secureBackendApiBaseUrl: 'http://localhost:9876', secureBackendAuthToken: 'desktop-secret' }),
    };
    global.fetch = vi.fn().mockResolvedValue(response({
      data: [{ b64_json: 'Zmlyc3Q=', revised_prompt: 'Revised' }, { b64_json: 'c2Vjb25k' }],
      request_id: 'request-1',
    }));
    const onPhaseUpdate = vi.fn();
    const result = await generateTokenHubImage('A poster', {
      settings: resolveTokenHubGptImage25RunSettings({
        kind: 'text_to_image', variant: 'flare', imageSizeSelection: 'landscape_4_3', quality: 'max', background: 'transparent', numImages: 2,
      }),
      onPhaseUpdate,
    });
    expect(onPhaseUpdate).toHaveBeenNthCalledWith(1, {
      phase: 'submitting', message: 'Generating with TokenHub; this can take a minute or more...',
    });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:9876/api/tokenhub/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [DESKTOP_AUTH_TOKEN_HEADER]: 'desktop-secret' },
      body: JSON.stringify({
        prompt: 'A poster', model: 'og-image-2-5-flare-standard', size: '1024x768', quality: 'max', background: 'transparent', n: 2, output_format: 'png',
      }),
      signal: undefined,
    });
    expect(result).toEqual({
      imageBase64: 'Zmlyc3Q=', imagesBase64: ['Zmlyc3Q=', 'c2Vjb25k'],
      imageDataUrls: ['data:image/png;base64,Zmlyc3Q=', 'data:image/png;base64,c2Vjb25k'],
      text: 'Revised', requestId: 'request-1',
    });
  });

  it('posts source and references as images with annotation markup as a separate field', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ b64_json: 'ZWRpdA==' }] }));
    const params = {
      prompt: 'Apply the marked edit',
      image: { id: 'c291cmNl' } as unknown as HTMLImageElement,
      tool: Tool.ANNOTATE,
      paths: [],
      imageDimensions: { width: 64, height: 64 },
      referenceImages: [{ id: 'cmVmZXJlbmNl' } as unknown as HTMLImageElement],
    } as GenerateImageEditParams;
    await generateTokenHubImageEdit(params, {
      settings: resolveTokenHubGptImage25RunSettings({ kind: 'image_edit', variant: 'sunburst' }),
    });
    const request = vi.mocked(global.fetch).mock.calls[0];
    expect(request?.[0]).toBe('http://localhost:8787/api/tokenhub/images/edits');
    expect(JSON.parse(request?.[1]?.body as string)).toEqual({
      prompt: 'Apply the marked edit',
      images: ['data:image/png;base64,c291cmNl', 'data:image/png;base64,cmVmZXJlbmNl'],
      markup: 'data:image/png;base64,bWFya3Vw',
      model: 'og-image-2-5-sunburst-standard', size: 'auto', quality: 'high', background: 'auto', n: 1, output_format: 'png',
    });
  });

  it('omits markup for selection edits and surfaces backend errors', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ detail: 'TOKENHUB_API_KEY must be set.' }, false, 503));
    const params = {
      prompt: 'Edit', image: { id: 'c291cmNl' } as unknown as HTMLImageElement,
      tool: Tool.SELECTION, paths: [], imageDimensions: { width: 64, height: 64 },
    } as GenerateImageEditParams;
    await expect(generateTokenHubImageEdit(params, {
      settings: resolveTokenHubGptImage25RunSettings({ kind: 'image_edit' }),
    })).rejects.toThrow('TOKENHUB_API_KEY must be set.');
    expect(JSON.parse(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body as string)).not.toHaveProperty('markup');
  });

  it('rejects empty and URL-only responses', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ url: 'https://example.com/image.png' }] }));
    await expect(generateTokenHubImage('A poster', {
      settings: resolveTokenHubGptImage25RunSettings({ kind: 'text_to_image' }),
    })).rejects.toThrow('TokenHub returned no base64 image data.');
  });

  it('preserves the gateway request ID on failed generations', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({
      detail: 'TokenHub is busy', error: { requestID: 'gateway-123' },
    }, false, 429));
    await expect(generateTokenHubImage('A poster', {
      settings: resolveTokenHubGptImage25RunSettings({ kind: 'text_to_image' }),
    })).rejects.toMatchObject({ message: 'HTTP 429: TokenHub is busy', requestId: 'gateway-123' });
  });

  it.each(['Bad Gateway', ''])('shows the HTTP status and TokenHub message for a Nano Banana gateway failure (%j)', async statusText => {
    global.fetch = vi.fn().mockResolvedValue(Response.json({
      detail: 'openai_error', error: { requestID: 'gateway-502' },
    }, { status: 502, statusText }));

    await expect(generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image' }),
    })).rejects.toMatchObject({ message: 'HTTP 502 Bad Gateway: openai_error', requestId: 'gateway-502' });
  });

  it.each([null, { data: [null] }, { data: {} }])('surfaces a concise error for malformed TokenHub success JSON', async body => {
    global.fetch = vi.fn().mockResolvedValue(response(body));
    await expect(generateTokenHubImage('A poster', {
      settings: resolveTokenHubGptImage25RunSettings({ kind: 'text_to_image' }),
    })).rejects.toThrow('TokenHub returned no base64 image data.');
  });

  it('preserves the Nano Banana text generation JPEG and only sends the supported fields', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ b64_json: '/9j/2Q==' }], request_id: 'nano-chat' }));
    const result = await generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', aspectRatioSelection: '16:9', resolution: '2K', webSearch: true }),
    });
    expect(result.imageDataUrls).toEqual(['data:image/jpeg;base64,/9j/2Q==']);
    expect(result.requestId).toBe('nano-chat');
    const [url, request] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('http://localhost:8787/api/tokenhub/images/generations');
    if (typeof request?.body !== 'string') throw new Error('Missing Nano Banana generation JSON');
    expect(JSON.parse(request.body)).toEqual({ model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'A poster', n: 1, thinking_level: 'medium', aspect_ratio: '16:9', resolution: '2K' });
  });

  it.each([undefined, 'default', 'auto'])('omits the Nano Banana text generation ratio for Auto (%s)', async aspectRatioSelection => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ b64_json: '/9j/2Q==' }] }));
    await generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', aspectRatioSelection }),
    });
    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    if (typeof request?.body !== 'string') throw new Error('Missing Nano Banana generation JSON');
    expect(JSON.parse(request.body)).toEqual({ model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'A poster', n: 1, thinking_level: 'medium' });
  });

  it.each([
    { resolution: '1K', aspectRatioSelection: '16:9', expected: { aspect_ratio: '16:9' } },
    { resolution: '2K', expected: { resolution: '2K' } },
    { resolution: '4K', expected: { resolution: '4K' } },
    { resolution: '4K', aspectRatioSelection: '8:1', expected: { aspect_ratio: '8:1', resolution: '4K' } },
  ])('sends independently selected Nano Banana text generation options ($resolution, $aspectRatioSelection)', async ({ resolution, aspectRatioSelection, expected }) => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ b64_json: '/9j/2Q==' }] }));
    await generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', aspectRatioSelection, resolution }),
    });
    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    if (typeof request?.body !== 'string') throw new Error('Missing Nano Banana generation JSON');
    expect(JSON.parse(request.body)).toEqual({ model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'A poster', n: 1, thinking_level: 'medium', ...expected });
  });

  it.each(['minimal', 'medium', 'high'])('sends the resolved Nano Banana text generation thinking level (%s)', async thinkingLevel => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ b64_json: '/9j/2Q==' }] }));
    await generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', thinkingLevel, webSearch: true, numImages: 4 }),
    });
    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    if (typeof request?.body !== 'string') throw new Error('Missing Nano Banana generation JSON');
    expect(JSON.parse(request.body)).toEqual({
      model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'A poster', n: 1, thinking_level: thinkingLevel,
    });
  });

  it('sends Nano edit references, the annotated composite, and the source in fal Nano order', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ data: [{ b64_json: '/9j/2Q==' }] }));
    const image = document.createElement('img');
    image.id = 'c291cmNl';
    const firstReference = document.createElement('img');
    firstReference.id = 'Zmlyc3Q=';
    const secondReference = document.createElement('img');
    secondReference.id = 'c2Vjb25k';
    const params = {
      prompt: 'Apply the marked edit', image, tool: Tool.ANNOTATE, paths: [],
      imageDimensions: { width: 64, height: 64 }, referenceImages: [firstReference, secondReference],
    } satisfies GenerateImageEditParams;
    const abort = new AbortController();
    const result = await generateTokenHubNanoBananaEdit(params, {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'image_edit', aspectRatioSelection: '4:1', numImages: 2 }),
      abortSignal: abort.signal,
    });
    expect(buildAnnotationCanvas).toHaveBeenCalledWith(image, [], params.imageDimensions, 'composite');
    const [url, request] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('http://localhost:8787/api/tokenhub/images/edits');
    expect(request?.signal).toBe(abort.signal);
    if (typeof request?.body !== 'string') throw new Error('Missing TokenHub edit JSON');
    expect(JSON.parse(request.body)).toEqual({
      prompt: 'Apply the marked edit', model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
      images: ['c2Vjb25k', 'Zmlyc3Q=', 'bWFya3Vw', 'c291cmNl'].map(bytes => `data:image/png;base64,${bytes}`),
      aspect_ratio: '4:1', thinking_level: 'medium', n: 2,
    });
    expect(result.imageDataUrls).toEqual(['data:image/jpeg;base64,/9j/2Q==']);
  });
});
