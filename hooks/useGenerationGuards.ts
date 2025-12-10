import { useMemo } from 'react';
import { Tool } from '../types';
import { getFalModelLabel } from '../services/modelConfig';

type Args = {
  apiProvider: 'google' | 'fal';
  appMode: 'CANVAS' | 'ANNOTATE' | 'INPAINT';
  tool: Tool;
  prompt: string;
  isKlingO1EditMode: boolean;
  isKlingO1RefV2VMode?: boolean;
  hasSourceVideo: boolean;
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
  isKlingO1EditMode,
  isKlingO1RefV2VMode = false,
  hasSourceVideo,
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
  const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode;
  // Central place for prompt bar UX rules (disable states, placeholders) based on model/tool constraints.
  return useMemo(() => {
    const usingFal = apiProvider === 'fal';
    const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
    const hasPrimaryImage = Boolean(activePrimaryImage);
    const isTextToImage = !hasPrimaryImage && !(isVideoMode && isKlingO1VideoInputMode && hasSourceVideo);
    const promptEmpty = prompt.trim().length === 0;
    const shouldValidateFalOptions = usingFal && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
    const isNumImagesInvalid =
      !Number.isFinite(falNumImages) ||
      falNumImages < 1 ||
      falNumImages > 4;
    const requiresPrompt = !(usingFal && isUpscaleModel);
    const isPromptMissing = requiresPrompt && promptEmpty;
    const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
    const requiresSelectedImageForVideo = usingFal && isVideoMode && !isKlingO1VideoInputMode && !hasPrimaryImage;
    const requiresSourceVideoForVideoInput = usingFal && isVideoMode && isKlingO1VideoInputMode && !hasSourceVideo;
    const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
      (usingFal && isReveModel) ||
      (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
      (appMode === 'INPAINT' && !hasInpaintMask)
    );

    const submitDisabled = isPromptMissing ||
      (shouldValidateFalOptions && isNumImagesInvalid) ||
      requiresSelectedImageForUpscale ||
      requiresSelectedImageForVideo ||
      requiresSourceVideoForVideoInput ||
      editConstraintsActive;

    const promptPlaceholderText = isVideoMode
      ? (hasPrimaryImage
        ? 'Describe the motion or scene you want this image to turn into...'
        : isKlingO1VideoInputMode
          ? (hasSourceVideo
            ? (isKlingO1EditMode
              ? 'Describe how you want to edit this video...'
              : 'Describe the next shot based on this reference video...')
            : (isKlingO1EditMode
              ? 'Select a video to edit, then describe the changes...'
              : 'Select a reference video, then describe the next shot...'))
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
    hasSourceVideo,
    isGeminiModel,
    isHailuoVideoModel,
    isKling26VideoModel,
    isKlingModel,
    isKlingO1EditMode,
    isKlingO1VideoInputMode,
    isKlingVideoModel,
    isReveModel,
    isSeedreamModel,
    isUpscaleModel,
    isVideoMode,
    prompt,
    tool,
  ]);
}
