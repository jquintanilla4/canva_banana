import { describe, expect, it } from 'vitest';
import {
  isUnavailableLegacyTransferModelId,
  isVideoNegativePromptModelId,
  KLING_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
} from '../modelConfig';

describe('isUnavailableLegacyTransferModelId', () => {
  it.each([
    'fal-ai/kling-video/o1/video-to-video/edit',
    'fal-ai/kling-video/v2.6/pro/motion-control',
    'wan/v2.6/image-to-video',
    'wan/v2.6/text-to-image',
  ])('blocks removed generation model %s', modelId => {
    expect(isUnavailableLegacyTransferModelId(modelId)).toBe(true);
  });

  it('keeps current shared-selector endpoints eligible for transfer', () => {
    expect(isUnavailableLegacyTransferModelId('fal-ai/kling-video/o3/pro/video-to-video/edit')).toBe(false);
    expect(isUnavailableLegacyTransferModelId('fal-ai/wan/v2.7/reference-to-video')).toBe(false);
  });
});

describe('isVideoNegativePromptModelId', () => {
  it.each([
    KLING_VIDEO_MODEL_ID,
    KLING_V3_VIDEO_MODEL_ID,
    WAN_VISION_ENHANCER_MODEL_ID,
    WAN_27_VIDEO_MODEL_ID,
    VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  ])('recognizes %s as owning a negative-prompt bucket', modelId => {
    expect(isVideoNegativePromptModelId(modelId)).toBe(true);
  });

  it.each([
    SEEDANCE_2_VIDEO_MODEL_ID,
    MINIMAX_H3_VIDEO_MODEL_ID,
  ])('excludes %s so it cannot overwrite another model bucket', modelId => {
    expect(isVideoNegativePromptModelId(modelId)).toBe(false);
  });
});
