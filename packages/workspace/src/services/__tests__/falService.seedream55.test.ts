import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { Tool } from '../../types';
import { generateImage, generateImageEdit, layerizeSeedream55Image } from '../falService';
import { parseSeedream55Layers } from '../fal/seedream55';
import * as snapshotService from '../snapshotService';
import * as responses from '../fal/responses';
import { SEEDREAM_55_MODEL_ID } from '../seedream55Config';
import { resolveSeedream55RunSettings } from '../seedream55RunSettings';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));
const image = document.createElement('img');
Object.defineProperties(image, { naturalWidth: { value: 1024 }, naturalHeight: { value: 768 } });
const edit = { prompt: 'Change the colors', image, tool: Tool.SELECTION, paths: [], imageDimensions: { width: 1024, height: 768 } };
const png = 'data:image/png;base64,cG5n';
const jpeg = 'data:image/jpeg;base64,anBlZw==';
const layers = [
  { image: { url: png }, z_index: 3, bounding_box: { absolute: [10, 20, 110, 220] }, name: 'Top' },
  { image: { url: jpeg }, z_index: 0 },
];
const providerResult = (data: unknown, requestId = 'seedream55') => ({ data, requestId }) as Awaited<ReturnType<typeof fal.subscribe>>;

describe('Seedream 5.5 Fal requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    vi.mocked(fal.storage.upload).mockImplementation(async () => `https://example.com/${vi.mocked(fal.storage.upload).mock.calls.length}.png`);
    vi.mocked(fal.subscribe).mockResolvedValue(providerResult({ images: [{ url: jpeg, content_type: 'image/jpeg' }] }));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('routes aliases to text generation with resolved settings taking precedence', async () => {
    const output = await generateImage('A poster', {
      modelId: `${SEEDREAM_55_MODEL_ID}/layerize`, numImages: 2, imageSize: 'square',
      seedream55RunSettings: resolveSeedream55RunSettings('text_to_image', { imageSizeSelection: 'auto_1.5K', numImages: 6, seedream55Background: 'opaque', seedream55OutputFormat: 'jpeg' }),
    });
    expect(fal.subscribe).toHaveBeenCalledWith(`${SEEDREAM_55_MODEL_ID}/text-to-image`, expect.objectContaining({ input: {
      prompt: 'A poster', num_images: 6, image_size: 'auto_1.5K', background: 'opaque', output_format: 'jpeg', sync_mode: false,
    } }));
    expect(output.imageDataUrls).toEqual([jpeg]);
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it('sends defaults and transparent PNG without legacy Seedream parameters', async () => {
    await generateImage('A cutout', { modelId: SEEDREAM_55_MODEL_ID, seed: 12, seedream55Background: 'transparent', seedream55OutputFormat: 'jpeg' });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toEqual({ prompt: 'A cutout', image_size: 'auto_2K', num_images: 1, background: 'transparent', output_format: 'png', sync_mode: false });
  });

  it('supports ten edit inputs and counts composite annotations as an ordinary input', async () => {
    await generateImageEdit({ ...edit, tool: Tool.ANNOTATE, referenceImages: Array.from({ length: 8 }, () => image) }, { modelId: `${SEEDREAM_55_MODEL_ID}/text-to-image`, imageSize: 'auto_1K', numImages: 99, seedream55OutputFormat: 'jpeg' });
    expect(fal.subscribe).toHaveBeenCalledWith(`${SEEDREAM_55_MODEL_ID}/edit`, expect.objectContaining({ input: {
      prompt: edit.prompt, image_urls: Array.from({ length: 10 }, (_, index) => `https://example.com/${index + 1}.png`),
      image_size: 'auto_1K', num_images: 6, background: 'auto', output_format: 'jpeg', sync_mode: false,
    } }));
    expect(fal.storage.upload).toHaveBeenCalledTimes(10);
  });

  it('rejects excess edit references before uploading', async () => {
    await expect(generateImageEdit({ ...edit, referenceImages: Array.from({ length: 10 }, () => image) }, { modelId: SEEDREAM_55_MODEL_ID })).rejects.toThrow('10 total input');
    await expect(generateImageEdit({ ...edit, tool: Tool.ANNOTATE, referenceImages: Array.from({ length: 9 }, () => image) }, { modelId: SEEDREAM_55_MODEL_ID })).rejects.toThrow('10 total input');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('submits only source and trimmed layer instructions then returns sorted positioned layers', async () => {
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_endpoint, options) => {
      options.onQueueUpdate?.({ status: 'IN_QUEUE', request_id: 'layer-request', queue_position: 2, response_url: '', status_url: '', cancel_url: '' });
      options.onQueueUpdate?.({ status: 'IN_PROGRESS', request_id: 'layer-request', logs: [], response_url: '', status_url: '', cancel_url: '' });
      return providerResult({ layers, images: [{ url: 'ignored gallery image' }] }, 'layer-request');
    });
    const onPhaseUpdate = vi.fn();
    const onQueueUpdate = vi.fn();
    const result = await layerizeSeedream55Image({ image, prompt: '  separate the title  ' }, { jobId: 'layers-job', onPhaseUpdate, onQueueUpdate });
    expect(fal.subscribe).toHaveBeenCalledWith(`${SEEDREAM_55_MODEL_ID}/layerize`, expect.objectContaining({ input: { image_url: 'https://example.com/1.png', prompt: 'separate the title' }, logs: true }));
    expect(result).toEqual({ requestId: 'layer-request', layers: [
      { dataUrl: jpeg, bounds: null }, { dataUrl: png, bounds: { x: 10, y: 20, width: 100, height: 200 }, name: 'Top' },
    ] });
    expect(onQueueUpdate).toHaveBeenCalledTimes(2);
    expect(onPhaseUpdate.mock.calls.map(([update]) => update.phase)).toEqual(expect.arrayContaining(['uploading', 'submitting', 'queued', 'processing', 'downloading']));
    expect(onPhaseUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'downloading', requestId: 'layer-request' }));
  });

  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/heic', 'image/heif'])('uploads original %s bytes without rasterizing', async type => {
    const sourceFile = new File(['original compressed bytes'], 'source', { type });
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers }));
    await layerizeSeedream55Image({ image, sourceFile, prompt: '' });
    expect(fal.storage.upload).toHaveBeenCalledWith(sourceFile);
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it('materializes a retained snapshot file before uploading original bytes', async () => {
    const sourceFile = new File(['snapshot metadata'], 'snapshot.jpg', { type: 'image/jpeg' });
    const materialized = new File(['retained original bytes'], 'snapshot.jpg', { type: 'image/jpeg' });
    const ensureFile = vi.spyOn(snapshotService, 'ensureRealSnapshotFile').mockResolvedValueOnce(materialized);
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers }));
    await layerizeSeedream55Image({ image, sourceFile, prompt: '' });
    expect(ensureFile).toHaveBeenCalledWith(sourceFile);
    expect(fal.storage.upload).toHaveBeenCalledWith(materialized);
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it.each(['image/gif', 'image/svg+xml', 'oversized PNG'])('rasterizes %s through bounded encoding', async input => {
    const sourceFile = new File(['source bytes'], 'source', { type: input === 'oversized PNG' ? 'image/png' : input });
    if (input === 'oversized PNG') Object.defineProperty(sourceFile, 'size', { value: 30_000_001 });
    const largePng = new Blob(['large PNG'], { type: 'image/png' });
    Object.defineProperty(largePng, 'size', { value: 30_000_001 });
    const boundedWebp = new Blob(['bounded image'], { type: 'image/webp' });
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback, type) => callback(type === 'image/webp' ? boundedWebp : largePng));
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers }));
    await layerizeSeedream55Image({ image, sourceFile, prompt: '' });
    expect(fal.storage.upload).toHaveBeenCalledWith(boundedWebp);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.92);
  });

  it('accepts an original at the provider byte limit', async () => {
    const sourceFile = new File(['original'], 'source.png', { type: 'image/png' });
    Object.defineProperty(sourceFile, 'size', { value: 30_000_000 });
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers }));
    await layerizeSeedream55Image({ image, sourceFile, prompt: '' });
    expect(fal.storage.upload).toHaveBeenCalledWith(sourceFile);
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it.each([[256, 256], [6001, 6000], [2049, 128], [128, 2049]])('rejects a %s × %s source before uploading', async (width, height) => {
    const invalidImage = document.createElement('img');
    Object.defineProperties(invalidImage, { naturalWidth: { value: width }, naturalHeight: { value: height } });
    await expect(layerizeSeedream55Image({ image: invalidImage, prompt: '' })).rejects.toThrow('Resize the image');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('bounds layer downloads to three while preserving stacking order', async () => {
    const resolveDownloads: Array<(value: string) => void> = [];
    const download = vi.spyOn(responses, 'extractInlineData').mockImplementation(() => new Promise(resolve => resolveDownloads.push(resolve)));
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers: Array.from({ length: 7 }, (_, index) => ({
      image: { url: `https://example.com/${index}.png` }, z_index: index,
      ...(index ? { bounding_box: { absolute: [index, index, index + 10, index + 20] } } : {}),
    })).reverse() }));
    const pending = layerizeSeedream55Image({ image, prompt: '' });
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    resolveDownloads[1]('second');
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(4));
    resolveDownloads[2]('third');
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(5));
    resolveDownloads[0]('first');
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(6));
    resolveDownloads[3]('fourth');
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(7));
    resolveDownloads[4]('fifth');
    resolveDownloads[5]('sixth');
    resolveDownloads[6]('seventh');
    expect((await pending).layers.map(layer => layer.dataUrl)).toEqual(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh']);
  });

  it('cancels the other layer downloads when one fails', async () => {
    let failDownload: (error: Error) => void = () => { throw new Error('Download has not started'); };
    const download = vi.spyOn(responses, 'extractInlineData')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failDownload = reject; }))
      .mockImplementation((_url, signal) => new Promise(resolve => {
        signal?.addEventListener('abort', () => resolve('download raced with abort'), { once: true });
      }));
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers: [
      { image: { url: jpeg }, z_index: 0 },
      ...[1, 2, 3].map(index => ({ image: { url: png }, z_index: index, bounding_box: { absolute: [0, 0, 10, 10] } })),
    ] }));
    const pending = layerizeSeedream55Image({ image, prompt: '' });
    const rejection = expect(pending).rejects.toMatchObject({ phase: 'downloading', message: 'download failed' });
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(3));
    failDownload(new Error('download failed'));
    await rejection;
    expect(download.mock.calls.slice(1).map(([, signal]) => signal?.aborted)).toEqual([true, true]);
    expect(download).toHaveBeenCalledTimes(3);
  });

  it('omits blank layer instructions and validates every layer before fetching', async () => {
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers: [
      { image: { url: 'https://example.com/base.png' }, z_index: 0 },
      { image: { url: 'https://example.com/layer.png' }, z_index: 1, bounding_box: { absolute: [10, 20, 5, 30] } },
    ] }));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(layerizeSeedream55Image({ image, prompt: '   ' })).rejects.toMatchObject({ phase: 'downloading', requestId: 'seedream55' });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toEqual({ image_url: 'https://example.com/1.png' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {}, { images: [{ url: png }] }, { layers: [] },
    { layers: [{ image: { url: png } }] },
    { layers: [{ image: { url: png }, z_index: 1, bounding_box: { absolute: [0, 0, 5, 5] } }] },
    { layers: [{ image: { url: png }, z_index: 0 }, { image: { url: png }, z_index: 0 }] },
    { layers: [{ image: { url: png }, z_index: 0 }, { url: png, z_index: 1, bounding_box: { absolute: [0, 0, 5, 5] } }] },
    { layers: [{ image: { url: png }, z_index: 0 }, { image: { url: png }, z_index: 1.5, bounding_box: { absolute: [0, 0, 5, 5] } }] },
  ])('rejects malformed provider layers %#', data => {
    expect(() => parseSeedream55Layers(data)).toThrow('Seedream 5.5');
  });

  it('preserves cancellation, upload failures, request failures and download request IDs', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Stopped layers'));
    await expect(layerizeSeedream55Image({ image, prompt: '' }, { abortSignal: controller.signal })).rejects.toThrow('Stopped layers');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    vi.mocked(fal.storage.upload).mockRejectedValueOnce(new Error('upload unavailable'));
    await expect(layerizeSeedream55Image({ image, prompt: '' })).rejects.toMatchObject({ phase: 'uploading' });
    vi.mocked(fal.subscribe).mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(layerizeSeedream55Image({ image, prompt: '' })).rejects.toMatchObject({ phase: 'submitting' });
    vi.mocked(fal.subscribe).mockResolvedValueOnce(providerResult({ layers: [{ image: { url: 'https://example.com/missing' }, z_index: 0 }] }, 'failed-download'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(layerizeSeedream55Image({ image, prompt: '' })).rejects.toMatchObject({ phase: 'downloading', requestId: 'failed-download' });
  });
});
