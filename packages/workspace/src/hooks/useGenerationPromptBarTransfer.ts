import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  isFalVideoModelId,
  isVideoNegativePromptModelId,
  normalizeFalModelId,
  type FalVideoModelId,
} from '../services/modelConfig';
import type { ApiProviderId, CanvasImage, GenerationInputs } from '../types';
import { cloneCameraSelection, EMPTY_CAMERA_SELECTION, type CameraSettingsSelection } from '../utils/cameraSettings';
import { getGenerationTransferBlockReason, resolveGenerationInputSelection } from '../utils/generationPromptBarTransfer';
import { normalizeKrea2StyleStrength } from '../utils/krea2StyleStrength';
import type { SelectionStateResult } from './useSelectionState';

type TransferSelectionSetters = Pick<
  SelectionStateResult,
  | 'setSelectedImageIds'
  | 'setReferenceImageIds'
  | 'setReferenceVideoIds'
  | 'setReferenceAudioIds'
  | 'setSeedanceReferenceOrderIds'
  | 'setElementImageIds'
  | 'setVideoLastFrameImageId'
  | 'setSourceVideoId'
  | 'setSourceAudioId'
>; // Transfer restores every persisted canvas input role together.

interface UseGenerationPromptBarTransferArgs {
  displayedImages: CanvasImage[];
  providerAvailability: Readonly<Record<ApiProviderId, boolean>>;
  applyGenerationSettings: (generation: GenerationInputs) => boolean;
  selection: TransferSelectionSetters;
  setApiProvider: Dispatch<SetStateAction<ApiProviderId>>;
  setPrompt: Dispatch<SetStateAction<string>>;
  setCameraSettings: Dispatch<SetStateAction<CameraSettingsSelection>>;
  setActiveEmbeddedPromptBarId: Dispatch<SetStateAction<string | null>>;
  setSelectedVideoPromptAreaId: Dispatch<SetStateAction<string | null>>;
  setVideoNegativePromptForModel: (modelId: FalVideoModelId, value: string) => void;
  setWan27ImageNegativePrompt: Dispatch<SetStateAction<string>>;
  setKrea2StyleReferenceStrengths: Dispatch<SetStateAction<Record<string, number>>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  resetEditContext: () => void;
}

interface UseGenerationPromptBarTransferResult {
  handleMetadataToPromptBar: (imageId: string) => void;
  promptFocusRequestToken: number;
}

const buildTransferToastMessage = (
  missingInputCount: number,
  hasSavedEditStrokes: boolean,
  skippedNegativePrompt: boolean,
): string => {
  const warnings: string[] = [];
  if (missingInputCount > 0) warnings.push(`${missingInputCount} saved canvas input(s) were unavailable.`);
  if (hasSavedEditStrokes) warnings.push('Saved edit strokes were not restored.');
  if (skippedNegativePrompt) warnings.push('The saved negative prompt was not restored.');
  return warnings.length > 0
    ? `Metadata loaded; ${warnings.join(' ')}`
    : 'Generation metadata loaded into prompt bar.'; // One toaster summarizes every partial restore.
};

export const useGenerationPromptBarTransfer = ({
  displayedImages,
  providerAvailability,
  applyGenerationSettings,
  selection,
  setApiProvider,
  setPrompt,
  setCameraSettings,
  setActiveEmbeddedPromptBarId,
  setSelectedVideoPromptAreaId,
  setVideoNegativePromptForModel,
  setWan27ImageNegativePrompt,
  setKrea2StyleReferenceStrengths,
  setToastMessage,
  resetEditContext,
}: UseGenerationPromptBarTransferArgs): UseGenerationPromptBarTransferResult => {
  const [promptFocusRequestToken, setPromptFocusRequestToken] = useState(0);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTransferToast = useCallback((message: string, durationMs: number) => {
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current); // An earlier transfer must not cut this toast short.
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      toastTimeoutRef.current = null;
      setToastMessage(null);
    }, durationMs);
  }, [setToastMessage]);
  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current); // Never write toast state after unmount.
    }
  }, []);
  const {
    setSelectedImageIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setSeedanceReferenceOrderIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setSourceAudioId,
  } = selection;

  const handleMetadataToPromptBar = useCallback((imageId: string) => {
    const targetImage = displayedImages.find(image => image.id === imageId);
    const generation = targetImage?.metadata?.generation;
    if (!generation) {
      showTransferToast('No generation metadata found for this media.', 2000);
      return;
    }

    setPrompt(generation.prompt); // Saved generation text always replaces the current prompt.
    setCameraSettings(cloneCameraSelection(EMPTY_CAMERA_SELECTION)); // Saved prompts already include any camera prefix.
    setActiveEmbeddedPromptBarId(null);
    setPromptFocusRequestToken(token => token + 1);

    const requestedApiProvider: ApiProviderId = generation.provider === 'google' ? 'google' : 'fal';
    if (getGenerationTransferBlockReason(generation, providerAvailability) || !applyGenerationSettings(generation)) {
      showTransferToast('Prompt loaded and camera settings cleared, but the saved model or provider is unavailable.', 3500); // The toolbar already blocks this, so it only backstops a settings apply that fails late.
      return;
    }

    const restoredSelection = resolveGenerationInputSelection(generation, displayedImages);
    if (generation.kind === 'image_edit') resetEditContext(); // Saved edits start from a clean neutral canvas context.
    setApiProvider(requestedApiProvider);
    setSelectedImageIds(restoredSelection.selectedImageIds);
    setReferenceImageIds(restoredSelection.referenceImageIds);
    setReferenceVideoIds(restoredSelection.referenceVideoIds);
    setReferenceAudioIds(restoredSelection.referenceAudioIds);
    setSeedanceReferenceOrderIds(restoredSelection.seedanceReferenceOrderIds);
    setElementImageIds(restoredSelection.elementImageIds);
    setVideoLastFrameImageId(restoredSelection.videoLastFrameImageId);
    setSourceVideoId(restoredSelection.sourceVideoId);
    setSourceAudioId(restoredSelection.sourceAudioId);
    setSelectedVideoPromptAreaId(null);

    const normalizedModelId = generation.provider === 'fal' ? normalizeFalModelId(generation.modelId) : undefined;
    const savedNegativePrompt = generation.falOptions?.negativePrompt ?? '';
    const hasSavedNegativePrompt = savedNegativePrompt.trim().length > 0;
    let skippedNegativePrompt = false;
    if (normalizedModelId && isFalVideoModelId(normalizedModelId) && isVideoNegativePromptModelId(normalizedModelId)) {
      setVideoNegativePromptForModel(normalizedModelId, savedNegativePrompt); // Only models owning a bucket may overwrite it, never a shared fallback.
    } else if (normalizedModelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID) {
      setWan27ImageNegativePrompt(savedNegativePrompt); // Wan image generations use the dedicated negative prompt field.
    } else {
      skippedNegativePrompt = hasSavedNegativePrompt; // Other settings and inputs still load when this field cannot.
    }

    const restoredReferenceIds = new Set(restoredSelection.referenceImageIds);
    const restoredKreaStrengths = generation.falOptions?.krea2StyleReferenceStrengths ?? {};
    setKrea2StyleReferenceStrengths(Object.fromEntries(
      Object.entries(restoredKreaStrengths)
        .filter(([referenceId]) => restoredReferenceIds.has(referenceId))
        .map(([referenceId, strength]) => [referenceId, normalizeKrea2StyleStrength(strength)]),
    )); // Only surviving Krea references keep their saved strength.

    showTransferToast(buildTransferToastMessage(
      restoredSelection.missingInputCount,
      Boolean(generation.editPaths?.length),
      skippedNegativePrompt,
    ), 3500);
  }, [
    applyGenerationSettings,
    displayedImages,
    providerAvailability,
    resetEditContext,
    setActiveEmbeddedPromptBarId,
    setApiProvider,
    setCameraSettings,
    setElementImageIds,
    setKrea2StyleReferenceStrengths,
    setPrompt,
    setReferenceAudioIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setSeedanceReferenceOrderIds,
    setSelectedImageIds,
    setSelectedVideoPromptAreaId,
    setSourceAudioId,
    setSourceVideoId,
    showTransferToast,
    setVideoLastFrameImageId,
    setVideoNegativePromptForModel,
    setWan27ImageNegativePrompt,
  ]);

  return { handleMetadataToPromptBar, promptFocusRequestToken }; // App only wires the action and focus signal.
};
