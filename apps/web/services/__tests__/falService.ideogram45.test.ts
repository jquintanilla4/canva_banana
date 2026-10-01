import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { Tool, type Ideogram45Quality } from '../../types';
import { generateImage, generateImageEdit } from '../falService';
import { FAL_IMAGE_MODEL_OPTIONS, getFalNumImageMaxForModel, getFalNumImageOptionsForModel, getMaxReferenceImages, normalizeFalModelId } from '../modelConfig';
import { IDEOGRAM_45_MODEL_ID, IDEOGRAM_45_EDIT_MODEL_ID, IDEOGRAM_45_IMAGE_SIZE_OPTIONS } from '../ideogram45Config';
import type { Ideogram45EditRequest, Ideogram45TextRequest } from '../fal/ideogram45';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));

const editParams = (referenceCount = 0, tool = Tool.SELECTION) => ({
  prompt: 'Keep the subject and change the sign',
  image: Object.assign(document.createElement('img'), { width: 1024, height: 1024 }),
  tool,
  paths: [],
  imageDimensions: { width: 1024, height: 1024 },
  referenceImages: Array.from({ length: referenceCount }, () => document.createElement('img')),
});

describe('Ideogram 4.5 Fal requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/input.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy', width: 1024, height: 1024 }], seed: 123456 },
      requestId: 'ideogram-request',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });
  afterEach(() => vi.restoreAllMocks());

  it('declares endpoint-specific quality and source-image contracts', () => {
    expectTypeOf<Ideogram45TextRequest['quality']>().toEqualTypeOf<'low' | 'medium' | 'high'>();
    expectTypeOf<Ideogram45EditRequest['quality']>().toEqualTypeOf<Ideogram45Quality>();
    expectTypeOf<Ideogram45EditRequest['image_url']>().toEqualTypeOf<string>();
    expectTypeOf<Ideogram45EditRequest['edit_precision']>().toEqualTypeOf<'regular' | 'high'>();
    expectTypeOf<Ideogram45TextRequest['sync_mode']>().toEqualTypeOf<false>();
  });

  it('registers one entry with eight outputs and four references', () => {
    expect(FAL_IMAGE_MODEL_OPTIONS.filter(option => option.value.startsWith('ideogram/'))).toEqual([
      { value: IDEOGRAM_45_MODEL_ID, label: 'Ideogram 4.5' },
    ]);
    expect(normalizeFalModelId(IDEOGRAM_45_EDIT_MODEL_ID)).toBe(IDEOGRAM_45_MODEL_ID);
    expect(getFalNumImageMaxForModel(IDEOGRAM_45_MODEL_ID)).toBe(8);
    expect(getFalNumImageOptionsForModel(IDEOGRAM_45_EDIT_MODEL_ID)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(getMaxReferenceImages(IDEOGRAM_45_MODEL_ID)).toBe(4);
  });

  it.each([IDEOGRAM_45_MODEL_ID, IDEOGRAM_45_EDIT_MODEL_ID])('routes generation and editing from %s with documented defaults', async modelId => {
    const generated = await generateImage('A sign reading hello', { modelId, numImages: 9 });
    expect(generated).toMatchObject({ imageBase64: 'YmFy', imagesBase64: ['YmFy'], requestId: 'ideogram-request', imagesMetadata: [{ width: 1024, height: 1024 }] });
    expect(fal.subscribe).toHaveBeenLastCalledWith(IDEOGRAM_45_MODEL_ID, expect.objectContaining({
      input: { prompt: 'A sign reading hello', image_size: 'square_hd', quality: 'medium', num_images: 8, enable_prompt_expansion: true, sync_mode: false },
    }));
    await generateImageEdit(editParams(2), { modelId, numImages: 8 });
    expect(fal.subscribe).toHaveBeenLastCalledWith(IDEOGRAM_45_EDIT_MODEL_ID, expect.objectContaining({
      input: {
        prompt: editParams().prompt, image_url: 'https://example.com/input.png',
        reference_image_urls: Array(2).fill('https://example.com/input.png'),
        image_size: 'auto', quality: 'medium', edit_precision: 'regular', num_images: 8, sync_mode: false,
      },
    }));
  });

  it.each(['low', 'medium', 'high'] as const)('passes %s quality to generation and both edit precisions', async quality => {
    await generateImage('A subject', { modelId: IDEOGRAM_45_MODEL_ID, ideogram45Quality: quality });
    for (const precision of ['regular', 'high'] as const) {
      await generateImageEdit(editParams(), { modelId: IDEOGRAM_45_MODEL_ID, ideogram45Quality: quality, ideogram45EditPrecision: precision });
      expect(fal.subscribe).toHaveBeenLastCalledWith(IDEOGRAM_45_EDIT_MODEL_ID, expect.objectContaining({ input: expect.objectContaining({ quality, edit_precision: precision }) }));
    }
    for (const [, request] of vi.mocked(fal.subscribe).mock.calls) expect(request.input).toHaveProperty('quality', quality);
  });

  it.each([Tool.SELECTION, Tool.ANNOTATE])('keeps source and reference roles distinct for %s', async tool => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/source.png')
      .mockResolvedValueOnce('https://example.com/first-reference.png')
      .mockResolvedValueOnce('https://example.com/second-reference.png');
    await generateImageEdit(editParams(tool === Tool.ANNOTATE ? 1 : 2, tool), {
      modelId: IDEOGRAM_45_MODEL_ID, ideogram45Quality: 'very_low', ideogram45EditPrecision: 'regular', numImages: 2,
    });
    expect(fal.subscribe).toHaveBeenLastCalledWith(IDEOGRAM_45_EDIT_MODEL_ID, expect.objectContaining({
      input: {
        prompt: editParams().prompt, image_url: 'https://example.com/source.png',
        reference_image_urls: ['https://example.com/first-reference.png', 'https://example.com/second-reference.png'],
        image_size: 'auto', quality: 'very_low', edit_precision: 'regular', num_images: 2, sync_mode: false,
      },
    }));
  });

  it('only allows Very Low quality for regular edits and omits reference fields when empty', async () => {
    const options = { modelId: IDEOGRAM_45_MODEL_ID, ideogram45Quality: 'very_low' as const };
    await generateImage('A subject', options);
    expect(vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input).toHaveProperty('quality', 'medium');
    await generateImageEdit(editParams(), options);
    const regular = vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input;
    expect(regular).toHaveProperty('quality', 'very_low');
    expect(regular).not.toHaveProperty('reference_image_urls');
    await generateImageEdit(editParams(), { ...options, ideogram45EditPrecision: 'high' });
    expect(vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input).toHaveProperty('quality', 'medium');
    await generateImage('A subject', { modelId: IDEOGRAM_45_MODEL_ID, ideogram45Quality: 'bad' as Ideogram45Quality, numImages: 0, seed: 42 });
    expect(vi.mocked(fal.subscribe).mock.calls.at(-1)?.[1].input).toMatchObject({ quality: 'medium', num_images: 1, seed: 42 });
  });

  it.each(IDEOGRAM_45_IMAGE_SIZE_OPTIONS.map(option => option.value))('supports %s and preserves source size for precise edits', async imageSize => {
    const options = { modelId: IDEOGRAM_45_MODEL_ID, imageSize };
    await generateImage('A subject', options);
    await generateImageEdit(editParams(), options);
    const explicit = imageSize.match(/^(\d+)x(\d+)$/);
    const expected = explicit ? { width: Number(explicit[1]), height: Number(explicit[2]) } : imageSize;
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toHaveProperty('image_size', imageSize === 'auto' ? 'square_hd' : expected);
    expect(vi.mocked(fal.subscribe).mock.calls[1][1].input).toHaveProperty('image_size', expected);
    await generateImageEdit(editParams(), { ...options, ideogram45EditPrecision: 'high' });
    expect(vi.mocked(fal.subscribe).mock.calls[2][1].input).toHaveProperty('image_size', 'auto');
  });

  it.each([{ tool: Tool.SELECTION, references: 4 }, { tool: Tool.ANNOTATE, references: 3 }])('enforces reference limits before uploading for $tool', async ({ tool, references }) => {
    await generateImageEdit(editParams(references, tool), { modelId: IDEOGRAM_45_MODEL_ID });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toHaveProperty('reference_image_urls', Array(4).fill('https://example.com/input.png'));
    vi.mocked(fal.subscribe).mockClear();
    vi.mocked(fal.storage.upload).mockClear();
    await expect(generateImageEdit(editParams(references + 1, tool), { modelId: IDEOGRAM_45_MODEL_ID })).rejects.toThrow('4 reference images');
    await expect(generateImageEdit(editParams(), { modelId: IDEOGRAM_45_MODEL_ID, imageSize: '2048x1152' })).rejects.toThrow('supported Ideogram 4.5 image size');
    await expect(generateImage('A subject', { modelId: IDEOGRAM_45_MODEL_ID, imageSize: 'auto_2K' })).rejects.toThrow('supported Ideogram 4.5 image size');
    expect(fal.subscribe).not.toHaveBeenCalled();
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });
});
