import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  KLING_V4_ASPECT_RATIO_OPTIONS,
  KLING_V4_DEFAULTS,
  KLING_V4_DURATION_OPTIONS,
  KLING_V4_EDIT_VIDEO_MODEL_ID,
  KLING_V4_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID,
  KLING_V4_RESOLUTION_OPTIONS,
  KLING_V4_TEXT_TO_VIDEO_MODEL_ID,
  KLING_V4_VARIANT_OPTIONS,
  KLING_V4_VIDEO_MODEL_ID,
  isKlingV4AspectRatio,
  isKlingV4Duration,
  isKlingV4Resolution,
  isKlingV4Variant,
  isKlingV4VideoModel,
} from '../klingV4Config';
import { resolveKlingV4RunSettings, serializeKlingV4GenerationOptions } from '../klingV4RunSettings';
import { serializeKlingV4Input } from '../fal/klingV4';
import type { GenerateVideoOptions } from '../fal/types';

describe('Kling 4 configuration and run settings', () => {
  it('recognizes exactly the family selector and supported endpoint aliases', () => {
    for (const modelId of [KLING_V4_VIDEO_MODEL_ID, KLING_V4_TEXT_TO_VIDEO_MODEL_ID, KLING_V4_IMAGE_TO_VIDEO_MODEL_ID, KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID, KLING_V4_EDIT_VIDEO_MODEL_ID]) {
      expect(isKlingV4VideoModel(modelId)).toBe(true);
    }
    for (const modelId of [undefined, '', 'kling/v3', 'kling/v4/unknown', 'kling/v40', 'kling/v4/text-to-video/extra']) {
      expect(isKlingV4VideoModel(modelId)).toBe(false);
    }
  });

  it('exports guard-backed options and exactly source plus the integer strings 3 through 30', () => {
    for (const option of KLING_V4_VARIANT_OPTIONS) expect(isKlingV4Variant(option.value)).toBe(true);
    for (const option of KLING_V4_RESOLUTION_OPTIONS) expect(isKlingV4Resolution(option.value)).toBe(true);
    for (const option of KLING_V4_ASPECT_RATIO_OPTIONS) expect(isKlingV4AspectRatio(option.value)).toBe(true);
    expect(KLING_V4_DURATION_OPTIONS.map(option => option.value)).toEqual(['source', ...Array.from({ length: 28 }, (_, index) => String(index + 3))]);
    for (const option of KLING_V4_DURATION_OPTIONS) expect(isKlingV4Duration(option.value)).toBe(true);
    for (const value of [undefined, null, 5, NaN, {}, '2', '31', '03', '3.0', '3.5', '5s', 'auto', '', ' 5', '5\n']) {
      expect(isKlingV4Duration(value)).toBe(false);
    }
    expect(isKlingV4Variant('smart')).toBe(false);
    expect(isKlingV4Resolution('4k')).toBe(false);
    expect(isKlingV4AspectRatio('4:3')).toBe(false);
  });

  it('uses the agreed defaults and repairs malformed restored options', () => {
    const defaults = resolveKlingV4RunSettings();
    expect(defaults).toEqual({ variant: 'generate', resolution: '1080p', aspectRatio: '16:9', duration: '5' });
    expect(serializeKlingV4GenerationOptions(defaults)).toEqual(KLING_V4_DEFAULTS);
    expectTypeOf(serializeKlingV4GenerationOptions(defaults)).toExtend<GenerateVideoOptions>();
    expect(resolveKlingV4RunSettings({ variant: 'smart', resolution: '4K', aspectRatio: '4:3', duration: 5 })).toEqual(defaults);
  });

  it.each(KLING_V4_DURATION_OPTIONS)('normalizes and serializes duration $value without losing saved controls', ({ value }) => {
    for (const variant of ['generate', 'edit'] as const) {
      const settings = resolveKlingV4RunSettings({ variant, duration: value, aspectRatio: 'auto', resolution: '720p' });
      const duration = value === 'source' && variant === 'generate' ? '5' : value;
      expect(serializeKlingV4GenerationOptions(settings)).toEqual({
        klingV4Variant: variant, klingV4Duration: duration, klingV4AspectRatio: 'auto', klingV4Resolution: '720p',
      });
      const input = serializeKlingV4Input(settings, variant === 'edit' ? KLING_V4_EDIT_VIDEO_MODEL_ID : KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID);
      if (duration === 'source') expect(input).not.toHaveProperty('duration');
      else expect(input).toHaveProperty('duration', Number(duration));
    }
  });

  it('lets an explicit edit endpoint override a stale Generate picker value', () => {
    expect(resolveKlingV4RunSettings({ modelId: KLING_V4_EDIT_VIDEO_MODEL_ID, variant: 'generate', duration: 'source' })).toMatchObject({ variant: 'edit', duration: 'source' });
  });

  it.each(KLING_V4_ASPECT_RATIO_OPTIONS)('serializes aspect ratio $value only for the endpoints that support it', ({ value }) => {
    const settings = resolveKlingV4RunSettings({ aspectRatio: value });
    expect(serializeKlingV4Input(settings, KLING_V4_TEXT_TO_VIDEO_MODEL_ID)).toEqual({ resolution: '1080p', duration: 5, aspect_ratio: value === 'auto' ? '16:9' : value });
    expect(serializeKlingV4Input(settings, KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID)).toEqual({ resolution: '1080p', duration: 5, aspect_ratio: value });
    expect(serializeKlingV4Input(settings, KLING_V4_IMAGE_TO_VIDEO_MODEL_ID)).toEqual({ resolution: '1080p', duration: 5 });
    expect(serializeKlingV4Input(settings, KLING_V4_EDIT_VIDEO_MODEL_ID)).toEqual({ resolution: '1080p', duration: 5 });
  });
});
