import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { Tool } from '../../types';
import { generateImage, generateImageEdit } from '../falService';
import { buildAnnotationCanvas } from '../fal/media';
import { GPT_IMAGE_26_MODEL_ID, GPT_IMAGE_26_OUTPUT_MIME_TYPES } from '../gptImage26Config';
import { resolveGptImage26RunSettings } from '../gptImage26RunSettings';
import { extractInlineData } from '../fal/responses';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));
const image = document.createElement('img');
Object.defineProperties(image, { naturalWidth: { value: 1024 }, naturalHeight: { value: 768 } });
const edit = { prompt: 'Use the marked area', image, tool: Tool.ANNOTATE, paths: [{ tool: Tool.BRUSH, color: '#ff0000', size: 5, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }], imageDimensions: { width: 512, height: 384 } };

describe('GPT Image 2.6 Fal requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    vi.mocked(fal.storage.upload).mockImplementation(async () => `https://example.com/${vi.mocked(fal.storage.upload).mock.calls.length}.png`);
    vi.mocked(fal.subscribe).mockResolvedValue({ data: { images: [{ url: 'data:image/svg+xml;base64,PHN2Zy8+', content_type: 'image/svg+xml' }] }, requestId: 'image26' } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('routes text requests through the existing configured SDK with exact effective settings', async () => {
    const settings = resolveGptImage26RunSettings({ kind: 'text_to_image', outputFormat: 'svg', background: 'transparent', reasoningEffort: 'medium', quality: 'max', imageSizeSelection: '2560x1440' });
    const output = await generateImage('An icon', { modelId: `${GPT_IMAGE_26_MODEL_ID}/edit`, gptImage26RunSettings: settings, numImages: 4 });
    expect(fal.subscribe).toHaveBeenCalledWith(`${GPT_IMAGE_26_MODEL_ID}/text-to-image`, expect.objectContaining({ input: { prompt: 'An icon', image_size: { width: 2560, height: 1440 }, quality: 'max', background: 'transparent', reasoning_effort: 'medium', output_format: 'svg', num_images: 1, sync_mode: false } }));
    expect(output.imageDataUrls).toEqual(['data:image/svg+xml;base64,PHN2Zy8+']);
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it.each(['text', 'edit'])('passes genuine GIF MIME and animation settings for %s', async mode => {
    const gif = 'data:image/gif;base64,R0lGODlh';
    vi.mocked(fal.subscribe).mockResolvedValueOnce({ data: { images: [{ url: gif, content_type: 'image/gif' }] }, requestId: 'gif-output' } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
    const options = { modelId: GPT_IMAGE_26_MODEL_ID, gptImage26OutputFormat: 'gif' as const, gptImage26FrameCount: 8, gptImage26FrameDurationMs: 205, numImages: 4 };
    const output = await (mode === 'text' ? generateImage('A loop', options) : generateImageEdit(edit, options));
    expect(output.imageDataUrls).toEqual([gif]);
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toMatchObject({ output_format: 'gif', frame_count: 8, frame_duration_ms: 210, num_images: 4 });
  });

  it('keeps source plus 15 refs in image_urls and submits markup separately', async () => {
    await generateImageEdit({ ...edit, referenceImages: Array.from({ length: 15 }, () => image) }, { modelId: GPT_IMAGE_26_MODEL_ID, gptImage26OutputFormat: 'webp' });
    const input = vi.mocked(fal.subscribe).mock.calls[0][1].input;
    expect(input).toMatchObject({ image_urls: expect.any(Array), markup_image_url: 'https://example.com/2.png', output_format: 'webp', num_images: 1, reasoning_effort: 'high', sync_mode: false });
    expect(input).toHaveProperty('image_urls', expect.arrayContaining(['https://example.com/1.png']));
    if (!input || !('image_urls' in input) || !('markup_image_url' in input)) throw new Error('Missing edit fields');
    expect(input.image_urls).toHaveLength(16);
    expect(input.image_urls).not.toContain(input.markup_image_url);
    expect(input).not.toHaveProperty('mask_image_url');
    expect(fal.storage.upload).toHaveBeenCalledTimes(17);
  });

  it('rejects SVG edits and a 16th ref before upload or provider calls', async () => {
    await expect(generateImageEdit(edit, { modelId: GPT_IMAGE_26_MODEL_ID, gptImage26OutputFormat: 'svg' })).rejects.toThrow('editing supports');
    await expect(generateImageEdit({ ...edit, referenceImages: Array.from({ length: 16 }, () => image) }, { modelId: GPT_IMAGE_26_MODEL_ID })).rejects.toThrow('16 total input');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it.each(['text', 'edit'])('rejects unsupported inline result formats for %s requests', async mode => {
    vi.mocked(fal.subscribe).mockResolvedValueOnce({ data: { images: [{ url: 'data:image/avif;base64,YXZpZg==', content_type: 'image/avif' }] }, requestId: 'unsupported-format' } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
    const request = mode === 'text'
      ? generateImage('A subject', { modelId: GPT_IMAGE_26_MODEL_ID })
      : generateImageEdit(edit, { modelId: GPT_IMAGE_26_MODEL_ID });
    await expect(request).rejects.toMatchObject({ phase: 'downloading', requestId: 'unsupported-format' });
  });

  it('preserves cancellation and phase-aware upload/download failures', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Stopped run'));
    await expect(generateImageEdit(edit, { modelId: GPT_IMAGE_26_MODEL_ID, abortSignal: controller.signal })).rejects.toThrow('Stopped run');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    vi.mocked(fal.storage.upload).mockRejectedValueOnce(new Error('upload unavailable'));
    await expect(generateImageEdit(edit, { modelId: GPT_IMAGE_26_MODEL_ID })).rejects.toMatchObject({ phase: 'uploading' });
    vi.mocked(fal.subscribe).mockResolvedValueOnce({ data: { images: [{ url: 'https://example.com/missing', content_type: 'image/svg+xml' }] }, requestId: 'failed-download' } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(generateImage('A vector', { modelId: GPT_IMAGE_26_MODEL_ID, gptImage26OutputFormat: 'svg' })).rejects.toMatchObject({ phase: 'downloading', requestId: 'failed-download' });
  });

  it('draws transparent markup at source dimensions, scaling path positions and stroke geometry', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const canvas = buildAnnotationCanvas(image, edit.paths, edit.imageDimensions, 'transparent');
    const context = getContext.mock.results[0].value;
    expect([canvas.width, canvas.height]).toEqual([1024, 768]);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.lineWidth).toBe(5);
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(context.lineTo).toHaveBeenCalledWith(30, 40);
    buildAnnotationCanvas(image, edit.paths, edit.imageDimensions);
    expect(getContext.mock.results[1].value.drawImage).toHaveBeenCalledWith(image, 0, 0, 1024, 768);
  });

  it('uses provider SVG MIME only when the download has missing or generic MIME', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { headers: { 'Content-Type': 'application/octet-stream' } })));
    const options = { fallbackContentType: 'image/svg+xml; charset=utf-8', allowedContentTypes: GPT_IMAGE_26_OUTPUT_MIME_TYPES };
    expect(await extractInlineData('https://example.com/out', undefined, options)).toBe('data:image/svg+xml;base64,PHN2Zy8+');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { headers: { 'Content-Type': 'text/html' } })));
    await expect(extractInlineData('https://example.com/out', undefined, options)).rejects.toThrow('unsupported image format');
  });
});
