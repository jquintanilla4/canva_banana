import { useMemo } from 'react';
import { Tool } from '../types';
import { getFalModelLabel } from '../services/modelConfig';

type Args = {
  apiProvider: 'google' | 'fal';
  appMode: 'CANVAS' | 'ANNOTATE' | 'INPAINT';
  tool: Tool;
  prompt: string;
  isVideoMode: boolean;
  isUpscaleModel: boolean;
  isSeedreamModel: boolean;
  isGeminiModel: boolean;
  isReveModel: boolean;
  isKlingModel: boolean;
  isKlingVideoModel: boolean;
  isKling26VideoModel: boolean;
  isHailuoVideoModel: boolean;
  falModelId: string;
  falNumImages: number;
  hasInpaintMask: boolean;
  activePrimaryImage: unknown;
};

export type GenerationGuardsResult = {
  submitDisabled: boolean;
  promptPlaceholderText: string;
  disablePromptInput: boolean;
  shouldValidateFalOptions: boolean;
  isNumImagesInvalid: boolean;
  isTextToImage: boolean;
  promptEmpty: boolean;
};

export function useGenerationGuards({
  apiProvider,
  appMode,
  tool,
  prompt,
  isVideoMode,
  isUpscaleModel,
  isSeedreamModel,
  isGeminiModel,
  isReveModel,
  isKlingModel,
  isKlingVideoModel,
  isKling26VideoModel,
  isHailuoVideoModel,
  falModelId,
  falNumImages,
  hasInpaintMask,
  activePrimaryImage,
}: Args): GenerationGuardsResult {
  // Central place for prompt bar UX rules (disable states, placeholders) based on model/tool constraints.
  return useMemo(() => {
    const usingFal = apiProvider === 'fal';
    const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
    const isTextToImage = !activePrimaryImage;
    const promptEmpty = prompt.trim().length === 0;
    const shouldValidateFalOptions = usingFal && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
    const isNumImagesInvalid =
      !Number.isFinite(falNumImages) ||
      falNumImages < 1 ||
      falNumImages > 4;
    const requiresPrompt = !(usingFal && isUpscaleModel);
    const isPromptMissing = requiresPrompt && promptEmpty;
    const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
    const requiresSelectedImageForVideo = usingFal && isVideoMode && isTextToImage;
    const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
      (usingFal && isReveModel) ||
      (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
      (appMode === 'INPAINT' && !hasInpaintMask)
    );

    const submitDisabled = isPromptMissing ||
      (shouldValidateFalOptions && isNumImagesInvalid) ||
      requiresSelectedImageForUpscale ||
      requiresSelectedImageForVideo ||
      editConstraintsActive;

    const promptPlaceholderText = isVideoMode
      ? (activePrimaryImage
        ? 'Describe the motion or scene you want this image to turn into...'
        : 'Select an image and describe the video you want to create...')
      : usingFal && isUpscaleModel
        ? `Prompt disabled for ${getFalModelLabel(falModelId)}. Select an image and scale factor.`
        : isTextToImage
          ? 'Describe the image you want to create... (Cmd/Ctrl + Enter to generate)'
          : 'Describe your edit... (Cmd/Ctrl + Enter to generate)';
    const disablePromptInput = usingFal && isUpscaleModel;

    return {
      submitDisabled,
      promptPlaceholderText,
      disablePromptInput,
      shouldValidateFalOptions,
      isNumImagesInvalid,
      isTextToImage,
      promptEmpty,
    };
  }, [
    activePrimaryImage,
    apiProvider,
    appMode,
    falModelId,
    falNumImages,
    hasInpaintMask,
    isGeminiModel,
    isHailuoVideoModel,
    isKling26VideoModel,
    isKlingModel,
    isKlingVideoModel,
    isReveModel,
    isSeedreamModel,
    isUpscaleModel,
    isVideoMode,
    prompt,
    tool,
  ]);
}
