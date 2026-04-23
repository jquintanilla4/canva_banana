import { useMemo } from 'react';
import type { CanvasMediaType } from '../types';

type UseKlingPromptMentionsArgs = {
  isKlingO3VideoModel: boolean;
  isKlingO3EditMode: boolean;
  isSeedance2ReferenceMode?: boolean; // Reuses the Kling mention UX for Seedance reference prompts.
  isFlux2MaxModel?: boolean;
  isWan27ImageModel?: boolean;
  referenceOrderLabels: Record<string, string> | null;
  elementOrderLabels: Record<string, string> | null;
  referenceImageIds: string[];
  hasSingleImageSelected: boolean;
  primarySelectionMediaType: CanvasMediaType | null;
};

type UseKlingPromptMentionsResult = {
  klingPromptMentions: string[];
  klingReferenceCount: number;
};

export const useKlingPromptMentions = ({
  isKlingO3VideoModel,
  isKlingO3EditMode,
  isSeedance2ReferenceMode = false,
  isFlux2MaxModel = false,
  isWan27ImageModel = false,
  referenceOrderLabels,
  elementOrderLabels,
  referenceImageIds,
  hasSingleImageSelected,
  primarySelectionMediaType,
}: UseKlingPromptMentionsArgs): UseKlingPromptMentionsResult => {
  const isKlingO3VideoInputMode = isKlingO3EditMode; // Only Kling O3 edit uses a source video mention path.
  return useMemo(() => {
    if (!isKlingO3VideoModel && !isSeedance2ReferenceMode && !isFlux2MaxModel && !isWan27ImageModel) {
      return { klingPromptMentions: [], klingReferenceCount: 0 };
    }

    const hasPrimaryImageSelected = hasSingleImageSelected && primarySelectionMediaType === 'image';
    const hasPrimaryVideoSelected = hasSingleImageSelected && primarySelectionMediaType === 'video';

    const referenceMentions = referenceOrderLabels ? Object.values(referenceOrderLabels) : []; // Canvas badges become autocomplete options.
    const elementMentions = elementOrderLabels
      ? Object.values(elementOrderLabels).map(label => (label.startsWith('@') ? label : `@${label}`))
      : [];

    const merged = [...referenceMentions, ...elementMentions];
    const seen = new Set<string>();
    let klingPromptMentions = merged.filter(label => {
      if (!label || seen.has(label)) {
        return false;
      }
      seen.add(label);
      return true;
    });

    if (
      isKlingO3VideoModel &&
      isKlingO3VideoInputMode &&
      hasPrimaryVideoSelected &&
      klingPromptMentions.length === 0 &&
      referenceImageIds.length === 0
    ) {
      klingPromptMentions = ['Video'];
    }

    const klingReferenceCount = klingPromptMentions.length
      || referenceImageIds.length
      || (hasPrimaryImageSelected ? 1 : 0);

    return { klingPromptMentions, klingReferenceCount };
  }, [
    elementOrderLabels,
    hasSingleImageSelected,
    primarySelectionMediaType,
    isKlingO3VideoModel,
    isKlingO3VideoInputMode,
    isSeedance2ReferenceMode,
    isFlux2MaxModel,
    isWan27ImageModel,
    referenceImageIds.length,
    referenceOrderLabels,
  ]);
};
