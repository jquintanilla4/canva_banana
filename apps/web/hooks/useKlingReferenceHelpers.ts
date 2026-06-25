import { useMemo } from 'react';
import type { CanvasMediaType } from '../types';

type KlingReferenceHelpersInput = {
  labelReferences: boolean;
  primaryImageId?: string | null;
  primaryImageMediaType?: CanvasMediaType | null;
  includePrimaryImageAsReference?: boolean; // Lets Seedance reference mode skip auto-labeling the primary pick.
  referenceImageIds: string[];
  referenceVideoIds?: string[]; // Optional video refs for Seedance multimodal prompts.
  referenceAudioIds?: string[]; // Optional audio refs for Seedance multimodal prompts.
  labelElements?: boolean;
  elementImageIds?: string[];
  isEditMode?: boolean;
  sourceVideoId?: string | null;
  includeTailFrame?: boolean;
  tailImageId?: string | null;
};

// Handles Kling-specific reference and element labeling so App.tsx stays lean.
export const useKlingReferenceHelpers = ({
  labelReferences,
  primaryImageId,
  primaryImageMediaType = null,
  includePrimaryImageAsReference = true,
  referenceImageIds,
  referenceVideoIds = [],
  referenceAudioIds = [],
  labelElements = false,
  elementImageIds = [],
  isEditMode = false,
  sourceVideoId = null,
  includeTailFrame = false,
  tailImageId = null,
}: KlingReferenceHelpersInput) => {
  const referenceOrderLabels = useMemo(() => {
    if (!labelReferences) {
      return null;
    }
    const shouldLabelPrimary = includePrimaryImageAsReference && !isEditMode && primaryImageMediaType === 'image' && !!primaryImageId; // Most models treat the primary image as @Image1.
    const shouldLabelTailFrame = includeTailFrame && !!tailImageId; // FFLF flows expose the last frame as another @ImageN token.
    const orderedIds = Array.from(new Set([
      ...(shouldLabelPrimary ? [primaryImageId] : []),
      ...(shouldLabelTailFrame ? [tailImageId as string] : []),
      ...referenceImageIds,
    ]));
    // In edit mode, don't include primaryImageId (which is the source video) in labels
    // Reference images start from @Image1
    const labels: Record<string, string> = orderedIds.reduce<Record<string, string>>((acc, id, index) => {
      acc[id] = `@Image${index + 1}`;
      return acc;
    }, {});
    referenceVideoIds.forEach((id, index) => {
      labels[id] = `@Video${index + 1}`; // Seedance can mix video references into the same prompt.
    });
    referenceAudioIds.forEach((id, index) => {
      labels[id] = `@Audio${index + 1}`; // Seedance can mix audio references into the same prompt.
    });
    if (isEditMode && sourceVideoId) {
      labels[sourceVideoId] = 'Video'; // Kling edit flows keep the source video mention stable.
    }
    if (Object.keys(labels).length === 0) {
      return null;
    }
    return labels;
  }, [includePrimaryImageAsReference, includeTailFrame, isEditMode, labelReferences, primaryImageId, primaryImageMediaType, referenceAudioIds, referenceImageIds, referenceVideoIds, sourceVideoId, tailImageId]);

  const elementOrderLabels = useMemo(() => {
    if (!labelElements || elementImageIds.length === 0) {
      return null;
    }
    return elementImageIds.reduce<Record<string, string>>((acc, id, index) => {
      acc[id] = `@Element${index + 1}`;
      return acc;
    }, {});
  }, [elementImageIds, labelElements]);

  return { referenceOrderLabels, elementOrderLabels };
};
