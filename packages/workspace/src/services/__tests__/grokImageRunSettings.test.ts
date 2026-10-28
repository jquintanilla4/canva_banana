import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  FAL_GROK_ASPECT_RATIO_OPTIONS, GROK_IMAGE_DEFAULTS, GROK_IMAGE_MAX_INPUTS, GROK_IMAGE_NUM_IMAGE_OPTIONS,
  GROK_IMAGE_RESOLUTION_OPTIONS, GROK_IMAGE_QUALITY_OPTIONS, GROK_IMAGE_OUTPUT_FORMAT_OPTIONS,
  GROK_IMAGINE_IMAGE_MODEL_ID, GROK_IMAGINE_IMAGE_EDIT_MODEL_ID,
  isGrokImageAspectRatio, isGrokImageResolution, isGrokImageQuality, isGrokImageOutputFormat,
} from '../grokImageConfig';
import { resolveGrokImageRunSettings, serializeGrokImageGenerationOptions } from '../grokImageRunSettings';
import { resolveGrokImageSettingsForRequest, serializeGrokImageInput } from '../fal/grokImage';
import { buildGrokImageControls } from '../promptBar/grokImageControls';

describe('Grok image settings and controls', () => {
  it('uses the verified input and output limits and keeps endpoints operation-specific', () => {
    expect(GROK_IMAGE_MAX_INPUTS).toBe(5);
    expect(GROK_IMAGE_NUM_IMAGE_OPTIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expectTypeOf(resolveGrokImageRunSettings({ kind: 'text_to_image' }).endpoint).toEqualTypeOf<typeof GROK_IMAGINE_IMAGE_MODEL_ID>();
    expectTypeOf(resolveGrokImageRunSettings({ kind: 'image_edit' }).endpoint).toEqualTypeOf<typeof GROK_IMAGINE_IMAGE_EDIT_MODEL_ID>();
  });

  it.each(['text_to_image', 'image_edit'] as const)('serializes explicit defaults for %s and preserves legacy default ratios', kind => {
    for (const aspectRatio of [undefined, 'default']) {
      const settings = resolveGrokImageRunSettings({ kind, aspectRatio });
      expect(serializeGrokImageInput(settings)).toEqual({
        aspect_ratio: kind === 'image_edit' ? 'auto' : '1:1',
        resolution: '1k', quality: 'medium', output_format: 'png', image_passthrough: false,
        enable_safety_checker: true, sync_mode: kind === 'text_to_image',
      });
      expect(settings).not.toHaveProperty('numImages');
    }
  });

  it.each(FAL_GROK_ASPECT_RATIO_OPTIONS)('supports $value in text, edit, metadata, and raw requests', ({ value }) => {
    expect(isGrokImageAspectRatio(value)).toBe(true);
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      const settings = resolveGrokImageRunSettings({ kind, aspectRatio: value });
      expect(serializeGrokImageInput(settings).aspect_ratio).toBe(value);
      const metadata = serializeGrokImageGenerationOptions(settings);
      expect(metadata.grokImageAspectRatio).toBe(value);
      expect(resolveGrokImageSettingsForRequest(kind, metadata)).toEqual(settings);
      if (value === 'auto' || value === '5:2') expect(metadata).not.toHaveProperty('aspectRatioSelection');
      else expect(metadata.aspectRatioSelection).toBe(value);
    }
  });

  it.each([
    { field: 'aspectRatio', guard: isGrokImageAspectRatio, values: FAL_GROK_ASPECT_RATIO_OPTIONS },
    { field: 'resolution', guard: isGrokImageResolution, values: GROK_IMAGE_RESOLUTION_OPTIONS },
    { field: 'quality', guard: isGrokImageQuality, values: GROK_IMAGE_QUALITY_OPTIONS },
    { field: 'outputFormat', guard: isGrokImageOutputFormat, values: GROK_IMAGE_OUTPUT_FORMAT_OPTIONS },
  ] as const)('validates $field strictly and repairs restored invalid values', ({ field, guard, values }) => {
    for (const { value } of values) {
      expect(guard(value)).toBe(true);
      expect(resolveGrokImageRunSettings({ kind: 'image_edit', [field]: value })[field]).toBe(value);
    }
    for (const value of ['unsupported', '', null, 3, false]) {
      expect(guard(value)).toBe(false);
      expect(() => resolveGrokImageRunSettings({ kind: 'text_to_image', [field]: value })).toThrow('supported Grok Imagine');
      expect(resolveGrokImageRunSettings({ kind: 'image_edit', [field]: value }, 'restore')[field]).toBe(GROK_IMAGE_DEFAULTS[field]);
    }
  });

  it('retains count clamping and repairs malformed boolean preferences', () => {
    for (const [numImages, expected] of [[0, 1], [3.9, 3], [10, 10], [99, 10]]) {
      expect(resolveGrokImageRunSettings({ kind: 'text_to_image', numImages }).numImages).toBe(expected);
    }
    expect(resolveGrokImageRunSettings({ kind: 'image_edit', numImages: NaN }, 'restore').numImages).toBe(1);
    expect(resolveGrokImageRunSettings({ kind: 'image_edit', imagePassthrough: 'true', enableSafetyChecker: 0 }))
      .toMatchObject({ imagePassthrough: false, enableSafetyChecker: true });
  });

  it('resolves all dedicated raw options, falls back to legacy ratios, and prioritizes typed settings', () => {
    const raw = {
      aspectRatio: '16:9' as const, grokImageAspectRatio: '5:2' as const, grokImageResolution: '1.5k' as const,
      grokImageQuality: 'low' as const, grokImageOutputFormat: 'webp' as const,
      grokImagePassthrough: true, grokImageEnableSafetyChecker: false, numImages: 10,
    };
    const settings = resolveGrokImageSettingsForRequest('image_edit', raw);
    expect(serializeGrokImageInput(settings)).toEqual({
      aspect_ratio: '5:2', resolution: '1.5k', quality: 'low', output_format: 'webp',
      image_passthrough: true, enable_safety_checker: false, num_images: 10, sync_mode: false,
    });
    expect(serializeGrokImageGenerationOptions(settings)).toEqual({
      grokImageAspectRatio: '5:2', grokImageResolution: '1.5k', grokImageQuality: 'low', grokImageOutputFormat: 'webp',
      grokImagePassthrough: true, grokImageEnableSafetyChecker: false, numImages: 10,
    });
    expect(resolveGrokImageSettingsForRequest('image_edit', { aspectRatio: '16:9' }).aspectRatio).toBe('16:9');
    expect(resolveGrokImageSettingsForRequest('image_edit', { ...raw, grokImageRunSettings: settings })).toBe(settings);
    const overridden = resolveGrokImageRunSettings({ kind: 'image_edit', aspectRatio: 'auto', quality: 'auto' });
    expect(resolveGrokImageSettingsForRequest('image_edit', { ...raw, grokImageRunSettings: overridden })).toBe(overridden);
  });

  it.each([false, true])('builds seven controls with restored values and loading=%s', isLoading => {
    const callbacks = {
      onAspectRatioChange: vi.fn(), onResolutionChange: vi.fn(), onQualityChange: vi.fn(), onOutputFormatChange: vi.fn(),
      onImagePassthroughChange: vi.fn(), onEnableSafetyCheckerChange: vi.fn(), onNumImagesChange: vi.fn(),
    };
    const controls = buildGrokImageControls({ ...callbacks, isLoading, kind: 'image_edit' });
    expect(controls.map(control => control.value)).toEqual(['auto', '1k', 'medium', 'png', 'false', 'true', '1']);
    expect(controls).toHaveLength(7);
    expect(new Set(controls.map(control => control.id)).size).toBe(7);
    for (const control of controls) {
      expect(control.disabled).toBe(isLoading);
      expect(control.ariaLabel).toContain('Grok image');
      expect(control.options.some(option => option.value === control.value)).toBe(true);
    }
    controls[0].onChange('21:9');
    controls[1].onChange('2k');
    controls[2].onChange('auto');
    controls[3].onChange('jpeg');
    expect(callbacks.onAspectRatioChange).toHaveBeenCalledWith('21:9');
    expect(callbacks.onResolutionChange).toHaveBeenCalledWith('2k');
    expect(callbacks.onQualityChange).toHaveBeenCalledWith('auto');
    expect(callbacks.onOutputFormatChange).toHaveBeenCalledWith('jpeg');
    for (const value of [true, false]) {
      controls[4].onChange(String(value));
      controls[5].onChange(String(value));
      expect(callbacks.onImagePassthroughChange).toHaveBeenLastCalledWith(value);
      expect(callbacks.onEnableSafetyCheckerChange).toHaveBeenLastCalledWith(value);
    }
    expect(controls[4].options.map(option => option.label)).toEqual(['No', 'Yes']);
    for (const value of GROK_IMAGE_NUM_IMAGE_OPTIONS) {
      controls[6].onChange(String(value));
      expect(callbacks.onNumImagesChange).toHaveBeenLastCalledWith(value);
    }
  });
});
