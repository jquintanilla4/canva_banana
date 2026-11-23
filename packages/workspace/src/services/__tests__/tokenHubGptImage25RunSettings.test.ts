import { describe, expect, expectTypeOf, it } from 'vitest';
import { TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS, TOKENHUB_GPT_IMAGE_25_QUALITY_OPTIONS } from '../tokenHubGptImage25Config';
import { resolveTokenHubGptImage25RunSettings, serializeTokenHubGptImage25GenerationOptions, serializeTokenHubGptImage25Input } from '../tokenHubGptImage25RunSettings';

describe('TokenHub GPT Image 2.5 run settings', () => {
  it.each(['flare', 'sunburst'] as const)('maps $variant to the TokenHub model for text and edits', variant => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      const settings = resolveTokenHubGptImage25RunSettings({ kind, variant });
      expect(settings).toMatchObject({
        kind,
        variant,
        model: `og-image-2-5-${variant}-standard`,
        imageSizeSelection: 'auto',
        quality: 'high',
        background: 'auto',
        numImages: 1,
      });
    }
    expectTypeOf(resolveTokenHubGptImage25RunSettings({ kind: 'text_to_image' }).kind).toEqualTypeOf<'text_to_image'>();
    expectTypeOf(resolveTokenHubGptImage25RunSettings({ kind: 'image_edit' }).kind).toEqualTypeOf<'image_edit'>();
  });

  it.each(TOKENHUB_GPT_IMAGE_25_QUALITY_OPTIONS)('serializes $value with OpenAI Images fields', ({ value }) => {
    const settings = resolveTokenHubGptImage25RunSettings({
      kind: 'text_to_image', quality: value, background: 'transparent', numImages: 3,
    });
    expect(serializeTokenHubGptImage25Input(settings)).toEqual({
      model: 'og-image-2-5-sunburst-standard',
      size: 'auto',
      quality: value,
      background: 'transparent',
      n: 3,
      output_format: 'png',
    });
    expect(serializeTokenHubGptImage25Input(settings)).not.toHaveProperty('image_size');
    expect(serializeTokenHubGptImage25Input(settings)).not.toHaveProperty('num_images');
    expect(serializeTokenHubGptImage25Input(settings)).not.toHaveProperty('sync_mode');
    expect(serializeTokenHubGptImage25GenerationOptions(settings)).toEqual({
      tokenHubGptImage25Variant: 'sunburst',
      tokenHubGptImage25Quality: value,
      tokenHubGptImage25Background: 'transparent',
      imageSizeSelection: 'auto',
      numImages: 3,
    });
  });

  it.each(TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS)('serializes $value as an OpenAI size string', ({ value }) => {
    const settings = resolveTokenHubGptImage25RunSettings({ kind: 'image_edit', imageSizeSelection: value });
    const expected = {
      landscape_4_3: '1024x768',
      portrait_4_3: '768x1024',
      square_hd: '1024x1024',
    }[value as 'landscape_4_3' | 'portrait_4_3' | 'square_hd'] ?? value;
    expect(serializeTokenHubGptImage25Input(settings).size).toBe(expected);
    expect(serializeTokenHubGptImage25GenerationOptions(settings).imageSizeSelection).toBe(value);
  });

  it('rejects invalid live sizes and repairs malformed restored settings', () => {
    const input = { kind: 'text_to_image' as const, variant: 'bad', quality: 'bad', background: 'bad', imageSizeSelection: 'bad', numImages: NaN };
    expect(() => resolveTokenHubGptImage25RunSettings(input)).toThrow('supported GPT Image 2.5 (TokenHub) image size');
    expect(resolveTokenHubGptImage25RunSettings(input, 'restore')).toMatchObject({
      variant: 'sunburst', quality: 'high', background: 'auto', imageSizeSelection: 'auto', numImages: 1,
    });
    expect(resolveTokenHubGptImage25RunSettings({ kind: 'text_to_image', numImages: 99 }).numImages).toBe(4);
  });
});
