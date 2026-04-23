import { useCallback, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction, SyntheticEvent } from 'react';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok Imagine model id.
  GROK_IMAGINE_VIDEO_EDIT_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  RECRAFT_V4_PRO_MAX_COLORS,
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  VEO_31_EXTEND_VIDEO_MODEL_ID,
  VEO_31_FFLF_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  getFalModelLabel,
  getFalNumImageMaxForModel,
  getHailuoActualModelId,
  getKlingActualModelId,
  getKlingO1VideoEndpoint,
  getNanoBananaTextToImageModelId,
  getWanAnimateVideoEndpoint,
  getMaxReferenceImages,
  isGenerationProvider,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isKlingO1VideoModelId,
  isKlingV3CfgScaleSelectionValue,
  isKlingV3DurationSelectionValue,
  isKlingV3ShotDurationSelectionValue,
  isLipsyncSyncMode,
  isNanoBananaEditModelId,
  isRecraftV4ProModel,
  isRecraftV4ProImageSizeSelectionValue,
  normalizeRecraftRgbColor,
  isSeedance2AspectRatioSelectionValue,
  isSeedance2DurationSelectionValue,
  isSeedance2ResolutionSelectionValue,
  isSeedance2Variant,
  isWan27VideoAspectRatioSelectionValue,
  isWan27VideoDurationSelectionValue,
  isWan27VideoResolutionSelectionValue,
  isWan27VideoVariant,
  getSeedreamTextToImageModelId,
  isFalImageModelId,
  isFalModelMode,
  isFalVideoModelId,
  isSeedreamModelId,
  isSeedreamV5LiteModelId,
  normalizeFalModelId,
  type FalAspectRatioSelectionValue,
  type FalImageModelId,
  type FalImageSizeSelectionValue,
  type FalModelId,
  type FalModelMode,
  type FalResolutionSelectionValue,
  type FalVideoModelId,
  type HailuoVariant,
  type KlingO1Variant,
  type KlingV3CfgScaleSelectionValue,
  type KlingV3DurationSelectionValue,
  type KlingV3ShotDurationSelectionValue,
  type KlingVariant,
  type WanAnimateQualitySelectionValue,
  type WanAnimateResolutionSelectionValue,
  type WanAnimateShiftSelectionValue,
  type WanAnimateStepsSelectionValue,
  type WanAnimateVariant,
  type WanCreativity,
  type Wan27VideoAudioSettingSelectionValue,
  type Wan27VideoAspectRatioSelectionValue,
  type Wan27VideoDurationSelectionValue,
  type Wan27VideoResolutionSelectionValue,
  type Wan27VideoVariant,
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
import { buildFalDisplayError, FAL_PROVIDER_DOWN_MESSAGE } from '../services/falConstants';
import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasNote,
  GenerationInputs,
  GenerationKind,
  GenerationProviderId,
  Path,
  Point,
  FalVideoDuration,
  FalQueueJob,
  Seedance2Variant,
} from '../types';
import { Tool } from '../types';
import { getImageBounds, isOverlapping } from '../utils/canvasGeometry';
import { getNaturalSize, isVideoFileType, loadMediaFromBlob, rasterizeImages } from '../services/mediaService';
import { applyFalQueueUpdateToJob } from '../services/falQueueUtils';
import { convertAudioBlobToWav } from '../services/audioService';
import { generateSeedanceVideo, type VolcengineQueueUpdate } from '../services/volcengineService';
import { extractHeygenClipIntent } from '../services/moonshotIntentService';
import { buildSeedance2RequestKey } from '../utils/seedanceRequestKey';
import {
  buildEffectiveSeedanceReferenceIds,
  getCanvasMediaDurationSeconds,
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS,
  SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS,
  SEEDANCE_REFERENCE_TOTAL_FILE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS,
} from '../utils/seedanceReferences';
import {
  getSeedanceReferencePromptMentionError,
  normalizeSeedanceReferencePromptMentions,
} from '../utils/seedancePromptMentions';
import type { AppState } from './useCanvasHistory';

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
  setState: (updater: (prevState: AppState) => AppState) => void;
  setToastMessage: (message: string | null) => void;
  setTool: (tool: Tool) => void;
  onGenerationComplete?: () => void;
};

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

const extractDataUrlBase64 = (dataUrl: string): string | null => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex === -1 ? null : dataUrl.slice(commaIndex + 1); // Keep only payload bytes.
};

const loadGeneratedImageElement = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Failed to load generated image.'));
  img.src = src;
});

const normalizeGeneratedImageToPng = async (
  src: string,
): Promise<{ image: HTMLImageElement; base64: string }> => {
  const sourceImage = await loadGeneratedImageElement(src);
  const sourceBase64 = extractDataUrlBase64(src);
  if (src.startsWith(PNG_DATA_URL_PREFIX) && sourceBase64) {
    return { image: sourceImage, base64: sourceBase64 }; // Existing PNG outputs skip canvas work.
  }

  const width = sourceImage.naturalWidth || sourceImage.width;
  const height = sourceImage.naturalHeight || sourceImage.height;
  if (width <= 0 || height <= 0) {
    throw new Error('Generated image has invalid dimensions.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to prepare generated image.');
  }

  context.drawImage(sourceImage, 0, 0, width, height);
  const pngDataUrl = canvas.toDataURL('image/png');
  const pngBase64 = extractDataUrlBase64(pngDataUrl);
  if (!pngBase64) {
    throw new Error('Failed to convert generated image to PNG.');
  }

  return { image: await loadGeneratedImageElement(pngDataUrl), base64: pngBase64 };
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

const mergeQueueLogMessages = (existing: string[], incoming?: string[]): string[] => {
  if (!incoming || incoming.length === 0) {
    return existing;
  }
  const next = [...existing];
  incoming.forEach(message => {
    const normalized = message.trim();
    if (!normalized || next.includes(normalized)) {
      return;
    }
    next.push(normalized);
  });
  return next; // Keep queue logs de-duped across polls.
};

const fetchGeneratedVideoBlob = async (videoUrl: string, videoLabel: string): Promise<Blob> => {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`${videoLabel} download failed (HTTP ${response.status}).`); // Surface backend proxy failures instead of handing HTML to the video loader.
  }
  const videoBlob = await response.blob();
  if (videoBlob.type && !isVideoFileType(videoBlob.type)) {
    throw new Error(`${videoLabel} did not return a video file (${videoBlob.type}).`); // Catch provider error documents before the canvas loader tries to decode them.
  }
  return videoBlob;
};

const applyVolcengineQueueUpdateToJob = (
  job: FalQueueJob,
  update: VolcengineQueueUpdate,
): FalQueueJob => ({
  ...job,
  status: update.status,
  requestId: update.requestId || job.requestId,
  logs: mergeQueueLogMessages(job.logs, update.logs),
  outputUrl: update.outputUrl || job.outputUrl,
  error: update.status === 'FAILED' ? update.error || job.error : job.error,
  updatedAt: Date.now(),
});

const buildSeedance2ModelLabel = (baseLabel: string, variant: Seedance2Variant): string =>
  `${baseLabel} ${variant === 'reference' ? 'Reference' : 'Smart'}`; // Surface the active variant in the queue.

const buildStillImageFile = async (
  image: CanvasImage & { element: HTMLImageElement },
  fileNameBase: string,
): Promise<File> => {
  if ((image.rotation ?? 0) === 0) {
    return image.file;
  }
  const rasterized = await rasterizeImages([image]);
  return new File([rasterized.file], `${fileNameBase}.png`, { type: rasterized.file.type || 'image/png' }); // Rotated frames need a baked file.
};

const SEEDANCE_REPEAT_CONFIRM_INTERVAL = 5; // Ask before every sixth identical Seedance run.

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

  const seedanceRepeatStreakRef = useRef<{ requestKey: string | null; count: number }>({ requestKey: null, count: 0 });

  const confirmRepeatedSeedanceRequest = useCallback((requestKey: string): boolean => {
    const currentStreak = seedanceRepeatStreakRef.current;
    const nextCount = currentStreak.requestKey === requestKey ? currentStreak.count + 1 : 1;
    const shouldConfirm = nextCount > 1 && (nextCount - 1) % SEEDANCE_REPEAT_CONFIRM_INTERVAL === 0;
    if (shouldConfirm) {
      const confirmed = window.confirm(`You've submitted this same Seedance request ${nextCount - 1} times in a row. Generate it again?`);
      if (!confirmed) {
        return false;
      }
    }
    seedanceRepeatStreakRef.current = { requestKey, count: nextCount };
    return true; // Repeated random-seed runs stay allowed unless the user cancels the checkpoint.
  }, []);

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
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
    klingO1Variant,
    klingO1KeepAudio,
    klingV3ControlKeepSound,
    klingV3ControlOrientation,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
    oneToAllAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    lipsyncSyncMode,
    heygenEnableCaption,
    heygenEnableDynamicDuration,
    heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    infinitalkDuration,
    grokImagineVideoDuration,
    grokImagineVideoResolution,
    grokImagineVideoAspectRatio,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan27VideoResolution,
    wan27VideoDuration,
    wan27VideoAspectRatio,
    wan27VideoPromptExpansion,
    wan27VideoVariant,
    wan27VideoAudioSetting,
    isWan27VideoModel,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    seedance2Variant,
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    isSeedance15VideoModel,
    flux2MaxImageSize,
    isFlux2MaxModel,
    wan27ImageAspectRatio,
    wan27ImageMaxImages,
    isWan27ImageModel,
    recraftImageSize,
    recraftBackgroundColor,
    recraftColors,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
  } = fal;

  const {
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds,
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
    setReferenceVideoIds,
    setReferenceAudioIds,
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
    const requestedProviderForRun = isGenerationProvider(generationOverride?.provider) ? generationOverride.provider : apiProvider;
    const apiProviderForRun: ApiProviderId = requestedProviderForRun === 'google' ? 'google' : 'fal';
    const overrideModelId = normalizeFalModelId(generationOverride?.modelId); // Accept legacy saved model ids.
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
    const klingV3DurationForRun: KlingV3DurationSelectionValue = isKlingV3DurationSelectionValue(falOptionsOverride.klingV3Duration)
      ? falOptionsOverride.klingV3Duration
      : klingV3Duration;
    const klingV3GenerateAudioForRun = falOptionsOverride.klingV3GenerateAudio ?? klingV3GenerateAudio;
    const klingV3CfgScaleForRun: KlingV3CfgScaleSelectionValue = isKlingV3CfgScaleSelectionValue(falOptionsOverride.klingV3CfgScale)
      ? falOptionsOverride.klingV3CfgScale
      : klingV3CfgScale;
    const klingV3MultiPromptEnabledForRun = falOptionsOverride.klingV3MultiPromptEnabled ?? klingV3MultiPromptEnabled;
    const klingV3MultiPromptForRun = typeof falOptionsOverride.klingV3MultiPrompt === 'string'
      ? falOptionsOverride.klingV3MultiPrompt
      : klingV3MultiPrompt;
    const klingV3Shot1DurationForRun: KlingV3ShotDurationSelectionValue = isKlingV3ShotDurationSelectionValue(falOptionsOverride.klingV3Shot1Duration)
      ? falOptionsOverride.klingV3Shot1Duration
      : klingV3Shot1Duration;
    const klingV3Shot2DurationForRun: KlingV3ShotDurationSelectionValue = isKlingV3ShotDurationSelectionValue(falOptionsOverride.klingV3Shot2Duration)
      ? falOptionsOverride.klingV3Shot2Duration
      : klingV3Shot2Duration;
    const klingO1VariantForRun = falOptionsOverride.klingO1Variant ?? klingO1Variant;
    const videoNegativePromptForRun = falOptionsOverride.negativePrompt ?? videoNegativePrompt;
    const legacyWanOptions = falOptionsOverride as {
      wan26Resolution?: unknown;
      wan26Duration?: unknown;
      wan26PromptExpansion?: unknown;
    }; // Read old saved Wan 2.6 options.
    const wan27VideoResolutionForRun: Wan27VideoResolutionSelectionValue = isWan27VideoResolutionSelectionValue(falOptionsOverride.wan27VideoResolution)
      ? falOptionsOverride.wan27VideoResolution
      : isWan27VideoResolutionSelectionValue(legacyWanOptions.wan26Resolution)
        ? legacyWanOptions.wan26Resolution
        : wan27VideoResolution;
    const wan27VideoDurationForRun: Wan27VideoDurationSelectionValue = isWan27VideoDurationSelectionValue(falOptionsOverride.wan27VideoDuration)
      ? falOptionsOverride.wan27VideoDuration
      : isWan27VideoDurationSelectionValue(legacyWanOptions.wan26Duration)
        ? legacyWanOptions.wan26Duration
        : wan27VideoDuration;
    const wan27VideoAspectRatioForRun: Wan27VideoAspectRatioSelectionValue = isWan27VideoAspectRatioSelectionValue(falOptionsOverride.wan27VideoAspectRatio)
      ? falOptionsOverride.wan27VideoAspectRatio
      : wan27VideoAspectRatio;
    const wan27VideoPromptExpansionForRun = typeof falOptionsOverride.wan27VideoPromptExpansion === 'boolean'
      ? falOptionsOverride.wan27VideoPromptExpansion
      : typeof legacyWanOptions.wan26PromptExpansion === 'boolean'
        ? legacyWanOptions.wan26PromptExpansion
        : wan27VideoPromptExpansion;
    const wan27VideoVariantForRun: Wan27VideoVariant = isWan27VideoVariant(falOptionsOverride.wan27VideoVariant)
      ? falOptionsOverride.wan27VideoVariant
      : generationOverride ? 'smart' : wan27VideoVariant;
    const wan27VideoAudioSettingOverride = falOptionsOverride.wan27VideoAudioSetting; // Saved reruns can explicitly choose either audio mode.
    const wan27VideoAudioSettingForRun: Wan27VideoAudioSettingSelectionValue = wan27VideoAudioSettingOverride === 'auto' || wan27VideoAudioSettingOverride === 'origin'
      ? wan27VideoAudioSettingOverride
      : wan27VideoAudioSetting;
    const wanTargetResolutionForRun = falOptionsOverride.wanTargetResolution ?? wanTargetResolution;
    const wanCreativityForRun = falOptionsOverride.wanCreativity ?? wanCreativity;
    const wanAnimateVariantForRun = falOptionsOverride.wanAnimateVariant ?? wanAnimateVariant;
    const wanAnimateStepsForRun = falOptionsOverride.wanAnimateSteps ?? wanAnimateSteps;
    const wanAnimateResolutionForRun = falOptionsOverride.wanAnimateResolution ?? wanAnimateResolution;
    const wanAnimateShiftForRun = falOptionsOverride.wanAnimateShift ?? wanAnimateShift;
    const wanAnimateQualityForRun = falOptionsOverride.wanAnimateQuality ?? wanAnimateQuality;
    const wanAnimateUseTurboForRun = falOptionsOverride.wanAnimateUseTurbo ?? wanAnimateUseTurbo;
    const oneToAllAnimateResolutionForRun = falOptionsOverride.oneToAllAnimateResolution ?? oneToAllAnimateResolution;
    const lipsyncSyncModeForRun = isLipsyncSyncMode(falOptionsOverride.lipsyncSyncMode)
      ? falOptionsOverride.lipsyncSyncMode
      : lipsyncSyncMode; // Reruns can override current UI.
    const heygenEnableCaptionForRun = falOptionsOverride.heygenEnableCaption ?? heygenEnableCaption;
    const heygenEnableDynamicDurationForRun = falOptionsOverride.heygenEnableDynamicDuration ?? heygenEnableDynamicDuration;
    const heygenDisableMusicTrackForRun = falOptionsOverride.heygenDisableMusicTrack ?? heygenDisableMusicTrack;
    const heygenEnableSpeechEnhancementForRun = falOptionsOverride.heygenEnableSpeechEnhancement ?? heygenEnableSpeechEnhancement;
    const heygenStartTimeOverride = typeof falOptionsOverride.heygenStartTime === 'number' && Number.isFinite(falOptionsOverride.heygenStartTime)
      ? Math.max(0, falOptionsOverride.heygenStartTime)
      : undefined;
    const heygenEndTimeOverride = typeof falOptionsOverride.heygenEndTime === 'number' && Number.isFinite(falOptionsOverride.heygenEndTime)
      ? Math.max(0, falOptionsOverride.heygenEndTime)
      : undefined;
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
    const veo31VariantForRun = falOptionsOverride.veo31Variant ?? veo31Variant;
    const veo31DurationForRun = falOptionsOverride.veo31Duration ?? veo31Duration;
    const veo31ResolutionForRun = falOptionsOverride.veo31Resolution ?? veo31Resolution;
    const veo31AspectRatioForRun = falOptionsOverride.veo31AspectRatio ?? veo31AspectRatio;
    const veo31GenerateAudioForRun = falOptionsOverride.veo31GenerateAudio ?? veo31GenerateAudio;
    const recraftImageSizeForRun = isRecraftV4ProImageSizeSelectionValue(falOptionsOverride.recraftImageSize)
      ? falOptionsOverride.recraftImageSize
      : recraftImageSize;
    const recraftBackgroundColorForRun = normalizeRecraftRgbColor(falOptionsOverride.recraftBackgroundColor) ?? recraftBackgroundColor;
    const recraftColorsForRun = Array.isArray(falOptionsOverride.recraftColors)
      ? falOptionsOverride.recraftColors.map(normalizeRecraftRgbColor).filter((color): color is NonNullable<typeof color> => Boolean(color)).slice(0, RECRAFT_V4_PRO_MAX_COLORS)
      : recraftColors.slice(0, RECRAFT_V4_PRO_MAX_COLORS);
    const klingV3ControlKeepSoundForRun = falOptionsOverride.klingV3ControlKeepSound ?? klingV3ControlKeepSound;
    const klingV3ControlOrientationForRun = falOptionsOverride.klingV3ControlOrientation === 'image'
      || falOptionsOverride.klingV3ControlOrientation === 'video'
      ? falOptionsOverride.klingV3ControlOrientation
      : klingV3ControlOrientation;
    const volcengineOptionsOverride = generationOverride?.volcengineOptions ?? {};
    const seedanceOptionsOverride = { ...falOptionsOverride, ...volcengineOptionsOverride }; // Embedded bars store backend-specific Seedance settings in either options bag.
    const seedance2VariantForRun = isSeedance2Variant(seedanceOptionsOverride.seedance2Variant)
      ? seedanceOptionsOverride.seedance2Variant
      : seedance2Variant;
    const seedance2AspectRatioForRun = isSeedance2AspectRatioSelectionValue(seedanceOptionsOverride.seedance2AspectRatio)
      ? seedanceOptionsOverride.seedance2AspectRatio
      : seedance2AspectRatio;
    const seedance2ResolutionForRun = isSeedance2ResolutionSelectionValue(seedanceOptionsOverride.seedance2Resolution)
      ? seedanceOptionsOverride.seedance2Resolution
      : seedance2Resolution;
    const seedance2DurationForRun = isSeedance2DurationSelectionValue(seedanceOptionsOverride.seedance2Duration)
      ? seedanceOptionsOverride.seedance2Duration
      : seedance2Duration;
    const seedance2GenerateAudioForRun = typeof seedanceOptionsOverride.seedance2GenerateAudio === 'boolean'
      ? seedanceOptionsOverride.seedance2GenerateAudio
      : seedance2GenerateAudio;
    const seedance2CameraFixedForRun = typeof volcengineOptionsOverride.seedance2CameraFixed === 'boolean'
      ? volcengineOptionsOverride.seedance2CameraFixed
      : seedance2CameraFixed;
    const shouldMergeSeedanceReferenceIdsForRun = apiProviderForRun === 'fal'
      && falModelModeForRun === 'video'
      && (falVideoModelIdForRun === SEEDANCE_2_VIDEO_MODEL_ID || falVideoModelIdForRun === FAL_SEEDANCE_2_VIDEO_MODEL_ID)
      && seedance2VariantForRun === 'reference'
      && !generationOverride; // Only Seedance 2 treats selected media as reference labels.
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
        || falVideoModelIdForRun === KLING_V3_CONTROL_VIDEO_MODEL_ID
        || falVideoModelIdForRun === SCAIL_VIDEO_MODEL_ID
      );
    const primaryImageIdForRun = shouldPreferSelectedStillImage
      ? resolveSelectedStillImageId(basePrimaryImageIdForRun, selectedImageIds, images)
      : basePrimaryImageIdForRun;
    const primaryImageForRun = primaryImageIdForRun
      ? images.find(img => img.id === primaryImageIdForRun) || null
      : null;
    const activePrimary = isImageCanvasMedia(primaryImageForRun) ? primaryImageForRun : null;
    const baseReferenceImageIdsForRun = generationOverride ? generationOverride.referenceImageIds ?? [] : referenceImageIds;
    const baseReferenceVideoIdsForRun = generationOverride ? generationOverride.referenceVideoIds ?? [] : referenceVideoIds;
    const baseReferenceAudioIdsForRun = generationOverride ? generationOverride.referenceAudioIds ?? [] : referenceAudioIds;
    const {
      referenceImageIds: referenceImageIdsForRun,
      referenceVideoIds: referenceVideoIdsForRun,
      referenceAudioIds: referenceAudioIdsForRun,
    } = buildEffectiveSeedanceReferenceIds({
      enabled: shouldMergeSeedanceReferenceIdsForRun,
      images,
      selectedImageIds,
      referenceImageIds: baseReferenceImageIdsForRun,
      referenceVideoIds: baseReferenceVideoIdsForRun,
      referenceAudioIds: baseReferenceAudioIdsForRun,
      orderedReferenceIds: seedanceReferenceOrderIds,
    });
    const elementImageIdsForRun = generationOverride ? generationOverride.elementImageIds ?? [] : elementImageIds;
    const videoLastFrameImageIdForRun = generationOverride?.videoLastFrameImageId ?? videoLastFrameImageId;
    const sourceVideoIdForRun = generationOverride?.sourceVideoId ?? sourceVideoId;
    const sourceAudioIdForRun = generationOverride ? generationOverride.sourceAudioId ?? null : sourceAudioId;
    const klingO1KeepAudioForRun = generationOverride?.falOptions?.klingO1KeepAudio ?? klingO1KeepAudio;
    const generationProviderForRun: GenerationProviderId = apiProviderForRun === 'google'
      ? 'google'
      : falModelModeForRun === 'video' && falVideoModelIdForRun === SEEDANCE_2_VIDEO_MODEL_ID
        ? 'volcengine'
        : 'fal';

    const usingFal = generationProviderForRun === 'fal';
    const usingVolcengine = generationProviderForRun === 'volcengine';
    const usesGlobalLoadingLock = generationProviderForRun === 'google';
    const isVideoMode = generationProviderForRun !== 'google' && falModelModeForRun === 'video';
    const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelIdForRun);
    const normalizedFalImageSizeSelectionForRun = isSeedreamV5LiteModelId(falModelIdForRun) && falImageSizeSelectionForRun === 'default'
      ? 'auto_2K'
      : falImageSizeSelectionForRun; // Seedream 5 Lite defaults to auto_2K instead of source-matching.
    const isNanoBananaModel = !isVideoMode && isNanoBananaEditModelId(falModelIdForRun);
    const isGrokImagineModel = !isVideoMode && falModelIdForRun === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image.
    const grokAspectRatioForRun = (isGrokImagineModel && falAspectRatioSelectionForRun === 'default')
      ? '1:1'
      : falAspectRatioSelectionForRun; // Grok falls back to 1:1.
    const isFlux2MaxModelForRun = !isVideoMode && falModelIdForRun === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
    const isWan27ImageModelForRun = !isVideoMode && falModelIdForRun === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
    const isRecraftV4ProModelForRun = usingFal && !isVideoMode && isRecraftV4ProModel(falModelIdForRun);
    const isCrystalUpscaleModel = !isVideoMode && falModelIdForRun === CRYSTAL_UPSCALER_MODEL_ID;
    const isSeedvrUpscaleModel = !isVideoMode && falModelIdForRun === 'fal-ai/seedvr/upscale/image';
    const isUpscaleModel = isCrystalUpscaleModel || isSeedvrUpscaleModel;
    const isHailuoVideoModel = isVideoMode && falVideoModelIdForRun === HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
    const isHailuoStandardVideoModel = isHailuoVideoModel && hailuoVariantForRun === 'standard';
    const actualHailuoModelId = isHailuoVideoModel ? getHailuoActualModelId(hailuoVariantForRun) : null;
    const isKlingVideoModel = isVideoMode && falVideoModelIdForRun === KLING_VIDEO_MODEL_ID;
    const isKlingV3VideoModel = isVideoMode && falVideoModelIdForRun === KLING_V3_VIDEO_MODEL_ID;
    const isKlingO1VideoModel = isVideoMode && isKlingO1VideoModelId(falVideoModelIdForRun);
    const isKlingO1EditMode = isKlingO1VideoModel && klingO1VariantForRun === 'edit';
    const isKlingO1RefV2VMode = isKlingO1VideoModel && klingO1VariantForRun === 'refV2V';
    const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode;
    const isKlingV3ControlVideoModel = isVideoMode && falVideoModelIdForRun === KLING_V3_CONTROL_VIDEO_MODEL_ID;
    const isWanVisionEnhancerVideoModel = isVideoMode && falVideoModelIdForRun === WAN_VISION_ENHANCER_MODEL_ID;
    const isWanAnimateVideoModel = isVideoMode && falVideoModelIdForRun === WAN_ANIMATE_MODEL_ID;
    const isOneToAllAnimateVideoModel = isVideoMode && falVideoModelIdForRun === ONE_TO_ALL_ANIMATE_MODEL_ID;
    const isScailVideoModel = isVideoMode && falVideoModelIdForRun === SCAIL_VIDEO_MODEL_ID;
    const isLipsyncVideoModel = isVideoMode && falVideoModelIdForRun === SYNC_LIPSYNC_MODEL_ID;
    const isHeygenV3LipsyncVideoModel = isVideoMode && falVideoModelIdForRun === HEYGEN_V3_LIPSYNC_MODEL_ID;
    const isInfinitalkVideoModel = isVideoMode && falVideoModelIdForRun === INFINITALK_VIDEO_MODEL_ID;
    const isGrokImagineVideoModel = isVideoMode && falVideoModelIdForRun === GROK_IMAGINE_VIDEO_MODEL_ID;
    const isGrokImagineVideoEditMode = isGrokImagineVideoModel && primaryImageForRun?.mediaType === 'video';
    const isVeo31VideoModelForRun = isVideoMode && falVideoModelIdForRun === VEO_31_IMAGE_TO_VIDEO_MODEL_ID;
    const isWan27VideoModelForRun = isVideoMode && falVideoModelIdForRun === WAN_27_VIDEO_MODEL_ID;
    const isWan27ReferenceModeForRun = isWan27VideoModelForRun && wan27VideoVariantForRun === 'reference';
    const isWan27EditModeForRun = isWan27VideoModelForRun && wan27VideoVariantForRun === 'edit';
    const isWanVideoInputMode = isWanVisionEnhancerVideoModel || isWanAnimateVideoModel;
    const isVeo31ExtendMode = isVeo31VideoModelForRun && veo31VariantForRun === 'extend';
    const isFalVideoInputMode = isWanVideoInputMode
      || isOneToAllAnimateVideoModel
      || isLipsyncVideoModel
      || isHeygenV3LipsyncVideoModel
      || isInfinitalkVideoModel
      || isKlingV3ControlVideoModel
      || isVeo31ExtendMode
      || isScailVideoModel
      || isWan27EditModeForRun;
    const actualKlingModelId = isKlingVideoModel ? getKlingActualModelId(klingVariantForRun) : null;
    const actualKlingO1ModelId = isKlingO1VideoModel ? getKlingO1VideoEndpoint(klingO1VariantForRun) : null;
    const actualKlingV3ControlModelId = isKlingV3ControlVideoModel ? KLING_V3_CONTROL_VIDEO_MODEL_ID : null;
    const actualWanAnimateModelId = isWanAnimateVideoModel ? getWanAnimateVideoEndpoint(wanAnimateVariantForRun) : null;
    const isKlingO1FflfMode = isKlingO1VideoModel && klingO1VariantForRun === 'fflf';
    const isVeo31TailCapable = isVeo31VideoModelForRun && veo31VariantForRun === 'i2v-fflf';
    const isFalSeedance2VideoModelForRun = isVideoMode && falVideoModelIdForRun === FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    const isAnySeedance2VideoModelForRun = isVideoMode && (falVideoModelIdForRun === SEEDANCE_2_VIDEO_MODEL_ID || isFalSeedance2VideoModelForRun);
    const isSeedance2ReferenceModeForRun = isAnySeedance2VideoModelForRun && seedance2VariantForRun === 'reference';
    const wan27AudioIdForRun = isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun ? sourceAudioIdForRun : null; // Wan 2.7 Smart supports optional audio.
    const videoDurationForRun: FalVideoDuration | undefined = isHailuoVideoModel
      ? (hailuoVariantForRun === 'standard' ? falVideoDurationForRun : '6')
      : (isKlingVideoModel || isKlingO1VideoModel)
        ? (falVideoDurationForRun === '10' ? '10' : '5')
        : undefined;
    const normalizedVideoNegativePrompt =
      (isKlingVideoModel || isKlingV3VideoModel || isWanVisionEnhancerVideoModel || isOneToAllAnimateVideoModel || isVeo31VideoModelForRun || isWan27VideoModelForRun)
        ? videoNegativePromptForRun.trim()
        : '';
    const hasVideoNegativePrompt = normalizedVideoNegativePrompt.length > 0;
    const isTextToImage = overrideKind ? overrideKind === 'text_to_image' : !activePrimary || isRecraftV4ProModelForRun;
    const isWanPromptOptional = usingFal && isVideoMode && (isWanVisionEnhancerVideoModel || isWanAnimateVideoModel || (isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun && Boolean(activePrimary)));
    const isKlingV3ControlPromptOptional = usingFal && isVideoMode && isKlingV3ControlVideoModel; // Kling Control v3 prompt is optional.
    const isLipsyncPromptOptional = usingFal && isVideoMode && (isLipsyncVideoModel || isHeygenV3LipsyncVideoModel);
    const requiresPrompt = !(usingFal && (isUpscaleModel || isWanPromptOptional || isKlingV3ControlPromptOptional || isLipsyncPromptOptional));
    const requiresVideoSourceImage = usingFal && isVideoMode && !isKlingV3VideoModel && !isAnySeedance2VideoModelForRun && !isWan27VideoModelForRun && !isKlingO1VideoInputMode && !isFalVideoInputMode
      && !(isGrokImagineVideoModel && isGrokImagineVideoEditMode);
    const generationKind: GenerationKind = overrideKind
      ?? (isVideoMode ? 'video' : isTextToImage ? 'text_to_image' : isUpscaleModel ? 'upscale' : 'image_edit');

    if (requiresPrompt && !trimmedUserPrompt) {
      setError(isVideoMode
        ? 'Please describe the video you want to create.'
        : isTextToImage
          ? 'Please describe the image you want to create.'
          : 'Please write a prompt to describe your edit.');
      return;
    }

    if (usingFal && isKlingV3VideoModel && klingV3MultiPromptEnabledForRun && !klingV3MultiPromptForRun.trim()) {
      setError('Kling 3.0 Pro multi prompt requires a second prompt.');
      return;
    }

    if (usingFal && isVideoMode && isWan27ReferenceModeForRun && referenceImageIdsForRun.length + referenceVideoIdsForRun.length === 0) {
      setError('Wan 2.7 Reference requires at least one tagged reference image or video.');
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
    if (usingFal && isVideoMode && isKlingV3ControlVideoModel && !activePrimary) {
      setError('Select a character image to guide the motion.');
      return;
    }
    if (usingFal && isVideoMode && isScailVideoModel && !activePrimary) {
      setError('Select a still image to animate with Scail.');
      return;
    }

    const requiresAudioInput = isLipsyncVideoModel || isHeygenV3LipsyncVideoModel || isInfinitalkVideoModel;

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
      const baseModelLabel = getFalModelLabel(falModelIdForRun);
      const klingO1VariantLabel = klingO1VariantForRun === 'refI2V'
        ? 'RefI2V'
        : klingO1VariantForRun.toUpperCase();
      const veo31VariantLabel = veo31VariantForRun === 'extend' ? 'Extend' : 'i2v/FFLF';
      const jobModelLabel = isHailuoVideoModel
        ? `${baseModelLabel} ${hailuoVariantForRun === 'pro' ? 'Pro' : 'Standard'}`
        : isKlingVideoModel
          ? `${baseModelLabel} ${klingVariantForRun === 'pro' ? 'Pro' : 'Standard'}`
          : isKlingV3VideoModel
            ? `${baseModelLabel}${klingV3MultiPromptEnabledForRun ? ' Multi' : ' Smart'}`
          : isKlingO1VideoModel
            ? `${baseModelLabel} ${klingO1VariantLabel}`
            : isKlingV3ControlVideoModel
              ? baseModelLabel
              : isVeo31VideoModelForRun
                ? `${baseModelLabel} ${veo31VariantLabel}`
                : isWanAnimateVideoModel
                  ? `${baseModelLabel} ${wanAnimateVariantForRun === 'replace' ? 'Keep BG' : 'Replace BG'}`
                  : isWan27VideoModelForRun
                    ? `${baseModelLabel} ${wan27VideoVariantForRun === 'reference' ? 'Reference' : wan27VideoVariantForRun === 'edit' ? 'Edit' : 'Smart'}`
                  : isFalSeedance2VideoModelForRun
                    ? buildSeedance2ModelLabel(baseModelLabel, seedance2VariantForRun)
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

      if (usingVolcengine) {
        const volcengineJobId = crypto.randomUUID();
        const jobModelLabel = buildSeedance2ModelLabel(baseModelLabel, seedance2VariantForRun);
        const primarySelection = primaryImageIdForRun ? images.find(img => img.id === primaryImageIdForRun) ?? null : null;
        const isSeedance2ReferenceMode = seedance2VariantForRun === 'reference';
        const referenceAssetCount = referenceImageIdsForRun.length + referenceVideoIdsForRun.length + referenceAudioIdsForRun.length;
        const seedancePromptForRun = isSeedance2ReferenceMode
          ? normalizeSeedanceReferencePromptMentions(trimmedPrompt)
          : trimmedPrompt;

        if (!isSeedance2ReferenceMode && primarySelection && primarySelection.mediaType !== 'image') {
          setError('Seedance 2 Smart uses a still image as the first frame. Select an image or clear the selection.');
          return;
        }
        if (!isSeedance2ReferenceMode && videoLastFrameImageIdForRun && !activePrimary) {
          setError('Seedance 2 first/last-frame mode requires a starting still image.');
          return;
        }
        if (isSeedance2ReferenceMode && referenceAssetCount === 0) {
          setError('Seedance 2 Reference requires at least one tagged reference asset.');
          return;
        }
        if (isSeedance2ReferenceMode) {
          const promptMentionError = getSeedanceReferencePromptMentionError(seedancePromptForRun, {
            imageCount: referenceImageIdsForRun.length,
            videoCount: referenceVideoIdsForRun.length,
            audioCount: referenceAudioIdsForRun.length,
          });
          if (promptMentionError) {
            setError(promptMentionError);
            return;
          }
        }
        if (
          referenceImageIdsForRun.length > SEEDANCE_REFERENCE_IMAGE_LIMIT
          || referenceVideoIdsForRun.length > SEEDANCE_REFERENCE_VIDEO_LIMIT
          || referenceAudioIdsForRun.length > SEEDANCE_REFERENCE_AUDIO_LIMIT
        ) {
          setError(`Seedance 2 Reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips.`);
          return;
        }

        const tailFrame = videoLastFrameImageIdForRun
          ? images.find(img => img.id === videoLastFrameImageIdForRun) ?? null
          : null;
        if (tailFrame && !isImageCanvasMedia(tailFrame)) {
          setError('Select a still image on the canvas to use as the ending frame.');
          return;
        }

        const referenceImageCanvasItems = referenceImageIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia);
        if (referenceImageCanvasItems.length !== referenceImageIdsForRun.length) {
          setError('Seedance 2 image references must be still images.');
          return;
        }

        const referenceVideoCanvasItems = referenceVideoIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'video'));
        if (referenceVideoCanvasItems.length !== referenceVideoIdsForRun.length) {
          setError('Seedance 2 video references must be videos on the canvas.');
          return;
        }
        const referenceVideoDurations = referenceVideoCanvasItems.map(getCanvasMediaDurationSeconds); // Seedance validates reference video duration per clip and in total.
        if (referenceVideoDurations.some(durationSeconds => durationSeconds === null || durationSeconds < SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS || durationSeconds > SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS)) {
          setError(`Seedance 2 reference videos must each be between ${SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS} and ${SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS} seconds.`);
          return;
        }
        const totalReferenceVideoDurationSeconds = referenceVideoDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
        if (totalReferenceVideoDurationSeconds > SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS) {
          setError(`Seedance 2 reference videos must total ${SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS} seconds or less.`);
          return;
        }

        const referenceAudioCanvasItems = referenceAudioIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'audio'));
        if (referenceAudioCanvasItems.length !== referenceAudioIdsForRun.length) {
          setError('Seedance 2 audio references must be audio clips on the canvas.');
          return;
        }
        const referenceAudioDurations = referenceAudioCanvasItems.map(getCanvasMediaDurationSeconds); // Seedance validates reference audio duration per clip and in total.
        if (referenceAudioDurations.some(durationSeconds => durationSeconds === null || durationSeconds < SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS || durationSeconds > SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS)) {
          setError(`Seedance 2 reference audio clips must each be between ${SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS} and ${SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS} seconds.`);
          return;
        }
        const totalReferenceAudioDurationSeconds = referenceAudioDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
        if (totalReferenceAudioDurationSeconds > SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS) {
          setError(`Seedance 2 reference audio clips must total ${SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS} seconds or less.`);
          return;
        }

        const seedanceRequestKey = buildSeedance2RequestKey({
          provider: generationProviderForRun,
          modelId: falModelIdForRun,
          prompt: seedancePromptForRun,
          variant: seedance2VariantForRun,
          aspectRatio: seedance2AspectRatioForRun,
          resolution: seedance2ResolutionForRun,
          duration: seedance2DurationForRun,
          generateAudio: seedance2GenerateAudioForRun,
          cameraFixed: seedance2CameraFixedForRun,
          primaryImageId: primaryImageIdForRun,
          videoLastFrameImageId: videoLastFrameImageIdForRun,
          referenceImageIds: referenceImageIdsForRun,
          referenceVideoIds: referenceVideoIdsForRun,
          referenceAudioIds: referenceAudioIdsForRun,
          images,
        });

        if (!confirmRepeatedSeedanceRequest(seedanceRequestKey)) {
          return;
        }

        let jobQueued = false;
        const enqueueVolcengineJob = () => {
          if (jobQueued) {
            return;
          }
          const newJob: FalQueueJob = {
            id: volcengineJobId,
            prompt: seedancePromptForRun,
            modelId: falModelIdForRun,
            modelLabel: jobModelLabel,
            provider: 'volcengine',
            status: 'IN_QUEUE',
            logs: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setFalJobs(prev => [...prev.slice(-9), newJob]);
          addDebugLog({
            direction: 'outbound',
            source: 'volcengine',
            title: jobModelLabel,
            message: 'Preparing request',
            data: { jobId: volcengineJobId, kind: 'video', variant: seedance2VariantForRun },
          });
          jobQueued = true;
        };

        try {
          const firstFrameImageFile = activePrimary
            ? await buildStillImageFile(activePrimary, `seedance2-first-frame-${Date.now()}`)
            : undefined;
          const tailFrameImage = tailFrame && isImageCanvasMedia(tailFrame) ? tailFrame : null;
          const lastFrameImageFile = tailFrameImage && seedance2VariantForRun === 'smart'
            ? await buildStillImageFile(tailFrameImage, `seedance2-last-frame-${Date.now()}`)
            : undefined;
          enqueueVolcengineJob();
          setError(null);

          const referenceImageFiles = await Promise.all(
            referenceImageCanvasItems.map((img, index) => buildStillImageFile(img, `seedance2-reference-image-${index + 1}-${Date.now()}`)),
          );
          const referenceVideoFiles = referenceVideoCanvasItems.map((img, index) => (
            new File([img.file], img.file.name || `seedance2-reference-video-${index + 1}.mp4`, { type: img.file.type || 'video/mp4' })
          ));
          const referenceAudioFiles = await Promise.all(referenceAudioCanvasItems.map(async (img, index) => {
            if (img.file.type === 'audio/webm') {
              const wavBlob = await convertAudioBlobToWav(img.file);
              return new File([wavBlob], `seedance2-reference-audio-${index + 1}.wav`, { type: 'audio/wav' });
            }
            return new File([img.file], img.file.name || `seedance2-reference-audio-${index + 1}`, { type: img.file.type || 'audio/mpeg' });
          }));

          const videoResult = await generateSeedanceVideo(seedancePromptForRun, {
            modelId: 'doubao-seedance-2-0-260128',
            variant: seedance2VariantForRun,
            aspectRatio: seedance2AspectRatioForRun,
            duration: seedance2DurationForRun,
            resolution: seedance2ResolutionForRun,
            generateAudio: seedance2GenerateAudioForRun,
            cameraFixed: seedance2CameraFixedForRun,
            ...(firstFrameImageFile ? { primaryImageFile: firstFrameImageFile } : {}),
            ...(lastFrameImageFile ? { lastFrameImageFile } : {}),
            ...(referenceImageFiles.length ? { referenceImageFiles } : {}),
            ...(referenceVideoFiles.length ? { referenceVideoFiles } : {}),
            ...(referenceAudioFiles.length ? { referenceAudioFiles } : {}),
            onQueueUpdate: (update: VolcengineQueueUpdate) => {
              setFalJobs(prev => prev.map(job => (
                job.id === volcengineJobId ? applyVolcengineQueueUpdateToJob(job, update) : job
              )));
            },
          });

          setFalJobs(prev => prev.map(job => (
            job.id === volcengineJobId
              ? {
                ...job,
                status: 'COMPLETED',
                requestId: videoResult.requestId || job.requestId,
                description: 'Video ready',
                outputUrl: videoResult.videoUrl,
                updatedAt: Date.now(),
              }
              : job
          )));

          try {
            const videoBlob = await fetchGeneratedVideoBlob(videoResult.videoUrl, 'Seedance 2 result');
            const fileType = videoBlob.type || 'video/mp4';
            const extension = fileType.split('/')[1]?.split(';')[0] || 'mp4';
            const videoFileName = `generated_seedance2_video.${extension}`;
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
              ?? referenceImageCanvasItems[0]
              ?? referenceVideoCanvasItems[0]
              ?? referenceAudioCanvasItems[0]
              ?? images[images.length - 1]
              ?? null;
            const placement = anchorForPlacement
              ? (() => {
                const anchorBounds = getImageBounds(anchorForPlacement);
                return findNonOverlappingPlacement(displayWidth, displayHeight, anchorBounds.maxX + 20, anchorBounds.minY);
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
            const hasAudio = hasDetectedAudio || seedance2GenerateAudioForRun;

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
                prompt: seedancePromptForRun,
                generation: {
                  kind: 'video',
                  prompt: seedancePromptForRun,
                  provider: 'volcengine',
                  modelId: falModelIdForRun,
                  modelLabel: jobModelLabel,
                  modelMode: falModelModeForRun,
                  url: videoResult.videoUrl,
                  ...(primaryImageIdForRun ? { primaryImageId: primaryImageIdForRun } : {}),
                  ...(referenceImageIdsForRun.length ? { referenceImageIds: referenceImageIdsForRun } : {}),
                  ...(referenceVideoIdsForRun.length ? { referenceVideoIds: referenceVideoIdsForRun } : {}),
                  ...(referenceAudioIdsForRun.length ? { referenceAudioIds: referenceAudioIdsForRun } : {}),
                  ...(activePrimary?.metadata?.generation?.originalSourceImageId
                    ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
                    : primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                  ...(lastFrameImageFile && videoLastFrameImageIdForRun ? { videoLastFrameImageId: videoLastFrameImageIdForRun } : {}),
                  volcengineOptions: {
                    seedance2Variant: seedance2VariantForRun,
                    seedance2AspectRatio: seedance2AspectRatioForRun,
                    seedance2Resolution: seedance2ResolutionForRun,
                    seedance2Duration: seedance2DurationForRun,
                    seedance2GenerateAudio: seedance2GenerateAudioForRun,
                    seedance2CameraFixed: seedance2CameraFixedForRun,
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
            setReferenceVideoIds([]);
            setReferenceAudioIds([]);
            setElementImageIds([]);
            setTool(Tool.FREE_SELECTION);

            setToastMessage('Video added to canvas');
            onGenerationComplete?.();
          } catch (loadErr) {
            console.error('Failed to load generated Seedance 2 video into canvas', loadErr);
            setToastMessage('Video ready! Open from the queue panel.');
          }
          setTimeout(() => setToastMessage(null), 2000);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'An unknown error occurred.';
          if (jobQueued) {
            setFalJobs(prev => prev.map(job => (
              job.id === volcengineJobId
                ? {
                  ...job,
                  status: 'FAILED',
                  error: message,
                  updatedAt: Date.now(),
                }
                : job
            )));
          }
          setError(message);
        }

        return;
      }

      const falJobId = crypto.randomUUID();

      let videoPromptForRequest = trimmedPrompt;
      let jobQueued = false;
      const enqueueJob = () => {
        if (jobQueued) {
          return;
        }
        // Spin up a Fal queue job so the UI can show progress even while the video generates server-side.
        const newJob: FalQueueJob = {
          id: falJobId,
          prompt: videoPromptForRequest,
          modelId: falModelIdForRun,
          modelLabel: jobModelLabel,
          provider: 'fal',
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
        if (isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun && primarySelection?.mediaType === 'video') {
          setError('Wan 2.7 uses a still image as the first frame. Select an image or clear the selection.');
          return;
        }
        if (isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun && videoLastFrameImageIdForRun && !activePrimary) {
          setError('Wan 2.7 first/last-frame mode requires a starting still image.');
          return;
        }
        if (isKlingV3VideoModel && primarySelection?.mediaType === 'video') {
          setError('Kling 3.0 Pro uses a still image as the first frame. Select an image or clear the selection.');
          return;
        }
        if (isKlingV3VideoModel && videoLastFrameImageIdForRun && !activePrimary) {
          setError('Kling 3.0 Pro first/last-frame mode requires a starting still image.');
          return;
        }

        let seedanceReferenceImageCanvasItems: Array<CanvasImage & { element: HTMLImageElement }> = [];
        let seedanceReferenceVideoCanvasItems: CanvasImage[] = [];
        let seedanceReferenceAudioCanvasItems: CanvasImage[] = [];
        let wan27ReferenceVideoCanvasItems: CanvasImage[] = [];

        if (isWan27ReferenceModeForRun) {
          const referenceAssetCount = referenceImageIdsForRun.length + referenceVideoIdsForRun.length;
          if (referenceAssetCount === 0) {
            setError('Wan 2.7 Reference requires at least one tagged reference image or video.');
            return;
          }
          if (referenceAudioIdsForRun.length > 0) {
            setError('Wan 2.7 Reference supports image and video references only.');
            return;
          }
          wan27ReferenceVideoCanvasItems = referenceVideoIdsForRun
            .map(id => images.find(img => img.id === id))
            .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'video'));
          if (wan27ReferenceVideoCanvasItems.length !== referenceVideoIdsForRun.length) {
            setError('Wan 2.7 video references must be videos on the canvas.');
            return;
          }
        }

        if (isFalSeedance2VideoModelForRun) {
          const referenceAssetCount = referenceImageIdsForRun.length + referenceVideoIdsForRun.length + referenceAudioIdsForRun.length;
          const seedancePromptForRun = isSeedance2ReferenceModeForRun
            ? normalizeSeedanceReferencePromptMentions(trimmedPrompt)
            : trimmedPrompt;
          videoPromptForRequest = seedancePromptForRun;

          if (!isSeedance2ReferenceModeForRun && primarySelection && primarySelection.mediaType !== 'image') {
            setError('Seedance 2 Smart uses a still image as the first frame. Select an image or clear the selection.');
            return;
          }
          if (!isSeedance2ReferenceModeForRun && videoLastFrameImageIdForRun && !activePrimary) {
            setError('Seedance 2 first/last-frame mode requires a starting still image.');
            return;
          }
          if (isSeedance2ReferenceModeForRun && referenceAssetCount === 0) {
            setError('Seedance 2 Reference requires at least one tagged reference asset.');
            return;
          }
          if (isSeedance2ReferenceModeForRun) {
            const promptMentionError = getSeedanceReferencePromptMentionError(seedancePromptForRun, {
              imageCount: referenceImageIdsForRun.length,
              videoCount: referenceVideoIdsForRun.length,
              audioCount: referenceAudioIdsForRun.length,
            });
            if (promptMentionError) {
              setError(promptMentionError);
              return;
            }
          }
          if (
            referenceImageIdsForRun.length > SEEDANCE_REFERENCE_IMAGE_LIMIT
            || referenceVideoIdsForRun.length > SEEDANCE_REFERENCE_VIDEO_LIMIT
            || referenceAudioIdsForRun.length > SEEDANCE_REFERENCE_AUDIO_LIMIT
          ) {
            setError(`Seedance 2 Reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio clips.`);
            return;
          }
          if (isSeedance2ReferenceModeForRun && referenceAssetCount > SEEDANCE_REFERENCE_TOTAL_FILE_LIMIT) {
            setError(`Seedance 2 (FAL) Reference supports up to ${SEEDANCE_REFERENCE_TOTAL_FILE_LIMIT} total reference files.`);
            return;
          }
          if (isSeedance2ReferenceModeForRun && referenceAudioIdsForRun.length > 0 && referenceImageIdsForRun.length + referenceVideoIdsForRun.length === 0) {
            setError('Seedance 2 (FAL) audio references require at least one image or video reference.');
            return;
          }

          seedanceReferenceImageCanvasItems = referenceImageIdsForRun
            .map(id => images.find(img => img.id === id))
            .filter(isImageCanvasMedia);
          if (seedanceReferenceImageCanvasItems.length !== referenceImageIdsForRun.length) {
            setError('Seedance 2 image references must be still images.');
            return;
          }

          seedanceReferenceVideoCanvasItems = referenceVideoIdsForRun
            .map(id => images.find(img => img.id === id))
            .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'video'));
          if (seedanceReferenceVideoCanvasItems.length !== referenceVideoIdsForRun.length) {
            setError('Seedance 2 video references must be videos on the canvas.');
            return;
          }
          const referenceVideoDurations = seedanceReferenceVideoCanvasItems.map(getCanvasMediaDurationSeconds); // Fal Seedance validates the same video duration limits locally.
          if (referenceVideoDurations.some(durationSeconds => durationSeconds === null || durationSeconds < SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS || durationSeconds > SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS)) {
            setError(`Seedance 2 reference videos must each be between ${SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS} and ${SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS} seconds.`);
            return;
          }
          const totalReferenceVideoDurationSeconds = referenceVideoDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
          if (totalReferenceVideoDurationSeconds > SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS) {
            setError(`Seedance 2 reference videos must total ${SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS} seconds or less.`);
            return;
          }

          seedanceReferenceAudioCanvasItems = referenceAudioIdsForRun
            .map(id => images.find(img => img.id === id))
            .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'audio'));
          if (seedanceReferenceAudioCanvasItems.length !== referenceAudioIdsForRun.length) {
            setError('Seedance 2 audio references must be audio clips on the canvas.');
            return;
          }
          const referenceAudioDurations = seedanceReferenceAudioCanvasItems.map(getCanvasMediaDurationSeconds); // Fal Seedance validates the same audio duration limits locally.
          if (referenceAudioDurations.some(durationSeconds => durationSeconds === null || durationSeconds < SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS || durationSeconds > SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS)) {
            setError(`Seedance 2 reference audio clips must each be between ${SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS} and ${SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS} seconds.`);
            return;
          }
          const totalReferenceAudioDurationSeconds = referenceAudioDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
          if (totalReferenceAudioDurationSeconds > SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS) {
            setError(`Seedance 2 reference audio clips must total ${SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS} seconds or less.`);
            return;
          }

          const seedanceRequestKey = buildSeedance2RequestKey({
            provider: generationProviderForRun,
            modelId: falModelIdForRun,
            prompt: seedancePromptForRun,
            variant: seedance2VariantForRun,
            aspectRatio: seedance2AspectRatioForRun,
            resolution: seedance2ResolutionForRun,
            duration: seedance2DurationForRun,
            generateAudio: seedance2GenerateAudioForRun,
            cameraFixed: false,
            primaryImageId: primaryImageIdForRun,
            videoLastFrameImageId: videoLastFrameImageIdForRun,
            referenceImageIds: referenceImageIdsForRun,
            referenceVideoIds: referenceVideoIdsForRun,
            referenceAudioIds: referenceAudioIdsForRun,
            images,
          });

          if (!confirmRepeatedSeedanceRequest(seedanceRequestKey)) {
            return;
          }
        }

        // For video-input modes (Kling O1 edit/refV2V, Grok edit-video, Wan modes), get source video URL; for other modes, require starting frame image
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
                  : isKlingV3ControlVideoModel
                    ? 'Select a motion driver video on the canvas.'
                    : isWan27EditModeForRun
                      ? 'Select a video on the canvas to edit.'
                      : isLipsyncVideoModel || isHeygenV3LipsyncVideoModel
                        ? 'Select a video on the canvas to lip sync.'
                        : isInfinitalkVideoModel
                          ? 'Select a video on the canvas to drive Infinitalk.'
                          : isGrokImagineVideoEditMode
                            ? 'Select a video on the canvas to edit.'
                            : (isKlingO1EditMode ? 'Select a video on the canvas to edit.' : 'Select a video on the canvas as reference.'));
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
        } else if (!activePrimary && !isKlingV3VideoModel && !isWan27VideoModelForRun && !(isFalSeedance2VideoModelForRun && (seedance2VariantForRun === 'smart' || isSeedance2ReferenceModeForRun))) {
          throw new Error('Unable to find the starting frame for this video.');
        }

        // Upload the source audio when the active video model needs or supports it.
        let sourceAudioUrlForRequest: string | undefined;
        const sourceAudioIdForUpload = requiresAudioInput ? sourceAudioIdForRun : wan27AudioIdForRun;
        if (sourceAudioIdForUpload) {
          const sourceAudio = images.find(img => img.id === sourceAudioIdForUpload && img.mediaType === 'audio');
          if (!sourceAudio) {
            throw new Error(isWan27VideoModelForRun
              ? 'Select an audio clip on the canvas for Wan 2.7.'
              : isInfinitalkVideoModel
                ? 'Select an audio clip on the canvas for Infinitalk.'
                : 'Select an audio clip on the canvas for lip sync.');
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

        let heygenStartTimeForRequest = heygenStartTimeOverride;
        let heygenEndTimeForRequest = heygenEndTimeOverride;
        if (isHeygenV3LipsyncVideoModel && trimmedUserPrompt && heygenStartTimeForRequest === undefined && heygenEndTimeForRequest === undefined) {
          const videoDurationSeconds = (sourceVideo?.element as HTMLVideoElement | undefined)?.duration;
          setToastMessage('Reading HeyGen timing intent...');
          try {
            const clipIntent = await extractHeygenClipIntent(trimmedUserPrompt, {
              videoDurationSeconds: typeof videoDurationSeconds === 'number' && Number.isFinite(videoDurationSeconds)
                ? videoDurationSeconds
                : undefined,
            });
            heygenStartTimeForRequest = clipIntent.startTime;
            heygenEndTimeForRequest = clipIntent.endTime;
          } finally {
            setToastMessage(null);
          }
        }

        const videoSourceImage = (isFalSeedance2VideoModelForRun && (!activePrimary || isSeedance2ReferenceModeForRun)) || isWan27ReferenceModeForRun
          ? null
          : (isWanAnimateVideoModel || isOneToAllAnimateVideoModel || isKlingV3ControlVideoModel || isScailVideoModel)
            ? activePrimary?.element as HTMLImageElement
            : (isKlingO1VideoInputMode || isFalVideoInputMode || isGrokImagineVideoEditMode) ? null : (activePrimary?.element as HTMLImageElement | undefined) ?? null;
        const referenceImagesForRun = referenceImageIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia)
          .map(img => img.element as HTMLImageElement);
        const seedanceReferenceVideoFilesForRun = isSeedance2ReferenceModeForRun
          ? seedanceReferenceVideoCanvasItems.map((img, index) => (
            new File([img.file], img.file.name || `seedance2-fal-reference-video-${index + 1}.mp4`, { type: img.file.type || 'video/mp4' })
          ))
          : [];
        const wan27ReferenceVideoFilesForRun = isWan27ReferenceModeForRun
          ? wan27ReferenceVideoCanvasItems.map((img, index) => (
            new File([img.file], img.file.name || `wan27-reference-video-${index + 1}.mp4`, { type: img.file.type || 'video/mp4' })
          ))
          : [];
        const seedanceReferenceAudioFilesForRun = isSeedance2ReferenceModeForRun
          ? await Promise.all(seedanceReferenceAudioCanvasItems.map(async (img, index) => {
            if (img.file.type === 'audio/webm') {
              const wavBlob = await convertAudioBlobToWav(img.file);
              return new File([wavBlob], `seedance2-fal-reference-audio-${index + 1}.wav`, { type: 'audio/wav' });
            }
            return new File([img.file], img.file.name || `seedance2-fal-reference-audio-${index + 1}`, { type: img.file.type || 'audio/mpeg' });
          }))
          : [];
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
        if (isWan27ReferenceModeForRun && referenceImagesForRun.length !== referenceImageIdsForRun.length) {
          setError('Wan 2.7 image references must be still images.');
          return;
        }
        if (isWan27EditModeForRun) {
          if (referenceImagesForRun.length !== referenceImageIdsForRun.length) {
            setError('Wan 2.7 Edit reference must be a still image.');
            return;
          }
          if (referenceImagesForRun.length > 1) {
            setError('Wan 2.7 Edit supports one reference image.');
            return;
          }
          if (referenceVideoIdsForRun.length > 0 || referenceAudioIdsForRun.length > 0) {
            setError('Wan 2.7 Edit supports one still reference image.');
            return;
          }
        }
        let videoTailImageElement: HTMLImageElement | null = null;
        const supportsTailFrame = (isKlingVideoModel && klingVariantForRun === 'pro') || isKlingV3VideoModel || isKlingO1FflfMode || isVeo31TailCapable || (isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun) || isSeedance15VideoModel || (isFalSeedance2VideoModelForRun && seedance2VariantForRun === 'smart'); // Allow end-frame input for tail-capable variants.
        if (supportsTailFrame && videoLastFrameImageIdForRun) {
          const tailFrame = images.find(img => img.id === videoLastFrameImageIdForRun);
          if (!isImageCanvasMedia(tailFrame)) {
            setError('Select a still image on the canvas to use as the ending frame.');
            return;
          }
          videoTailImageElement = tailFrame.element as HTMLImageElement;
        }
        const videoLastFrameIdForMetadata = videoTailImageElement ? videoLastFrameImageIdForRun : null;
        const sourceAudioIdForMetadata = requiresAudioInput && sourceAudioIdForRun ? sourceAudioIdForRun : wan27AudioIdForRun; // Persist optional Wan audio too.

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
          ?? actualKlingV3ControlModelId
          ?? actualWanAnimateModelId
          ?? actualVeo31ModelId
          ?? actualGrokImagineVideoModelId
          ?? falVideoModelIdForRun;
        const shouldSendDuration = isHailuoVideoModel
          ? isHailuoStandardVideoModel
          : (isKlingVideoModel || (isKlingO1VideoModel && !isKlingO1EditMode));
        const durationForRequest = shouldSendDuration ? videoDurationForRun : undefined;
        const oneToAllNegativePromptForRequest = isOneToAllAnimateVideoModel ? videoNegativePromptForRun.trim() : undefined;
        const negativePromptForRequest =
          (isKlingVideoModel || isKlingV3VideoModel || isWanVisionEnhancerVideoModel || isVeo31VideoModelForRun || isWan27VideoModelForRun) && hasVideoNegativePrompt
            ? normalizedVideoNegativePrompt
            : undefined;
        const keepOriginalSoundForRequest = isKlingV3ControlVideoModel ? klingV3ControlKeepSoundForRun : undefined;
        const characterOrientationForRequest = isKlingV3ControlVideoModel ? klingV3ControlOrientationForRun : undefined;
        const videoResult = await generateFalImageToVideo(videoPromptForRequest, videoSourceImage, {
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
          ...(isKlingV3ControlVideoModel ? {
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
          ...(isKlingV3VideoModel ? {
            klingV3Duration: klingV3DurationForRun,
            klingV3GenerateAudio: klingV3GenerateAudioForRun,
            klingV3CfgScale: klingV3CfgScaleForRun,
            klingV3MultiPromptEnabled: klingV3MultiPromptEnabledForRun,
            klingV3MultiPrompt: klingV3MultiPromptForRun,
            klingV3Shot1Duration: klingV3Shot1DurationForRun,
            klingV3Shot2Duration: klingV3Shot2DurationForRun,
          } : {}),
          ...(isLipsyncVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            sourceAudioUrl: sourceAudioUrlForRequest,
            lipsyncSyncMode: lipsyncSyncModeForRun,
          } : {}),
          ...(isHeygenV3LipsyncVideoModel ? {
            sourceVideoUrl: sourceVideoUrlForRequest,
            sourceAudioUrl: sourceAudioUrlForRequest,
            heygenEnableCaption: heygenEnableCaptionForRun,
            heygenEnableDynamicDuration: heygenEnableDynamicDurationForRun,
            heygenDisableMusicTrack: heygenDisableMusicTrackForRun,
            heygenEnableSpeechEnhancement: heygenEnableSpeechEnhancementForRun,
            ...(heygenStartTimeForRequest !== undefined ? { heygenStartTime: heygenStartTimeForRequest } : {}),
            ...(heygenEndTimeForRequest !== undefined ? { heygenEndTime: heygenEndTimeForRequest } : {}),
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
          ...(isVeo31VideoModelForRun ? {
            veo31Duration: veo31DurationForRun,
            veo31Resolution: veo31ResolutionForRun,
            veo31AspectRatio: veo31AspectRatioForRun,
            veo31GenerateAudio: veo31GenerateAudioForRun,
          } : {}),
          ...(isWan27VideoModelForRun ? {
            wan27VideoResolution: wan27VideoResolutionForRun,
            wan27VideoDuration: wan27VideoDurationForRun,
            wan27VideoAspectRatio: wan27VideoAspectRatioForRun,
            wan27VideoPromptExpansion: wan27VideoPromptExpansionForRun,
            wan27VideoVariant: wan27VideoVariantForRun,
            wan27VideoAudioSetting: wan27VideoAudioSettingForRun,
            ...(isWan27EditModeForRun ? {
              sourceVideoUrl: sourceVideoUrlForRequest,
              referenceImages: referenceImagesForRun,
            } : {}),
            ...(isWan27ReferenceModeForRun ? {
              referenceImages: referenceImagesForRun,
              referenceVideos: wan27ReferenceVideoFilesForRun,
            } : {}),
            ...(wan27AudioIdForRun && sourceAudioUrlForRequest ? { sourceAudioUrl: sourceAudioUrlForRequest } : {}),
          } : {}),
          ...(isSeedance15VideoModel ? {
            seedance15AspectRatio: seedance15AspectRatio,
            seedance15Resolution: seedance15Resolution,
            seedance15Duration: seedance15Duration,
            seedance15CameraFixed: seedance15CameraFixed,
            seedance15Audio: seedance15Audio,
            ...(videoTailImageElement ? { tailImage: videoTailImageElement } : {}),
          } : {}),
          ...(isFalSeedance2VideoModelForRun ? {
            seedance2Variant: seedance2VariantForRun,
            seedance2AspectRatio: seedance2AspectRatioForRun,
            seedance2Resolution: seedance2ResolutionForRun,
            seedance2Duration: seedance2DurationForRun,
            seedance2GenerateAudio: seedance2GenerateAudioForRun,
            ...(isSeedance2ReferenceModeForRun ? {
              referenceImages: referenceImagesForRun,
              referenceVideos: seedanceReferenceVideoFilesForRun,
              referenceAudios: seedanceReferenceAudioFilesForRun,
            } : {}),
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
          const videoBlob = await fetchGeneratedVideoBlob(videoResult.videoUrl, `${jobModelLabel} result`);
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
            ?? seedanceReferenceImageCanvasItems[0]
            ?? seedanceReferenceVideoCanvasItems[0]
            ?? seedanceReferenceAudioCanvasItems[0]
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
            || (isWan27VideoModelForRun && Boolean(sourceAudioUrlForRequest))
            || (isVeo31VideoModelForRun && veo31GenerateAudioForRun)
            || (isKlingV3VideoModel && klingV3GenerateAudioForRun)
            || (isFalSeedance2VideoModelForRun && seedance2GenerateAudioForRun);

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
              prompt: videoPromptForRequest,
              generation: {
                kind: 'video',
                prompt: videoPromptForRequest,
                provider: 'fal',
                modelId: falModelIdForRun,
                modelLabel: jobModelLabel,
                modelMode: falModelModeForRun,
                url: videoResult.videoUrl,
                primaryImageId: isWan27ReferenceModeForRun ? undefined : primaryImageIdForRun ?? undefined,
                ...(referenceImageIdsForRun.length ? { referenceImageIds: referenceImageIdsForRun } : {}),
                ...(referenceVideoIdsForRun.length ? { referenceVideoIds: referenceVideoIdsForRun } : {}),
                ...(referenceAudioIdsForRun.length ? { referenceAudioIds: referenceAudioIdsForRun } : {}),
                ...(elementImageIdsForRun.length ? { elementImageIds: elementImageIdsForRun } : {}),
                ...(activePrimary?.metadata?.generation?.originalSourceImageId
                  ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
                  : primaryImageIdForRun && !isWan27ReferenceModeForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                ...(videoLastFrameIdForMetadata ? { videoLastFrameImageId: videoLastFrameIdForMetadata } : {}),
                ...((isKlingO1VideoInputMode || isFalVideoInputMode) && sourceVideoIdForRun ? { sourceVideoId: sourceVideoIdForRun } : {}),
                ...(sourceAudioIdForMetadata ? { sourceAudioId: sourceAudioIdForMetadata } : {}),
                falOptions: {
                  ...(videoDurationForRun ? { videoDuration: videoDurationForRun } : {}),
                  ...(isHailuoVideoModel ? { hailuoVariant: hailuoVariantForRun } : {}),
                  ...(isKlingVideoModel ? { klingVariant: klingVariantForRun } : {}),
                  ...(isKlingV3VideoModel ? {
                    klingV3Duration: klingV3DurationForRun,
                    klingV3GenerateAudio: klingV3GenerateAudioForRun,
                    klingV3CfgScale: klingV3CfgScaleForRun,
                    klingV3MultiPromptEnabled: klingV3MultiPromptEnabledForRun,
                    klingV3MultiPrompt: klingV3MultiPromptForRun,
                    klingV3Shot1Duration: klingV3Shot1DurationForRun,
                    klingV3Shot2Duration: klingV3Shot2DurationForRun,
                  } : {}),
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
                    lipsyncSyncMode: lipsyncSyncModeForRun,
                  } : {}),
                  ...(isHeygenV3LipsyncVideoModel ? {
                    heygenEnableCaption: heygenEnableCaptionForRun,
                    heygenEnableDynamicDuration: heygenEnableDynamicDurationForRun,
                    heygenDisableMusicTrack: heygenDisableMusicTrackForRun,
                    heygenEnableSpeechEnhancement: heygenEnableSpeechEnhancementForRun,
                    ...(heygenStartTimeForRequest !== undefined ? { heygenStartTime: heygenStartTimeForRequest } : {}),
                    ...(heygenEndTimeForRequest !== undefined ? { heygenEndTime: heygenEndTimeForRequest } : {}),
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
                  ...(isVeo31VideoModelForRun ? {
                    veo31Variant: veo31VariantForRun,
                    veo31Duration: veo31DurationForRun,
                    veo31Resolution: veo31ResolutionForRun,
                    veo31AspectRatio: veo31AspectRatioForRun,
                    veo31GenerateAudio: veo31GenerateAudioForRun,
                  } : {}),
                  ...(isWan27VideoModelForRun ? {
                    wan27VideoResolution: wan27VideoResolutionForRun,
                    wan27VideoDuration: wan27VideoDurationForRun,
                    wan27VideoAspectRatio: wan27VideoAspectRatioForRun,
                    wan27VideoVariant: wan27VideoVariantForRun,
                    ...(isWan27EditModeForRun ? { wan27VideoAudioSetting: wan27VideoAudioSettingForRun } : {}),
                    ...(!isWan27ReferenceModeForRun && !isWan27EditModeForRun ? { wan27VideoPromptExpansion: wan27VideoPromptExpansionForRun } : {}),
                  } : {}),
                  ...(isSeedance15VideoModel ? {
                    seedance15AspectRatio: seedance15AspectRatio,
                    seedance15Resolution: seedance15Resolution,
                    seedance15Duration: seedance15Duration,
                    seedance15CameraFixed: seedance15CameraFixed,
                    seedance15Audio: seedance15Audio,
                  } : {}),
                  ...(isFalSeedance2VideoModelForRun ? {
                    seedance2Variant: seedance2VariantForRun,
                    seedance2AspectRatio: seedance2AspectRatioForRun,
                    seedance2Resolution: seedance2ResolutionForRun,
                    seedance2Duration: seedance2DurationForRun,
                    seedance2GenerateAudio: seedance2GenerateAudioForRun,
                  } : {}),
                  ...(isKlingV3ControlVideoModel ? {
                    klingV3ControlKeepSound: klingV3ControlKeepSoundForRun,
                    klingV3ControlOrientation: klingV3ControlOrientationForRun,
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
          setReferenceVideoIds([]);
          setReferenceAudioIds([]);
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
      && (isSeedreamModel || isNanoBananaModel || isGrokImagineModel); // Include Grok validation.
    const falNumImageMaxForRun = getFalNumImageMaxForModel(falModelIdForRun); // Read output cap from active model.
    const isNumImagesInvalid =
      !Number.isFinite(falNumImagesForRun) ||
      falNumImagesForRun < 1 ||
      falNumImagesForRun > falNumImageMaxForRun;
    const normalizedFalNumImages = Math.min(falNumImageMaxForRun, Math.max(1, Math.floor(Number.isFinite(falNumImagesForRun) ? falNumImagesForRun : 1)));
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
      setError(`Number of images must be between 1 and ${falNumImageMaxForRun}.`);
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
        provider: 'fal',
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
    } else if (usesGlobalLoadingLock) {
      setIsLoading(true);
    }

    setError(null);

    if (rawFalImageSizeSelection === 'placeholder' && !falOptionsOverride.imageSizeSelection) {
      setFalImageSizeSelection(isSeedreamV5LiteModelId(falModelIdForRun) ? 'auto_2K' : 'default');
    }
    if (rawFalAspectRatioSelection === 'placeholder' && !falOptionsOverride.aspectRatioSelection) {
      setFalAspectRatioSelection(isGrokImagineModel ? '1:1' : 'default'); // Grok uses 1:1 default.
    }

    let referenceIdsUsed: string[] = [];

    try {
      let generationResult: { imageBase64: string; imagesBase64: string[]; imageDataUrls?: string[]; text: string; requestId?: string };
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
            : isGrokImagineModel
              ? GROK_IMAGINE_IMAGE_MODEL_ID // Grok text-to-image endpoint.
              : isFlux2MaxModelForRun
                ? FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID
                : isWan27ImageModelForRun
                  ? WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID
                  : isRecraftV4ProModelForRun
                    ? RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID
                    : isNanoBananaModel
                      ? getNanoBananaTextToImageModelId(falModelIdForRun)
                      : NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;

          const falResult = await generateFalImage(trimmedPrompt, {
            onQueueUpdate: (update) => {
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }
                return applyFalQueueUpdateToJob(job, update);
              }));
            },
            modelId: textToImageModelId,
            aspectRatio: (isNanoBananaModel || isSeedreamModel || isGrokImagineModel)
              ? (isGrokImagineModel ? grokAspectRatioForRun : falAspectRatioSelectionForRun)
              : 'default', // Include Grok aspect ratios.
            ...(isNanoBananaModel ? { resolution: falResolutionSelectionForRun } : {}),
            ...(isSeedreamModel ? { imageSize: normalizedFalImageSizeSelectionForRun } : {}),
            ...(isFlux2MaxModelForRun ? { flux2MaxImageSize } : {}),
            ...(isWan27ImageModelForRun ? {
              wan27ImageSize: wan27ImageAspectRatio,
              wan27ImageMaxImages: wan27ImageMaxImages,
              negativePrompt: videoNegativePrompt.trim() || undefined,
            } : {}),
            ...(isRecraftV4ProModelForRun ? {
              recraftImageSize: recraftImageSizeForRun,
              recraftBackgroundColor: recraftBackgroundColorForRun,
              recraftColors: recraftColorsForRun,
            } : {}),
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
            const supportsEditReferenceImages = isNanoBananaModel || isSeedreamModel || isFlux2MaxModelForRun || isWan27ImageModelForRun;
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
              ...(normalizedFalImageSizeSelectionForRun ? { imageSize: normalizedFalImageSizeSelectionForRun } : {}),
              ...(falResolutionSelectionForRun ? { resolution: falResolutionSelectionForRun } : {}),
              ...(isWan27ImageModelForRun ? {
                wan27ImageSize: wan27ImageAspectRatio,
                wan27ImageMaxImages: wan27ImageMaxImages,
                negativePrompt: videoNegativePrompt.trim() || undefined,
              } : {}),
              numImages: normalizedFalNumImages,
              onQueueUpdate: (update) => {
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
      const generatedImageSources = generationResult.imageDataUrls?.length
        ? generationResult.imageDataUrls
        : generatedImages.map(base64 => `${PNG_DATA_URL_PREFIX}${base64}`); // Legacy providers still return raw PNG base64.
      // Hydrate generated outputs back into PNG canvas images with generation metadata.
      const addGeneratedImages = async () => {
        const newImages: CanvasImage[] = [];
        let lastBounds = images.length > 0 ? getImageBounds(images[images.length - 1]) : null;
        for (const source of generatedImageSources) {
          const { image: img, base64 } = await normalizeGeneratedImageToPng(source);

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
                provider: generationProviderForRun,
                modelId: falModelIdForRun,
                modelLabel: generationModelLabel,
                modelMode: falModelModeForRun,
                primaryImageId: primaryImageIdForRun ?? undefined,
                referenceImageIds: referenceIdsUsed.length > 0 ? referenceIdsUsed : undefined,
                ...(videoLastFrameImageIdForRun ? { videoLastFrameImageId: videoLastFrameImageIdForRun } : {}),
                ...(primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                falOptions: {
                  ...(falAspectRatioSelectionForRun ? { aspectRatioSelection: falAspectRatioSelectionForRun } : {}),
                  ...(normalizedFalImageSizeSelectionForRun ? { imageSizeSelection: normalizedFalImageSizeSelectionForRun } : {}),
                  ...(falResolutionSelectionForRun ? { resolutionSelection: falResolutionSelectionForRun } : {}),
                  ...(generationKind === 'upscale' ? { scaleFactor: falScaleFactorForRun } : {}),
                  ...(isSeedvrUpscaleModel ? { noiseScale: falNoiseScaleForRun } : {}),
                  ...(isCrystalUpscaleModel ? { creativity: falCreativityForRun } : {}),
                  ...(isRecraftV4ProModelForRun ? {
                    recraftImageSize: recraftImageSizeForRun,
                    recraftBackgroundColor: recraftBackgroundColorForRun,
                    recraftColors: recraftColorsForRun,
                  } : {}),
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
      const userFacingMessage = usingFal
        ? buildFalDisplayError(message) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE
        : message;
      if (usingFal) {
        setFalJobs(prev => prev.map(job => {
          if (job.id === falJobId) {
            return { ...job, status: 'FAILED', error: userFacingMessage, updatedAt: Date.now() };
          }
          return job;
        }));
      } else if (usesGlobalLoadingLock) {
        setIsLoading(false);
      }
      setError(userFacingMessage);
    } finally {
      if (usesGlobalLoadingLock) {
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
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
    klingO1Variant,
    klingV3ControlKeepSound,
    klingV3ControlOrientation,
    videoNegativePrompt,
    wanTargetResolution,
    wanCreativity,
    lipsyncSyncMode,
    heygenEnableCaption,
    heygenEnableDynamicDuration,
    heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    infinitalkDuration,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan27VideoResolution,
    wan27VideoDuration,
    wan27VideoAspectRatio,
    wan27VideoPromptExpansion,
    wan27VideoVariant,
    wan27VideoAudioSetting,
    isWan27VideoModel,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    seedance2Variant,
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    isSeedance15VideoModel,
    wan27ImageAspectRatio,
    wan27ImageMaxImages,
    isWan27ImageModel,
    recraftImageSize,
    recraftBackgroundColor,
    recraftColors,
    images,
    paths,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds,
    elementImageIds,
    videoLastFrameImageId,
    selectedImageIds,
    primaryImageId,
    activePrimaryImage,
    sourceVideoId,
    sourceAudioId,
    setError,
    confirmRepeatedSeedanceRequest,
    setIsLoading,
    setFalJobs,
    setState,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setToastMessage,
    setTool,
    onGenerationComplete,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
  ]);

  return {
    handleGenerate,
  };
};
