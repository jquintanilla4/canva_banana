import { useMemo } from 'react';

type KlingReferenceHelpersInput = {
  labelReferences: boolean;
  primaryImageId?: string | null;
  referenceImageIds: string[];
  labelElements?: boolean;
  elementImageIds?: string[];
  isEditMode?: boolean;
  sourceVideoId?: string | null;
};

// Handles Kling-specific reference and element labeling so App.tsx stays lean.
export const useKlingReferenceHelpers = ({
  labelReferences,
  primaryImageId,
  referenceImageIds,
  labelElements = false,
  elementImageIds = [],
  isEditMode = false,
  sourceVideoId = null,
}: KlingReferenceHelpersInput) => {
  const referenceOrderLabels = useMemo(() => {
    if (!labelReferences) {
      return null;
    }
    // In edit mode, don't include primaryImageId (which is the source video) in labels
    // Reference images start from @Image1
    const orderedIds = isEditMode
      ? referenceImageIds
      : [
          ...(primaryImageId ? [primaryImageId] : []),
          ...referenceImageIds,
        ];
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
  }, [isEditMode, labelReferences, primaryImageId, referenceImageIds, sourceVideoId]);

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
