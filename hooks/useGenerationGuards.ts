import { useMemo } from 'react';
import { Tool } from '../types';
import { getFalModelLabel, WAN_ANIMATE_MODEL_ID, WAN_VISION_ENHANCER_MODEL_ID } from '../services/modelConfig';

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
  const isWanVisionEnhancerVideoModel = isVideoMode && falModelId === WAN_VISION_ENHANCER_MODEL_ID;
  const isWanAnimateVideoModel = isVideoMode && falModelId === WAN_ANIMATE_MODEL_ID;
  const isWanVideoInputMode = isWanVisionEnhancerVideoModel || isWanAnimateVideoModel;
  const isVideoInputMode = isKlingO1VideoInputMode || isWanVideoInputMode;
  // Central place for prompt bar UX rules (disable states, placeholders) based on model/tool constraints.
  return useMemo(() => {
    const usingFal = apiProvider === 'fal';
    const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
    const hasPrimaryImage = Boolean(activePrimaryImage);
    const isTextToImage = !hasPrimaryImage && !(isVideoMode && isVideoInputMode && hasSourceVideo);
    const promptEmpty = prompt.trim().length === 0;
    const shouldValidateFalOptions = usingFal && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
    const isNumImagesInvalid =
      !Number.isFinite(falNumImages) ||
      falNumImages < 1 ||
      falNumImages > 4;
    const isWanPromptOptional = usingFal && isWanVideoInputMode;
    const requiresPrompt = !(usingFal && (isUpscaleModel || isWanPromptOptional));
    const isPromptMissing = requiresPrompt && promptEmpty;
    const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
    const requiresSelectedImageForVideo = usingFal && isVideoMode && !isVideoInputMode && !hasPrimaryImage;
    const requiresSelectedImageForWanAnimate = usingFal && isWanAnimateVideoModel && !hasPrimaryImage;
    const requiresSourceVideoForVideoInput = usingFal && isVideoMode && isVideoInputMode && !hasSourceVideo;
    const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
      (usingFal && isReveModel) ||
      (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
      (appMode === 'INPAINT' && !hasInpaintMask)
    );

    const submitDisabled = isPromptMissing ||
      (shouldValidateFalOptions && isNumImagesInvalid) ||
      requiresSelectedImageForUpscale ||
      requiresSelectedImageForVideo ||
      requiresSelectedImageForWanAnimate ||
      requiresSourceVideoForVideoInput ||
      editConstraintsActive;

    const promptPlaceholderText = isVideoMode
      ? (isWanAnimateVideoModel
        ? (hasSourceVideo
          ? (hasPrimaryImage ? 'Optionally describe changes for this replacement...' : 'Select a still image to replace the character...')
          : 'Select a video to replace a character, then select a still image...')
        : (hasPrimaryImage
          ? 'Describe the motion or scene you want this image to turn into...'
          : isVideoInputMode
            ? (hasSourceVideo
              ? (isWanVideoInputMode
                ? 'Describe how you want to enhance this video (optional)...'
                : (isKlingO1EditMode
                  ? 'Describe how you want to edit this video...'
                  : 'Describe the next shot based on this reference video...'))
              : (isWanVideoInputMode
                ? 'Select a video to enhance, then optionally describe changes...'
                : (isKlingO1EditMode
                  ? 'Select a video to edit, then describe the changes...'
                  : 'Select a reference video, then describe the next shot...')))
            : 'Select an image and describe the video you want to create...'))
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
	    isWanAnimateVideoModel,
    isReveModel,
    isSeedreamModel,
    isUpscaleModel,
    isVideoMode,
    prompt,
    tool,
  ]);
}
