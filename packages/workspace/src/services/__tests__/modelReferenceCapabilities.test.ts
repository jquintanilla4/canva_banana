import { describe, expect, it } from 'vitest';
import { Tool } from '../../types';
import { getModelReferenceCapabilities } from '../modelReferenceCapabilities';
import { getModelUiCapabilities } from '../modelCapabilities';
import {
  GPT_IMAGE_2_EDIT_MODEL_ID,
  GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID,
  GPT_IMAGE_25_MODEL_ID,
  IDEOGRAM_45_MODEL_ID,
  IDEOGRAM_45_EDIT_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  getGptImage25Endpoint,
  getMaxReferenceImages,
} from '../modelConfig';

describe('model annotation reference capabilities', () => {
  it.each([
    { modelId: IDEOGRAM_45_MODEL_ID, capacity: 4 },
    { modelId: IDEOGRAM_45_EDIT_MODEL_ID, capacity: 4 },
    { modelId: GPT_IMAGE_2_EDIT_MODEL_ID, capacity: 9 },
    { modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID, capacity: 9 },
    { modelId: GPT_IMAGE_25_MODEL_ID, capacity: 15 },
    { modelId: getGptImage25Endpoint('flare', 'edit'), capacity: 15 },
    { modelId: getGptImage25Endpoint('sunburst', 'text-to-image'), capacity: 15 },
  ])('reserves annotation without counting the source twice for $modelId', ({ modelId, capacity }) => {
    expect(getModelReferenceCapabilities(modelId)).toEqual({
      referenceCapacity: capacity, annotationSlots: 0, availableReferenceSlots: capacity,
    });
    expect(getModelReferenceCapabilities(modelId, Tool.ANNOTATE)).toEqual({
      referenceCapacity: capacity, annotationSlots: 1, availableReferenceSlots: capacity - 1,
    });
    if (modelId !== GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID) {
      const capabilities = getModelUiCapabilities(modelId);
      expect(capabilities.maxReferenceImages).toBe(capacity);
      expect(capabilities.referenceLimitToast?.(capacity - 1)?.message).toContain(`up to ${capacity - 1} references`);
    }
  });

  it.each([SEEDREAM_V45_MODEL_ID, MINIMAX_H3_VIDEO_MODEL_ID, undefined])('leaves other model accounting unchanged for %s', modelId => {
    const capacity = getMaxReferenceImages(modelId);
    expect(getModelReferenceCapabilities(modelId, Tool.ANNOTATE)).toEqual({
      referenceCapacity: capacity, annotationSlots: 0, availableReferenceSlots: capacity,
    });
  });
});
