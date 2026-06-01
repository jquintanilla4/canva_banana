import { describe, expect, it } from 'vitest';
import {
  FAL_IMAGE_MODEL_OPTIONS,
  FAL_VIDEO_MODEL_OPTIONS,
  getFalNumImageMaxForModel,
  getFalNumImageOptionsForModel,
  getSeedreamImageSizeOptions,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  isFalVideoModelId,
  isFalModelId,
  getMaxReferenceImages,
  isKrea2AspectRatioSelectionValue,
  isKrea2CreativitySelectionValue,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  isRecraftV4ProModel,
  normalizeFalModelId,
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
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

  it('replaces Kling 2.6 Control with Kling 3.0 Control', () => {
    const videoModelIds = FAL_VIDEO_MODEL_OPTIONS.map(option => option.value);
    const videoModelLabels = FAL_VIDEO_MODEL_OPTIONS.map(option => option.label as string);
    const legacyKling26StandardControlModelId = 'fal-ai/kling-video/v2.6/standard/motion-control';
    const legacyKling26ProControlModelId = 'fal-ai/kling-video/v2.6/pro/motion-control';

    expect(videoModelIds).toContain(KLING_V3_CONTROL_VIDEO_MODEL_ID);
    expect(videoModelLabels).toContain('Kling 3.0 Control');
    expect(videoModelLabels).not.toContain('Kling 2.6');
    expect(isFalVideoModelId(KLING_V3_CONTROL_VIDEO_MODEL_ID)).toBe(true);
    expect(isFalModelId(KLING_V3_CONTROL_VIDEO_MODEL_ID)).toBe(true);
    expect(isFalVideoModelId(legacyKling26StandardControlModelId)).toBe(false);
    expect(isFalVideoModelId(legacyKling26ProControlModelId)).toBe(false);
    expect(normalizeFalModelId(legacyKling26StandardControlModelId)).toBe(KLING_V3_CONTROL_VIDEO_MODEL_ID);
    expect(normalizeFalModelId(legacyKling26ProControlModelId)).toBe(KLING_V3_CONTROL_VIDEO_MODEL_ID);
  });

  it('does not expose removed Reve image models', () => {
    const imageModelLabels = FAL_IMAGE_MODEL_OPTIONS.map(option => option.label as string);
    expect(imageModelLabels).not.toContain('Reve Image');
    expect(isFalModelId('fal-ai/reve/text-to-image')).toBe(false);
    expect(normalizeFalModelId('fal-ai/reve/text-to-image')).toBeUndefined();
  });

  it('does not expose removed Kling O1 image model', () => {
    const imageModelLabels = FAL_IMAGE_MODEL_OPTIONS.map(option => option.label as string);
    expect(imageModelLabels).not.toContain('Kling O1 Image');
    expect(isFalModelId('fal-ai/kling-image/o1')).toBe(false);
    expect(normalizeFalModelId('fal-ai/kling-image/o1')).toBeUndefined();
  });

  it('exposes Recraft v4 Pro as a Fal image model', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID);

    expect(option?.label).toBe('Recraft v4 Pro');
    expect(isFalModelId(RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID)).toBe(true);
    expect(isRecraftV4ProModel(RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID)).toBe(true);
  });

  it('exposes Krea 2 Large with Krea-specific guards and reference cap', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID);

    expect(option?.label).toBe('Krea 2 Large');
    expect(isFalModelId(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID)).toBe(true);
    expect(getMaxReferenceImages(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID)).toBe(10);
    expect(isKrea2AspectRatioSelectionValue('16:9')).toBe(true);
    expect(isKrea2AspectRatioSelectionValue('21:9')).toBe(false);
    expect(isKrea2CreativitySelectionValue('medium')).toBe(true);
    expect(isKrea2CreativitySelectionValue('maximum')).toBe(false);
  });
});
