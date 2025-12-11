import { useMemo } from 'react';
import type { CanvasMediaType } from '../types';

type KlingReferenceHelpersInput = {
  labelReferences: boolean;
  primaryImageId?: string | null;
  primaryImageMediaType?: CanvasMediaType | null;
  referenceImageIds: string[];
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
  referenceImageIds,
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
    const shouldLabelPrimary = !isEditMode && primaryImageMediaType === 'image' && !!primaryImageId;
    const shouldLabelTailFrame = includeTailFrame && !!tailImageId;
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
    if (isEditMode && sourceVideoId) {
      labels[sourceVideoId] = 'Video';
    }
    if (Object.keys(labels).length === 0) {
      return null;
    }
    return labels;
  }, [includeTailFrame, isEditMode, labelReferences, primaryImageId, primaryImageMediaType, referenceImageIds, sourceVideoId, tailImageId]);

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
