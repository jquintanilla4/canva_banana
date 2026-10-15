import { Tool } from '../types';
import {
  getMaxReferenceImages,
  isGptImage2EditModelId,
  isGptImage25Model,
  normalizeFalModelId,
} from './modelConfig';
import { isIdeogram45Model } from './ideogram45Config';

export interface ModelReferenceCapabilities {
  referenceCapacity: number; // Source image is already excluded from this count.
  annotationSlots: number;
  availableReferenceSlots: number;
}

export const getModelReferenceCapabilities = (
  modelId: string | undefined,
  tool: Tool = Tool.SELECTION,
): ModelReferenceCapabilities => {
  const normalizedModelId = normalizeFalModelId(modelId);
  const referenceCapacity = getMaxReferenceImages(normalizedModelId);
  const annotationUsesReferenceSlot = isGptImage2EditModelId(normalizedModelId)
    || isGptImage25Model(normalizedModelId)
    || isIdeogram45Model(normalizedModelId);
  const annotationSlots = annotationUsesReferenceSlot && tool === Tool.ANNOTATE ? 1 : 0;
  return {
    referenceCapacity,
    annotationSlots,
    availableReferenceSlots: Math.max(0, referenceCapacity - annotationSlots),
  };
};
