import { useMemo } from 'react';
import { useKlingReferenceHelpers } from './useKlingReferenceHelpers';
import type { ModelUiSelectionFlags } from '../services/modelCapabilities';

type UseCanvasReferenceLabelsArgs = {
  capabilitySelection: ModelUiSelectionFlags;
  klingSuggestionsEnabled: boolean;
  isKlingO3VideoModel: boolean;
  effectiveSeedanceReferenceImageIds: string[];
  effectiveSeedanceReferenceVideoIds: string[];
  effectiveSeedanceReferenceAudioIds: string[];
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  elementImageIds: string[];
  primaryImageId: string | null;
  primarySelectionMediaType: 'image' | 'video' | 'audio' | null;
  sourceVideoId: string | null;
  videoLastFrameImageId: string | null;
  flux3CanvasLabels: Record<string, string>;
  videoPromptAreaLabelMap: Record<string, string>;
  acceptedVideoPromptImageIds: string[];
  acceptedVideoPromptVideoIds: string[];
  acceptedVideoPromptAudioIds: string[];
  acceptedVideoPromptElementIds: string[];
};

// Merges the model-specific reference labeling (@Image1/@Video1/@Element1) with the
// video-prompt-area labels into the id lists and label maps Canvas renders. All
// outputs are memoized: they feed Canvas's draw callback, and a fresh array every
// App render would force a full canvas repaint on unrelated state changes.
export function useCanvasReferenceLabels({
  capabilitySelection,
  klingSuggestionsEnabled,
  isKlingO3VideoModel,
  effectiveSeedanceReferenceImageIds,
  effectiveSeedanceReferenceVideoIds,
  effectiveSeedanceReferenceAudioIds,
  referenceImageIds,
  referenceVideoIds,
  referenceAudioIds,
  elementImageIds,
  primaryImageId,
  primarySelectionMediaType,
  sourceVideoId,
  videoLastFrameImageId,
  flux3CanvasLabels,
  videoPromptAreaLabelMap,
  acceptedVideoPromptImageIds,
  acceptedVideoPromptVideoIds,
  acceptedVideoPromptAudioIds,
  acceptedVideoPromptElementIds,
}: UseCanvasReferenceLabelsArgs) {
  const isMultimodalReferenceMode = capabilitySelection.multimodalReferenceMode;
  const {
    referenceOrderLabels: klingReferenceOrderLabels,
    elementOrderLabels: klingElementOrderLabels,
  } = useKlingReferenceHelpers({
    // Every @-mention model labels its references; Wan Reference labels without offering suggestions.
    labelReferences: klingSuggestionsEnabled || capabilitySelection.wan27ReferenceMode,
    primaryImageId,
    primaryImageMediaType: primarySelectionMediaType,
    includePrimaryImageAsReference: !capabilitySelection.klingO3ReferenceMode && !isMultimodalReferenceMode && !capabilitySelection.wan27ReferenceMode, // Only API prompt references get @Image labels.
    referenceImageIds: isMultimodalReferenceMode ? effectiveSeedanceReferenceImageIds : referenceImageIds,
    referenceVideoIds: isMultimodalReferenceMode ? effectiveSeedanceReferenceVideoIds : referenceVideoIds,
    referenceAudioIds: isMultimodalReferenceMode ? effectiveSeedanceReferenceAudioIds : referenceAudioIds,
    labelElements: isKlingO3VideoModel,
    elementImageIds,
    isEditMode: capabilitySelection.klingO3VideoInputMode,
    sourceVideoId,
    includeTailFrame: capabilitySelection.flux3FflfMode,
    tailImageId: videoLastFrameImageId,
  });

  const canvasElementImageIds = useMemo(() => (
    Array.from(new Set([...elementImageIds, ...acceptedVideoPromptElementIds]))
  ), [elementImageIds, acceptedVideoPromptElementIds]);
  const seedance2ReferenceAssetCount = effectiveSeedanceReferenceImageIds.length + effectiveSeedanceReferenceVideoIds.length + effectiveSeedanceReferenceAudioIds.length; // Seedance reference mode treats selected media as effective refs too.
  const canvasReferenceOrderLabels = useMemo(() => ({
    ...(klingReferenceOrderLabels ?? {}),
    ...flux3CanvasLabels,
    ...videoPromptAreaLabelMap,
  }), [flux3CanvasLabels, klingReferenceOrderLabels, videoPromptAreaLabelMap]); // Area labels should render on canvas without replacing the legacy reference flow.
  const canvasElementOrderLabels = useMemo(() => ({
    ...(klingElementOrderLabels ?? {}),
    ...videoPromptAreaLabelMap,
  }), [klingElementOrderLabels, videoPromptAreaLabelMap]); // Element labels share the same area role labels.
  const canvasReferenceImageIds = useMemo(() => (
    Array.from(new Set([
      ...(isMultimodalReferenceMode ? effectiveSeedanceReferenceImageIds : referenceImageIds),
      ...acceptedVideoPromptImageIds,
    ]))
  ), [acceptedVideoPromptImageIds, effectiveSeedanceReferenceImageIds, isMultimodalReferenceMode, referenceImageIds]);
  const canvasReferenceVideoIds = useMemo(() => (
    Array.from(new Set([
      ...(isMultimodalReferenceMode ? effectiveSeedanceReferenceVideoIds : referenceVideoIds),
      ...acceptedVideoPromptVideoIds,
    ]))
  ), [acceptedVideoPromptVideoIds, effectiveSeedanceReferenceVideoIds, isMultimodalReferenceMode, referenceVideoIds]);
  const canvasReferenceAudioIds = useMemo(() => (
    Array.from(new Set([
      ...(isMultimodalReferenceMode ? effectiveSeedanceReferenceAudioIds : referenceAudioIds),
      ...acceptedVideoPromptAudioIds,
    ]))
  ), [acceptedVideoPromptAudioIds, effectiveSeedanceReferenceAudioIds, isMultimodalReferenceMode, referenceAudioIds]);

  return {
    klingReferenceOrderLabels,
    klingElementOrderLabels,
    seedance2ReferenceAssetCount,
    canvasElementImageIds,
    canvasReferenceOrderLabels,
    canvasElementOrderLabels,
    canvasReferenceImageIds,
    canvasReferenceVideoIds,
    canvasReferenceAudioIds,
  };
}
