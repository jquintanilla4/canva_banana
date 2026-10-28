import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { Tool } from '../../types';
import { generateImage, generateImageEdit } from '../falService';
import { FAL_IMAGE_MODEL_OPTIONS, normalizeFalModelId } from '../modelConfig';
import { KREA_3_MODEL_ID } from '../krea3Config';
import { resolveKrea3RunSettings } from '../krea3RunSettings';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));

const editParams = (referenceCount = 0, tool = Tool.SELECTION) => ({
  prompt: 'Keep the subject', image: Object.assign(document.createElement('img'), { width: 640, height: 480 }),
  tool, paths: [], imageDimensions: { width: 640, height: 480 },
  referenceImages: Array.from({ length: referenceCount }, () => document.createElement('img')),
});

describe('Krea 3 Fal requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    vi.mocked(fal.storage.upload).mockImplementation(async () => `https://example.com/input-${vi.mocked(fal.storage.upload).mock.calls.length}.png`);
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy', width: 640, height: 480 }] }, requestId: 'krea3-request',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });
  afterEach(() => vi.restoreAllMocks());

  it('exposes one model and normalizes both endpoints', () => {
    expect(FAL_IMAGE_MODEL_OPTIONS.filter(option => option.value.startsWith('krea/'))).toEqual([{ value: KREA_3_MODEL_ID, label: 'Krea 3' }]);
    for (const modelId of [KREA_3_MODEL_ID, 'krea/v3/text-to-image', 'krea/v3/edit']) {
      expect(normalizeFalModelId(modelId)).toBe(KREA_3_MODEL_ID);
    }
  });

  it.each([KREA_3_MODEL_ID, 'krea/v3/edit', 'krea/v3/text-to-image'])('routes %s to the requested operation with schema defaults', async modelId => {
    const options = { modelId, numImages: 4 };
    expect((await generateImage('A fox', options)).imageBase64).toBe('YmFy');
    expect(fal.subscribe).toHaveBeenLastCalledWith('krea/v3/text-to-image', expect.objectContaining({ input: {
      prompt: 'A fox', model: 'berry', reasoning_level: 'medium', image_size: 'auto', sync_mode: false, output_format: 'png',
    } }));
    expect((await generateImageEdit(editParams(2), options)).imageBase64).toBe('YmFy');
    expect(fal.subscribe).toHaveBeenLastCalledWith('krea/v3/edit', expect.objectContaining({ input: {
      prompt: 'Keep the subject', model: 'berry', reasoning_level: 'medium', image_size: 'auto', sync_mode: false, output_format: 'png',
      image_urls: ['https://example.com/input-1.png', 'https://example.com/input-2.png', 'https://example.com/input-3.png'],
    } }));
  });

  it('preserves non-default options and uses edit-only reasoning only for edits', async () => {
    const options = { modelId: KREA_3_MODEL_ID, krea3Variant: 'jam' as const, krea3ReasoningLevel: 'high' as const, imageSize: 'portrait_16_9' as const };
    await generateImage('A fox', options);
    expect(vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input).toMatchObject({ model: 'jam', reasoning_level: 'medium', image_size: 'portrait_16_9' });
    await generateImageEdit(editParams(), options);
    expect(vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input).toMatchObject({ model: 'jam', reasoning_level: 'high', image_size: 'portrait_16_9' });
    await generateImageEdit(editParams(), { ...options, krea3ReasoningLevel: 'ultra' });
    const ultraInput = vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input;
    expect(ultraInput).toHaveProperty('reasoning_level', 'ultra');
    expect(ultraInput).not.toHaveProperty('image_size');
  });

  it('uses resolved settings instead of conflicting raw options in both modes', async () => {
    const options = { modelId: KREA_3_MODEL_ID, krea3Variant: 'berry' as const, imageSize: 'square' as const };
    await generateImage('A fox', { ...options, krea3RunSettings: resolveKrea3RunSettings({ kind: 'text_to_image', variant: 'jam', reasoningLevel: 'low', imageSizeSelection: 'landscape_4_3' }) });
    await generateImageEdit(editParams(), { ...options, krea3RunSettings: resolveKrea3RunSettings({ kind: 'image_edit', variant: 'jam', reasoningLevel: 'low', imageSizeSelection: 'landscape_4_3' }) });
    for (const [, request] of vi.mocked(fal.subscribe).mock.calls) expect(request.input).toMatchObject({ model: 'jam', reasoning_level: 'low', image_size: 'landscape_4_3' });
  });

  it.each([{ tool: Tool.SELECTION, references: 7 }, { tool: Tool.ANNOTATE, references: 6 }])('accepts eight images and rejects nine before uploads for $tool', async ({ tool, references }) => {
    await generateImageEdit(editParams(references, tool), { modelId: KREA_3_MODEL_ID });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toHaveProperty('image_urls', Array.from({ length: 8 }, (_, index) => `https://example.com/input-${index + 1}.png`));
    vi.mocked(fal.subscribe).mockClear();
    vi.mocked(fal.storage.upload).mockClear();
    await expect(generateImageEdit(editParams(references + 1, tool), { modelId: KREA_3_MODEL_ID })).rejects.toThrow('8 total input images');
    expect(fal.subscribe).not.toHaveBeenCalled();
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });
});
