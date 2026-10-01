import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  resolveIdeogram45RunSettings,
  serializeIdeogram45GenerationOptions,
  type Ideogram45EditRunSettings,
  type Ideogram45TextRunSettings,
} from '../ideogram45RunSettings';
import { IDEOGRAM_45_IMAGE_SIZE_OPTIONS } from '../ideogram45Config';

describe('Ideogram 4.5 run settings', () => {
  it('models unsupported quality and high-precision size combinations in the types', () => {
    expectTypeOf<Ideogram45TextRunSettings['quality']>().toEqualTypeOf<'low' | 'medium' | 'high'>();
    type PreciseEdit = Extract<Ideogram45EditRunSettings, { editPrecision: 'high' }>;
    expectTypeOf<PreciseEdit['quality']>().toEqualTypeOf<'low' | 'medium' | 'high'>();
    expectTypeOf<PreciseEdit['imageSizeSelection']>().toEqualTypeOf<'auto'>();
    expectTypeOf<PreciseEdit['preserveSourceSize']>().toEqualTypeOf<true>();
  });

  it.each((['text_to_image', 'image_edit'] as const).flatMap(kind =>
    (['regular', 'high'] as const).flatMap(editPrecision =>
      (['very_low', 'low', 'medium', 'high'] as const).map(quality => ({ kind, editPrecision, quality })),
    ),
  ))('resolves $kind / $editPrecision / $quality', ({ kind, editPrecision, quality }) => {
    const settings = resolveIdeogram45RunSettings({ kind, editPrecision, quality, imageSizeSelection: '2560x1440', numImages: 8 });
    const veryLowAllowed = kind === 'image_edit' && editPrecision === 'regular';
    const preserveSourceSize = kind === 'image_edit' && editPrecision === 'high';
    expect(settings).toMatchObject({
      kind, editPrecision, quality: quality === 'very_low' && !veryLowAllowed ? 'medium' : quality,
      imageSizeSelection: preserveSourceSize ? 'auto' : '2560x1440', preserveSourceSize, numImages: 8,
    });
    expect(settings.qualityOptions.some(option => option.value === 'very_low')).toBe(veryLowAllowed);
    expect(serializeIdeogram45GenerationOptions(settings)).toEqual({
      ideogram45Quality: settings.quality, ideogram45EditPrecision: settings.editPrecision,
      imageSizeSelection: settings.imageSizeSelection, numImages: settings.numImages,
    });
  });

  it.each(IDEOGRAM_45_IMAGE_SIZE_OPTIONS)('preserves the selected $value size except for precise edits', ({ value }) => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      expect(resolveIdeogram45RunSettings({ kind, imageSizeSelection: value }).imageSizeSelection).toBe(value);
    }
    expect(resolveIdeogram45RunSettings({ kind: 'image_edit', editPrecision: 'high', imageSizeSelection: value }).imageSizeSelection).toBe('auto');
  });

  it('keeps strict API validation separate from tolerant saved-settings restoration', () => {
    const input = { kind: 'image_edit' as const, quality: 'bad', editPrecision: 'bad', imageSizeSelection: 'auto_2K', numImages: NaN };
    expect(() => resolveIdeogram45RunSettings(input)).toThrow('supported Ideogram 4.5 image size');
    expect(resolveIdeogram45RunSettings(input, 'restore')).toMatchObject({
      quality: 'medium', editPrecision: 'regular', imageSizeSelection: 'auto', preserveSourceSize: false,
    });
    expect(() => resolveIdeogram45RunSettings({ ...input, editPrecision: 'high' })).toThrow('supported Ideogram 4.5 image size');
  });

  it('normalizes output counts and text seeds without inventing omitted fields', () => {
    expect(resolveIdeogram45RunSettings({ kind: 'text_to_image', numImages: 99, seed: 42.9 })).toMatchObject({ numImages: 8, seed: 42 });
    expect(resolveIdeogram45RunSettings({ kind: 'image_edit', numImages: -2 })).toHaveProperty('numImages', 1);
    const defaults = resolveIdeogram45RunSettings({ kind: 'text_to_image', imageSizeSelection: 'default', seed: Infinity });
    expect(defaults).not.toHaveProperty('numImages');
    expect(defaults).not.toHaveProperty('seed');
    expect(defaults.imageSizeSelection).toBe('auto');
  });
});
