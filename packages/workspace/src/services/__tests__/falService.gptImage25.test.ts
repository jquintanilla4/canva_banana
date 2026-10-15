import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { Tool, type GptImage25Background, type GptImage25Quality } from '../../types';
import { generateImage, generateImageEdit } from '../falService';
import { FAL_IMAGE_MODEL_OPTIONS, GPT_IMAGE_25_MODEL_ID, GPT_IMAGE_25_IMAGE_SIZE_OPTIONS, GPT_IMAGE_25_QUALITY_OPTIONS } from '../modelConfig';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));

const editParams = (referenceCount = 0, tool = Tool.SELECTION) => ({
  prompt: 'Keep the subject',
  image: Object.assign(document.createElement('img'), { width: 1024, height: 1024 }),
  tool,
  paths: [],
  imageDimensions: { width: 1024, height: 1024 },
  referenceImages: Array.from({ length: referenceCount }, () => document.createElement('img')),
});

describe('GPT Image 2.5 Fal requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/input.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy', width: 1024, height: 1024 }] },
      requestId: 'gpt25-request',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });
  afterEach(() => vi.restoreAllMocks());

  it('registers one family picker entry and only valid size presets', () => {
    expect(FAL_IMAGE_MODEL_OPTIONS.filter(option => option.value.includes('gpt-image-2.5'))).toEqual([
      { value: GPT_IMAGE_25_MODEL_ID, label: 'GPT Image 2.5' },
    ]);
    for (const option of GPT_IMAGE_25_IMAGE_SIZE_OPTIONS) {
      if (option.value === 'auto') continue;
      const dimensions = option.label.match(/\((\d+)x(\d+)\)/);
      expect(dimensions).not.toBeNull();
      const [, width, height] = dimensions!.map(Number);
      expect(width % 16 + height % 16).toBe(0);
      expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(3);
      expect(width * height).toBeGreaterThanOrEqual(655360);
      expect(width * height).toBeLessThanOrEqual(8294400);
    }
  });

  it.each([
    ['2688x1152', 2688, 1152],
    ['2016x864', 2016, 864],
    ['1344x576', 1344, 576],
  ] as const)('sends cinematic %s as custom dimensions for both variants and modes', async (imageSize, width, height) => {
    expect(width / height).toBe(21 / 9);
    expect(GPT_IMAGE_25_IMAGE_SIZE_OPTIONS.some(option => option.value === imageSize)).toBe(true);
    for (const gptImage25Variant of ['flare', 'sunburst'] as const) {
      const options = { modelId: GPT_IMAGE_25_MODEL_ID, gptImage25Variant, imageSize };
      await generateImage('A cinematic scene', options);
      await generateImageEdit(editParams(), options);
    }
    expect(fal.subscribe).toHaveBeenCalledTimes(4);
    for (const [, request] of vi.mocked(fal.subscribe).mock.calls) {
      expect(request.input).toHaveProperty('image_size', { width, height });
    }
  });

  it.each(['flare', 'sunburst'] as const)('routes %s generation and editing with every background', async variant => {
    for (const background of ['auto', 'transparent', 'opaque'] as const) {
      const options = { modelId: GPT_IMAGE_25_MODEL_ID, gptImage25Variant: variant, gptImage25Background: background, gptImage25Quality: 'xhigh' as const, imageSize: '2048x2048' as const, numImages: 5 };
      const generated = await generateImage('A transparent subject', options);
      expect(generated.imageBase64).toBe('YmFy');
      const commonInput = { image_size: { width: 2048, height: 2048 }, quality: 'xhigh', background, num_images: 4, output_format: 'png', sync_mode: false };
      expect(fal.subscribe).toHaveBeenLastCalledWith(`openai/gpt-image-2.5/${variant}/text-to-image`, expect.objectContaining({ input: expect.objectContaining(commonInput) }));
      const edited = await generateImageEdit(editParams(2), options);
      expect(edited.imageBase64).toBe('YmFy');
      expect(fal.subscribe).toHaveBeenLastCalledWith(`openai/gpt-image-2.5/${variant}/edit`, expect.objectContaining({ input: expect.objectContaining({ ...commonInput, image_urls: Array(3).fill('https://example.com/input.png') }) }));
    }
  });

  it.each(['text', 'edit'])('defaults %s requests to Sunburst, High, Auto and PNG', async mode => {
    const options = { modelId: GPT_IMAGE_25_MODEL_ID };
    if (mode === 'text') await generateImage('A subject', options);
    else await generateImageEdit(editParams(), options);
    expect(fal.subscribe).toHaveBeenLastCalledWith(`openai/gpt-image-2.5/sunburst/${mode === 'text' ? 'text-to-image' : 'edit'}`, expect.objectContaining({ input: expect.objectContaining({ quality: 'high', background: 'auto', image_size: 'auto', output_format: 'png', sync_mode: false }) }));
  });

  it.each(GPT_IMAGE_25_QUALITY_OPTIONS.map(option => option.value))('passes quality %s to both endpoints', async quality => {
    const options = { modelId: GPT_IMAGE_25_MODEL_ID, gptImage25Quality: quality };
    await generateImage('A subject', options);
    await generateImageEdit(editParams(), options);
    for (const [, request] of vi.mocked(fal.subscribe).mock.calls) expect(request.input).toHaveProperty('quality', quality);
  });

  it('normalizes malformed options and rejects unsupported small sizes', async () => {
    await generateImage('A subject', { modelId: GPT_IMAGE_25_MODEL_ID, gptImage25Quality: 'bad' as GptImage25Quality, gptImage25Background: 'bad' as GptImage25Background, numImages: 0 });
    expect(fal.subscribe).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ input: expect.objectContaining({ quality: 'high', background: 'auto', num_images: 1 }) }));
    vi.mocked(fal.subscribe).mockClear();
    vi.mocked(fal.storage.upload).mockClear();
    await expect(generateImage('A subject', { modelId: GPT_IMAGE_25_MODEL_ID, imageSize: 'square' })).rejects.toThrow('supported GPT Image 2.5 image size');
    await expect(generateImageEdit(editParams(), { modelId: GPT_IMAGE_25_MODEL_ID, imageSize: 'landscape_16_9' })).rejects.toThrow('supported GPT Image 2.5 image size');
    expect(fal.subscribe).not.toHaveBeenCalled();
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it.each([{ tool: Tool.SELECTION, references: 15 }, { tool: Tool.ANNOTATE, references: 14 }])('accepts 16 inputs and rejects 17 for $tool', async ({ tool, references }) => {
    await generateImageEdit(editParams(references, tool), { modelId: GPT_IMAGE_25_MODEL_ID });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toHaveProperty('image_urls', Array(16).fill('https://example.com/input.png'));
    vi.mocked(fal.subscribe).mockClear();
    vi.mocked(fal.storage.upload).mockClear();
    await expect(generateImageEdit(editParams(references + 1, tool), { modelId: GPT_IMAGE_25_MODEL_ID })).rejects.toThrow('16 total input images');
    expect(fal.subscribe).not.toHaveBeenCalled();
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });
});
