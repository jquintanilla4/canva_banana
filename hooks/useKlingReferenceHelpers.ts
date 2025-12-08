import { useEffect, useMemo, useRef } from 'react';

type KlingReferenceHelpersInput = {
  isKlingModel: boolean;
  referenceImageIds: string[];
};

// Handles Kling-specific reference labeling so App.tsx stays lean.
export const useKlingReferenceHelpers = ({
  isKlingModel,
  referenceImageIds,
}: KlingReferenceHelpersInput) => {
  const badgeLabels = useMemo(() => {
    if (!isKlingModel || referenceImageIds.length <= 1) {
      return null;
    }
    return referenceImageIds.reduce<Record<string, string>>((acc, id, index) => {
      acc[id] = `@Image${index + 1}`;
      return acc;
    }, {});
  }, [isKlingModel, referenceImageIds]);

  return { referenceOrderLabels: badgeLabels };
};
