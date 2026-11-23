import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_AUTH_TOKEN_HEADER } from '../secureBackendService';
import { TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL } from '../tokenHubNanoBananaConfig';
import { resolveTokenHubNanoBananaRunSettings } from '../tokenHubNanoBananaRunSettings';
import { generateTokenHubNanoBanana } from '../tokenHubNanoBananaService';
import { beginWorkspaceSession } from '../workspaceSession';

const imageResponse = (index: number) => Response.json({
  data: [{ b64_json: `jpeg-${index}`, revised_prompt: `Prompt ${index}` }], request_id: `request-${index}`,
});

describe('TokenHub NanoBanana text generation batches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.canvaBananaDesktop;
  });

  it.each([1, 2, 3, 4])('requests exactly %i JPEG images using independent n:1 requests', async numImages => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({ isDesktop: true, secureBackendApiBaseUrl: 'http://localhost:9876', secureBackendAuthToken: 'desktop-secret' }),
    };
    let nextIndex = 0;
    const fetch = vi.fn<typeof global.fetch>().mockImplementation(async () => imageResponse(nextIndex++));
    vi.stubGlobal('fetch', fetch);
    const result = await generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({
        kind: 'text_to_image', numImages, aspectRatioSelection: '8:1', resolution: '4K', thinkingLevel: 'high', webSearch: true,
      }),
    });

    expect(fetch).toHaveBeenCalledTimes(numImages);
    for (const [url, request] of fetch.mock.calls) {
      expect(url).toBe('http://localhost:9876/api/tokenhub/images/generations');
      expect(request?.method).toBe('POST');
      expect(request?.headers).toEqual({ 'Content-Type': 'application/json', [DESKTOP_AUTH_TOKEN_HEADER]: 'desktop-secret' });
      if (typeof request?.body !== 'string') throw new Error('Missing generation JSON');
      expect(JSON.parse(request.body)).toEqual({
        model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, prompt: 'A poster', n: 1,
        aspect_ratio: '8:1', resolution: '4K', thinking_level: 'high',
      });
    }
    expect(result).toEqual({
      imageBase64: 'jpeg-0', imagesBase64: Array.from({ length: numImages }, (_, index) => `jpeg-${index}`),
      imageDataUrls: Array.from({ length: numImages }, (_, index) => `data:image/jpeg;base64,jpeg-${index}`),
      text: 'Prompt 0', requestId: 'request-0',
    });
  });

  it('limits concurrency to two, preserves slot order, and reports only batch phases', async () => {
    const pending = new Map<number, (response: Response) => void>();
    const fetch = vi.fn<typeof global.fetch>().mockImplementation(() => new Promise(resolve => {
      pending.set(pending.size, resolve);
    }));
    vi.stubGlobal('fetch', fetch);
    const onPhaseUpdate = vi.fn();
    const batch = generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', numImages: 4 }), onPhaseUpdate,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onPhaseUpdate.mock.calls).toEqual([[{
      phase: 'submitting', message: 'Generating 4 images with TokenHub; this can take a minute or more...',
    }]]);
    pending.get(1)?.(imageResponse(1));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    pending.get(2)?.(imageResponse(2));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    pending.get(3)?.(imageResponse(3));
    pending.get(0)?.(imageResponse(0));

    expect((await batch).imagesBase64).toEqual(['jpeg-0', 'jpeg-1', 'jpeg-2', 'jpeg-3']);
    expect(onPhaseUpdate).toHaveBeenCalledTimes(2);
    expect(onPhaseUpdate).toHaveBeenLastCalledWith({ phase: 'completed', message: '4 of 4 images ready', requestId: 'request-0' });
  });

  it('keeps valid sibling images after malformed and failed requests without retrying', async () => {
    const fetch = vi.fn<typeof global.fetch>()
      .mockResolvedValueOnce(Response.json({ data: [{ b64_json: 'jpeg-0' }, { b64_json: 'jpeg-1' }], request_id: 'request-0' }))
      .mockResolvedValueOnce(Response.json({ data: [{ url: 'https://example.com/image.jpg' }] }))
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(imageResponse(3));
    vi.stubGlobal('fetch', fetch);
    const onPhaseUpdate = vi.fn();
    const result = await generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', numImages: 4 }), onPhaseUpdate,
    });

    expect(result.imagesBase64).toEqual(['jpeg-0', 'jpeg-1', 'jpeg-3']);
    expect(result.imageDataUrls).toEqual(['data:image/jpeg;base64,jpeg-0', 'data:image/jpeg;base64,jpeg-1', 'data:image/jpeg;base64,jpeg-3']);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(onPhaseUpdate).toHaveBeenCalledTimes(2);
    expect(onPhaseUpdate).toHaveBeenLastCalledWith({ phase: 'completed', message: '3 of 4 images ready', requestId: 'request-0' });
  });

  it('propagates the first useful request error when every image fails', async () => {
    const fetch = vi.fn<typeof global.fetch>()
      .mockResolvedValueOnce(Response.json({ detail: 'TokenHub is busy', error: { requestID: 'gateway-first' } }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockRejectedValueOnce(new TypeError('Network unavailable'));
    vi.stubGlobal('fetch', fetch);
    const onPhaseUpdate = vi.fn();

    await expect(generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', numImages: 3 }), onPhaseUpdate,
    })).rejects.toMatchObject({ name: 'TokenHubImageRequestError', message: 'HTTP 429: TokenHub is busy', requestId: 'gateway-first' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onPhaseUpdate).toHaveBeenCalledTimes(1);
  });

  it.each(['caller', 'workspace'] as const)('aborts active and queued requests when the %s is cancelled', async cancellation => {
    const controller = new AbortController();
    const closeWorkspace = beginWorkspaceSession();
    const fetch = vi.fn<typeof global.fetch>().mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      const signal = request?.signal;
      if (!signal) throw new Error('Missing abort signal');
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetch);
    const onPhaseUpdate = vi.fn();
    const batch = generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', numImages: 4 }),
      abortSignal: controller.signal, onPhaseUpdate,
    });
    const rejected = expect(batch).rejects.toMatchObject({ name: 'AbortError' });
    try {
      expect(fetch).toHaveBeenCalledTimes(2);
      if (cancellation === 'caller') controller.abort();
      else closeWorkspace();
      await rejected;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls.every(([, request]) => request?.signal?.aborted)).toBe(true);
      expect(onPhaseUpdate).toHaveBeenCalledTimes(1);
    } finally {
      closeWorkspace();
    }
  });

  it('does not start requests or report submission for a pre-aborted batch', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<typeof global.fetch>();
    vi.stubGlobal('fetch', fetch);
    const onPhaseUpdate = vi.fn();

    await expect(generateTokenHubNanoBanana('A poster', {
      settings: resolveTokenHubNanoBananaRunSettings({ kind: 'text_to_image', numImages: 4 }),
      abortSignal: controller.signal, onPhaseUpdate,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
    expect(onPhaseUpdate).not.toHaveBeenCalled();
  });
});
