import { useMemo } from 'react';
import { Tool } from '../types';
import {
  getFalModelLabel,
  INFINITALK_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  WAN_26_I2V_MODEL_ID,
  type FalModelId,
} from '../services/modelConfig';

type Args = {
  apiProvider: 'google' | 'fal';
  appMode: 'CANVAS' | 'ANNOTATE';
  tool: Tool;
  prompt: string;
  isKlingO1EditMode: boolean;
  isKlingO1RefV2VMode?: boolean;
  hasSourceVideo: boolean;
  hasSourceAudio: boolean;
  isVideoMode: boolean;
  isUpscaleModel: boolean;
  isSeedreamModel: boolean;
  isNanoBananaModel: boolean;
  isReveModel: boolean;
  isKlingModel: boolean;
  isGrokModel: boolean; // Grok text-to-image flag.
  isGrokImagineVideoModel: boolean;
  isKlingVideoModel: boolean;
  isKling26VideoModel: boolean;
  isKling26ControlVideoModel: boolean;
  isHailuoVideoModel: boolean;
  isVeo31VideoModel: boolean;
  veo31Variant: 'i2v-fflf' | 'extend';
  falModelId: string;
  falNumImages: number;
  activePrimaryImage: unknown;
  primarySelectionMediaType: 'image' | 'video' | 'audio' | null;
  hasSelectedStillImage: boolean;
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
  hasSourceAudio,
  isVideoMode,
  isUpscaleModel,
  isSeedreamModel,
  isNanoBananaModel,
  isReveModel,
  isKlingModel,
  isGrokModel, // Grok text-to-image flag.
  isGrokImagineVideoModel,
  isKlingVideoModel,
  isKling26VideoModel,
  isKling26ControlVideoModel,
  isHailuoVideoModel,
  isVeo31VideoModel,
  veo31Variant,
  falModelId,
  falNumImages,
  activePrimaryImage,
  primarySelectionMediaType,
  hasSelectedStillImage,
}: Args): GenerationGuardsResult {
  const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode;
  const isWanVisionEnhancerVideoModel = isVideoMode && falModelId === WAN_VISION_ENHANCER_MODEL_ID;
  const isWanAnimateVideoModel = isVideoMode && falModelId === WAN_ANIMATE_MODEL_ID;
  const isOneToAllAnimateVideoModel = isVideoMode && falModelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
  const isScailVideoModel = isVideoMode && falModelId === SCAIL_VIDEO_MODEL_ID;
  const isLipsyncVideoModel = isVideoMode && falModelId === SYNC_LIPSYNC_MODEL_ID;
  const isInfinitalkVideoModel = isVideoMode && falModelId === INFINITALK_VIDEO_MODEL_ID;
  const isWan26I2VVideoModel = isVideoMode && falModelId === WAN_26_I2V_MODEL_ID;
  const isVeo31ExtendMode = isVeo31VideoModel && veo31Variant === 'extend';
  const isWanVideoInputMode = isWanVisionEnhancerVideoModel || isWanAnimateVideoModel;
  const isAudioInputMode = isLipsyncVideoModel || isInfinitalkVideoModel;
  const isFalVideoInputMode = isWanVideoInputMode
    || isOneToAllAnimateVideoModel
    || isAudioInputMode
    || isKling26ControlVideoModel
    || isVeo31ExtendMode
    || isScailVideoModel;
  const isVideoInputMode = isKlingO1VideoInputMode || isFalVideoInputMode;
  // Central place for prompt bar UX rules (disable states, placeholders) based on model/tool constraints.
  return useMemo(() => {
    const usingFal = apiProvider === 'fal';
    const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
    const hasPrimaryImage = Boolean(activePrimaryImage);
    const hasPrimaryVideoSelected = primarySelectionMediaType === 'video';
    const isGrokImagineVideoEditMode = isGrokImagineVideoModel && hasPrimaryVideoSelected;
    const hasWanAnimateStillImage = isWanAnimateVideoModel || isOneToAllAnimateVideoModel
      ? hasSelectedStillImage
      : hasPrimaryImage;
    const hasScailStillImage = isScailVideoModel ? hasSelectedStillImage : hasPrimaryImage;
    const hasKling26ControlStillImage = isKling26ControlVideoModel ? hasSelectedStillImage : hasPrimaryImage;
    const isTextToImage = !hasPrimaryImage && !(isVideoMode && (
      (isVideoInputMode && hasSourceVideo) || isGrokImagineVideoEditMode
    ));
    const promptEmpty = prompt.trim().length === 0;
    const shouldValidateFalOptions = usingFal
      && !isVideoMode
      && (isSeedreamModel || isNanoBananaModel || isReveModel || isKlingModel || isGrokModel); // Include Grok validation.
    const isNumImagesInvalid =
      !Number.isFinite(falNumImages) ||
      falNumImages < 1 ||
      falNumImages > 4;
    const isWanPromptOptional = usingFal && isWanVideoInputMode;
    const isLipsyncPromptOptional = usingFal && isLipsyncVideoModel;
    const requiresPrompt = !(usingFal && (isUpscaleModel || isWanPromptOptional || isLipsyncPromptOptional));
    const isPromptMissing = requiresPrompt && promptEmpty;
    const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
    const requiresSelectedImageForVideo = usingFal && isVideoMode && !isVideoInputMode && !hasPrimaryImage && !isGrokImagineVideoEditMode;
    const requiresSelectedImageForWanAnimate = usingFal && isWanAnimateVideoModel && !hasWanAnimateStillImage;
    const requiresSelectedImageForOneToAll = usingFal && isOneToAllAnimateVideoModel && !hasWanAnimateStillImage;
    const requiresSelectedImageForKling26Control = usingFal && isKling26ControlVideoModel && !hasKling26ControlStillImage;
    const requiresSelectedImageForScail = usingFal && isScailVideoModel && !hasScailStillImage;
    const requiresSourceVideoForVideoInput = usingFal && isVideoMode && isVideoInputMode && !hasSourceVideo;
    const requiresSourceAudioForVideoInput = usingFal && isVideoMode && isAudioInputMode && !hasSourceAudio;
    const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
      appMode === 'CANVAS' && !isCanvasGenerationTool
    );

    const submitDisabled = isPromptMissing ||
      (shouldValidateFalOptions && isNumImagesInvalid) ||
      requiresSelectedImageForUpscale ||
      requiresSelectedImageForVideo ||
      requiresSelectedImageForWanAnimate ||
      requiresSelectedImageForOneToAll ||
      requiresSelectedImageForKling26Control ||
      requiresSelectedImageForScail ||
      requiresSourceVideoForVideoInput ||
      requiresSourceAudioForVideoInput ||
      editConstraintsActive;

    const promptPlaceholderText = (() => {
      if (isVideoMode) {
        if (isLipsyncVideoModel) {
          return `Prompt disabled for ${getFalModelLabel(falModelId as FalModelId)}. Select a video and audio clip to lip sync.`;
        }
        if (isWanAnimateVideoModel) {
          if (!hasSourceVideo) {
            return `Prompt disabled for ${getFalModelLabel(falModelId as FalModelId)}. Select a video to replace a character.`;
          }
          if (!hasWanAnimateStillImage) {
            return `Prompt disabled for ${getFalModelLabel(falModelId as FalModelId)}. Select a still image to replace the character.`;
          }
          return `Prompt disabled for ${getFalModelLabel(falModelId as FalModelId)}. Ready to generate.`;
        }
        if (isOneToAllAnimateVideoModel) {
          if (!hasSourceVideo) {
            return 'Select a pose video, then select a reference image to animate...';
          }
          return hasWanAnimateStillImage
            ? 'Describe the motion or scene you want to animate...'
            : 'Select a reference image to animate...';
        }
        if (isScailVideoModel) {
          if (!hasSourceVideo) {
            return 'Select a motion video, then select a reference image to animate...';
          }
          return hasScailStillImage
            ? 'Describe the motion you want to apply to the reference image...'
            : 'Select a reference image to animate...';
        }
        if (isKling26ControlVideoModel) {
          if (!hasSourceVideo) {
            return 'Select a motion driver video, then select a character image...';
          }
          return hasKling26ControlStillImage
            ? 'Describe the motion or scene you want to transfer...'
            : 'Select a character image to control the motion...';
        }
        if (isGrokImagineVideoEditMode) {
          return 'Describe how you want to edit this video...';
        }
        if (hasPrimaryImage) {
          return 'Describe the motion or scene you want this image to turn into...';
        }
        if (isVideoInputMode) {
          const hasAllInputs = hasSourceVideo && (!isInfinitalkVideoModel || hasSourceAudio);
          if (hasAllInputs) {
            if (isWanVideoInputMode) {
              return 'Describe how you want to enhance this video (optional)...';
            }
            if (isInfinitalkVideoModel) {
              return 'Describe the talking avatar and expression you want to generate...';
            }
            if (isKlingO1EditMode) {
              return 'Describe how you want to edit this video...';
            }
            return 'Describe the next shot based on this reference video...';
          }
          if (isWanVideoInputMode) {
            return 'Select a video to enhance, then optionally describe changes...';
          }
          if (isInfinitalkVideoModel) {
            return 'Select a video and audio clip, then describe the talking avatar...';
          }
          if (isKlingO1EditMode) {
            return 'Select a video to edit, then describe the changes...';
          }
          return 'Select a reference video, then describe the next shot...';
        }
        if (isGrokImagineVideoModel) {
          return 'Select an image or video and describe what you want to generate...';
        }
        return 'Select an image and describe the video you want to create...';
      }
      if (usingFal && isUpscaleModel) {
        return `Prompt disabled for ${getFalModelLabel(falModelId as FalModelId)}. Select an image and scale factor.`;
      }
      return isTextToImage
        ? 'Describe the image you want to create... (Cmd/Ctrl + Enter to generate)'
        : 'Describe your edit... (Cmd/Ctrl + Enter to generate)';
    })();
    const disablePromptInput = usingFal && (isUpscaleModel || isLipsyncVideoModel || isWanAnimateVideoModel);

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
    hasSelectedStillImage,
    hasSourceAudio,
    hasSourceVideo,
    primarySelectionMediaType,
    isGrokImagineVideoModel,
    isNanoBananaModel,
    isHailuoVideoModel,
    isKling26VideoModel,
    isKling26ControlVideoModel,
    isKlingModel,
    isKlingO1EditMode,
    isKlingO1VideoInputMode,
    isKlingVideoModel,
    isWanAnimateVideoModel,
    isScailVideoModel,
    isInfinitalkVideoModel,
    isLipsyncVideoModel,
    isOneToAllAnimateVideoModel,
    isWan26I2VVideoModel,
    isVeo31ExtendMode,
    isReveModel,
    isSeedreamModel,
    isUpscaleModel,
    isVideoMode,
    prompt,
    tool,
  ]);
}
