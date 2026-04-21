import { useMemo } from 'react';
import type { CanvasMediaType } from '../types';

type UseKlingPromptMentionsArgs = {
  isKlingModel: boolean;
  isKlingO1VideoModel: boolean;
  isKlingO1EditMode: boolean;
  isKlingO1RefV2VMode?: boolean;
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
  isKlingModel,
  isKlingO1VideoModel,
  isKlingO1EditMode,
  isKlingO1RefV2VMode = false,
  isSeedance2ReferenceMode = false,
  isFlux2MaxModel = false,
  isWan27ImageModel = false,
  referenceOrderLabels,
  elementOrderLabels,
  referenceImageIds,
  hasSingleImageSelected,
  primarySelectionMediaType,
}: UseKlingPromptMentionsArgs): UseKlingPromptMentionsResult => {
  const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode; // Both Kling O1 video-input variants share the same "Video" mention behavior.
  return useMemo(() => {
    if (!isKlingModel && !isKlingO1VideoModel && !isSeedance2ReferenceMode && !isFlux2MaxModel && !isWan27ImageModel) {
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
      isKlingO1VideoModel &&
      isKlingO1VideoInputMode &&
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
    isKlingModel,
    isKlingO1VideoModel,
    isKlingO1VideoInputMode,
    isSeedance2ReferenceMode,
    isFlux2MaxModel,
    isWan27ImageModel,
    referenceImageIds.length,
    referenceOrderLabels,
  ]);
};
