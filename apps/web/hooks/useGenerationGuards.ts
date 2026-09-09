import { Tool, type Seedance2Variant, type Seedance2VolcengineModel } from '../types';
import type { Flux3InputKind } from '../utils/flux3';
import type { UseFalSettingsResult } from './useFalSettings';
import type { ModelUiCapabilities } from '../services/modelCapabilities';
import {
  GROK_IMAGINE_IMAGE_MODEL_ID,
  isGptImage2EditModelId,
  isGptImage25Model,
  isNanoBananaEditModelId,
  isSeedreamModelId,
} from '../services/modelConfig';
import {
  getFalModelLabel,
  getFalNumImageMaxForModel,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  isRecraftV4ProModel,
  SCAIL_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  type FalModelId,
} from '../services/modelConfig';
import {
  getSeedance2VolcengineReferenceLimits,
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
} from '../utils/seedanceReferences';
import { getJimengMultiframeDisabledReason } from '../utils/jimengMultiframe';
import {
  SEEDANCE25_REFERENCE_AUDIO_LIMIT,
  SEEDANCE25_REFERENCE_IMAGE_LIMIT,
  SEEDANCE25_REFERENCE_VIDEO_LIMIT,
} from '../utils/seedance25References';

type Args = {
  apiProvider: 'google' | 'fal';
  appMode: 'CANVAS' | 'ANNOTATE';
  tool: Tool;
  prompt: string;
  isKlingO3EditMode: boolean;
  hasSourceVideo: boolean;
  hasSourceAudio: boolean;
  isVideoMode: boolean;
  isUpscaleModel: boolean;
  isSeedreamModel: boolean;
  isNanoBananaModel: boolean;
  isGptImage2Model?: boolean;
  isKrea2LargeModel?: boolean;
  isGrokModel: boolean; // Grok text-to-image flag.
  isGrokImagineVideoModel: boolean;
  isKlingVideoModel: boolean;
  isKlingV3VideoModel?: boolean;
  isKlingO3VideoModel: boolean;
  isKlingV3ControlVideoModel: boolean;
  isVeo31VideoModel: boolean;
  isMiniMaxH3VideoModel?: boolean;
  isFlux3VideoModel?: boolean;
  flux3InputKind?: Flux3InputKind;
  flux3ValidationError?: string | null;
  miniMaxH3Variant?: 'standard' | 'reference';
  miniMaxH3ReferenceAssetCount?: number;
  isSeedance2VideoModel: boolean;
  seedance2Variant: Seedance2Variant;
  seedance2ReferenceAssetCount: number;
  seedance2ReferenceVideoCount?: number;
  seedance2VolcengineModel?: Seedance2VolcengineModel; // Missing sub-model state defaults to the 2.0 copy.
  isSeedance25VideoModel?: boolean;
  seedance25Variant?: 'smart' | 'reference';
  seedance25ReferenceAssetCount?: number;
  wan27VideoVariant?: 'smart' | 'reference' | 'edit';
  wan27ReferenceAssetCount?: number;
  veo31Variant: 'i2v-fflf' | 'extend';
  falModelId: string;
  falNumImages: number;
  activePrimaryImage: unknown;
  primarySelectionMediaType: 'image' | 'video' | 'audio' | null;
  hasSelectedStillImage: boolean;
  selectedMediaCount: number;
  selectedStillImageCount: number;
};

export type GenerationGuardsArgs = Args;

type BuildGenerationGuardArgsParams = {
  apiProvider: 'google' | 'fal';
  appMode: 'CANVAS' | 'ANNOTATE';
  tool: Tool;
  prompt: string;
  fal: UseFalSettingsResult;
  capabilities: ModelUiCapabilities;
  flux3RunPlan: { policy: { inputKind: Flux3InputKind }; error?: string | null };
  hasSourceVideo: boolean;
  hasSourceAudio: boolean;
  seedance2ReferenceAssetCount: number;
  seedance2ReferenceVideoCount: number;
  taggedReferenceImageCount: number;
  taggedReferenceVideoCount: number;
  activePrimaryImage: unknown;
  primarySelectionMediaType: 'image' | 'video' | 'audio' | null;
  hasSelectedStillImage: boolean;
  selectedMediaCount: number;
  selectedStillImageCount: number;
};

// Assembles the guards' argument bag from live settings plus the capability
// registry, so App does not have to thread ~30 model flags by hand. The Args type
// itself stays unchanged — the per-model test suites construct it directly.
export const buildGenerationGuardArgs = ({
  apiProvider,
  appMode,
  tool,
  prompt,
  fal,
  capabilities,
  flux3RunPlan,
  hasSourceVideo,
  hasSourceAudio,
  seedance2ReferenceAssetCount,
  seedance2ReferenceVideoCount,
  taggedReferenceImageCount,
  taggedReferenceVideoCount,
  activePrimaryImage,
  primarySelectionMediaType,
  hasSelectedStillImage,
  selectedMediaCount,
  selectedStillImageCount,
}: BuildGenerationGuardArgsParams): GenerationGuardsArgs => ({
  apiProvider,
  appMode,
  tool,
  prompt,
  isKlingO3EditMode: fal.isKlingO3EditMode,
  hasSourceVideo,
  hasSourceAudio,
  isVideoMode: fal.isVideoMode,
  isUpscaleModel: fal.isUpscaleModel,
  isSeedreamModel: !fal.isVideoMode && isSeedreamModelId(fal.falModelId),
  isNanoBananaModel: !fal.isVideoMode && isNanoBananaEditModelId(fal.falModelId),
  isGptImage2Model: !fal.isVideoMode && (isGptImage2EditModelId(fal.falModelId) || isGptImage25Model(fal.falModelId)),
  isKrea2LargeModel: apiProvider === 'fal' && fal.isKrea2LargeModel, // Krea behavior only applies while Fal is active.
  isGrokModel: !fal.isVideoMode && fal.falModelId === GROK_IMAGINE_IMAGE_MODEL_ID, // Grok text-to-image.
  isGrokImagineVideoModel: fal.isGrokImagineVideoModel,
  isKlingVideoModel: fal.isKlingVideoModel,
  isKlingV3VideoModel: fal.isKlingV3VideoModel,
  isKlingO3VideoModel: fal.isKlingO3VideoModel,
  isKlingV3ControlVideoModel: fal.isKlingV3ControlVideoModel,
  isVeo31VideoModel: fal.isVeo31VideoModel,
  isMiniMaxH3VideoModel: fal.isMiniMaxH3VideoModel,
  isFlux3VideoModel: fal.isFlux3VideoModel,
  flux3InputKind: flux3RunPlan.policy.inputKind,
  flux3ValidationError: flux3RunPlan.error,
  miniMaxH3Variant: fal.miniMaxH3Variant,
  miniMaxH3ReferenceAssetCount: capabilities.selection.miniMaxH3ReferenceMode ? seedance2ReferenceAssetCount : 0,
  isSeedance2VideoModel: fal.isSeedance2VideoModel,
  seedance2Variant: fal.seedance2Variant,
  seedance2ReferenceAssetCount,
  seedance2ReferenceVideoCount,
  seedance2VolcengineModel: fal.seedance2VolcengineModel,
  isSeedance25VideoModel: fal.isSeedance25VideoModel,
  seedance25Variant: fal.seedance25Variant,
  seedance25ReferenceAssetCount: capabilities.selection.seedance25ReferenceMode ? seedance2ReferenceAssetCount : 0,
  wan27VideoVariant: fal.wan27VideoVariant,
  wan27ReferenceAssetCount: capabilities.selection.wan27ReferenceMode ? taggedReferenceImageCount + taggedReferenceVideoCount : 0,
  veo31Variant: fal.veo31Variant,
  falModelId: fal.falModelId,
  falNumImages: fal.falNumImages,
  activePrimaryImage,
  primarySelectionMediaType,
  hasSelectedStillImage,
  selectedMediaCount,
  selectedStillImageCount,
});

export type GenerationGuardsResult = {
  submitDisabled: boolean;
  submitDisabledReason: string | null;
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
  isKlingO3EditMode,
  hasSourceVideo,
  hasSourceAudio,
  isVideoMode,
  isUpscaleModel,
  isSeedreamModel,
  isNanoBananaModel,
  isGptImage2Model = false,
  isKrea2LargeModel = false,
  isGrokModel, // Grok text-to-image flag.
  isGrokImagineVideoModel,
  isKlingVideoModel,
  isKlingV3VideoModel = false,
  isKlingO3VideoModel,
  isKlingV3ControlVideoModel,
  isVeo31VideoModel,
  isMiniMaxH3VideoModel = false,
  isFlux3VideoModel = false,
  flux3InputKind = 'optional-start-image',
  flux3ValidationError = null,
  miniMaxH3Variant = 'reference',
  miniMaxH3ReferenceAssetCount = 0,
  isSeedance2VideoModel,
  seedance2Variant,
  seedance2ReferenceAssetCount,
  seedance2ReferenceVideoCount = 0,
  seedance2VolcengineModel = 'standard',
  isSeedance25VideoModel = false,
  seedance25Variant = 'reference',
  seedance25ReferenceAssetCount = 0,
  wan27VideoVariant,
  wan27ReferenceAssetCount = 0,
  veo31Variant,
  falModelId,
  falNumImages,
  activePrimaryImage,
  primarySelectionMediaType,
  hasSelectedStillImage,
  selectedMediaCount,
  selectedStillImageCount,
}: Args): GenerationGuardsResult {
  const isKlingO3VideoInputMode = isKlingO3EditMode;
  const isWanVisionEnhancerVideoModel = isVideoMode && falModelId === WAN_VISION_ENHANCER_MODEL_ID;
  const isWanAnimateVideoModel = isVideoMode && falModelId === WAN_ANIMATE_MODEL_ID;
  const isFlux3ExtendMode = isVideoMode && isFlux3VideoModel && flux3InputKind === 'source-video';
  const isScailVideoModel = isVideoMode && falModelId === SCAIL_VIDEO_MODEL_ID;
  const isLipsyncVideoModel = isVideoMode && falModelId === SYNC_LIPSYNC_MODEL_ID;
  const isHeygenV3LipsyncVideoModel = isVideoMode && falModelId === HEYGEN_V3_LIPSYNC_MODEL_ID;
  const isInfinitalkVideoModel = isVideoMode && falModelId === INFINITALK_VIDEO_MODEL_ID;
  const isWan27VideoModel = isVideoMode && falModelId === WAN_27_VIDEO_MODEL_ID;
  const isKlingV3SmartVideoModel = isVideoMode && (isKlingV3VideoModel || falModelId === KLING_V3_VIDEO_MODEL_ID);
  const isJimengMultiframeVideoModel = isVideoMode && falModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
  const isWan27ReferenceMode = isWan27VideoModel && wan27VideoVariant === 'reference';
  const isWan27EditMode = isWan27VideoModel && wan27VideoVariant === 'edit';
  const isVeo31ExtendMode = isVeo31VideoModel && veo31Variant === 'extend';
  const isSeedance2ReferenceMode = isSeedance2VideoModel && seedance2Variant === 'reference';
  const isVolcengineSeedance2VideoModel = isSeedance2VideoModel && falModelId === SEEDANCE_2_VIDEO_MODEL_ID; // Edit/Extend only exist on the Volcengine backend.
  const isSeedance2EditMode = isVolcengineSeedance2VideoModel && seedance2Variant === 'edit';
  const isSeedance2ExtendMode = isVolcengineSeedance2VideoModel && seedance2Variant === 'extend';
  const isVolcengineSeedance25Model = isVolcengineSeedance2VideoModel && seedance2VolcengineModel === 'seedance25';
  const seedance2VolcengineLabel = isVolcengineSeedance25Model ? 'Seedance 2.5' : 'Seedance 2';
  const seedance2VolcengineReferenceLimits = getSeedance2VolcengineReferenceLimits(isVolcengineSeedance25Model ? 'seedance25' : 'standard'); // Placeholder copy follows the selected sub-model's caps.
  const isSeedance25ReferenceMode = isSeedance25VideoModel && seedance25Variant === 'reference';
  const isJimengReferenceMode = (
    falModelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID && isSeedance2ReferenceMode
  ) || (
    falModelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID && isSeedance25ReferenceMode
  ); // Dreamina multimodal prompts are optional for both supported Seedance families.
  const isMiniMaxH3ReferenceMode = isMiniMaxH3VideoModel && miniMaxH3Variant === 'reference';
  const isWanVideoInputMode = isWanVisionEnhancerVideoModel || isWanAnimateVideoModel;
  const isAudioInputMode = isLipsyncVideoModel || isHeygenV3LipsyncVideoModel || isInfinitalkVideoModel;
  const isFalVideoInputMode = isWanVideoInputMode
    || isAudioInputMode
    || isKlingV3ControlVideoModel
    || isVeo31ExtendMode
    || isFlux3ExtendMode
    || isScailVideoModel
    || isWan27EditMode;
  const isVideoInputMode = isKlingO3VideoInputMode || isFalVideoInputMode;
  const hasPrimaryImage = Boolean(activePrimaryImage);
  const hasSeedance2SmartUnsupportedSelection = apiProvider === 'fal'
    && isVideoMode
    && isSeedance2VideoModel
    && !isSeedance2ReferenceMode
    && !isSeedance2EditMode
    && !isSeedance2ExtendMode
    && primarySelectionMediaType !== null
    && !hasPrimaryImage;
  const hasSeedance25SmartUnsupportedSelection = apiProvider === 'fal'
    && isVideoMode
    && isSeedance25VideoModel
    && !isSeedance25ReferenceMode
    && primarySelectionMediaType !== null
    && !hasPrimaryImage;
  const hasMiniMaxH3StandardUnsupportedSelection = apiProvider === 'fal'
    && isVideoMode
    && isMiniMaxH3VideoModel
    && !isMiniMaxH3ReferenceMode
    && primarySelectionMediaType !== null
    && !hasPrimaryImage;
  const hasFlux3SmartUnsupportedSelection = apiProvider === 'fal'
    && isVideoMode
    && isFlux3VideoModel
    && flux3InputKind === 'optional-start-image'
    && (
      selectedMediaCount > 1
      || (primarySelectionMediaType !== null && !hasPrimaryImage)
    );
  const flux3SmartUnsupportedSelectionReason = hasFlux3SmartUnsupportedSelection
    ? 'Flux 3 Smart supports at most one selected still image. Clear extra images, videos, or audio.'
    : null;
  const hasWan27SmartUnsupportedSelection = apiProvider === 'fal'
    && isVideoMode
    && isWan27VideoModel
    && !isWan27ReferenceMode
    && !isWan27EditMode
    && primarySelectionMediaType === 'video'
    && !hasPrimaryImage;
  const hasKlingV3UnsupportedSelection = apiProvider === 'fal'
    && isVideoMode
    && isKlingV3SmartVideoModel
    && primarySelectionMediaType !== null
    && !hasPrimaryImage;
  // Central place for prompt bar UX rules (disable states, placeholders) based on model/tool constraints.
  return (() => {
    const usingFal = apiProvider === 'fal';
    const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
    const hasPrimaryVideoSelected = primarySelectionMediaType === 'video';
    const isGrokImagineVideoEditMode = isGrokImagineVideoModel && hasPrimaryVideoSelected;
    const hasWanAnimateStillImage = isWanAnimateVideoModel ? hasSelectedStillImage : hasPrimaryImage;
    const hasScailStillImage = isScailVideoModel ? hasSelectedStillImage : hasPrimaryImage;
    const hasKlingV3ControlStillImage = isKlingV3ControlVideoModel ? hasSelectedStillImage : hasPrimaryImage;
    const isRecraftTextToImage = usingFal && !isVideoMode && isRecraftV4ProModel(falModelId); // Recraft t2i is Fal-only.
    const isKrea2TextToImage = usingFal && !isVideoMode && isKrea2LargeModel; // Krea refs are style inputs, not edits.
    const isTextToImage = (!hasPrimaryImage || isRecraftTextToImage || isKrea2TextToImage) && !(isVideoMode && (
      (isVideoInputMode && hasSourceVideo) || isGrokImagineVideoEditMode
    ));
    const promptEmpty = prompt.trim().length === 0;
    const shouldValidateFalOptions = usingFal
      && !isVideoMode
      && (isSeedreamModel || isNanoBananaModel || isGrokModel || isGptImage2Model); // Include GPT Image 2 validation.
    const falNumImageMax = getFalNumImageMaxForModel(falModelId); // Read output cap from active model.
    const isNumImagesInvalid =
      !Number.isFinite(falNumImages) ||
      falNumImages < 1 ||
      falNumImages > falNumImageMax;
    const hasWan27ReferenceAssets = wan27ReferenceAssetCount > 0;
    const jimengMultiframeDisabledReason = usingFal && isJimengMultiframeVideoModel
      ? getJimengMultiframeDisabledReason(prompt, selectedMediaCount, selectedStillImageCount)
      : null;
    const isWanPromptOptional = usingFal && (isWanVideoInputMode || (isWan27VideoModel && !isWan27ReferenceMode && !isWan27EditMode && hasPrimaryImage));
    const isKlingV3ControlPromptOptional = usingFal && isKlingV3ControlVideoModel; // Kling Control v3 prompt is optional.
    const isLipsyncPromptOptional = usingFal && (isLipsyncVideoModel || isHeygenV3LipsyncVideoModel);
    const requiresPrompt = !(usingFal && (isUpscaleModel || isWanPromptOptional || isKlingV3ControlPromptOptional || isLipsyncPromptOptional || isJimengReferenceMode));
    const isPromptMissing = requiresPrompt && promptEmpty;
    const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
    const requiresSelectedImageForVideo = usingFal && isVideoMode && !isKlingV3SmartVideoModel && !isMiniMaxH3VideoModel && !isFlux3VideoModel && !isSeedance2VideoModel && !isSeedance25VideoModel && !isWan27VideoModel && !isVideoInputMode && !hasPrimaryImage && !isGrokImagineVideoEditMode;
    const requiresSelectedImageForWanAnimate = usingFal && isWanAnimateVideoModel && !hasWanAnimateStillImage;
    const requiresSelectedImageForKlingV3Control = usingFal && isKlingV3ControlVideoModel && !hasKlingV3ControlStillImage;
    const requiresSelectedImageForScail = usingFal && isScailVideoModel && !hasScailStillImage;
    const requiresSourceVideoForVideoInput = usingFal && isVideoMode && (isVideoInputMode || isFlux3ExtendMode) && !hasSourceVideo;
    const requiresSourceAudioForVideoInput = usingFal && isVideoMode && isAudioInputMode && !hasSourceAudio;
    const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
      appMode === 'CANVAS' && !isCanvasGenerationTool
    );

    const submitDisabled = isPromptMissing ||
      (shouldValidateFalOptions && isNumImagesInvalid) ||
      (usingFal && isMiniMaxH3ReferenceMode && miniMaxH3ReferenceAssetCount === 0) ||
      (usingFal && isSeedance2ReferenceMode && seedance2ReferenceAssetCount === 0) ||
      (usingFal && isSeedance2EditMode && seedance2ReferenceVideoCount === 0) ||
      (usingFal && isSeedance2ExtendMode && seedance2ReferenceVideoCount === 0) ||
      (usingFal && isSeedance25ReferenceMode && seedance25ReferenceAssetCount === 0) ||
      (usingFal && isWan27ReferenceMode && !hasWan27ReferenceAssets) ||
      (usingFal && isFlux3VideoModel && flux3ValidationError !== null) ||
      jimengMultiframeDisabledReason !== null ||
      hasSeedance2SmartUnsupportedSelection ||
      hasSeedance25SmartUnsupportedSelection ||
      hasMiniMaxH3StandardUnsupportedSelection ||
      hasFlux3SmartUnsupportedSelection ||
      hasWan27SmartUnsupportedSelection ||
      hasKlingV3UnsupportedSelection ||
      requiresSelectedImageForUpscale ||
      requiresSelectedImageForVideo ||
      requiresSelectedImageForWanAnimate ||
      requiresSelectedImageForKlingV3Control ||
      requiresSelectedImageForScail ||
      requiresSourceVideoForVideoInput ||
      requiresSourceAudioForVideoInput ||
      editConstraintsActive;

    const promptPlaceholderText = (() => {
      if (isVideoMode) {
        if (flux3SmartUnsupportedSelectionReason) {
          return selectedMediaCount > 1
            ? flux3SmartUnsupportedSelectionReason
            : 'Flux 3 Smart uses a still image as its optional starting frame. Clear the current video or audio selection to run text-to-video...';
        }
        if (isMiniMaxH3VideoModel) {
          if (isMiniMaxH3ReferenceMode) {
            return miniMaxH3ReferenceAssetCount > 0
              ? `MiniMax H3 Reference: select up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips as @Image1, @Video1, or @Audio1, then describe the scene...`
              : 'MiniMax H3 Reference: select canvas media to label @Image1, @Video1, or @Audio1 references, then describe the scene...';
          }
          if (hasMiniMaxH3StandardUnsupportedSelection) {
            return 'MiniMax H3 Standard uses still images for its first and last frames. Clear the current video or audio selection...';
          }
          return hasPrimaryImage
            ? 'Describe the motion, or shift-click another still image to set the end frame...'
            : 'Describe the video, or select an image for image-to-video...';
        }
        if (isSeedance2VideoModel) {
          if (isSeedance2EditMode) {
            return seedance2ReferenceVideoCount > 0
              ? 'Describe how to edit @Video1, optionally referencing @Image1 or @Audio1 clips as replacement material...'
              : `${seedance2VolcengineLabel} Edit: select a video to edit (@Video1), optionally tag image or audio references, then describe the changes...`;
          }
          if (isSeedance2ExtendMode) {
            return seedance2ReferenceVideoCount > 0
              ? 'Describe how the clips connect, e.g. "@Video1 followed by @Video2", or extend @Video1 forward or backward...'
              : `${seedance2VolcengineLabel} Extend: select up to ${seedance2VolcengineReferenceLimits.videos} video clips (@Video1, @Video2, ...), then describe how to chain or extend them...`;
          }
          if (isSeedance2ReferenceMode) {
            return seedance2ReferenceAssetCount > 0
              ? `${seedance2VolcengineLabel} Reference: select or shift-click up to ${seedance2VolcengineReferenceLimits.images} images, ${seedance2VolcengineReferenceLimits.videos} videos, and ${seedance2VolcengineReferenceLimits.audios} audio clips as @Image1, @Video1, or @Audio1, then describe the scene you want...`
              : `${seedance2VolcengineLabel} Reference: select canvas media to label @Image1, @Video1, or @Audio1 references, then describe the scene...`;
          }
          if (hasSeedance2SmartUnsupportedSelection) {
            return `${seedance2VolcengineLabel} Smart uses a still image as the first frame. Clear the current video or audio selection to run text-to-video...`;
          }
          if (hasPrimaryImage) {
            return 'Describe the motion or scene you want this image to turn into, or shift-click another still image to set the end frame...';
          }
          return 'Describe the video you want to create, or select an image for image-to-video...';
        }
        if (isSeedance25VideoModel) {
          if (isSeedance25ReferenceMode) {
            return seedance25ReferenceAssetCount > 0
              ? `Seedance 2.5 Reference: select or shift-click up to ${SEEDANCE25_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE25_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE25_REFERENCE_AUDIO_LIMIT} audio clips as @Image1, @Video1, or @Audio1, then describe the scene you want...`
              : 'Seedance 2.5 Reference: select canvas media to label @Image1, @Video1, or @Audio1 references, then describe the scene...';
          }
          if (hasSeedance25SmartUnsupportedSelection) {
            return 'Seedance 2.5 Smart uses a still image as the first frame. Clear the current video or audio selection to run text-to-video...';
          }
          return hasPrimaryImage
            ? 'Describe the motion or scene you want this image to turn into, or shift-click another still image to set the end frame...'
            : 'Describe the video you want to create, or select an image for image-to-video...';
        }
        if (isWan27VideoModel) {
          if (isWan27EditMode) {
            return hasSourceVideo
              ? 'Describe how you want to edit this video...'
              : 'Wan 2.7 Edit: select a video, then describe how to edit it...';
          }
          if (isWan27ReferenceMode) {
            return hasWan27ReferenceAssets
              ? 'Wan 2.7 Reference: shift-click image or video references as @Image1 or @Video1, then describe the scene...'
              : 'Wan 2.7 Reference: tag at least one image or video reference, then describe the scene...';
          }
          if (hasWan27SmartUnsupportedSelection) {
            return 'Wan 2.7 uses a still image as the first frame. Clear the current video selection to run text-to-video...';
          }
          if (hasPrimaryImage) {
            return 'Optionally describe the motion or scene, or shift-click another still image to set the end frame...';
          }
          return 'Describe the video you want to create, or select an image for image-to-video...';
        }
        if (isKlingV3SmartVideoModel) {
          if (hasKlingV3UnsupportedSelection) {
            return 'Kling 3.0 Pro uses a still image as the first frame. Clear the current video or audio selection to run text-to-video...';
          }
          if (hasPrimaryImage) {
            return 'Describe the first Kling 3.0 Pro shot, or shift-click another still image to set the end frame...';
          }
          return 'Describe the Kling 3.0 Pro video you want to create, or select an image for image-to-video...';
        }
        if (isHeygenV3LipsyncVideoModel) {
          return 'Optional: describe the video segment to lip sync, such as "from 3.5s to 8s", or leave blank for the full video.';
        }
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
        if (isScailVideoModel) {
          if (!hasSourceVideo) {
            return 'Select a motion video, then select a reference image to animate...';
          }
          return hasScailStillImage
            ? 'Describe the motion you want to apply to the reference image...'
            : 'Select a reference image to animate...';
        }
        if (isKlingV3ControlVideoModel) {
          if (!hasSourceVideo) {
            return 'Select a motion driver video, then select a character image...';
          }
          return hasKlingV3ControlStillImage
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
          if (isFlux3ExtendMode) {
            return hasSourceVideo
              ? 'Describe how you want to extend the source video...'
              : 'Select a source video, then describe how you want to extend it...';
          }
          if (hasAllInputs) {
            if (isWanVideoInputMode) {
              return 'Describe how you want to enhance this video (optional)...';
            }
            if (isInfinitalkVideoModel) {
              return 'Describe the talking avatar and expression you want to generate...';
            }
            if (isKlingO3EditMode) {
              return 'Describe how you want to edit this video...';
            }
            if (isKlingO3VideoModel) {
              return 'Describe the scene you want to generate from this image...';
            }
            return 'Describe the next shot based on this reference video...';
          }
          if (isWanVideoInputMode) {
            return 'Select a video to enhance, then optionally describe changes...';
          }
          if (isInfinitalkVideoModel) {
            return 'Select a video and audio clip, then describe the talking avatar...';
          }
          if (isKlingO3EditMode) {
            return 'Select a video to edit, then describe the changes...';
          }
          if (isKlingO3VideoModel) {
            return 'Select an image, then describe the video you want to generate...';
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
      if (usingFal && isKrea2LargeModel) {
        return 'Describe the image to create, or shift-click up to 10 canvas images as style references...';
      }
      return isTextToImage
        ? 'Describe the image you want to create... (Cmd/Ctrl + Enter to generate)'
        : 'Describe your edit... (Cmd/Ctrl + Enter to generate)';
    })();
    const disablePromptInput = usingFal && (isUpscaleModel || isLipsyncVideoModel || isWanAnimateVideoModel);

    return {
      submitDisabled,
      submitDisabledReason: flux3SmartUnsupportedSelectionReason
        ?? (usingFal && isFlux3VideoModel ? flux3ValidationError : null)
        ?? jimengMultiframeDisabledReason,
      promptPlaceholderText,
      disablePromptInput,
      shouldValidateFalOptions,
      isNumImagesInvalid,
      isTextToImage,
      promptEmpty,
    };
  })();
}
