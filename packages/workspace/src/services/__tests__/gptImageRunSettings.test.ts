import { describe, expect, expectTypeOf, it } from 'vitest';
import { resolveGptImage2RunSettings, serializeGptImage2GenerationOptions } from '../gptImage2RunSettings';
import { resolveGptImage25RunSettings, serializeGptImage25GenerationOptions } from '../gptImage25RunSettings';
import { GPT_IMAGE_2_IMAGE_SIZE_OPTIONS, GPT_IMAGE_2_QUALITY_OPTIONS, GPT_IMAGE_2_EDIT_MODEL_ID, GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID } from '../gptImage2Config';
import { GPT_IMAGE_25_IMAGE_SIZE_OPTIONS, GPT_IMAGE_25_QUALITY_OPTIONS, getGptImage25Endpoint } from '../gptImage25Config';
import { serializeGptImage2Input, serializeGptImage25Input } from '../fal/gptImage';

describe('GPT image run settings', () => {
  it('keeps text and edit settings distinct in the types', () => {
    const text = resolveGptImage2RunSettings({ kind: 'text_to_image' });
    const edit = resolveGptImage2RunSettings({ kind: 'image_edit' });
    expectTypeOf(text.kind).toEqualTypeOf<'text_to_image'>();
    expectTypeOf(text.endpoint).toEqualTypeOf<typeof GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID>();
    expectTypeOf(edit.endpoint).toEqualTypeOf<typeof GPT_IMAGE_2_EDIT_MODEL_ID>();
    expectTypeOf(resolveGptImage25RunSettings({ kind: 'image_edit' }).kind).toEqualTypeOf<'image_edit'>();
  });

  it.each(GPT_IMAGE_2_QUALITY_OPTIONS)('preserves GPT Image 2 $value quality for both modes', ({ value }) => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      const settings = resolveGptImage2RunSettings({ kind, quality: value, numImages: 9 });
      expect(settings).toMatchObject({ kind, quality: value, imageSizeSelection: 'auto', numImages: 4 });
      expect(serializeGptImage2Input(settings)).toEqual({ image_size: 'auto', quality: value, num_images: 4, sync_mode: false, output_format: 'png' });
      expect(serializeGptImage2GenerationOptions(settings)).toEqual({ gptImage2Quality: value, imageSizeSelection: 'auto', numImages: 4 });
    }
  });

  it.each(GPT_IMAGE_25_QUALITY_OPTIONS)('preserves GPT Image 2.5 $value quality for all variants, backgrounds, and modes', ({ value }) => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      for (const variant of ['flare', 'sunburst'] as const) {
        for (const background of ['auto', 'transparent', 'opaque'] as const) {
          const settings = resolveGptImage25RunSettings({ kind, quality: value, variant, background, numImages: 3 });
          expect(settings.endpoint).toBe(getGptImage25Endpoint(variant, kind === 'text_to_image' ? 'text-to-image' : 'edit'));
          expect(serializeGptImage25Input(settings)).toEqual({ image_size: 'auto', quality: value, background, num_images: 3, sync_mode: false, output_format: 'png' });
          expect(serializeGptImage25GenerationOptions(settings)).toEqual({
            gptImage25Quality: value, gptImage25Variant: variant, gptImage25Background: background, imageSizeSelection: 'auto', numImages: 3,
          });
        }
      }
    }
  });

  it.each([
    ...GPT_IMAGE_2_IMAGE_SIZE_OPTIONS.map(option => ({ model: '2' as const, size: option.value })),
    ...GPT_IMAGE_25_IMAGE_SIZE_OPTIONS.map(option => ({ model: '2.5' as const, size: option.value })),
  ])('serializes GPT Image $model size $size without changing metadata', ({ model, size }) => {
    const dimensions = size.match(/^(\d+)x(\d+)$/);
    const wireSize = dimensions ? { width: Number(dimensions[1]), height: Number(dimensions[2]) } : size;
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      if (model === '2') {
        const settings = resolveGptImage2RunSettings({ kind, imageSizeSelection: size });
        expect(serializeGptImage2Input(settings).image_size).toEqual(wireSize);
        expect(serializeGptImage2GenerationOptions(settings).imageSizeSelection).toBe(size);
      } else {
        const settings = resolveGptImage25RunSettings({ kind, imageSizeSelection: size });
        expect(serializeGptImage25Input(settings).image_size).toEqual(wireSize);
        expect(serializeGptImage25GenerationOptions(settings).imageSizeSelection).toBe(size);
      }
    }
  });

  it.each(['2688x1152', '2016x864', '1344x576', 'auto_1K', 'auto_2K', 'auto_3K', 'auto_4K'])('preserves GPT Image 2 legacy direct-call size %s', imageSizeSelection => {
    expect(resolveGptImage2RunSettings({ kind: 'image_edit', imageSizeSelection }).imageSizeSelection).toBe(imageSizeSelection);
  });

  it('preserves defaults and omitted direct-call counts, but repairs malformed restored options', () => {
    const input = { kind: 'text_to_image' as const, quality: 'bad', variant: 'bad', background: 'bad', imageSizeSelection: 'bad', numImages: NaN };
    expect(() => resolveGptImage2RunSettings(input)).toThrow('supported GPT Image 2 image size');
    expect(() => resolveGptImage25RunSettings(input)).toThrow('supported GPT Image 2.5 image size');
    expect(resolveGptImage2RunSettings(input, 'restore')).toMatchObject({ quality: 'medium', imageSizeSelection: 'auto', numImages: 1 });
    expect(resolveGptImage25RunSettings(input, 'restore')).toMatchObject({ quality: 'high', background: 'auto', variant: 'sunburst', imageSizeSelection: 'auto', numImages: 1 });
    for (const resolve of [resolveGptImage2RunSettings, resolveGptImage25RunSettings]) {
      expect(resolve({ kind: 'text_to_image', imageSizeSelection: 'default' }).imageSizeSelection).toBe('auto');
      expect(resolve({ kind: 'text_to_image' })).not.toHaveProperty('numImages');
      expect(resolve({ kind: 'image_edit', numImages: 0 }).numImages).toBe(1);
      expect(resolve({ kind: 'image_edit', numImages: 3.9 }).numImages).toBe(3);
    }
  });

  it.each(['flare', 'sunburst'] as const)('infers %s from saved endpoints but allows explicit saved controls to override it', variant => {
    const modelId = getGptImage25Endpoint(variant, 'edit');
    const inferred = resolveGptImage25RunSettings({ kind: 'text_to_image', modelId }, 'restore');
    expect(inferred.variant).toBe(variant);
    expect(inferred.endpoint).toBe(getGptImage25Endpoint(variant, 'text-to-image'));
    expect(resolveGptImage25RunSettings({ kind: 'image_edit', modelId, variant: 'sunburst' }).variant).toBe('sunburst');
  });
});
