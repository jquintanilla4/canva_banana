import { useCallback } from 'react';
import type { Dispatch, SetStateAction, SyntheticEvent } from 'react';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok Imagine model id.
  GROK_IMAGINE_VIDEO_EDIT_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  KLING_26_CONTROL_VIDEO_MODEL_ID,
  KLING_26_VIDEO_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SORA_2_PRO_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  VEO_31_EXTEND_VIDEO_MODEL_ID,
  VEO_31_FFLF_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  getFalModelLabel,
  getHailuoActualModelId,
  getKlingActualModelId,
  getKling26ControlModelId,
  getKlingO1VideoEndpoint,
  getWanAnimateVideoEndpoint,
  getMaxReferenceImages,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isKlingO1VideoModelId,
  getSeedreamTextToImageModelId,
  isApiProvider,
  isFalImageModelId,
  isFalModelMode,
  isFalVideoModelId,
  isSeedreamModelId,
  type FalAspectRatioSelectionValue,
  type FalImageModelId,
  type FalImageSizeSelectionValue,
  type FalModelId,
  type FalModelMode,
  type FalResolutionSelectionValue,
  type FalVideoModelId,
  type HailuoVariant,
  type Kling26AudioSelectionValue,
  type KlingO1Variant,
  type KlingVariant,
  type LipsyncAudioMode,
  type LipsyncEmotion,
  type LipsyncModelMode,
  type WanAnimateQualitySelectionValue,
  type WanAnimateResolutionSelectionValue,
  type WanAnimateShiftSelectionValue,
  type WanAnimateStepsSelectionValue,
  type WanAnimateVariant,
  type WanCreativity,
  type WanTargetResolution,
} from '../services/modelConfig';
import type { UseFalSettingsResult } from './useFalSettings';
import type { SelectionStateResult } from './useSelectionState';
import { generateImageEdit as generateGoogleImageEdit, generateImage as generateGoogleImage } from '../services/geminiService';
import {
  generateImageEdit as generateFalImageEdit,
  generateImage as generateFalImage,
  generateImageToVideo as generateFalImageToVideo,
  upscaleCrystalImage as upscaleFalCrystalImage,
  upscaleSeedvrImage as upscaleFalSeedvrImage,
  uploadVideoToFal,
  type FalQueueUpdate,
} from '../services/falService';
import { addDebugLog } from '../services/debugLog';
import { buildFalDisplayError, FAL_PROVIDER_DOWN_MESSAGE, getFalFileSizeErrorMessage } from '../services/falConstants';
import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasNote,
  GenerationInputs,
  GenerationKind,
  Path,
  Point,
  FalVideoDuration,
  FalQueueJob,
} from '../types';
import { Tool } from '../types';
import { getImageBounds, isOverlapping } from '../utils/canvasGeometry';
import { getNaturalSize, loadMediaFromBlob, rasterizeImages } from '../services/mediaService';
import { applyFalQueueUpdateToJob } from '../services/falQueueUtils';
import { convertAudioBlobToWav } from '../services/audioService';

type UseGenerationArgs = {
  appMode: AppMode;
  tool: Tool;
  prompt: string;
  promptPrefix?: string;
  apiProvider: ApiProviderId;
  fal: UseFalSettingsResult;
  selection: SelectionStateResult;
  images: CanvasImage[];
  paths: Path[];
  videoNegativePrompt: string;
  setError: (message: string | null) => void;
  setIsLoading: (value: boolean) => void;
  setFalJobs: Dispatch<SetStateAction<FalQueueJob[]>>;
  setState: (updater: (prevState: { images: CanvasImage[]; paths: Path[]; notes: CanvasNote[] }) => { images: CanvasImage[]; paths: Path[]; notes: CanvasNote[] }) => void;
  setToastMessage: (message: string | null) => void;
  setTool: (tool: Tool) => void;
  onGenerationComplete?: () => void;
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

const extractFalQueueLogMessages = (logs: FalQueueUpdate['logs']): string[] => {
  if (!logs) {
    return [];
  }
  if (typeof logs === 'string') {
    return [logs];
  }
  if (Array.isArray(logs)) {
    return logs
      .map(entry => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry && typeof entry === 'object') {
          const message = (entry as { message?: unknown }).message;
          return typeof message === 'string' ? message : '';
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof logs === 'object') {
    return Object.values(logs)
      .flatMap(value => extractFalQueueLogMessages(value as FalQueueUpdate['logs']));
  }
  return [];
};

const resolveSelectedStillImageId = (
  primaryImageId: string | null,
  selectedImageIds: string[],
  images: CanvasImage[],
): string | null => {
  if (primaryImageId) {
    const primaryImage = images.find(img => img.id === primaryImageId);
    if (primaryImage?.mediaType === 'image') {
      return primaryImageId;
    }
  }

  for (const imageId of selectedImageIds) {
    const candidate = images.find(img => img.id === imageId);
    if (candidate?.mediaType === 'image') {
      return imageId;
    }
  }

  return primaryImageId;
};

export const useGeneration = (args: UseGenerationArgs) => {
  const {
    appMode,
    tool,
    prompt,
    promptPrefix,
    apiProvider,
    fal,
    selection,
    images,
    paths,
    videoNegativePrompt,
    setError,
    setIsLoading,
    setFalJobs,
    setState,
    setToastMessage,
    setTool,
    onGenerationComplete,
  } = args;

  const showTemporaryError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => {
      setError(null);
    }, 4000);
  }, [setError]);

  const {
    falModelMode,
    falImageModelId,
    falVideoModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    falVideoDuration,
    hailuoVariant,
    klingVariant,
    klingO1Variant,
    klingO1KeepAudio,
    kling26AudioSelection,
    kling26ControlVariant,
    kling26ControlKeepSound,
    kling26ControlDriver,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
    oneToAllAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    lipsyncEmotion,
    lipsyncModelMode,
    lipsyncAudioMode,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    infinitalkDuration,
    grokImagineVideoDuration,
    grokImagineVideoResolution,
    grokImagineVideoAspectRatio,
    sora2ProResolution,
    sora2ProAspectRatio,
    sora2ProDuration,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan26Resolution,
    wan26Duration,
    wan26PromptExpansion,
    wan26MultiShots,
    isWan26I2VVideoModel,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    isSeedance15VideoModel,
    flux2MaxImageSize,
    isFlux2MaxModel,
    wan26ImageAspectRatio,
    wan26ImageMaxImages,
    isWan26ImageModel,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
  } = fal;

  const {
    referenceImageIds,
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    sourceAudioId,
    selectedImageIds,
    primaryImageId,
    activePrimaryImage,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
  } = selection;

  // Centralized generation orchestrator for both providers (Fal/Gemini) across text-to-image, edits, upscales, and video.
  const handleGenerate = useCallback(async (generationOverrideOrEvent?: GenerationInputs | SyntheticEvent) => {
    const generationOverride = generationOverrideOrEvent && 'kind' in generationOverrideOrEvent
      ? generationOverrideOrEvent
      : undefined;
    const overrideKind = generationOverride?.kind;
    const overridePrompt = typeof generationOverride?.prompt === 'string' ? generationOverride.prompt : undefined;
    const basePrompt = overridePrompt ?? prompt;
    const trimmedUserPrompt = overridePrompt !== undefined ? basePrompt.trim() : prompt.trim();
    const normalizedPrefix = promptPrefix && promptPrefix.trim().length > 0 ? promptPrefix : '';
    const shouldApplyPromptPrefix = overridePrompt === undefined && normalizedPrefix.length > 0 && trimmedUserPrompt.length > 0;
    const promptForRun = shouldApplyPromptPrefix ? `${normalizedPrefix}${basePrompt}` : basePrompt;
    const trimmedPrompt = promptForRun.trim();
    const apiProviderForRun = isApiProvider(generationOverride?.provider) ? generationOverride.provider : apiProvider;
    const overrideModelId = generationOverride?.modelId;
    const falModelModeForRun = isFalModelMode(generationOverride?.modelMode) ? generationOverride.modelMode : falModelMode;
    const falImageModelIdForRun = isFalImageModelId(overrideModelId) ? overrideModelId : falImageModelId;
    const falVideoModelIdForRun = isFalVideoModelId(overrideModelId) ? overrideModelId : falVideoModelId;
    const falModelIdForRun: FalModelId = falModelModeForRun === 'video' ? falVideoModelIdForRun : falImageModelIdForRun;
    const falOptionsOverride = generationOverride?.falOptions ?? {};
    const rawFalImageSizeSelection = falOptionsOverride.imageSizeSelection ?? falImageSizeSelection;
    const rawFalAspectRatioSelection = falOptionsOverride.aspectRatioSelection ?? falAspectRatioSelection;
    const falImageSizeSelectionForRun = rawFalImageSizeSelection === 'placeholder' ? 'default' : rawFalImageSizeSelection;
    const falAspectRatioSelectionForRun = rawFalAspectRatioSelection === 'placeholder' ? 'default' : rawFalAspectRatioSelection;
    const falResolutionSelectionForRun = falOptionsOverride.resolutionSelection ?? falResolutionSelection;
    const falNumImagesForRun = falOptionsOverride.numImages ?? falNumImages;
    const falScaleFactorForRun = falOptionsOverride.scaleFactor ?? falScaleFactor;
    const falNoiseScaleForRun = falOptionsOverride.noiseScale ?? falNoiseScale;
    const falCreativityForRun = falOptionsOverride.creativity ?? falCreativity;
    const falVideoDurationForRun = falOptionsOverride.videoDuration ?? falVideoDuration;
    const hailuoVariantForRun = falOptionsOverride.hailuoVariant ?? hailuoVariant;
    const klingVariantForRun = falOptionsOverride.klingVariant ?? klingVariant;
    const klingO1VariantForRun = falOptionsOverride.klingO1Variant ?? klingO1Variant;
    const videoNegativePromptForRun = falOptionsOverride.negativePrompt ?? videoNegativePrompt;
    const wanTargetResolutionForRun = falOptionsOverride.wanTargetResolution ?? wanTargetResolution;
    const wanCreativityForRun = falOptionsOverride.wanCreativity ?? wanCreativity;
    const wanAnimateVariantForRun = falOptionsOverride.wanAnimateVariant ?? wanAnimateVariant;
    const wanAnimateStepsForRun = falOptionsOverride.wanAnimateSteps ?? wanAnimateSteps;
    const wanAnimateResolutionForRun = falOptionsOverride.wanAnimateResolution ?? wanAnimateResolution;
    const wanAnimateShiftForRun = falOptionsOverride.wanAnimateShift ?? wanAnimateShift;
    const wanAnimateQualityForRun = falOptionsOverride.wanAnimateQuality ?? wanAnimateQuality;
    const wanAnimateUseTurboForRun = falOptionsOverride.wanAnimateUseTurbo ?? wanAnimateUseTurbo;
    const oneToAllAnimateResolutionForRun = falOptionsOverride.oneToAllAnimateResolution ?? oneToAllAnimateResolution;
    const infinitalkResolutionForRun = falOptionsOverride.infinitalkResolution ?? infinitalkResolution;
    const infinitalkSeedForRun = falOptionsOverride.infinitalkSeed ?? infinitalkSeed;
    const infinitalkAccelerationForRun = falOptionsOverride.infinitalkAcceleration ?? infinitalkAcceleration;
    const infinitalkDurationForRun = falOptionsOverride.infinitalkDuration ?? infinitalkDuration;
    const grokImagineVideoDurationForRun = isGrokImagineVideoDurationSelectionValue(falOptionsOverride.grokImagineVideoDuration)
      ? falOptionsOverride.grokImagineVideoDuration
      : grokImagineVideoDuration;
    const grokImagineVideoResolutionForRun = isGrokImagineVideoResolutionSelectionValue(falOptionsOverride.grokImagineVideoResolution)
      ? falOptionsOverride.grokImagineVideoResolution
      : grokImagineVideoResolution;
    const grokImagineVideoAspectRatioForRun = isGrokImagineVideoAspectRatioSelectionValue(falOptionsOverride.grokImagineVideoAspectRatio)
      ? falOptionsOverride.grokImagineVideoAspectRatio
      : grokImagineVideoAspectRatio;
    const sora2ProResolutionForRun = falOptionsOverride.sora2ProResolution ?? sora2ProResolution;
    const sora2ProAspectRatioForRun = falOptionsOverride.sora2ProAspectRatio ?? sora2ProAspectRatio;
    const sora2ProDurationForRun = falOptionsOverride.sora2ProDuration ?? sora2ProDuration;
    const veo31VariantForRun = falOptionsOverride.veo31Variant ?? veo31Variant;
    const veo31DurationForRun = falOptionsOverride.veo31Duration ?? veo31Duration;
    const veo31ResolutionForRun = falOptionsOverride.veo31Resolution ?? veo31Resolution;
    const veo31AspectRatioForRun = falOptionsOverride.veo31AspectRatio ?? veo31AspectRatio;
    const veo31GenerateAudioForRun = falOptionsOverride.veo31GenerateAudio ?? veo31GenerateAudio;
    const kling26AudioOverride = falOptionsOverride.kling26Audio;
    const kling26AudioForRun = kling26AudioOverride !== undefined
      ? kling26AudioOverride
      : kling26AudioSelection === 'on';
    const kling26ControlVariantForRun = falOptionsOverride.kling26ControlVariant === 'pro'
      || falOptionsOverride.kling26ControlVariant === 'standard'
      ? falOptionsOverride.kling26ControlVariant
      : kling26ControlVariant;
    const kling26ControlKeepSoundForRun = falOptionsOverride.kling26ControlKeepSound ?? kling26ControlKeepSound;
    const kling26ControlDriverForRun = falOptionsOverride.kling26ControlDriver === 'image'
      || falOptionsOverride.kling26ControlDriver === 'video'
      ? falOptionsOverride.kling26ControlDriver
      : kling26ControlDriver;
    const infinitalkSeedValue = infinitalkSeedForRun === 'random'
      ? undefined
      : Number.isFinite(Number(infinitalkSeedForRun)) ? Number(infinitalkSeedForRun) : undefined;
    const basePrimaryImageIdForRun = generationOverride ? generationOverride.primaryImageId ?? null : primaryImageId;
    const shouldPreferSelectedStillImage = apiProviderForRun === 'fal'
      && falModelModeForRun === 'video'
      && !generationOverride
      && (
        falVideoModelIdForRun === WAN_ANIMATE_MODEL_ID
        || falVideoModelIdForRun === ONE_TO_ALL_ANIMATE_MODEL_ID
        || falVideoModelIdForRun === KLING_26_CONTROL_VIDEO_MODEL_ID
        || falVideoModelIdForRun === SCAIL_VIDEO_MODEL_ID
      );
    const primaryImageIdForRun = shouldPreferSelectedStillImage
      ? resolveSelectedStillImageId(basePrimaryImageIdForRun, selectedImageIds, images)
      : basePrimaryImageIdForRun;
    const primaryImageForRun = primaryImageIdForRun
      ? images.find(img => img.id === primaryImageIdForRun) || null
      : null;
    const activePrimary = isImageCanvasMedia(primaryImageForRun) ? primaryImageForRun : null;
    const referenceImageIdsForRun = generationOverride ? generationOverride.referenceImageIds ?? [] : referenceImageIds;
    const elementImageIdsForRun = generationOverride ? generationOverride.elementImageIds ?? [] : elementImageIds;
    const videoLastFrameImageIdForRun = generationOverride?.videoLastFrameImageId ?? videoLastFrameImageId;
    const sourceVideoIdForRun = generationOverride?.sourceVideoId ?? sourceVideoId;
    const klingO1KeepAudioForRun = generationOverride?.falOptions?.klingO1KeepAudio ?? klingO1KeepAudio;

    const usingFal = apiProviderForRun === 'fal';
    const isVideoMode = usingFal && falModelModeForRun === 'video';
    const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelIdForRun);
    const isNanoBananaProModel = !isVideoMode && falModelIdForRun === NANO_BANANA_PRO_EDIT_MODEL_ID;
    const isNanoBananaModel = isNanoBananaProModel;
    const isReveModel = !isVideoMode && falModelIdForRun === REVE_TEXT_TO_IMAGE_MODEL_ID;
    const isKlingModel = !isVideoMode && falModelIdForRun === KLING_IMAGE_MODEL_ID;
    const isGrokImagineModel = !isVideoMode && falModelIdForRun === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image.
    const grokAspectRatioForRun = (isGrokImagineModel && falAspectRatioSelectionForRun === 'default')
      ? '1:1'
      : falAspectRatioSelectionForRun; // Grok falls back to 1:1.
    const isFlux2MaxModelForRun = !isVideoMode && falModelIdForRun === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
    const isWan26ImageModelForRun = !isVideoMode && falModelIdForRun === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
    const normalizedFalResolutionSelectionForRun =
      isKlingModel && falResolutionSelectionForRun === '4K' ? '2K' : falResolutionSelectionForRun;
    const isCrystalUpscaleModel = !isVideoMode && falModelIdForRun === CRYSTAL_UPSCALER_MODEL_ID;
    const isSeedvrUpscaleModel = !isVideoMode && falModelIdForRun === 'fal-ai/seedvr/upscale/image';
    const isUpscaleModel = isCrystalUpscaleModel || isSeedvrUpscaleModel;
    const isHailuoVideoModel = isVideoMode && falVideoModelIdForRun === HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
    const isHailuoStandardVideoModel = isHailuoVideoModel && hailuoVariantForRun === 'standard';
    const actualHailuoModelId = isHailuoVideoModel ? getHailuoActualModelId(hailuoVariantForRun) : null;
    const isKlingVideoModel = isVideoMode && falVideoModelIdForRun === KLING_VIDEO_MODEL_ID;
    const isKlingO1VideoModel = isVideoMode && isKlingO1VideoModelId(falVideoModelIdForRun);
    const isKlingO1EditMode = isKlingO1VideoModel && klingO1VariantForRun === 'edit';
    const isKlingO1RefV2VMode = isKlingO1VideoModel && klingO1VariantForRun === 'refV2V';
    const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode;
    const isKling26VideoModel = isVideoMode && falVideoModelIdForRun === KLING_26_VIDEO_MODEL_ID;
    const isKling26ControlVideoModel = isVideoMode && falVideoModelIdForRun === KLING_26_CONTROL_VIDEO_MODEL_ID;
    const isWanVisionEnhancerVideoModel = isVideoMode && falVideoModelIdForRun === WAN_VISION_ENHANCER_MODEL_ID;
    const isWanAnimateVideoModel = isVideoMode && falVideoModelIdForRun === WAN_ANIMATE_MODEL_ID;
    const isOneToAllAnimateVideoModel = isVideoMode && falVideoModelIdForRun === ONE_TO_ALL_ANIMATE_MODEL_ID;
    const isScailVideoModel = isVideoMode && falVideoModelIdForRun === SCAIL_VIDEO_MODEL_ID;
    const isLipsyncVideoModel = isVideoMode && falVideoModelIdForRun === SYNC_LIPSYNC_MODEL_ID;
    const isInfinitalkVideoModel = isVideoMode && falVideoModelIdForRun === INFINITALK_VIDEO_MODEL_ID;
    const isGrokImagineVideoModel = isVideoMode && falVideoModelIdForRun === GROK_IMAGINE_VIDEO_MODEL_ID;
    const isGrokImagineVideoEditMode = isGrokImagineVideoModel && primaryImageForRun?.mediaType === 'video';
    const isSora2ProVideoModel = isVideoMode && falVideoModelIdForRun === SORA_2_PRO_VIDEO_MODEL_ID;
    const isVeo31VideoModelForRun = isVideoMode && falVideoModelIdForRun === VEO_31_IMAGE_TO_VIDEO_MODEL_ID;
    const isWanVideoInputMode = isWanVisionEnhancerVideoModel || isWanAnimateVideoModel;
    const isVeo31ExtendMode = isVeo31VideoModelForRun && veo31VariantForRun === 'extend';
    const isFalVideoInputMode = isWanVideoInputMode
      || isOneToAllAnimateVideoModel
      || isLipsyncVideoModel
      || isInfinitalkVideoModel
      || isKling26ControlVideoModel
      || isVeo31ExtendMode
      || isScailVideoModel;
    const actualKlingModelId = isKlingVideoModel ? getKlingActualModelId(klingVariantForRun) : null;
    const actualKlingO1ModelId = isKlingO1VideoModel ? getKlingO1VideoEndpoint(klingO1VariantForRun) : null;
    const actualKling26ControlModelId = isKling26ControlVideoModel
      ? getKling26ControlModelId(kling26ControlVariantForRun)
      : null;
    const actualWanAnimateModelId = isWanAnimateVideoModel ? getWanAnimateVideoEndpoint(wanAnimateVariantForRun) : null;
    const isKlingO1FflfMode = isKlingO1VideoModel && klingO1VariantForRun === 'fflf';
    const isVeo31TailCapable = isVeo31VideoModelForRun && veo31VariantForRun === 'i2v-fflf';
    const videoDurationForRun: FalVideoDuration | undefined = isHailuoVideoModel
      ? (hailuoVariantForRun === 'standard' ? falVideoDurationForRun : '6')
      : (isKlingVideoModel || isKling26VideoModel || isKlingO1VideoModel)
        ? (falVideoDurationForRun === '10' ? '10' : '5')
        : undefined;
    const normalizedVideoNegativePrompt =
      (isKlingVideoModel || isKling26VideoModel || isWanVisionEnhancerVideoModel || isOneToAllAnimateVideoModel || isVeo31VideoModelForRun)
        ? videoNegativePromptForRun.trim()
        : '';
    const hasVideoNegativePrompt = normalizedVideoNegativePrompt.length > 0;
    const isTextToImage = overrideKind ? overrideKind === 'text_to_image' : !activePrimary;
    const isWanPromptOptional = usingFal && isVideoMode && (isWanVisionEnhancerVideoModel || isWanAnimateVideoModel);
    const isLipsyncPromptOptional = usingFal && isVideoMode && isLipsyncVideoModel;
    const requiresPrompt = !(usingFal && (isUpscaleModel || isWanPromptOptional || isLipsyncPromptOptional));
    const requiresVideoSourceImage = usingFal && isVideoMode && !isKlingO1VideoInputMode && !isFalVideoInputMode
      && !(isGrokImagineVideoModel && isGrokImagineVideoEditMode);
    const generationKind: GenerationKind = overrideKind
      ?? (isVideoMode ? 'video' : isTextToImage ? 'text_to_image' : isUpscaleModel ? 'upscale' : 'image_edit');

    if (requiresPrompt && !trimmedUserPrompt) {
      setError(isTextToImage ? 'Please describe the image you want to create.' : 'Please write a prompt to describe your edit.');
      return;
    }

    if (requiresVideoSourceImage && !activePrimary) {
      setError('Select an image to use as the first frame for your video.');
      return;
    }

    if (usingFal && isVideoMode && isWanAnimateVideoModel && !activePrimary) {
      setError('Select a still image to replace the character.');
      return;
    }

    if (usingFal && isVideoMode && isOneToAllAnimateVideoModel && !activePrimary) {
      setError('Select a still image to animate.');
      return;
    }
    if (usingFal && isVideoMode && isKling26ControlVideoModel && !activePrimary) {
      setError('Select a character image to guide the motion.');
      return;
    }
    if (usingFal && isVideoMode && isScailVideoModel && !activePrimary) {
      setError('Select a still image to animate with Scail.');
      return;
    }

    // Get sourceAudioId for lip sync mode
    const sourceAudioIdForRun = generationOverride?.sourceAudioId ?? sourceAudioId;

    const requiresAudioInput = isLipsyncVideoModel || isInfinitalkVideoModel;

    if (usingFal && isVideoMode && requiresAudioInput) {
      if (!sourceVideoIdForRun) {
        setError(isInfinitalkVideoModel
          ? 'Select a video on the canvas to drive Infinitalk.'
          : 'Select a video on the canvas to lip sync.');
        return;
      }
      if (!sourceAudioIdForRun) {
        setError(isInfinitalkVideoModel
          ? 'Select an audio clip on the canvas for Infinitalk.'
          : 'Select an audio clip on the canvas for lip sync audio.');
        return;
      }
    }

    if (isVideoMode) {
      const falJobId = crypto.randomUUID();
      const baseModelLabel = getFalModelLabel(falModelIdForRun);
      const klingO1VariantLabel = klingO1VariantForRun === 'refI2V'
        ? 'RefI2V'
        : klingO1VariantForRun.toUpperCase();
      const veo31VariantLabel = veo31VariantForRun === 'extend' ? 'Extend' : 'i2v/FFLF';
      const jobModelLabel = isHailuoVideoModel
        ? `${baseModelLabel} ${hailuoVariantForRun === 'pro' ? 'Pro' : 'Standard'}`
        : isKlingVideoModel
          ? `${baseModelLabel} ${klingVariantForRun === 'pro' ? 'Pro' : 'Standard'}`
          : isKlingO1VideoModel
            ? `${baseModelLabel} ${klingO1VariantLabel}`
            : isKling26ControlVideoModel
              ? `${baseModelLabel} ${kling26ControlVariantForRun === 'pro' ? 'Pro' : 'Standard'}`
            : isKling26VideoModel
              ? `${baseModelLabel} Pro`
              : isVeo31VideoModelForRun
                ? `${baseModelLabel} ${veo31VariantLabel}`
                : isWanAnimateVideoModel
                  ? `${baseModelLabel} ${wanAnimateVariantForRun === 'replace' ? 'Keep BG' : 'Replace BG'}`
                  : baseModelLabel;
      const findNonOverlappingPlacement = (
        width: number,
        height: number,
        startX: number,
        startY: number,
        spacing = 20,
        maxAttempts = 24,
      ): { x: number; y: number } => {
        let x = startX;
        let y = startY;
        const overlapsExisting = (minX: number, minY: number, maxX: number, maxY: number) => {
          return images.some(img => {
            const bounds = getImageBounds(img);
            return !(minX > bounds.maxX || maxX < bounds.minX || minY > bounds.maxY || maxY < bounds.minY);
          });
        };

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const minX = x;
          const minY = y;
          const maxX = x + width;
          const maxY = y + height;
          if (!overlapsExisting(minX, minY, maxX, maxY)) {
            return { x, y };
          }
          x += width + spacing;
        }

        return { x: startX, y: startY + height + spacing };
      };

      let jobQueued = false;
      const enqueueJob = () => {
        if (jobQueued) {
          return;
        }
        // Spin up a Fal queue job so the UI can show progress even while the video generates server-side.
        const newJob: FalQueueJob = {
          id: falJobId,
          prompt: trimmedPrompt,
          modelId: falModelIdForRun,
          modelLabel: jobModelLabel,
          status: 'IN_QUEUE',
          logs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setFalJobs(prev => [...prev.slice(-9), newJob]);
        addDebugLog({
          direction: 'outbound',
          source: 'fal',
          title: jobModelLabel,
          message: 'Submitting request',
          data: { jobId: falJobId, kind: 'video' },
        });
        jobQueued = true;
      };

      try {
        // In Ref-i2v, ensure a still image is selected (videos must be captured to images first)
        const primarySelection = primaryImageIdForRun ? images.find(img => img.id === primaryImageIdForRun) : null;
        if (isKlingO1VideoModel && !isKlingO1VideoInputMode && primarySelection?.mediaType === 'video') {
          setError('Kling O1 Ref-i2v requires a still image. Capture a frame from the video and select that snapshot instead.');
          return;
        }
        if (isWanAnimateVideoModel && primarySelection?.mediaType === 'video') {
          setError('Wan Animate Replace requires a still image. Capture a frame or upload an image.');
          return;
        }
        if (isOneToAllAnimateVideoModel && primarySelection?.mediaType === 'video') {
          setError('1-to-All Animate requires a still image. Capture a frame or upload an image.');
          return;
        }
        if (isScailVideoModel && primarySelection?.mediaType === 'video') {
          setError('Scail requires a still image. Capture a frame or upload an image.');
          return;
        }

        // For video-input modes (Kling O1 edit/refV2V, Grok edit-video, Wan enhancer), get source video URL; for other modes, require starting frame image
        let sourceVideo: CanvasImage | null = null;
        let sourceVideoUrlForRequest: string | undefined;
        if (isKlingO1VideoInputMode || isFalVideoInputMode || isGrokImagineVideoEditMode) {
          sourceVideo = isGrokImagineVideoEditMode
            ? (primarySelection?.mediaType === 'video' ? primarySelection : null)
            : sourceVideoIdForRun
              ? images.find(img => img.id === sourceVideoIdForRun && img.mediaType === 'video')
              : null;
          if (!sourceVideo) {
            throw new Error(isWanVisionEnhancerVideoModel
              ? 'Select a video on the canvas to enhance.'
              : isWanAnimateVideoModel
                ? 'Select a video on the canvas to replace a character.'
                : isOneToAllAnimateVideoModel
                  ? 'Select a video on the canvas to drive the animation.'
                  : isScailVideoModel
                    ? 'Select a video on the canvas to drive Scail.'
                  : isKling26ControlVideoModel
                    ? 'Select a motion driver video on the canvas.'
                  : isLipsyncVideoModel
                    ? 'Select a video on the canvas to lip sync.'
                    : isInfinitalkVideoModel
                      ? 'Select a video on the canvas to drive Infinitalk.'
                      : isGrokImagineVideoEditMode
                        ? 'Select a video on the canvas to edit.'
                        : (isKlingO1EditMode ? 'Select a video on the canvas to edit.' : 'Select a video on the canvas as reference.'));
          }
          if (isLipsyncVideoModel) {
            const durationSeconds = (sourceVideo.element as HTMLVideoElement | undefined)?.duration;
            if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 15) {
              setError('Lip Sync requires videos 15 seconds or shorter.');
              return;
            }
          }
          if (isWanVisionEnhancerVideoModel) {
            const durationSeconds = (sourceVideo.element as HTMLVideoElement | undefined)?.duration;
            if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 16) {
              setToastMessage('Videos longer than 500 frames will have only the first 500 frames processed');
              setTimeout(() => setToastMessage(null), 10000);
            }
          }
          // Get video URL from generation metadata, or upload if it's an imported video
          sourceVideoUrlForRequest = sourceVideo.metadata?.generation?.url;
          if (!sourceVideoUrlForRequest) {
            // Video was imported, need to upload it to FAL storage
            if (!sourceVideo.file) {
              throw new Error('The selected video does not have a file to upload.');
            }
            setToastMessage('Uploading video...');
            sourceVideoUrlForRequest = await uploadVideoToFal(sourceVideo.file);
            setToastMessage(null);
          }
        } else if (!activePrimary) {
          throw new Error('Unable to find the starting frame for this video.');
        }

        // For lip sync mode, get the audio URL
        let sourceAudioUrlForRequest: string | undefined;
        if (requiresAudioInput && sourceAudioIdForRun) {
          const sourceAudio = images.find(img => img.id === sourceAudioIdForRun && img.mediaType === 'audio');
          if (!sourceAudio) {
            throw new Error(isInfinitalkVideoModel
              ? 'Select an audio clip on the canvas for Infinitalk.'
              : 'Select an audio clip on the canvas for lip sync.');
          }
          const audioDurationSeconds = sourceAudio.audioDuration ?? sourceAudio.audioElement?.duration;
          if (isLipsyncVideoModel && typeof audioDurationSeconds === 'number' && Number.isFinite(audioDurationSeconds) && audioDurationSeconds > 15) {
            setError('Lip Sync requires audio 15 seconds or shorter.');
            return;
          }
          if (!sourceAudio.file) {
            throw new Error('The selected audio does not have a file to upload.');
          }
          setToastMessage('Preparing audio...');
          const audioFileForUpload = sourceAudio.file.type === 'audio/webm'
            ? new File([await convertAudioBlobToWav(sourceAudio.file)], `fal-audio-${Date.now()}.wav`, { type: 'audio/wav' })
            : sourceAudio.file;
          setToastMessage('Uploading audio...');
          sourceAudioUrlForRequest = await uploadVideoToFal(audioFileForUpload);
          setToastMessage(null);
        }

        const videoSourceImage = (isWanAnimateVideoModel || isOneToAllAnimateVideoModel || isKling26ControlVideoModel || isScailVideoModel)
          ? activePrimary?.element as HTMLImageElement
          : (isKlingO1VideoInputMode || isFalVideoInputMode || isGrokImagineVideoEditMode) ? null : activePrimary?.element as HTMLImageElement;
        const referenceImagesForRun = referenceImageIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia)
          .map(img => img.element as HTMLImageElement);
        const elementImagesForRun = elementImageIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia)
          .map(img => img.element as HTMLImageElement);
        if (isKlingO1VideoModel) {
          if (referenceImagesForRun.length !== referenceImageIdsForRun.length) {
            setError('Reference images must be still images.');
            return;
          }
          if (elementImagesForRun.length !== elementImageIdsForRun.length) {
            setError('Element images must be still images.');
            return;
          }
          if (isKlingO1FflfMode && (referenceImagesForRun.length > 0 || elementImagesForRun.length > 0)) {
            setError('Kling O1 FFLF only supports a start and end frame. Remove reference or element images.');
            return;
          }
          const maxSupportImages = isKlingO1VideoInputMode ? 4 : getMaxReferenceImages(falModelIdForRun);
          const totalImageCount = referenceImagesForRun.length + elementImagesForRun.length;
          if (totalImageCount > maxSupportImages) {
            setError(isKlingO1VideoInputMode
              ? `Kling O1 Video ${isKlingO1EditMode ? 'Edit' : 'Ref-v2v'} supports up to 4 images total (references + elements).`
              : 'Kling O1 Video supports up to 7 images total (start + references + elements).');
            return;
          }
        }
        let videoTailImageElement: HTMLImageElement | null = null;
        const supportsTailFrame = (isKlingVideoModel && klingVariantForRun === 'pro') || isKling26VideoModel || isKlingO1FflfMode || isVeo31TailCapable || isSeedance15VideoModel; // Allow end-frame input for Kling 2.6/tail-capable variants.
        if (supportsTailFrame && videoLastFrameImageIdForRun) {
          const tailFrame = images.find(img => img.id === videoLastFrameImageIdForRun);
          if (!isImageCanvasMedia(tailFrame)) {
            setError('Select a still image on the canvas to use as the ending frame.');
            return;
          }
          videoTailImageElement = tailFrame.element as HTMLImageElement;
        }
        const videoLastFrameIdForMetadata = videoTailImageElement ? videoLastFrameImageIdForRun : null;

        setError(null);
        enqueueJob();

        const actualVeo31ModelId = isVeo31VideoModelForRun
          ? veo31VariantForRun === 'extend'
            ? VEO_31_EXTEND_VIDEO_MODEL_ID
            : videoTailImageElement
              ? VEO_31_FFLF_VIDEO_MODEL_ID
              : VEO_31_IMAGE_TO_VIDEO_MODEL_ID
          : null;
        const actualGrokImagineVideoModelId = isGrokImagineVideoModel
          ? (isGrokImagineVideoEditMode ? GROK_IMAGINE_VIDEO_EDIT_MODEL_ID : GROK_IMAGINE_VIDEO_MODEL_ID)
          : null;
        const videoModelIdForRequest = actualHailuoModelId
          ?? actualKlingModelId
          ?? actualKlingO1ModelId
          ?? actualKling26ControlModelId
          ?? actualWanAnimateModelId
          ?? actualVeo31ModelId
          ?? actualGrokImagineVideoModelId
          ?? falVideoModelIdForRun;
        const shouldSendDuration = isHailuoVideoModel
          ? isHailuoStandardVideoModel
          : (isKlingVideoModel || isKling26VideoModel || (isKlingO1VideoModel && !isKlingO1EditMode));
        const durationForRequest = shouldSendDuration ? videoDurationForRun : undefined;
        const oneToAllNegativePromptForRequest = isOneToAllAnimateVideoModel ? videoNegativePromptForRun.trim() : undefined;
        const negativePromptForRequest =
          (isKlingVideoModel || isKling26VideoModel || isWanVisionEnhancerVideoModel || isVeo31VideoModelForRun) && hasVideoNegativePrompt
            ? normalizedVideoNegativePrompt
            : undefined;
        const generateAudioForRequest = isKling26VideoModel ? kling26AudioForRun : undefined;
        const keepOriginalSoundForRequest = isKling26ControlVideoModel ? kling26ControlKeepSoundForRun : undefined;
        const characterOrientationForRequest = isKling26ControlVideoModel ? kling26ControlDriverForRun : undefined;
        const videoResult = await generateFalImageToVideo(trimmedPrompt, videoSourceImage, {
          modelId: videoModelIdForRequest,
          duration: durationForRequest,
          negativePrompt: isOneToAllAnimateVideoModel ? oneToAllNegativePromptForRequest : negativePromptForRequest,
          ...(isOneToAllAnimateVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            resolution: oneToAllAnimateResolutionForRun,
          } : {}),
          ...(isScailVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
          } : {}),
          ...(isVeo31ExtendMode ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
          } : {}),
          ...(videoTailImageElement ? { tailImage: videoTailImageElement } : {}),
          ...(generateAudioForRequest !== undefined ? { generateAudio: generateAudioForRequest } : {}),
          ...(isKling26ControlVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            keepOriginalSound: keepOriginalSoundForRequest,
            characterOrientation: characterOrientationForRequest,
          } : {}),
          ...(isWanVisionEnhancerVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            targetResolution: wanTargetResolutionForRun,
            creativity: wanCreativityForRun,
          } : {}),
          ...(isWanAnimateVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            numInferenceSteps: Number(wanAnimateStepsForRun),
            resolution: wanAnimateResolutionForRun,
            shift: Number(wanAnimateShiftForRun),
            videoQuality: wanAnimateQualityForRun,
            useTurbo: wanAnimateUseTurboForRun,
          } : {}),
          ...(isKlingO1VideoModel ? {
            referenceImages: referenceImagesForRun,
            elementImages: elementImagesForRun,
            klingO1Variant: klingO1VariantForRun,
            ...(isKlingO1VideoInputMode ? {
              sourceVideoUrl: sourceVideoUrlForRequest,
              keepAudio: klingO1KeepAudioForRun,
              ...(isKlingO1RefV2VMode ? {
                duration: videoDurationForRun,
                aspectRatio: falAspectRatioSelectionForRun === 'default' ? 'auto' : falAspectRatioSelectionForRun,
              } : {}),
            } : {}),
          } : {}),
          ...(isLipsyncVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            sourceAudioUrl: sourceAudioUrlForRequest,
            lipsyncEmotion: lipsyncEmotion,
            lipsyncModelMode: lipsyncModelMode,
            lipsyncAudioMode: lipsyncAudioMode,
          } : {}),
          ...(isInfinitalkVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            sourceAudioUrl: sourceAudioUrlForRequest,
            resolution: infinitalkResolutionForRun,
            ...(infinitalkSeedValue !== undefined ? { seed: infinitalkSeedValue } : {}),
            acceleration: infinitalkAccelerationForRun,
            infinitalkDuration: infinitalkDurationForRun,
          } : {}),
          ...(isGrokImagineVideoModel ? {
            grokImagineVideoDuration: grokImagineVideoDurationForRun,
            grokImagineVideoResolution: grokImagineVideoResolutionForRun,
            grokImagineVideoAspectRatio: grokImagineVideoAspectRatioForRun,
            ...(isGrokImagineVideoEditMode ? { sourceVideoUrl: sourceVideoUrlForRequest } : {}),
          } : {}),
          ...(isSora2ProVideoModel ? {
            sora2ProResolution: sora2ProResolutionForRun,
            sora2ProAspectRatio: sora2ProAspectRatioForRun,
            sora2ProDuration: sora2ProDurationForRun,
          } : {}),
          ...(isVeo31VideoModelForRun ? {
            veo31Duration: veo31DurationForRun,
            veo31Resolution: veo31ResolutionForRun,
            veo31AspectRatio: veo31AspectRatioForRun,
            veo31GenerateAudio: veo31GenerateAudioForRun,
          } : {}),
          ...(isWan26I2VVideoModel ? {
            wan26Resolution: wan26Resolution,
            wan26Duration: wan26Duration,
            wan26PromptExpansion: wan26PromptExpansion,
            wan26MultiShots: wan26MultiShots,
            ...(sourceAudioUrlForRequest ? { sourceAudioUrl: sourceAudioUrlForRequest } : {}),
          } : {}),
          ...(isSeedance15VideoModel ? {
            seedance15AspectRatio: seedance15AspectRatio,
            seedance15Resolution: seedance15Resolution,
            seedance15Duration: seedance15Duration,
            seedance15CameraFixed: seedance15CameraFixed,
            seedance15Audio: seedance15Audio,
            ...(videoTailImageElement ? { tailImage: videoTailImageElement } : {}),
          } : {}),
          onQueueUpdate: (update: FalQueueUpdate) => {
            setFalJobs(prev => prev.map(job => {
              if (job.id !== falJobId) {
                return job;
              }
              return applyFalQueueUpdateToJob(job, update);
            }));
          },
        });

        setFalJobs(prev => prev.map(job => {
          if (job.id !== falJobId) {
            return job;
          }
          if (job.status === 'FAILED') {
            return job;
          }
          return {
            ...job,
            status: 'COMPLETED',
            requestId: videoResult.requestId || job.requestId,
            description: 'Video ready',
            outputUrl: videoResult.videoUrl,
            updatedAt: Date.now(),
          };
        }));

        try {
          const response = await fetch(videoResult.videoUrl);
          const videoBlob = await response.blob();
          const fileType = videoBlob.type || 'video/mp4';
          const extension = fileType.split('/')[1]?.split(';')[0] || 'mp4';
          const videoFileName = `generated_video.${extension}`;
          const videoElement = await loadMediaFromBlob(videoBlob, 'video') as HTMLVideoElement;
          videoElement.pause();
          videoElement.currentTime = 0;
          videoElement.loop = true;
          videoElement.muted = true;
          videoElement.playsInline = true;
          let isPlaying = true;
          try {
            const playPromise = videoElement.play();
            if (playPromise && typeof playPromise.then === 'function') {
              await playPromise;
            }
          } catch {
            videoElement.pause();
            isPlaying = false;
          }

          const { naturalWidth, naturalHeight } = getNaturalSize(videoElement);
          const displayWidth = naturalWidth || 1;
          const displayHeight = naturalHeight || 1;
          const anchorForPlacement = activePrimary
            ?? primarySelection
            ?? sourceVideo
            ?? images[images.length - 1]
            ?? null;
          const placement = anchorForPlacement
            ? (() => {
              const anchorBounds = getImageBounds(anchorForPlacement);
              const placementX = anchorBounds.maxX + 20;
              const placementY = anchorBounds.minY;
              return findNonOverlappingPlacement(displayWidth, displayHeight, placementX, placementY);
            })()
            : { x: 100, y: 100 };
          const audioTrackInfo = (videoElement as unknown as { audioTracks?: { length?: number } }).audioTracks;
          const audioTrackCount = typeof audioTrackInfo?.length === 'number' ? audioTrackInfo.length : 0;
          const webkitAudioDecodedByteCount = (videoElement as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
          const hasDetectedAudio = Boolean(
            (videoElement as unknown as { mozHasAudio?: boolean }).mozHasAudio ||
            audioTrackCount > 0 ||
            (typeof webkitAudioDecodedByteCount === 'number' && webkitAudioDecodedByteCount > 0)
          );
          const hasAudio = hasDetectedAudio
            || generateAudioForRequest === true
            || (isVeo31VideoModelForRun && veo31GenerateAudioForRun);

          const newVideo: CanvasImage = {
            id: crypto.randomUUID(),
            element: videoElement,
            mediaType: 'video',
            x: placement.x,
            y: placement.y,
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth,
            naturalHeight,
            file: new File([videoBlob], videoFileName, { type: fileType }),
            isPlaying,
            hasAudio,
            metadata: {
              source: 'generated',
              modelLabel: jobModelLabel,
              prompt: trimmedPrompt,
              generation: {
                kind: 'video',
                prompt: trimmedPrompt,
                provider: 'fal',
                modelId: falModelIdForRun,
                modelLabel: jobModelLabel,
                modelMode: falModelModeForRun,
                url: videoResult.videoUrl,
                primaryImageId: primaryImageIdForRun ?? undefined,
                ...(referenceImageIdsForRun.length ? { referenceImageIds: referenceImageIdsForRun } : {}),
                ...(elementImageIdsForRun.length ? { elementImageIds: elementImageIdsForRun } : {}),
                ...(activePrimary?.metadata?.generation?.originalSourceImageId
                  ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
                  : primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                ...(videoLastFrameIdForMetadata ? { videoLastFrameImageId: videoLastFrameIdForMetadata } : {}),
                ...((isKlingO1VideoInputMode || isFalVideoInputMode) && sourceVideoIdForRun ? { sourceVideoId: sourceVideoIdForRun } : {}),
                falOptions: {
                  ...(videoDurationForRun ? { videoDuration: videoDurationForRun } : {}),
                  ...(isHailuoVideoModel ? { hailuoVariant: hailuoVariantForRun } : {}),
                  ...(isKlingVideoModel ? { klingVariant: klingVariantForRun } : {}),
                  ...(isKlingO1VideoModel ? { klingO1Variant: klingO1VariantForRun } : {}),
                  ...(isKlingO1VideoInputMode ? { klingO1KeepAudio: klingO1KeepAudioForRun } : {}),
                  ...(isKlingO1RefV2VMode ? { aspectRatioSelection: falAspectRatioSelectionForRun } : {}),
                  ...(hasVideoNegativePrompt ? { negativePrompt: normalizedVideoNegativePrompt } : {}),
                  ...(isWanVisionEnhancerVideoModel ? {
                    wanTargetResolution: wanTargetResolutionForRun,
                    wanCreativity: wanCreativityForRun,
                  } : {}),
                  ...(isWanAnimateVideoModel ? {
                    wanAnimateVariant: wanAnimateVariantForRun,
                    wanAnimateSteps: wanAnimateStepsForRun,
                    wanAnimateResolution: wanAnimateResolutionForRun,
                    wanAnimateShift: wanAnimateShiftForRun,
                    wanAnimateQuality: wanAnimateQualityForRun,
                    wanAnimateUseTurbo: wanAnimateUseTurboForRun,
                  } : {}),
                  ...(isOneToAllAnimateVideoModel ? {
                    oneToAllAnimateResolution: oneToAllAnimateResolutionForRun,
                  } : {}),
                  ...(isLipsyncVideoModel ? {
                    lipsyncEmotion: lipsyncEmotion,
                    lipsyncModelMode: lipsyncModelMode,
                    lipsyncAudioMode: lipsyncAudioMode,
                  } : {}),
                  ...(isInfinitalkVideoModel ? {
                    infinitalkResolution: infinitalkResolutionForRun,
                    infinitalkSeed: infinitalkSeedForRun,
                    infinitalkAcceleration: infinitalkAccelerationForRun,
                    infinitalkDuration: infinitalkDurationForRun,
                  } : {}),
                  ...(isGrokImagineVideoModel ? {
                    grokImagineVideoDuration: grokImagineVideoDurationForRun,
                    grokImagineVideoResolution: grokImagineVideoResolutionForRun,
                    grokImagineVideoAspectRatio: grokImagineVideoAspectRatioForRun,
                  } : {}),
                  ...(isSora2ProVideoModel ? {
                    sora2ProResolution: sora2ProResolutionForRun,
                    sora2ProAspectRatio: sora2ProAspectRatioForRun,
                    sora2ProDuration: sora2ProDurationForRun,
                  } : {}),
                  ...(isVeo31VideoModelForRun ? {
                    veo31Variant: veo31VariantForRun,
                    veo31Duration: veo31DurationForRun,
                    veo31Resolution: veo31ResolutionForRun,
                    veo31AspectRatio: veo31AspectRatioForRun,
                    veo31GenerateAudio: veo31GenerateAudioForRun,
                  } : {}),
                  ...(isWan26I2VVideoModel ? {
                    wan26Resolution: wan26Resolution,
                    wan26Duration: wan26Duration,
                    wan26PromptExpansion: wan26PromptExpansion,
                    wan26MultiShots: wan26MultiShots,
                  } : {}),
                  ...(isSeedance15VideoModel ? {
                    seedance15AspectRatio: seedance15AspectRatio,
                    seedance15Resolution: seedance15Resolution,
                    seedance15Duration: seedance15Duration,
                    seedance15CameraFixed: seedance15CameraFixed,
                    seedance15Audio: seedance15Audio,
                  } : {}),
                  ...(isKling26VideoModel ? { kling26Audio: kling26AudioForRun } : {}),
                  ...(isKling26ControlVideoModel ? {
                    kling26ControlVariant: kling26ControlVariantForRun,
                    kling26ControlKeepSound: kling26ControlKeepSoundForRun,
                    kling26ControlDriver: kling26ControlDriverForRun,
                  } : {}),
                },
              },
            },
          };

          setState(prev => ({
            ...prev,
            images: [...prev.images, newVideo],
          }));
          setSelectedImageIds([newVideo.id]);
          setSelectedNoteIds([]);
          setReferenceImageIds([]);
          setElementImageIds([]);
          setTool(Tool.FREE_SELECTION);

          setToastMessage('Video added to canvas');
          // Let autosave know a generation completed successfully.
          onGenerationComplete?.();
        } catch (loadErr) {
          console.error('Failed to load generated video into canvas', loadErr);
          setToastMessage('Video ready! Open from the Fal Queue panel.');
        }
        setTimeout(() => setToastMessage(null), 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        const userFacingMessage = buildFalDisplayError(message) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE;

        if (jobQueued) {
          setFalJobs(prev => prev.map(job => {
            if (job.id !== falJobId) {
              return job;
            }
            return {
              ...job,
              status: 'FAILED',
              error: userFacingMessage,
              updatedAt: Date.now(),
            };
          }));
        }

        setError(userFacingMessage);
      }

      return;
    }

    if (usingFal && isUpscaleModel && isTextToImage) {
      setError('Please select an image to upscale.');
      return;
    }

    const generationModelLabel = usingFal ? getFalModelLabel(falModelIdForRun) : 'Google Gemini';
    const shouldValidateFalOptions = usingFal
      && (isSeedreamModel || isNanoBananaModel || isReveModel || isKlingModel || isGrokImagineModel); // Include Grok validation.
    const isNumImagesInvalid =
      !Number.isFinite(falNumImagesForRun) ||
      falNumImagesForRun < 1 ||
      falNumImagesForRun > 4;
    const normalizedFalNumImages = Math.min(4, Math.max(1, Math.floor(Number.isFinite(falNumImagesForRun) ? falNumImagesForRun : 1)));
    const googleAspectRatio = isNanoBananaModel && falAspectRatioSelectionForRun !== 'default'
      ? falAspectRatioSelectionForRun
      : undefined;

    if (!isTextToImage) {
      if (!primaryImageIdForRun || !activePrimary) {
        setError('Please select an image to edit.');
        return;
      }

      if (!isUpscaleModel) {
        if (appMode === 'CANVAS' && tool !== Tool.SELECTION && tool !== Tool.FREE_SELECTION) {
          setError('In Canvas Mode, please use the Select tool to perform a general image edit.');
          return;
        }

      }
    }

    if (shouldValidateFalOptions && isNumImagesInvalid) {
      setError('Number of images must be between 1 and 4.');
      return;
    }

    const falJobId = usingFal ? crypto.randomUUID() : null;
    const jobModelLabel = getFalModelLabel(falModelIdForRun);
    const upscaleDetails = usingFal && isUpscaleModel
      ? [
        `${falScaleFactorForRun}x`,
        ...(isSeedvrUpscaleModel ? [`noise ${falNoiseScaleForRun.toFixed(1)}`] : []),
        ...(isCrystalUpscaleModel ? [`creativity ${falCreativityForRun.toFixed(1)}`] : []),
      ].join(', ')
      : '';
    const jobPromptDescription = usingFal && isUpscaleModel
      ? `${jobModelLabel} (${upscaleDetails})`
      : trimmedPrompt;

    if (usingFal && falJobId) {
      const newJob: FalQueueJob = {
        id: falJobId,
        prompt: jobPromptDescription,
        modelId: falModelIdForRun,
        modelLabel: jobModelLabel,
        status: 'IN_QUEUE',
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setFalJobs(prev => [...prev.slice(-9), newJob]);
      addDebugLog({
        direction: 'outbound',
        source: 'fal',
        title: jobModelLabel,
        message: 'Submitting request',
        data: {
          jobId: falJobId,
          kind: isTextToImage ? 'text-to-image' : isUpscaleModel ? 'upscale' : 'edit',
        },
      });
    } else {
      setIsLoading(true);
    }

    setError(null);

    if (rawFalImageSizeSelection === 'placeholder' && !falOptionsOverride.imageSizeSelection) {
      setFalImageSizeSelection('default');
    }
    if (rawFalAspectRatioSelection === 'placeholder' && !falOptionsOverride.aspectRatioSelection) {
      setFalAspectRatioSelection(isGrokImagineModel ? '1:1' : 'default'); // Grok uses 1:1 default.
    }

    let referenceIdsUsed: string[] = [];

    try {
      let generationResult: { imageBase64: string; imagesBase64: string[]; text: string; requestId?: string };
      let placementOrigin = { x: 100, y: 100 };
      let sourceImageForAPI: {
        element: HTMLImageElement;
        x: number;
        y: number;
        width: number;
        height: number;
        naturalWidth: number;
        naturalHeight: number;
        file: File;
      } | null = null;

      if (isTextToImage) {
        const imageBoundsList = images.map(getImageBounds);
        const placementX = imageBoundsList.length > 0
          ? Math.max(...imageBoundsList.map(b => b.maxX)) + 20
          : 100;
        const placementY = imageBoundsList.length > 0
          ? Math.min(...imageBoundsList.map(b => b.minY))
          : 100;
        placementOrigin = { x: placementX, y: placementY };

        if (usingFal) {
          if (!falJobId) {
            throw new Error('Unable to create Fal job identifier.');
          }

          const textToImageModelId = isSeedreamModel
            ? getSeedreamTextToImageModelId(falModelIdForRun)
            : isReveModel
              ? REVE_TEXT_TO_IMAGE_MODEL_ID
              : isGrokImagineModel
                ? GROK_IMAGINE_IMAGE_MODEL_ID // Grok text-to-image endpoint.
              : isKlingModel
                ? KLING_IMAGE_MODEL_ID
                : isFlux2MaxModelForRun
                  ? FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID
                  : isWan26ImageModelForRun
                    ? WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID
                    : isNanoBananaProModel
                      ? NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID
                      : NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;

          let klingReferenceImages: HTMLImageElement[] | undefined;
          if (isKlingModel) {
            const maxReferenceImages = getMaxReferenceImages(falModelIdForRun);
            const referenceCanvasImages = referenceImageIdsForRun
              .map(id => images.find(img => img.id === id))
              .filter((img): img is CanvasImage & { element: HTMLImageElement } => isImageCanvasMedia(img))
              .slice(0, maxReferenceImages);

            const prepareReferenceImage = async (img: CanvasImage & { element: HTMLImageElement }): Promise<HTMLImageElement> => {
              if ((img.rotation ?? 0) === 0) {
                return img.element;
              }
              const rasterized = await rasterizeImages([img]);
              return rasterized.element;
            };

            if (referenceCanvasImages.length > 0) {
              klingReferenceImages = await Promise.all(referenceCanvasImages.map(prepareReferenceImage));
              referenceIdsUsed = referenceCanvasImages.map(img => img.id);
            }
          }

          const falResult = await generateFalImage(trimmedPrompt, {
            onQueueUpdate: (update) => {
              if (isKlingModel && update.status === 'FAILED') {
                const updateMessage = typeof (update as { message?: unknown }).message === 'string'
                  ? (update as { message?: string }).message
                  : undefined;
                const updateError = typeof (update as { error?: unknown }).error === 'string'
                  ? (update as { error?: string }).error
                  : undefined;
                const fileSizeMessage = getFalFileSizeErrorMessage(
                  updateMessage ?? updateError,
                  extractFalQueueLogMessages(update.logs),
                );
                if (fileSizeMessage) {
                  showTemporaryError(fileSizeMessage);
                }
              }
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }
                return applyFalQueueUpdateToJob(job, update);
              }));
            },
            modelId: textToImageModelId,
            aspectRatio: (isNanoBananaModel || isReveModel || isKlingModel || isSeedreamModel || isGrokImagineModel)
              ? (isGrokImagineModel ? grokAspectRatioForRun : falAspectRatioSelectionForRun)
              : 'default', // Include Grok aspect ratios.
            ...(isNanoBananaModel ? { resolution: falResolutionSelectionForRun } : {}),
            ...(isKlingModel ? { resolution: normalizedFalResolutionSelectionForRun } : {}),
            ...(isSeedreamModel ? { imageSize: falImageSizeSelectionForRun } : {}),
            ...(isFlux2MaxModelForRun ? { flux2MaxImageSize } : {}),
            ...(isWan26ImageModelForRun ? {
              wan26ImageSize: wan26ImageAspectRatio,
              wan26ImageMaxImages: wan26ImageMaxImages,
              negativePrompt: videoNegativePrompt.trim() || undefined,
            } : {}),
            ...(klingReferenceImages ? { referenceImages: klingReferenceImages } : {}),
            numImages: normalizedFalNumImages,
          });

          generationResult = falResult;

          setFalJobs(prev => prev.map(job => {
            if (job.id !== falJobId) {
              return job;
            }
            if (job.status === 'FAILED') {
              return job;
            }
            return {
              ...job,
              status: 'COMPLETED',
              requestId: falResult.requestId || job.requestId,
              description: falResult.text,
              updatedAt: Date.now(),
            };
          }));
        } else {
          generationResult = await generateGoogleImage(trimmedPrompt, {
            aspectRatio: googleAspectRatio,
          });
        }
      } else {
        if (!primaryImageIdForRun || !activePrimary) {
          throw new Error('Please select an image to edit.');
        }

        sourceImageForAPI = {
          element: activePrimary.element as HTMLImageElement,
          x: activePrimary.x,
          y: activePrimary.y,
          width: activePrimary.width,
          height: activePrimary.height,
          naturalWidth: activePrimary.naturalWidth,
          naturalHeight: activePrimary.naturalHeight,
          file: activePrimary.file,
        };

        const editImageDimensions = {
          width: sourceImageForAPI.naturalWidth || sourceImageForAPI.width,
          height: sourceImageForAPI.naturalHeight || sourceImageForAPI.height,
        };

        if (usingFal) {
          if (!falJobId) {
            throw new Error('Unable to create Fal job identifier.');
          }

          if (isUpscaleModel) {
            const onQueueUpdate = (update: FalQueueUpdate) => {
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }
                return applyFalQueueUpdateToJob(job, update);
              }));
            };

            const falUpscaleResult = isSeedvrUpscaleModel
              ? await upscaleFalSeedvrImage(
                sourceImageForAPI.element,
                falScaleFactorForRun,
                falNoiseScaleForRun,
                { onQueueUpdate },
              )
              : await upscaleFalCrystalImage(
                sourceImageForAPI.element,
                falScaleFactorForRun,
                falCreativityForRun,
                { onQueueUpdate },
              );

            generationResult = falUpscaleResult;

            setFalJobs(prev => prev.map(job => {
              if (job.id !== falJobId) {
                return job;
              }
              if (job.status === 'FAILED') {
                return job;
              }
              return {
                ...job,
                status: 'COMPLETED',
                requestId: falUpscaleResult.requestId || job.requestId,
                description: falUpscaleResult.text,
                updatedAt: Date.now(),
              };
            }));
          } else {
            const hasEditReferences = referenceImageIdsForRun.length > 0;
            const supportsEditReferenceImages = isKlingModel || isNanoBananaProModel || isSeedreamModel || isReveModel || isFlux2MaxModelForRun || isWan26ImageModelForRun;
            let editReferenceImages: HTMLImageElement[] | undefined;
            if (supportsEditReferenceImages && hasEditReferences) {
              const maxReferenceImages = getMaxReferenceImages(falModelIdForRun);
              const referenceCanvasImages = referenceImageIdsForRun
                .filter(id => id !== primaryImageIdForRun)
                .map(id => images.find(img => img.id === id))
                .filter((img): img is CanvasImage & { element: HTMLImageElement } => isImageCanvasMedia(img))
                .slice(0, maxReferenceImages);

              const prepareReferenceImage = async (img: CanvasImage & { element: HTMLImageElement }): Promise<HTMLImageElement> => {
                if ((img.rotation ?? 0) === 0) {
                  return img.element;
                }
                const rasterized = await rasterizeImages([img]);
                return rasterized.element;
              };

              if (referenceCanvasImages.length > 0) {
                editReferenceImages = await Promise.all(referenceCanvasImages.map(prepareReferenceImage));
                referenceIdsUsed = referenceCanvasImages.map(img => img.id);
              }
            }

            const falEditResult = await generateFalImageEdit({
              prompt: trimmedPrompt,
              image: sourceImageForAPI.element,
              tool,
              paths,
              imageDimensions: editImageDimensions,
              referenceImages: editReferenceImages,
            }, {
              modelId: falModelIdForRun,
              ...(falAspectRatioSelectionForRun ? { aspectRatio: falAspectRatioSelectionForRun } : {}),
              ...(falImageSizeSelectionForRun ? { imageSize: falImageSizeSelectionForRun } : {}),
              ...(falResolutionSelectionForRun ? { resolution: falResolutionSelectionForRun } : {}),
              ...(isWan26ImageModelForRun ? {
                wan26ImageSize: wan26ImageAspectRatio,
                wan26ImageMaxImages: wan26ImageMaxImages,
                negativePrompt: videoNegativePrompt.trim() || undefined,
              } : {}),
              numImages: normalizedFalNumImages,
              onQueueUpdate: (update) => {
                if (isKlingModel && update.status === 'FAILED') {
                  const updateMessage = typeof (update as { message?: unknown }).message === 'string'
                    ? (update as { message?: string }).message
                    : undefined;
                  const updateError = typeof (update as { error?: unknown }).error === 'string'
                    ? (update as { error?: string }).error
                    : undefined;
                  const fileSizeMessage = getFalFileSizeErrorMessage(
                    updateMessage ?? updateError,
                    extractFalQueueLogMessages(update.logs),
                  );
                  if (fileSizeMessage) {
                    showTemporaryError(fileSizeMessage);
                  }
                }
                setFalJobs(prev => prev.map(job => {
                  if (job.id !== falJobId) {
                    return job;
                  }
                  return applyFalQueueUpdateToJob(job, update);
                }));
              },
            });

            generationResult = falEditResult;

            setFalJobs(prev => prev.map(job => {
              if (job.id !== falJobId) {
                return job;
              }
              if (job.status === 'FAILED') {
                return job;
              }
              return {
                ...job,
                status: 'COMPLETED',
                requestId: falEditResult.requestId || job.requestId,
                description: falEditResult.text,
                updatedAt: Date.now(),
              };
            }));
          }
        } else {
          const googleResult = await generateGoogleImageEdit({
            prompt: trimmedPrompt,
            image: sourceImageForAPI.element,
            tool,
            paths,
            imageDimensions: editImageDimensions,
            mimeType: sourceImageForAPI.file.type,
          });
          generationResult = googleResult;
        }
      }

      if (!generationResult) {
        throw new Error('No generation result received.');
      }

      const imagesBase64 = generationResult.imagesBase64 || [];
      const generatedImages = imagesBase64.length > 0 ? imagesBase64 : [generationResult.imageBase64];
      // Hydrate base64 outputs back into canvas images and annotate them with generation metadata.
      const addGeneratedImages = async () => {
        const newImages: CanvasImage[] = [];
        let lastBounds = images.length > 0 ? getImageBounds(images[images.length - 1]) : null;
        for (const base64 of generatedImages) {
          const img = new Image();
          img.src = `data:image/png;base64,${base64}`;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to load generated image.'));
          });

          const { naturalWidth, naturalHeight } = getNaturalSize(img);
          const displayWidth = naturalWidth || 512;
          const displayHeight = naturalHeight || 512;
          const file = new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'generated.png', { type: 'image/png' });
          let newX = placementOrigin.x;
          let newY = placementOrigin.y;
          if (lastBounds) {
            newX = lastBounds.maxX + 20;
            newY = lastBounds.minY;
          }

          const newCanvasImage: CanvasImage = {
            id: crypto.randomUUID(),
            element: img,
            mediaType: 'image',
            x: newX,
            y: newY,
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth,
            naturalHeight,
            file: file,
            isPlaying: false,
            hasAudio: false,
            metadata: {
              source: 'generated',
              prompt: trimmedPrompt,
              modelLabel: generationModelLabel,
              ...(isUpscaleModel ? { upscaleFactor: falScaleFactorForRun } : {}),
              ...(isSeedvrUpscaleModel ? { noiseScale: falNoiseScaleForRun } : {}),
              ...(isCrystalUpscaleModel ? { creativity: falCreativityForRun } : {}),
              generation: {
                kind: generationKind,
                prompt: trimmedPrompt,
                provider: apiProviderForRun,
                modelId: falModelIdForRun,
                modelLabel: generationModelLabel,
                modelMode: falModelModeForRun,
                primaryImageId: primaryImageIdForRun ?? undefined,
                referenceImageIds: referenceIdsUsed.length > 0 ? referenceIdsUsed : undefined,
                ...(videoLastFrameImageIdForRun ? { videoLastFrameImageId: videoLastFrameImageIdForRun } : {}),
                ...(primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                falOptions: {
                  ...(falAspectRatioSelectionForRun ? { aspectRatioSelection: falAspectRatioSelectionForRun } : {}),
                  ...(falImageSizeSelectionForRun ? { imageSizeSelection: falImageSizeSelectionForRun } : {}),
                  ...(falResolutionSelectionForRun ? { resolutionSelection: falResolutionSelectionForRun } : {}),
                  ...(generationKind === 'upscale' ? { scaleFactor: falScaleFactorForRun } : {}),
                  ...(isSeedvrUpscaleModel ? { noiseScale: falNoiseScaleForRun } : {}),
                  ...(isCrystalUpscaleModel ? { creativity: falCreativityForRun } : {}),
                  ...(generationKind === 'video' ? { videoDuration: videoDurationForRun } : {}),
                  ...(isHailuoVideoModel ? { hailuoVariant: hailuoVariantForRun } : {}),
                  ...(isKlingVideoModel ? { klingVariant: klingVariantForRun } : {}),
                  ...(hasVideoNegativePrompt ? { negativePrompt: normalizedVideoNegativePrompt } : {}),
                  ...(isWanVisionEnhancerVideoModel ? {
                    wanTargetResolution: wanTargetResolutionForRun,
                    wanCreativity: wanCreativityForRun,
                  } : {}),
                  ...(isWanAnimateVideoModel ? {
                    wanAnimateVariant: wanAnimateVariantForRun,
                    wanAnimateSteps: wanAnimateStepsForRun,
                    wanAnimateResolution: wanAnimateResolutionForRun,
                    wanAnimateShift: wanAnimateShiftForRun,
                    wanAnimateQuality: wanAnimateQualityForRun,
                    wanAnimateUseTurbo: wanAnimateUseTurboForRun,
                  } : {}),
                  ...(isOneToAllAnimateVideoModel ? {
                    oneToAllAnimateResolution: oneToAllAnimateResolutionForRun,
                  } : {}),
                  ...(isKling26VideoModel ? { kling26Audio: kling26AudioForRun } : {}),
                  ...(normalizedFalNumImages ? { numImages: normalizedFalNumImages } : {}),
                },
              },
            },
          };

          newImages.push(newCanvasImage);
          lastBounds = getImageBounds(newCanvasImage);
        }

        setState(prev => ({
          ...prev,
          images: [...prev.images, ...newImages],
        }));
        if (newImages.length > 0) {
          setSelectedImageIds([newImages[newImages.length - 1].id]);
        }
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
        setTool(Tool.FREE_SELECTION);
        setToastMessage('Generation complete');
        setTimeout(() => setToastMessage(null), 2000);
      };

      await addGeneratedImages();
      // Let autosave know a generation completed successfully.
      onGenerationComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      const fileSizeMessage = usingFal && isKlingModel ? getFalFileSizeErrorMessage(message) : undefined;
      const userFacingMessage = usingFal
        ? fileSizeMessage ?? buildFalDisplayError(message) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE
        : message;
      if (usingFal) {
        setFalJobs(prev => prev.map(job => {
          if (job.id === falJobId) {
            return { ...job, status: 'FAILED', error: userFacingMessage, updatedAt: Date.now() };
          }
          return job;
        }));
      } else {
        setIsLoading(false);
      }
      if (fileSizeMessage) {
        showTemporaryError(fileSizeMessage);
      } else {
        setError(userFacingMessage);
      }
    } finally {
      if (!usingFal) {
        setIsLoading(false);
      }
    }
  }, [
    appMode,
    tool,
    prompt,
    promptPrefix,
    apiProvider,
    falModelMode,
    falImageModelId,
    falVideoModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    falVideoDuration,
    hailuoVariant,
    klingVariant,
    klingO1Variant,
    kling26AudioSelection,
    kling26ControlVariant,
    kling26ControlKeepSound,
    kling26ControlDriver,
    videoNegativePrompt,
    wanTargetResolution,
    wanCreativity,
    lipsyncEmotion,
    lipsyncModelMode,
    lipsyncAudioMode,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    infinitalkDuration,
    sora2ProResolution,
    sora2ProAspectRatio,
    sora2ProDuration,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan26Resolution,
    wan26Duration,
    wan26PromptExpansion,
    wan26MultiShots,
    isWan26I2VVideoModel,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    isSeedance15VideoModel,
    wan26ImageAspectRatio,
    wan26ImageMaxImages,
    isWan26ImageModel,
    images,
    paths,
    referenceImageIds,
    elementImageIds,
    videoLastFrameImageId,
    selectedImageIds,
    primaryImageId,
    activePrimaryImage,
    sourceAudioId,
    setError,
    showTemporaryError,
    setIsLoading,
    setFalJobs,
    setState,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setToastMessage,
    setTool,
    onGenerationComplete,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
  ]);

  return handleGenerate;
};
