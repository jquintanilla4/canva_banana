import { describe, expect, it } from 'vitest';
import {
  FAL_IMAGE_MODEL_OPTIONS,
  getFalNumImageMaxForModel,
  getFalNumImageOptionsForModel,
  getSeedreamImageSizeOptions,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  isFalModelId,
  normalizeFalModelId,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V5_LITE_MODEL_ID,
  SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig';

describe('modelConfig (seedream 5 lite helpers)', () => {
  it('returns Seedream 5 Lite max outputs as 6', () => {
    expect(getFalNumImageMaxForModel(SEEDREAM_V5_LITE_MODEL_ID)).toBe(6);
    expect(getFalNumImageMaxForModel(SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID)).toBe(6);
    expect(getFalNumImageMaxForModel(SEEDREAM_MODEL_ID)).toBe(4);
  });

  it('returns Seedream 5 Lite num image picker values as 1..6', () => {
    expect(getFalNumImageOptionsForModel(SEEDREAM_V5_LITE_MODEL_ID)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getFalNumImageOptionsForModel(SEEDREAM_MODEL_ID)).toEqual([1, 2, 3, 4]);
  });

  it('returns strict Seedream 5 Lite image sizes', () => {
    expect(getSeedreamImageSizeOptions(SEEDREAM_V5_LITE_MODEL_ID).map(option => option.value)).toEqual([
      'square_hd',
      'square',
      'portrait_4_3',
      'portrait_16_9',
      'landscape_4_3',
      'landscape_16_9',
      'auto_2K',
      'auto_3K',
    ]);
  });

  it('maps legacy Sora 2 Pro video snapshots to the default video model', () => {
    expect(normalizeFalModelId('fal-ai/sora-2/image-to-video/pro')).toBe(HAILUO_IMAGE_TO_VIDEO_MODEL_ID);
  });

  it('does not expose removed Reve image models', () => {
    const imageModelLabels = FAL_IMAGE_MODEL_OPTIONS.map(option => option.label as string);
    expect(imageModelLabels).not.toContain('Reve Image');
    expect(isFalModelId('fal-ai/reve/text-to-image')).toBe(false);
    expect(normalizeFalModelId('fal-ai/reve/text-to-image')).toBeUndefined();
  });
});
