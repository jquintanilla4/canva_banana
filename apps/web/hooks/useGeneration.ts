import { useCallback, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction, SyntheticEvent } from 'react';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok Imagine model id.
  GROK_IMAGINE_VIDEO_EDIT_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  isValidJimengMultiframeImageCount,
  JIMENG_MULTIFRAME_MAX_IMAGES,
  JIMENG_MULTIFRAME_MIN_IMAGES,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
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
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  getFalModelLabel,
  getFalNumImageMaxForModel,
  getGptImage2TextToImageModelId,
  getKlingActualModelId,
  getKlingO3VideoEndpoint,
  getNanoBananaTextToImageModelId,
  getWanAnimateVideoEndpoint,
  getMaxReferenceImages,
  isGenerationProvider,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isGptImage2EditModelId,
  isGptImage2QualitySelectionValue,
  isKrea2AspectRatioSelectionValue,
  isKrea2CreativitySelectionValue,
  isKrea2LargeModel,
  isKlingO3AspectRatioSelectionValue,
  isKlingO3DurationSelectionValue,
  isKlingO3VideoModelId,
  isKlingV3CfgScaleSelectionValue,
  isKlingV3DurationSelectionValue,
  isKlingV3ShotDurationSelectionValue,
  isLipsyncSyncMode,
  isLegacySora2ProVideoModelId,
  isNanoBananaEditModelId,
  isRemovedHailuoModelId,
  isRemovedOneToAllAnimateModelId,
  isRecraftV4ProModel,
  isRecraftV4ProImageSizeSelectionValue,
  normalizeRecraftRgbColor,
  isSeedance2AspectRatioSelectionValue,
  isSeedance2DurationSelectionValue,
  isSeedance2OutputFormatSelectionValue,
  isSeedance2VolcengineDurationSelectionValue,
  isJimengMultiframeDurationSelectionValue,
  isJimengMultiframeResolutionSelectionValue,
  isJimengSeedance2ModelVersion,
  isSeedance2ResolutionSelectionValue,
  isSeedance2Variant,
  isSeedance2VolcengineModel,
  getProviderSafeSeedance2Variant,
  getVolcengineSafeSeedance2Settings,
  isSeedance25AspectRatioSelectionValue,
  isSeedance25DurationSelectionValue,
  isSeedance25ResolutionSelectionValue,
  isSeedance25Variant,
  isSeedance15AspectRatioSelectionValue,
  isSeedance15DurationSelectionValue,
  isSeedance15ResolutionSelectionValue,
  isWan27ImageAspectRatioSelectionValue,
  isWan27ImageMaxImagesSelectionValue,
  isWan27VideoAspectRatioSelectionValue,
  isWan27VideoDurationSelectionValue,
  isWan27VideoResolutionSelectionValue,
  isWan27VideoVariant,
  isMiniMaxH3AspectRatioSelectionValue,
  isMiniMaxH3DurationSelectionValue,
  isMiniMaxH3Variant,
  isFlux3AspectRatio,
  isFlux3Duration,
  isFlux3Resolution,
  isFlux3Variant,
  normalizeJimengSeedance25AspectRatio,
  normalizeJimengSeedance25Duration,
  getSeedreamTextToImageModelId,
  isFalImageModelId,
  isFalModelMode,
  isFalVideoModelId,
  isFlux2MaxImageSizeSelectionValue,
  isSeedreamModelId,
  isSeedreamV5LiteModelId,
  isSeedreamV5ProModelId,
  normalizeKlingO3Variant as normalizeLegacyKlingO3Variant,
  normalizeFalModelId,
  type FalAspectRatioSelectionValue,
  type FalGptImage2QualitySelectionValue,
  type FalImageModelId,
  type FalImageSizeSelectionValue,
  type FalModelId,
  type FalModelMode,
  type FalResolutionSelectionValue,
  type FalVideoModelId,
  type KlingO3Variant,
  type KlingO3DurationSelectionValue,
  type KlingV3CfgScaleSelectionValue,
  type KlingV3DurationSelectionValue,
  type KlingV3ShotDurationSelectionValue,
  type KlingVariant,
  type Krea2AspectRatioSelectionValue,
  type Krea2CreativitySelectionValue,
  type WanAnimateQualitySelectionValue,
  type WanAnimateResolutionSelectionValue,
  type WanAnimateShiftSelectionValue,
  type WanAnimateStepsSelectionValue,
  type WanAnimateVariant,
  type WanCreativity,
  type Wan27VideoAudioSettingSelectionValue,
  type Wan27ImageAspectRatioSelectionValue,
  type Wan27ImageMaxImagesSelectionValue,
  type Wan27VideoAspectRatioSelectionValue,
  type Wan27VideoDurationSelectionValue,
  type Wan27VideoResolutionSelectionValue,
  type Wan27VideoVariant,
  type MiniMaxH3AspectRatioSelectionValue,
  type MiniMaxH3DurationSelectionValue,
  type MiniMaxH3Variant,
  type Seedance2DurationSelectionValue,
  type Seedance2VolcengineDurationSelectionValue,
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
  getFalErrorPhase,
  getFalErrorRequestId,
  type FalImageGenerationResult,
  type FalPhaseUpdate,
  type FalQueueUpdate,
} from '../services/falService';
import { addDebugLog } from '../services/debugLog';
import { buildFalDisplayError, FAL_PROVIDER_DOWN_MESSAGE } from '../services/falConstants';
import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasNote,
  GenerationFalOptions,
  GenerationInputs,
  GenerationKind,
  GenerationPlacedPayload,
  GenerationProviderId,
  Path,
  Point,
  FalVideoDuration,
  FalQueueJob,
  Seedance2Variant,
  Seedance2VolcengineModel,
} from '../types';
import { Tool } from '../types';
import { getImageBounds, isOverlapping } from '../utils/canvasGeometry';
import { getNaturalSize, getVideoFileExtension, isVideoFileType, loadMediaFromBlob, rasterizeImages } from '../services/mediaService';
import { ensureRealSnapshotFile } from '../services/snapshotService';
import { applyFalQueueUpdateToJob } from '../services/falQueueUtils';
import { convertAudioBlobToWav } from '../services/audioService';
import { generateSeedanceVideo, SEEDANCE2_VOLCENGINE_MODEL_IDS, type VolcengineQueueUpdate } from '../services/volcengineService';
import { generateJimengSeedanceVideo, type JimengQueueUpdate } from '../services/jimengService';
import { extractHeygenClipIntent } from '../services/moonshotIntentService';
import { buildSeedance2RequestKey } from '../utils/seedanceRequestKey';
import { normalizeKrea2StyleStrength } from '../utils/krea2StyleStrength';
import {
  buildEffectiveSeedanceReferenceIds,
  getSeedance2VolcengineReferenceLimits,
  SEEDANCE25_EDIT_VIDEO_MIN_DURATION_SECONDS,
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
  SEEDANCE25_REFERENCE_AUDIO_LIMIT,
  SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS,
  JIMENG_SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS,
  JIMENG_SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS,
  JIMENG_SEEDANCE25_REFERENCE_MEDIA_MIN_DURATION_SECONDS,
  JIMENG_SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS,
  SEEDANCE25_REFERENCE_IMAGE_LIMIT,
  SEEDANCE25_REFERENCE_IMAGE_MAX_BYTES,
  SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS,
  SEEDANCE25_REFERENCE_MEDIA_MIN_DURATION_SECONDS,
  SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT,
  SEEDANCE25_REFERENCE_VIDEO_LIMIT,
  SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS,
  getSeedance25AudioReferenceFileError,
  getSeedance25VideoReferenceFileError,
} from '../utils/seedance25References';
import { getCanvasMediaDurationSeconds, resolveCanvasMediaDurationSeconds, resolveOptionalCanvasMediaDurationSeconds } from '../utils/canvasMediaDuration';
import { readIsoBmffVideoFrameRate } from '../utils/isoBmffVideoFrameRate';
import {
  getSeedanceReferencePromptMentionError,
  normalizeSeedanceReferencePromptMentions,
} from '../utils/seedancePromptMentions';
import { hasValidJimengMultiframePrompt, parseJimengMultiframeTransitionPrompts } from '../utils/jimengMultiframe';
import {
  buildFlux3RunPlan,
  FLUX3_EXTEND_MAX_SECONDS,
  getFlux3ExtendVideoFileError,
  getFlux3ModePolicy,
} from '../utils/flux3';
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
  krea2StyleReferenceStrengths?: Record<string, number>;
  videoNegativePrompt: string;
  setError: (message: string | null) => void;
  setIsLoading: (value: boolean) => void;
  setFalJobs: Dispatch<SetStateAction<FalQueueJob[]>>;
  setState: (updater: (prevState: AppState) => AppState) => void;
  setToastMessage: (message: string | null) => void;
  setTool: (tool: Tool) => void;
  onGenerationComplete?: () => void;
  onGenerationPlaced?: (payload: GenerationPlacedPayload) => void;
};

type HandleGenerateOptions = {
  retryJobId?: string; // Existing queue row to replace during retry.
};

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const LEGACY_KLING_O1_EDIT_MODEL_ID = 'fal-ai/kling-video/o1/video-to-video/edit'; // Removed Kling O1 edit endpoint.
const LEGACY_KLING_O1_REF_V2V_MODEL_ID = 'fal-ai/kling-video/o1/video-to-video/reference'; // Removed Kling O1 ref-v2v endpoint.

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

type ReplayableImageEditTool = Tool.SELECTION | Tool.FREE_SELECTION | Tool.ANNOTATE;

const isReplayableImageEditTool = (value: unknown): value is ReplayableImageEditTool =>
  value === Tool.SELECTION || value === Tool.FREE_SELECTION || value === Tool.ANNOTATE; // Retry stores API-level edit tools only.

const getDefaultImageEditTool = (editAppMode: AppMode, value: Tool): Tool =>
  editAppMode === 'ANNOTATE'
    ? Tool.ANNOTATE
    : value; // Annotate mode always builds one annotation-mask request.

const clonePathsForRetry = (sourcePaths: Path[]): Path[] =>
  sourcePaths.map(path => ({ ...path, points: path.points.map(point => ({ ...point })) })); // Detach saved paths from live canvas edits.

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

type GeneratedMediaDebugContext = {
  source: string;
  modelLabel: string;
  jobId?: string;
  requestId?: string;
};

const logGeneratedVideoDownloaded = (
  context: GeneratedMediaDebugContext,
  videoBlob: Blob,
) => {
  addDebugLog({
    direction: 'inbound',
    source: context.source,
    title: context.modelLabel,
    message: 'Generated video downloaded for canvas.',
    data: {
      ...(context.jobId ? { jobId: context.jobId } : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
      byteSize: videoBlob.size,
      mimeType: videoBlob.type || 'video/mp4',
    },
  });
}; // Record the successful transfer after noisy provider polling has finished.

const logGeneratedMediaAppended = (
  context: GeneratedMediaDebugContext,
  mediaType: 'image' | 'video',
  mediaIds: string[],
) => {
  addDebugLog({
    direction: 'info',
    source: context.source,
    title: context.modelLabel,
    message: 'Generated media appended to canvas state.',
    data: {
      ...(context.jobId ? { jobId: context.jobId } : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
      mediaType,
      mediaIds,
      mediaCount: mediaIds.length,
    },
  });
}; // Correlate provider completion with the exact canvas item IDs.

const applyVolcengineQueueUpdateToJob = (
  job: FalQueueJob,
  update: VolcengineQueueUpdate | JimengQueueUpdate,
): FalQueueJob => ({
  ...job,
  providerJobId: 'providerJobId' in update ? update.providerJobId : job.providerJobId,
  status: update.status,
  requestId: update.requestId || job.requestId,
  logs: mergeQueueLogMessages(job.logs, update.logs),
  outputUrl: update.outputUrl || job.outputUrl,
  error: update.status === 'FAILED' ? update.error || job.error : job.error,
  updatedAt: Date.now(),
});

const applyFalPhaseUpdateToJob = (
  job: FalQueueJob,
  update: FalPhaseUpdate,
): FalQueueJob => {
  const now = Date.now();
  return {
    ...job,
    phase: update.phase,
    phaseMessage: update.message ?? job.phaseMessage,
    requestId: update.requestId || job.requestId,
    phaseStartedAt: job.phase === update.phase ? job.phaseStartedAt : now,
    lastPhaseDurationMs: update.durationMs ?? (job.phase !== update.phase && job.phaseStartedAt ? now - job.phaseStartedAt : job.lastPhaseDurationMs),
    updatedAt: now,
  };
}; // Apply service-level phase changes to the queue row.

const buildSeedance2ModelLabel = (baseLabel: string, variant: Seedance2Variant): string =>
  `${baseLabel} ${variant === 'reference' ? 'Reference' : variant === 'edit' ? 'Edit' : variant === 'extend' ? 'Extend' : 'Smart'}`; // Surface the active variant in the queue.

const VOLCENGINE_SEEDANCE2_MODEL_LABELS: Record<Seedance2VolcengineModel, string> = {
  standard: 'Seedance 2.0 (VE)',
  fast: 'Seedance 2.0 Fast (VE)',
  mini: 'Seedance 2.0 Mini (VE)',
  seedance25: 'Seedance 2.5 (VE)',
}; // Keep queue and generated-media metadata aligned with the selected Ark sub-model.

const buildJimengSeedance2ModelLabel = (baseLabel: string, variant: Seedance2Variant, modelVersion: string): string => {
  const channelLabel = modelVersion === 'seedance2.0_vip' ? 'VIP' : modelVersion === 'seedance2.0fast_vip' ? 'VIP Fast' : modelVersion === 'seedance2.0mini' ? 'Mini' : modelVersion === 'seedance2.0' ? 'Standard' : 'Standard Fast';
  return `${buildSeedance2ModelLabel(baseLabel, variant)} ${channelLabel}`;
}; // Surface the active Jimeng CLI channel in the queue.

const buildStillImageFile = async (
  image: CanvasImage & { element: HTMLImageElement },
  fileNameBase: string,
): Promise<File> => {
  if ((image.rotation ?? 0) === 0) {
    return ensureRealSnapshotFile(image.file);
  }
  const rasterized = await rasterizeImages([image]);
  return new File([rasterized.file], `${fileNameBase}.png`, { type: rasterized.file.type || 'image/png' }); // Rotated frames need a baked file.
};

const SEEDANCE_REPEAT_CONFIRM_INTERVAL = 5; // Ask before every sixth identical Seedance run.
const JIMENG_DEFAULT_SEEDANCE2_MODEL_VERSION = 'seedance2.0fast'; // Match backend/default CLI channel for restored legacy runs.
const JIMENG_AUDIO_ONLY_REFERENCE_HINT = 'Seedance 2 (JM CLI) needs an image or video reference too. Add one, then generate again.'; // Toast hint for Jimeng audio-only refs.

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
    krea2StyleReferenceStrengths = {},
    videoNegativePrompt,
    setError,
    setIsLoading,
    setFalJobs,
    setState,
    setToastMessage,
    setTool,
    onGenerationComplete,
    onGenerationPlaced,
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
    klingVariant,
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
    klingO3Variant,
    klingO3Duration,
    klingO3GenerateAudio,
    klingO3KeepAudio,
    klingV3ControlKeepSound,
    klingV3ControlOrientation,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
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
    miniMaxH3Variant,
    miniMaxH3AspectRatio,
    miniMaxH3Duration,
    flux3Variant,
    flux3AspectRatio,
    flux3Resolution,
    flux3Duration,
    flux3GenerateAudio,
    flux3KeyframeTimings,
    isMiniMaxH3VideoModel,
    isWan27VideoModel,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    seedance2Variant,
    seedance2JimengModelVersion,
    seedance2VolcengineModel,
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    seedance2OutputFormat,
    seedance25Variant,
    seedance25AspectRatio,
    seedance25Resolution,
    seedance25Duration,
    seedance25GenerateAudio,
    jimengMultiframeDuration,
    jimengMultiframeResolution,
    jimengSessionId,
    isSeedance15VideoModel,
    flux2MaxImageSize,
    isFlux2MaxModel,
    wan27ImageAspectRatio,
    wan27ImageMaxImages,
    isWan27ImageModel,
    recraftImageSize,
    recraftBackgroundColor,
    recraftColors,
    gptImage2Quality,
    krea2AspectRatio,
    krea2Creativity,
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
  } = selection;

  // Centralized generation orchestrator for both providers (Fal/Gemini) across text-to-image, edits, upscales, and video.
  const handleGenerate = useCallback(async (generationOverrideOrEvent?: GenerationInputs | SyntheticEvent, options: HandleGenerateOptions = {}) => {
    const generationOverride = generationOverrideOrEvent && 'kind' in generationOverrideOrEvent
      ? generationOverrideOrEvent
      : undefined;
    const retryJobId = options.retryJobId;
    const editAppModeForRun: AppMode = generationOverride?.editAppMode === 'CANVAS' || generationOverride?.editAppMode === 'ANNOTATE'
      ? generationOverride.editAppMode
      : appMode; // Saved retry data should keep the original edit mode.
    const editToolForRun = isReplayableImageEditTool(generationOverride?.editTool)
      ? generationOverride.editTool
      : getDefaultImageEditTool(editAppModeForRun, tool); // Saved retry data should keep the original edit intent.
    const editPathsForRun = Array.isArray(generationOverride?.editPaths)
      ? clonePathsForRetry(generationOverride.editPaths)
      : paths; // Saved retry data should keep the original edit strokes.
    const queueJob = (newJob: FalQueueJob) => {
      setFalJobs(prev => {
        if (!retryJobId) {
          return [...prev.slice(-9), newJob];
        }
        return prev.some(job => job.id === retryJobId)
          ? prev.map(job => job.id === retryJobId ? newJob : job)
          : [...prev.slice(-9), newJob]; // Fall back to append if the row was dismissed.
      });
    }; // Replace failed rows during retry, append for normal submissions.
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
    const rawOverrideModelId = generationOverride?.modelId;
    const isLegacySora2ProRun = isLegacySora2ProVideoModelId(rawOverrideModelId); // Migrated Sora reruns always use Kling Standard.
    const isUnsupportedRemovedHailuoRun = isRemovedHailuoModelId(rawOverrideModelId); // Saved Hailuo requests must not fall back to another paid model.
    const isUnsupportedRemovedOneToAllRun = isRemovedOneToAllAnimateModelId(rawOverrideModelId); // Retired 1-to-All reruns must not fall back to another paid model.
    const overrideModelId = normalizeFalModelId(rawOverrideModelId); // Accept legacy saved model ids.
    const falModelModeForRun = isFalModelMode(generationOverride?.modelMode) ? generationOverride.modelMode : falModelMode;
    const falImageModelIdForRun = isFalImageModelId(overrideModelId) ? overrideModelId : falImageModelId;
    const isJimengOverrideModelId = overrideModelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID
      || overrideModelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID
      || overrideModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
    const providerForcedVideoModelId = falModelModeForRun === 'video' && requestedProviderForRun !== 'google'
      ? requestedProviderForRun === 'jimeng'
        ? isJimengOverrideModelId ? null : JIMENG_SEEDANCE_2_VIDEO_MODEL_ID
        : requestedProviderForRun === 'volcengine' ? SEEDANCE_2_VIDEO_MODEL_ID : null
      : null; // Saved local-backend reruns may carry provider metadata without a model id.
    const falVideoModelIdForRun = providerForcedVideoModelId ?? (isFalVideoModelId(overrideModelId) ? overrideModelId : falVideoModelId);
    const falModelIdForRun: FalModelId = falModelModeForRun === 'video' ? falVideoModelIdForRun : falImageModelIdForRun;
    const falOptionsOverride = generationOverride?.falOptions ?? {};
    const rawFalImageSizeSelection = falOptionsOverride.imageSizeSelection ?? falImageSizeSelection;
    const rawFalAspectRatioSelection = falOptionsOverride.aspectRatioSelection ?? falAspectRatioSelection;
    const falImageSizeSelectionForRun = rawFalImageSizeSelection === 'placeholder' ? 'default' : rawFalImageSizeSelection;
    const falAspectRatioSelectionForRun = rawFalAspectRatioSelection === 'placeholder' ? 'default' : rawFalAspectRatioSelection;
    const falResolutionSelectionForRun = falOptionsOverride.resolutionSelection ?? falResolutionSelection;
    const flux2MaxImageSizeForRun = isFlux2MaxImageSizeSelectionValue(falOptionsOverride.flux2MaxImageSize)
      ? falOptionsOverride.flux2MaxImageSize
      : flux2MaxImageSize; // Retry data overrides the current Flux size picker.
    const falNumImagesForRun = falOptionsOverride.numImages ?? falNumImages;
    const falScaleFactorForRun = falOptionsOverride.scaleFactor ?? falScaleFactor;
    const falNoiseScaleForRun = falOptionsOverride.noiseScale ?? falNoiseScale;
    const falCreativityForRun = falOptionsOverride.creativity ?? falCreativity;
    const falVideoDurationForRun = falOptionsOverride.videoDuration ?? falVideoDuration;
    const klingVariantForRun: KlingVariant = isLegacySora2ProRun ? 'standard' : falOptionsOverride.klingVariant ?? klingVariant;
    const legacyKlingOptions = falOptionsOverride as {
      klingO1Variant?: unknown;
      klingO1KeepAudio?: unknown;
    }; // Read old saved Kling O1 options.
    const isUnsupportedLegacyKlingO1RefV2VRerun = rawOverrideModelId === LEGACY_KLING_O1_REF_V2V_MODEL_ID
      || legacyKlingOptions.klingO1Variant === 'refV2V'; // Removed model cannot be safely mapped to O3.
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
    const rawKlingModelImpliesEdit = rawOverrideModelId === KLING_O3_VIDEO_EDIT_MODEL_ID
      || rawOverrideModelId === LEGACY_KLING_O1_EDIT_MODEL_ID; // Endpoint-only reruns still need edit mode.
    const klingO3VariantForRun: KlingO3Variant = typeof falOptionsOverride.klingO3Variant === 'string'
      ? normalizeLegacyKlingO3Variant(falOptionsOverride.klingO3Variant)
      : rawKlingModelImpliesEdit
        ? 'edit'
        : normalizeLegacyKlingO3Variant(legacyKlingOptions.klingO1Variant ?? klingO3Variant);
    const klingO3DurationForRun: KlingO3DurationSelectionValue = isKlingO3DurationSelectionValue(falOptionsOverride.klingO3Duration)
      ? falOptionsOverride.klingO3Duration
      : klingO3Duration;
    const klingO3GenerateAudioForRun = typeof falOptionsOverride.klingO3GenerateAudio === 'boolean'
      ? falOptionsOverride.klingO3GenerateAudio
      : klingO3GenerateAudio;
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
    const wan27ImageAspectRatioForRun: Wan27ImageAspectRatioSelectionValue = isWan27ImageAspectRatioSelectionValue(falOptionsOverride.wan27ImageAspectRatio)
      ? falOptionsOverride.wan27ImageAspectRatio
      : wan27ImageAspectRatio; // Retry should keep the queued image size.
    const wan27ImageMaxImagesForRun: Wan27ImageMaxImagesSelectionValue = isWan27ImageMaxImagesSelectionValue(falOptionsOverride.wan27ImageMaxImages)
      ? falOptionsOverride.wan27ImageMaxImages
      : wan27ImageMaxImages; // Retry should keep the queued output count.
    const wan27VideoPromptExpansionForRun = typeof falOptionsOverride.wan27VideoPromptExpansion === 'boolean'
      ? falOptionsOverride.wan27VideoPromptExpansion
      : typeof legacyWanOptions.wan26PromptExpansion === 'boolean'
        ? legacyWanOptions.wan26PromptExpansion
        : wan27VideoPromptExpansion;
    const rawWan27ModelVariant: Wan27VideoVariant | null = rawOverrideModelId === WAN_27_EDIT_VIDEO_MODEL_ID
      ? 'edit'
      : rawOverrideModelId === WAN_27_REFERENCE_TO_VIDEO_MODEL_ID
        ? 'reference'
        : null; // Endpoint-only reruns still need the matching Wan 2.7 mode.
    const wan27VideoVariantForRun: Wan27VideoVariant = isWan27VideoVariant(falOptionsOverride.wan27VideoVariant)
      ? falOptionsOverride.wan27VideoVariant
      : rawWan27ModelVariant ?? (generationOverride ? 'smart' : wan27VideoVariant);
    const wan27VideoAudioSettingOverride = falOptionsOverride.wan27VideoAudioSetting; // Saved reruns can explicitly choose either audio mode.
    const wan27VideoAudioSettingForRun: Wan27VideoAudioSettingSelectionValue = wan27VideoAudioSettingOverride === 'auto' || wan27VideoAudioSettingOverride === 'origin'
      ? wan27VideoAudioSettingOverride
      : wan27VideoAudioSetting;
    const hasMiniMaxH3GenerationOverride = Boolean(generationOverride) && falVideoModelIdForRun === MINIMAX_H3_VIDEO_MODEL_ID; // Saved and embedded H3 runs must not inherit the global bar.
    const miniMaxH3VariantDefault: MiniMaxH3Variant = hasMiniMaxH3GenerationOverride ? 'reference' : miniMaxH3Variant; // Untouched H3 overrides match the embedded Reference default.
    const miniMaxH3VariantForRun: MiniMaxH3Variant = isMiniMaxH3Variant(falOptionsOverride.miniMaxH3Variant)
      ? falOptionsOverride.miniMaxH3Variant
      : miniMaxH3VariantDefault;
    const miniMaxH3AspectRatioDefault: MiniMaxH3AspectRatioSelectionValue = hasMiniMaxH3GenerationOverride
      ? miniMaxH3VariantForRun === 'reference' ? 'adaptive' : '16:9'
      : miniMaxH3AspectRatio; // Override defaults follow the selected H3 mode.
    const miniMaxH3AspectRatioForRun: MiniMaxH3AspectRatioSelectionValue = isMiniMaxH3AspectRatioSelectionValue(falOptionsOverride.miniMaxH3AspectRatio)
      ? falOptionsOverride.miniMaxH3AspectRatio
      : miniMaxH3AspectRatioDefault;
    const miniMaxH3DurationForRun: MiniMaxH3DurationSelectionValue = isMiniMaxH3DurationSelectionValue(falOptionsOverride.miniMaxH3Duration)
      ? falOptionsOverride.miniMaxH3Duration
      : hasMiniMaxH3GenerationOverride ? '5' : miniMaxH3Duration; // Embedded and saved overrides use the model default.
    const wanTargetResolutionForRun = falOptionsOverride.wanTargetResolution ?? wanTargetResolution;
    const wanCreativityForRun = falOptionsOverride.wanCreativity ?? wanCreativity;
    const wanAnimateVariantForRun = falOptionsOverride.wanAnimateVariant ?? wanAnimateVariant;
    const wanAnimateStepsForRun = falOptionsOverride.wanAnimateSteps ?? wanAnimateSteps;
    const wanAnimateResolutionForRun = falOptionsOverride.wanAnimateResolution ?? wanAnimateResolution;
    const wanAnimateShiftForRun = falOptionsOverride.wanAnimateShift ?? wanAnimateShift;
    const wanAnimateQualityForRun = falOptionsOverride.wanAnimateQuality ?? wanAnimateQuality;
    const wanAnimateUseTurboForRun = falOptionsOverride.wanAnimateUseTurbo ?? wanAnimateUseTurbo;
    const lipsyncSyncModeForRun = isLipsyncSyncMode(falOptionsOverride.lipsyncSyncMode)
      ? falOptionsOverride.lipsyncSyncMode
      : lipsyncSyncMode; // Reruns can override current UI.
    const heygenEnableCaptionForRun = falOptionsOverride.heygenEnableCaption ?? heygenEnableCaption;
    const heygenEnableDynamicDurationForRun = falOptionsOverride.heygenEnableDynamicDuration ?? heygenEnableDynamicDuration;
    const heygenDisableMusicTrackForRun = falOptionsOverride.heygenDisableMusicTrack ?? heygenDisableMusicTrack;
    const heygenEnableSpeechEnhancementForRun = falOptionsOverride.heygenEnableSpeechEnhancement ?? heygenEnableSpeechEnhancement;
    const heygenTimingResolvedOverride = falOptionsOverride.heygenTimingResolved === true;
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
    const flux3VariantForRun = isFlux3Variant(falOptionsOverride.flux3Variant) ? falOptionsOverride.flux3Variant : flux3Variant;
    const flux3ModePolicyForRun = getFlux3ModePolicy(flux3VariantForRun);
    const flux3AspectRatioForRun = isFlux3AspectRatio(falOptionsOverride.flux3AspectRatio) ? falOptionsOverride.flux3AspectRatio : flux3AspectRatio;
    const flux3ResolutionForRun = isFlux3Resolution(falOptionsOverride.flux3Resolution) ? falOptionsOverride.flux3Resolution : flux3Resolution;
    const flux3DurationForRun = isFlux3Duration(falOptionsOverride.flux3Duration) ? falOptionsOverride.flux3Duration : flux3Duration;
    const flux3GenerateAudioForRun = typeof falOptionsOverride.flux3GenerateAudio === 'boolean' ? falOptionsOverride.flux3GenerateAudio : flux3GenerateAudio;
    const flux3KeyframeTimingsForRun = Array.isArray(falOptionsOverride.flux3KeyframeTimings) ? falOptionsOverride.flux3KeyframeTimings : flux3KeyframeTimings;
    const seedance15AspectRatioForRun = isSeedance15AspectRatioSelectionValue(falOptionsOverride.seedance15AspectRatio)
      ? falOptionsOverride.seedance15AspectRatio
      : seedance15AspectRatio;
    const seedance15ResolutionForRun = isSeedance15ResolutionSelectionValue(falOptionsOverride.seedance15Resolution)
      ? falOptionsOverride.seedance15Resolution
      : seedance15Resolution;
    const seedance15DurationForRun = isSeedance15DurationSelectionValue(falOptionsOverride.seedance15Duration)
      ? falOptionsOverride.seedance15Duration
      : seedance15Duration;
    const seedance15CameraFixedForRun = typeof falOptionsOverride.seedance15CameraFixed === 'boolean'
      ? falOptionsOverride.seedance15CameraFixed
      : seedance15CameraFixed;
    const seedance15AudioForRun = typeof falOptionsOverride.seedance15Audio === 'boolean'
      ? falOptionsOverride.seedance15Audio
      : seedance15Audio;
    const recraftImageSizeForRun = isRecraftV4ProImageSizeSelectionValue(falOptionsOverride.recraftImageSize)
      ? falOptionsOverride.recraftImageSize
      : recraftImageSize;
    const recraftBackgroundColorForRun = normalizeRecraftRgbColor(falOptionsOverride.recraftBackgroundColor) ?? recraftBackgroundColor;
    const recraftColorsForRun = Array.isArray(falOptionsOverride.recraftColors)
      ? falOptionsOverride.recraftColors.map(normalizeRecraftRgbColor).filter((color): color is NonNullable<typeof color> => Boolean(color)).slice(0, RECRAFT_V4_PRO_MAX_COLORS)
      : recraftColors.slice(0, RECRAFT_V4_PRO_MAX_COLORS);
    const gptImage2QualityForRun: FalGptImage2QualitySelectionValue = isGptImage2QualitySelectionValue(falOptionsOverride.gptImage2Quality)
      ? falOptionsOverride.gptImage2Quality
      : gptImage2Quality; // Saved runs can override the active quality picker.
    const krea2AspectRatioForRun: Krea2AspectRatioSelectionValue = isKrea2AspectRatioSelectionValue(falOptionsOverride.aspectRatioSelection)
      ? falOptionsOverride.aspectRatioSelection
      : krea2AspectRatio;
    const krea2CreativityForRun: Krea2CreativitySelectionValue = isKrea2CreativitySelectionValue(falOptionsOverride.krea2Creativity)
      ? falOptionsOverride.krea2Creativity
      : krea2Creativity;
    const krea2StrengthsForRun = falOptionsOverride.krea2StyleReferenceStrengths ?? krea2StyleReferenceStrengths;
    const klingV3ControlKeepSoundForRun = falOptionsOverride.klingV3ControlKeepSound ?? klingV3ControlKeepSound;
    const klingV3ControlOrientationForRun = falOptionsOverride.klingV3ControlOrientation === 'image'
      || falOptionsOverride.klingV3ControlOrientation === 'video'
      ? falOptionsOverride.klingV3ControlOrientation
      : klingV3ControlOrientation;
    const volcengineOptionsOverride = generationOverride?.volcengineOptions ?? {};
    const jimengOptionsOverride = generationOverride?.jimengOptions ?? {};
    const seedanceOptionsOverride = { ...falOptionsOverride, ...volcengineOptionsOverride, ...jimengOptionsOverride }; // Embedded bars store backend-specific Seedance settings in provider bags.
    const jimengSessionIdForRun = typeof jimengOptionsOverride.sessionId === 'number' && Number.isInteger(jimengOptionsOverride.sessionId) && jimengOptionsOverride.sessionId >= 0
      ? jimengOptionsOverride.sessionId
      : generationOverride && (generationOverride.provider === 'jimeng' || generationOverride.jimengOptions)
        ? 0
        : jimengSessionId; // Legacy persisted Jimeng requests predate sessions and therefore used session zero.
    const rawSeedance2VariantForRun = isSeedance2Variant(seedanceOptionsOverride.seedance2Variant)
      ? seedanceOptionsOverride.seedance2Variant
      : seedance2Variant;
    const seedance2VariantForRun = getProviderSafeSeedance2Variant(falVideoModelIdForRun, rawSeedance2VariantForRun); // Submission is the final guard against stale cross-provider metadata.
    const seedance2JimengModelVersionForRun = isJimengSeedance2ModelVersion(seedanceOptionsOverride.seedance2JimengModelVersion)
      ? seedanceOptionsOverride.seedance2JimengModelVersion
      : generationOverride?.provider === 'jimeng' || generationOverride?.jimengOptions
        ? JIMENG_DEFAULT_SEEDANCE2_MODEL_VERSION
      : seedance2JimengModelVersion;
    const seedance2VolcengineModelForRun = isSeedance2VolcengineModel(seedanceOptionsOverride.seedance2VolcengineModel)
      ? seedanceOptionsOverride.seedance2VolcengineModel
      : generationOverride?.provider === 'volcengine' || generationOverride?.volcengineOptions
        ? 'standard'
        : seedance2VolcengineModel; // Legacy Volcengine generations predate sub-model selection and used Standard.
    const seedance2AspectRatioForRun = isSeedance2AspectRatioSelectionValue(seedanceOptionsOverride.seedance2AspectRatio)
      ? seedanceOptionsOverride.seedance2AspectRatio
      : seedance2AspectRatio;
    const seedance2ResolutionForRun = isSeedance2ResolutionSelectionValue(seedanceOptionsOverride.seedance2Resolution)
      ? seedanceOptionsOverride.seedance2Resolution
      : seedance2Resolution;
    const seedance2DurationWideForRun: Seedance2VolcengineDurationSelectionValue = isSeedance2VolcengineDurationSelectionValue(seedanceOptionsOverride.seedance2Duration)
      ? seedanceOptionsOverride.seedance2Duration
      : seedance2Duration; // Saved Seedance 2.5 runs may carry Auto or up to 30 seconds.
    const seedance2DurationForRun: Seedance2DurationSelectionValue = isSeedance2DurationSelectionValue(seedance2DurationWideForRun)
      ? seedance2DurationWideForRun
      : '5'; // Every 2.0 model stays within its 4-15 second envelope.
    const seedance2GenerateAudioForRun = typeof seedanceOptionsOverride.seedance2GenerateAudio === 'boolean'
      ? seedanceOptionsOverride.seedance2GenerateAudio
      : seedance2GenerateAudio;
    const seedance2CameraFixedForRun = typeof seedanceOptionsOverride.seedance2CameraFixed === 'boolean'
      ? seedanceOptionsOverride.seedance2CameraFixed
      : seedance2CameraFixed;
    const seedance2OutputFormatForRun = isSeedance2OutputFormatSelectionValue(seedanceOptionsOverride.seedance2OutputFormat)
      ? seedanceOptionsOverride.seedance2OutputFormat
      : seedance2OutputFormat; // Only Volcengine Seedance 2.5 sends the container choice.
    const seedance25VariantForRun = isSeedance25Variant(seedanceOptionsOverride.seedance25Variant)
      ? seedanceOptionsOverride.seedance25Variant
      : seedance25Variant;
    const seedance25AspectRatioForRun = isSeedance25AspectRatioSelectionValue(seedanceOptionsOverride.seedance25AspectRatio)
      ? seedanceOptionsOverride.seedance25AspectRatio
      : seedance25AspectRatio;
    const seedance25ResolutionForRun = isSeedance25ResolutionSelectionValue(seedanceOptionsOverride.seedance25Resolution)
      ? seedanceOptionsOverride.seedance25Resolution
      : seedance25Resolution;
    const seedance25DurationForRun = isSeedance25DurationSelectionValue(seedanceOptionsOverride.seedance25Duration)
      ? seedanceOptionsOverride.seedance25Duration
      : seedance25Duration;
    const seedance25GenerateAudioForRun = typeof seedanceOptionsOverride.seedance25GenerateAudio === 'boolean'
      ? seedanceOptionsOverride.seedance25GenerateAudio
      : seedance25GenerateAudio;
    const jimengMultiframeDurationForRun = isJimengMultiframeDurationSelectionValue(seedanceOptionsOverride.multiframeDuration)
      ? seedanceOptionsOverride.multiframeDuration
      : jimengMultiframeDuration;
    const jimengMultiframeResolutionForRun = isJimengMultiframeResolutionSelectionValue(seedanceOptionsOverride.multiframeResolution)
      ? seedanceOptionsOverride.multiframeResolution
      : jimengMultiframeResolution;
    const shouldMergeSeedanceReferenceIdsForRun = apiProviderForRun === 'fal'
      && falModelModeForRun === 'video'
      && (
        ((falVideoModelIdForRun === SEEDANCE_2_VIDEO_MODEL_ID || falVideoModelIdForRun === FAL_SEEDANCE_2_VIDEO_MODEL_ID || falVideoModelIdForRun === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID) && seedance2VariantForRun !== 'smart')
        || ((falVideoModelIdForRun === FAL_SEEDANCE_25_VIDEO_MODEL_ID || falVideoModelIdForRun === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID) && seedance25VariantForRun === 'reference')
        || (falVideoModelIdForRun === MINIMAX_H3_VIDEO_MODEL_ID && miniMaxH3VariantForRun === 'reference')
        || (falVideoModelIdForRun === FLUX_3_VIDEO_MODEL_ID && flux3ModePolicyForRun.inputKind === 'keyframe-images')
      )
      && !generationOverride; // Multimodal reference models merge selected media into ordered labels.
    const infinitalkSeedValue = infinitalkSeedForRun === 'random'
      ? undefined
      : Number.isFinite(Number(infinitalkSeedForRun)) ? Number(infinitalkSeedForRun) : undefined;
    const basePrimaryImageIdForRun = generationOverride ? generationOverride.primaryImageId ?? null : primaryImageId;
    const shouldPreferSelectedStillImage = apiProviderForRun === 'fal'
      && falModelModeForRun === 'video'
      && !generationOverride
      && (
        falVideoModelIdForRun === WAN_ANIMATE_MODEL_ID
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
    const videoLastFrameImageIdForRun = generationOverride ? generationOverride.videoLastFrameImageId ?? null : videoLastFrameImageId;
    const sourceVideoIdForRun = generationOverride ? generationOverride.sourceVideoId ?? null : sourceVideoId;
    const sourceAudioIdForRun = generationOverride ? generationOverride.sourceAudioId ?? null : sourceAudioId;
    const flux3RunPlan = buildFlux3RunPlan({
      prompt: trimmedPrompt,
      variant: flux3VariantForRun,
      duration: flux3DurationForRun,
      primaryImageId: activePrimary?.id,
      lastFrameImageId: videoLastFrameImageIdForRun,
      referenceImageIds: referenceImageIdsForRun,
      sourceVideoId: sourceVideoIdForRun,
      selectedMediaIds: generationOverride ? undefined : selectedImageIds,
      keyframeTimings: flux3KeyframeTimingsForRun,
    });
    const klingO3KeepAudioForRun = typeof generationOverride?.falOptions?.klingO3KeepAudio === 'boolean'
      ? generationOverride.falOptions.klingO3KeepAudio
      : typeof legacyKlingOptions.klingO1KeepAudio === 'boolean'
        ? legacyKlingOptions.klingO1KeepAudio
        : klingO3KeepAudio;
    const generationProviderForRun: GenerationProviderId = apiProviderForRun === 'google'
      ? 'google'
      : falModelModeForRun === 'video' && (falVideoModelIdForRun === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID || falVideoModelIdForRun === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID || falVideoModelIdForRun === JIMENG_MULTIFRAME_VIDEO_MODEL_ID)
        ? 'jimeng'
        : falModelModeForRun === 'video' && falVideoModelIdForRun === SEEDANCE_2_VIDEO_MODEL_ID
        ? 'volcengine'
        : 'fal';

    const usingFal = generationProviderForRun === 'fal';
    const usingVolcengine = generationProviderForRun === 'volcengine';
    const usingJimeng = generationProviderForRun === 'jimeng';
    const usesGlobalLoadingLock = generationProviderForRun === 'google';
    const isVideoMode = generationProviderForRun !== 'google' && falModelModeForRun === 'video';
    const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelIdForRun);
    const normalizedFalImageSizeSelectionForRun = (isSeedreamV5LiteModelId(falModelIdForRun) || isSeedreamV5ProModelId(falModelIdForRun)) && falImageSizeSelectionForRun === 'default'
      ? 'auto_2K'
      : falImageSizeSelectionForRun; // Seedream 5 defaults to auto_2K instead of source-matching.
    const isNanoBananaModel = !isVideoMode && isNanoBananaEditModelId(falModelIdForRun);
    const isGptImage2ModelForRun = !isVideoMode && isGptImage2EditModelId(falModelIdForRun);
    const isKrea2LargeModelForRun = usingFal && !isVideoMode && isKrea2LargeModel(falModelIdForRun);
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
    const isKlingVideoModel = isVideoMode && falVideoModelIdForRun === KLING_VIDEO_MODEL_ID;
    const isKlingV3VideoModel = isVideoMode && falVideoModelIdForRun === KLING_V3_VIDEO_MODEL_ID;
    const isKlingO3VideoModel = isVideoMode && isKlingO3VideoModelId(falVideoModelIdForRun);
    const isKlingO3EditMode = isKlingO3VideoModel && klingO3VariantForRun === 'edit';
    const isKlingO3ReferenceMode = isKlingO3VideoModel && klingO3VariantForRun === 'reference';
    const isKlingO3VideoInputMode = isKlingO3EditMode;
    const isKlingV3ControlVideoModel = isVideoMode && falVideoModelIdForRun === KLING_V3_CONTROL_VIDEO_MODEL_ID;
    const isWanVisionEnhancerVideoModel = isVideoMode && falVideoModelIdForRun === WAN_VISION_ENHANCER_MODEL_ID;
    const isWanAnimateVideoModel = isVideoMode && falVideoModelIdForRun === WAN_ANIMATE_MODEL_ID;
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
    const isFlux3VideoModelForRun = isVideoMode && falVideoModelIdForRun === FLUX_3_VIDEO_MODEL_ID;
    const isFlux3KeyframesModeForRun = isFlux3VideoModelForRun && flux3ModePolicyForRun.inputKind === 'keyframe-images';
    const isFlux3FflfModeForRun = isFlux3VideoModelForRun && flux3ModePolicyForRun.inputKind === 'first-last-images';
    const isFlux3ExtendModeForRun = isFlux3VideoModelForRun && flux3ModePolicyForRun.inputKind === 'source-video';
    const hasFlux3SmartUnsupportedSelectionForRun = isFlux3VideoModelForRun
      && flux3ModePolicyForRun.inputKind === 'optional-start-image'
      && (generationOverride
        ? primaryImageIdForRun !== null && !activePrimary
        : selectedImageIds.length > 1
          || selectedImageIds.some(selectedId => !isImageCanvasMedia(images.find(image => image.id === selectedId))));
    const isWanVideoInputMode = isWanVisionEnhancerVideoModel || isWanAnimateVideoModel;
    const isVeo31ExtendMode = isVeo31VideoModelForRun && veo31VariantForRun === 'extend';
    const isFalVideoInputMode = isWanVideoInputMode
      || isLipsyncVideoModel
      || isHeygenV3LipsyncVideoModel
      || isInfinitalkVideoModel
      || isKlingV3ControlVideoModel
      || isVeo31ExtendMode
      || isScailVideoModel
      || isWan27EditModeForRun
      || isFlux3ExtendModeForRun;
    const actualKlingModelId = isKlingVideoModel ? getKlingActualModelId(klingVariantForRun) : null;
    const actualKlingO3ModelId = isKlingO3VideoModel ? getKlingO3VideoEndpoint(klingO3VariantForRun) : null;
    const actualKlingV3ControlModelId = isKlingV3ControlVideoModel ? KLING_V3_CONTROL_VIDEO_MODEL_ID : null;
    const actualWanAnimateModelId = isWanAnimateVideoModel ? getWanAnimateVideoEndpoint(wanAnimateVariantForRun) : null;
    const isVeo31TailCapable = isVeo31VideoModelForRun && veo31VariantForRun === 'i2v-fflf';
    const isFalSeedance2VideoModelForRun = isVideoMode && falVideoModelIdForRun === FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    const isFalSeedance25VideoModelForRun = isVideoMode && falVideoModelIdForRun === FAL_SEEDANCE_25_VIDEO_MODEL_ID;
    const isMiniMaxH3VideoModelForRun = isVideoMode && falVideoModelIdForRun === MINIMAX_H3_VIDEO_MODEL_ID;
    const isJimengSeedance2VideoModelForRun = isVideoMode && falVideoModelIdForRun === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    const isJimengSeedance25VideoModelForRun = isVideoMode && falVideoModelIdForRun === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID;
    const isJimengMultiframeVideoModelForRun = isVideoMode && falVideoModelIdForRun === JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
    const isAnySeedance2VideoModelForRun = isVideoMode && (falVideoModelIdForRun === SEEDANCE_2_VIDEO_MODEL_ID || isFalSeedance2VideoModelForRun || isJimengSeedance2VideoModelForRun);
    const isSeedance2ReferenceModeForRun = isAnySeedance2VideoModelForRun && seedance2VariantForRun === 'reference';
    const isSeedance25ReferenceModeForRun = (isFalSeedance25VideoModelForRun || isJimengSeedance25VideoModelForRun) && seedance25VariantForRun === 'reference';
    const isMiniMaxH3ReferenceModeForRun = isMiniMaxH3VideoModelForRun && miniMaxH3VariantForRun === 'reference';
    const isMultimodalReferenceModeForRun = isSeedance2ReferenceModeForRun || isSeedance25ReferenceModeForRun || isMiniMaxH3ReferenceModeForRun || isFlux3KeyframesModeForRun;
    const shouldPersistReferenceInputsForRun = !isMiniMaxH3VideoModelForRun || isMiniMaxH3ReferenceModeForRun; // H3 Standard ignores references retained from Reference mode.
    const wan27AudioIdForRun = isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun ? sourceAudioIdForRun : null; // Wan 2.7 Smart supports optional audio.
    const videoDurationForRun: FalVideoDuration | undefined = isKlingVideoModel
      ? (falVideoDurationForRun === '10' ? '10' : '5')
      : undefined;
    const normalizedVideoNegativePrompt =
      (isKlingVideoModel || isKlingV3VideoModel || isWanVisionEnhancerVideoModel || isVeo31VideoModelForRun || isWan27VideoModelForRun)
        ? videoNegativePromptForRun.trim()
        : '';
    const hasVideoNegativePrompt = normalizedVideoNegativePrompt.length > 0;
    const isTextToImage = overrideKind ? overrideKind === 'text_to_image' : !activePrimary || isRecraftV4ProModelForRun || isKrea2LargeModelForRun;
    const isWanPromptOptional = usingFal && isVideoMode && (isWanVisionEnhancerVideoModel || isWanAnimateVideoModel || (isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun && Boolean(activePrimary)));
    const isKlingV3ControlPromptOptional = usingFal && isVideoMode && isKlingV3ControlVideoModel; // Kling Control v3 prompt is optional.
    const isLipsyncPromptOptional = usingFal && isVideoMode && (isLipsyncVideoModel || isHeygenV3LipsyncVideoModel);
    const requiresPrompt = !(usingFal && (isUpscaleModel || isWanPromptOptional || isKlingV3ControlPromptOptional || isLipsyncPromptOptional))
      && !(usingJimeng && isMultimodalReferenceModeForRun); // Dreamina multimodal prompts are optional.
    const requiresVideoSourceImage = usingFal && isVideoMode && !isKlingV3VideoModel && !isMiniMaxH3VideoModelForRun && !isFlux3VideoModelForRun && !isAnySeedance2VideoModelForRun && !isFalSeedance25VideoModelForRun && !isWan27VideoModelForRun && !isKlingO3VideoInputMode && !isFalVideoInputMode
      && !(isGrokImagineVideoModel && isGrokImagineVideoEditMode);
    const generationKind: GenerationKind = overrideKind
      ?? (isVideoMode ? 'video' : isTextToImage ? 'text_to_image' : isUpscaleModel ? 'upscale' : 'image_edit');

    if (isUnsupportedLegacyKlingO1RefV2VRerun) {
      setError('Kling O1 Ref-v2v is no longer available and cannot be regenerated. Create a new Kling O3 Reference or Edit generation instead.');
      return;
    }

    if (isUnsupportedRemovedHailuoRun) {
      setError('Hailuo 2.3 is no longer available and cannot be regenerated. Select a supported video model and create a new generation instead.');
      return;
    }

    if (isUnsupportedRemovedOneToAllRun) {
      setError('1-to-All Animate is no longer available and cannot be regenerated. Select a supported video model and create a new generation instead.');
      return;
    }

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
    if (usingFal && isFlux3VideoModelForRun) {
      if (hasFlux3SmartUnsupportedSelectionForRun) {
        setError(generationOverride
          ? 'Flux 3 Smart could not find its starting image on the canvas.'
          : 'Flux 3 Smart supports at most one selected still image. Clear extra images, videos, or audio.');
        return;
      }
      if (flux3RunPlan.error) {
        setError(flux3RunPlan.error);
        return;
      }
      if (isFlux3ExtendModeForRun) {
        const source = sourceVideoIdForRun ? images.find(image => image.id === sourceVideoIdForRun && image.mediaType === 'video') : null;
        if (!source) {
          setError('Flux 3 Extend requires exactly one source video.');
          return;
        }
        const sourceFileError = getFlux3ExtendVideoFileError(source.file);
        if (sourceFileError) {
          setError(sourceFileError);
          return;
        }
        const sourceDuration = await resolveOptionalCanvasMediaDurationSeconds(source);
        if (sourceDuration !== null && sourceDuration >= FLUX3_EXTEND_MAX_SECONDS) {
          setError('Flux 3 Extend supports source videos under 15 seconds.');
          return;
        }
      }
    }
    if (isVideoMode) {
      const baseModelLabel = getFalModelLabel(falModelIdForRun);
      const klingO3VariantLabel = klingO3VariantForRun === 'edit' ? 'Edit' : 'Reference';
      const veo31VariantLabel = veo31VariantForRun === 'extend' ? 'Extend' : 'i2v/FFLF';
      const jobModelLabel = isKlingVideoModel
          ? `${baseModelLabel} ${klingVariantForRun === 'pro' ? 'Pro' : 'Standard'}`
        : isKlingV3VideoModel
          ? `${baseModelLabel}${klingV3MultiPromptEnabledForRun ? ' Multi' : ' Smart'}`
          : isKlingO3VideoModel
            ? `${baseModelLabel} ${klingO3VariantLabel}`
            : isKlingV3ControlVideoModel
              ? baseModelLabel
              : isVeo31VideoModelForRun
                ? `${baseModelLabel} ${veo31VariantLabel}`
                : isWanAnimateVideoModel
                  ? `${baseModelLabel} ${wanAnimateVariantForRun === 'replace' ? 'Keep BG' : 'Replace BG'}`
                  : isWan27VideoModelForRun
                    ? `${baseModelLabel} ${wan27VideoVariantForRun === 'reference' ? 'Reference' : wan27VideoVariantForRun === 'edit' ? 'Edit' : 'Smart'}`
                  : isFalSeedance2VideoModelForRun || isJimengSeedance2VideoModelForRun
                    ? buildSeedance2ModelLabel(baseModelLabel, seedance2VariantForRun)
                  : isFalSeedance25VideoModelForRun || isJimengSeedance25VideoModelForRun
                    ? buildSeedance2ModelLabel(baseModelLabel, seedance25VariantForRun)
                  : isMiniMaxH3VideoModelForRun
                    ? `${baseModelLabel} ${miniMaxH3VariantForRun === 'reference' ? 'Reference' : 'Standard'}`
                  : isFlux3VideoModelForRun
                    ? `${baseModelLabel} ${flux3RunPlan.policy.label}`
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

      if (usingVolcengine || usingJimeng) {
        const queueJobId = retryJobId ?? crypto.randomUUID();
        const localBackendProvider: Extract<GenerationProviderId, 'volcengine' | 'jimeng'> = usingJimeng ? 'jimeng' : 'volcengine';
        const isJimeng25 = usingJimeng && isJimengSeedance25VideoModelForRun;
        const isJimengMulti = usingJimeng && isJimengMultiframeVideoModelForRun;
        const isVolcengineSeedance25 = usingVolcengine && seedance2VolcengineModelForRun === 'seedance25';
        const safeVolcengineSettings = getVolcengineSafeSeedance2Settings(seedance2VolcengineModelForRun, {
          seedance2Variant: seedance2VariantForRun,
          seedance2AspectRatio: seedance2AspectRatioForRun,
          seedance2Resolution: seedance2ResolutionForRun,
          seedance2Duration: seedance2DurationWideForRun,
          seedance2CameraFixed: seedance2CameraFixedForRun,
        }, Boolean(activePrimary)); // Retry, embedded, and live first-frame requests share the same final provider clamps.
        const seedance2VolcengineDurationForRun = safeVolcengineSettings.seedance2Duration;
        const jimengSeedance25AspectRatioForRun = normalizeJimengSeedance25AspectRatio(seedance25AspectRatioForRun); // Persist provider-valid values for retries and snapshots.
        const jimengSeedance25DurationForRun = normalizeJimengSeedance25Duration(seedance25DurationForRun); // Legacy metadata must resolve to an explicit CLI duration.
        const localVariant = isJimengMulti ? 'smart' : isJimeng25 ? seedance25VariantForRun : usingJimeng ? seedance2VariantForRun : safeVolcengineSettings.seedance2Variant;
        const localAspectRatio = isJimengMulti ? '16:9' : isJimeng25 ? jimengSeedance25AspectRatioForRun : usingJimeng ? seedance2AspectRatioForRun : safeVolcengineSettings.seedance2AspectRatio;
        const localResolution = isJimengMulti ? jimengMultiframeResolutionForRun : isJimeng25 ? seedance25ResolutionForRun : usingJimeng ? seedance2ResolutionForRun : safeVolcengineSettings.seedance2Resolution;
        const localDuration = isJimengMulti ? jimengMultiframeDurationForRun : isJimeng25 ? jimengSeedance25DurationForRun : seedance2DurationForRun;
        const localModelVersion = isJimeng25 ? 'seedance2.5' : seedance2JimengModelVersionForRun;
        const jobModelLabel = usingJimeng
          ? isJimengMulti
            ? baseModelLabel
            : isJimeng25
            ? buildSeedance2ModelLabel(baseModelLabel, seedance25VariantForRun)
            : buildJimengSeedance2ModelLabel(baseModelLabel, seedance2VariantForRun, seedance2JimengModelVersionForRun)
          : buildSeedance2ModelLabel(VOLCENGINE_SEEDANCE2_MODEL_LABELS[seedance2VolcengineModelForRun], seedance2VariantForRun); // Queue labels name the exact sub-model, not the picker entry.
        const primarySelection = primaryImageIdForRun ? images.find(img => img.id === primaryImageIdForRun) ?? null : null;
        const isSeedance2ReferenceMode = localVariant === 'reference';
        const isSeedance2EditMode = !usingJimeng && localVariant === 'edit';
        const isSeedance2ExtendMode = !usingJimeng && localVariant === 'extend';
        const isSeedance2MultimodalMode = isSeedance2ReferenceMode || isSeedance2EditMode || isSeedance2ExtendMode; // Edit/Extend submit through the reference media path.
        const multiframeImageIds = isJimengMulti
          ? (generationOverride ? referenceImageIdsForRun : selectedImageIds)
          : [];
        const localReferenceImageIds = isSeedance2MultimodalMode ? referenceImageIdsForRun : [];
        const localReferenceVideoIds = isSeedance2MultimodalMode ? referenceVideoIdsForRun : [];
        const localReferenceAudioIds = isSeedance2MultimodalMode ? referenceAudioIdsForRun : []; // Smart and Multi-frame must not inherit stale tagged references.
        const usesSmartPrimaryImage = !isJimengMulti && localVariant === 'smart' && Boolean(activePrimary);
        const usesJimengReferencePrimaryImage = usingJimeng
          && localVariant === 'reference'
          && Boolean(activePrimary)
          && !localReferenceImageIds.includes(activePrimary.id);
        const localReferenceImageCount = localReferenceImageIds.length + Number(usesJimengReferencePrimaryImage);
        const referenceAssetCount = localReferenceImageCount + localReferenceVideoIds.length + localReferenceAudioIds.length;
        const submittedPrimaryImageId = usesSmartPrimaryImage || usesJimengReferencePrimaryImage ? primaryImageIdForRun : null;
        const submittedLastFrameImageId = !isJimengMulti && localVariant === 'smart' ? videoLastFrameImageIdForRun : null;
        const multiframeCanvasItems = multiframeImageIds
          .map(id => images.find(image => image.id === id))
          .filter(isImageCanvasMedia);
        const multiframeTransitionPrompts = isJimengMulti && multiframeCanvasItems.length > 2
          ? parseJimengMultiframeTransitionPrompts(trimmedPrompt)
          : [];
        const seedancePromptForRun = isSeedance2MultimodalMode
          ? normalizeSeedanceReferencePromptMentions(trimmedPrompt)
          : trimmedPrompt;

        if (isJimengMulti) {
          if (multiframeCanvasItems.length !== multiframeImageIds.length || !isValidJimengMultiframeImageCount(multiframeCanvasItems.length)) {
            setError(`Jimeng Multi-frame requires selecting between ${JIMENG_MULTIFRAME_MIN_IMAGES} and ${JIMENG_MULTIFRAME_MAX_IMAGES} still images.`);
            return;
          }
          if (!hasValidJimengMultiframePrompt(trimmedPrompt, multiframeCanvasItems.length)) {
            setError(`Jimeng Multi-frame needs ${multiframeCanvasItems.length - 1} transition prompts separated with ||.`);
            return;
          }
        }

        if (usingJimeng && localAspectRatio === 'adaptive') {
          setError('Seedance 2 (JM CLI) does not support adaptive aspect ratio yet.');
          return;
        }
        if (usingJimeng && !isJimeng25 && !isJimengMulti && localResolution === '480p') {
          setError('Seedance 2 (JM CLI) supports 720p, plus 1080p and 4K on the VIP channel.');
          return;
        }
        if (usingJimeng && !isJimeng25 && !isJimengMulti && (localResolution === '1080p' || localResolution === '4k') && seedance2JimengModelVersionForRun !== 'seedance2.0_vip') {
          setError(`Seedance 2 (JM CLI) ${localResolution} requires the VIP channel.`);
          return;
        }
        if (isVolcengineSeedance25 && (localResolution === '1080p' || localResolution === '4k')) {
          setError('Seedance 2.5 supports 480p and 720p only.');
          return;
        }
        const seedance25RequiresAdaptiveRatio = isSeedance2EditMode || isSeedance2ExtendMode || (localVariant === 'smart' && Boolean(activePrimary));
        if (isVolcengineSeedance25 && seedance25RequiresAdaptiveRatio && localAspectRatio !== 'adaptive') {
          setError('Seedance 2.5 first-frame, Edit, and Extend tasks require the Adaptive aspect ratio.');
          return;
        }
        if (isVolcengineSeedance25 && localVariant === 'edit' && seedance2VolcengineDurationForRun !== 'auto') {
          setError('Seedance 2.5 Edit requires the Auto duration.');
          return;
        }
        if (!isJimengMulti && !isSeedance2MultimodalMode && primarySelection && primarySelection.mediaType !== 'image') {
          setError('Seedance 2 Smart uses a still image as the first frame. Select an image or clear the selection.');
          return;
        }
        if (!isJimengMulti && !isSeedance2MultimodalMode && videoLastFrameImageIdForRun && !activePrimary) {
          setError('Seedance 2 first/last-frame mode requires a starting still image.');
          return;
        }
        if (isSeedance2ReferenceMode && referenceAssetCount === 0) {
          setError('Seedance 2 Reference requires at least one tagged reference asset.');
          return;
        }
        if ((isSeedance2EditMode || isSeedance2ExtendMode) && localReferenceVideoIds.length === 0) {
          setError(`Seedance 2 ${isSeedance2EditMode ? 'Edit' : 'Extend'} requires at least one video clip.`);
          return;
        }
        if (isSeedance2ExtendMode && (localReferenceImageIds.length > 0 || localReferenceAudioIds.length > 0)) {
          setError('Seedance 2 Extend accepts video clips only.');
          return;
        }
        if (usingJimeng && !isJimeng25 && isSeedance2ReferenceMode && localReferenceAudioIds.length > 0 && localReferenceImageCount + localReferenceVideoIds.length === 0) {
          setToastMessage(JIMENG_AUDIO_ONLY_REFERENCE_HINT);
          setTimeout(() => setToastMessage(null), 4000);
          return;
        }
        if (isSeedance2MultimodalMode) {
          const promptMentionError = getSeedanceReferencePromptMentionError(seedancePromptForRun, {
            imageCount: localReferenceImageCount,
            videoCount: localReferenceVideoIds.length,
            audioCount: localReferenceAudioIds.length,
          });
          if (promptMentionError) {
            setError(promptMentionError);
            return;
          }
        }
        const volcengineReferenceLimits = getSeedance2VolcengineReferenceLimits(isVolcengineSeedance25 ? 'seedance25' : 'standard'); // Volcengine 2.5 raises every reference cap.
        const seedance25FamilyLabel = isJimeng25 || isVolcengineSeedance25 ? 'Seedance 2.5' : 'Seedance 2';
        const localReferenceImageLimit = isJimeng25 ? SEEDANCE25_REFERENCE_IMAGE_LIMIT : volcengineReferenceLimits.images;
        const localReferenceVideoLimit = isJimeng25 ? SEEDANCE25_REFERENCE_VIDEO_LIMIT : volcengineReferenceLimits.videos;
        const localReferenceAudioLimit = isJimeng25 ? SEEDANCE25_REFERENCE_AUDIO_LIMIT : volcengineReferenceLimits.audios;
        if (!isJimengMulti && (
          localReferenceImageCount > localReferenceImageLimit
          || localReferenceVideoIds.length > localReferenceVideoLimit
          || localReferenceAudioIds.length > localReferenceAudioLimit
        )) {
          setError(`${seedance25FamilyLabel} Reference supports up to ${localReferenceImageLimit} images, ${localReferenceVideoLimit} videos, and ${localReferenceAudioLimit} audio clips.`);
          return;
        }
        const localReferenceTotalLimit = isJimeng25 ? SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT : volcengineReferenceLimits.total;
        if (!isJimengMulti && referenceAssetCount > localReferenceTotalLimit) {
          setError(`${seedance25FamilyLabel} Reference supports up to ${localReferenceTotalLimit} total inputs.`);
          return;
        }
        const localSeedance2GenerateAudioForRun = usingJimeng ? false : seedance2GenerateAudioForRun; // Jimeng hides and ignores audio generation.
        const localSeedance2CameraFixedForRun = usingJimeng ? false : safeVolcengineSettings.seedance2CameraFixed; // Jimeng hides and ignores fixed camera; Volcengine 2.5 clears it.
        const localProviderOptionsForRun: Pick<GenerationInputs, 'jimengOptions' | 'volcengineOptions'> = usingJimeng ? { jimengOptions: isJimengMulti ? {
          multiframeDuration: jimengMultiframeDurationForRun,
          multiframeResolution: jimengMultiframeResolutionForRun,
          sessionId: jimengSessionIdForRun,
        } : isJimeng25 ? {
          seedance25Variant: seedance25VariantForRun,
          seedance25AspectRatio: jimengSeedance25AspectRatioForRun,
          seedance25Resolution: seedance25ResolutionForRun,
          seedance25Duration: jimengSeedance25DurationForRun,
          seedance25GenerateAudio: false,
          sessionId: jimengSessionIdForRun,
        } : {
          seedance2Variant: seedance2VariantForRun,
          seedance2JimengModelVersion: seedance2JimengModelVersionForRun,
          seedance2AspectRatio: seedance2AspectRatioForRun,
          seedance2Resolution: seedance2ResolutionForRun,
          seedance2Duration: seedance2DurationForRun,
          seedance2GenerateAudio: localSeedance2GenerateAudioForRun,
          seedance2CameraFixed: localSeedance2CameraFixedForRun,
          sessionId: jimengSessionIdForRun,
        } } : { volcengineOptions: {
          seedance2Variant: safeVolcengineSettings.seedance2Variant,
          seedance2VolcengineModel: seedance2VolcengineModelForRun,
          seedance2AspectRatio: safeVolcengineSettings.seedance2AspectRatio,
          seedance2Resolution: safeVolcengineSettings.seedance2Resolution,
          seedance2Duration: seedance2VolcengineDurationForRun,
          seedance2GenerateAudio: seedance2GenerateAudioForRun,
          seedance2CameraFixed: safeVolcengineSettings.seedance2CameraFixed,
          ...(isVolcengineSeedance25 ? { seedance2OutputFormat: seedance2OutputFormatForRun } : {}), // 2.0 sub-models never persist the container choice.
        } }; // One source of truth shared by queue-retry inputs and saved-video metadata.
        const localSeedanceRetryInputs: GenerationInputs = {
          kind: 'video',
          prompt: seedancePromptForRun,
          provider: localBackendProvider,
          modelId: falModelIdForRun,
          modelLabel: jobModelLabel,
          modelMode: falModelModeForRun,
          ...(submittedPrimaryImageId ? { primaryImageId: submittedPrimaryImageId } : {}),
          ...((isJimengMulti ? multiframeImageIds : localReferenceImageIds).length ? { referenceImageIds: isJimengMulti ? multiframeImageIds : localReferenceImageIds } : {}),
          ...(localReferenceVideoIds.length ? { referenceVideoIds: localReferenceVideoIds } : {}),
          ...(localReferenceAudioIds.length ? { referenceAudioIds: localReferenceAudioIds } : {}),
          ...(submittedPrimaryImageId && activePrimary?.metadata?.generation?.originalSourceImageId
            ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
            : submittedPrimaryImageId ? { originalSourceImageId: submittedPrimaryImageId } : {}),
          ...(submittedLastFrameImageId ? { videoLastFrameImageId: submittedLastFrameImageId } : {}),
          ...localProviderOptionsForRun,
        }; // Queue retry uses the same request metadata as saved videos.

        const tailFrame = submittedLastFrameImageId
          ? images.find(img => img.id === submittedLastFrameImageId) ?? null
          : null;
        if (tailFrame && !isImageCanvasMedia(tailFrame)) {
          setError('Select a still image on the canvas to use as the ending frame.');
          return;
        }

        const referenceImageCanvasItems = localReferenceImageIds
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia);
        if (referenceImageCanvasItems.length !== localReferenceImageIds.length) {
          setError('Seedance 2 image references must be still images.');
          return;
        }

        const referenceVideoCanvasItems = localReferenceVideoIds
          .map(id => images.find(img => img.id === id))
          .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'video'));
        if (referenceVideoCanvasItems.length !== localReferenceVideoIds.length) {
          setError('Seedance 2 video references must be videos on the canvas.');
          return;
        }
        const localReferenceMinDuration = isJimeng25 ? JIMENG_SEEDANCE25_REFERENCE_MEDIA_MIN_DURATION_SECONDS : volcengineReferenceLimits.clipMinDurationSeconds;
        const localReferenceVideoMinDuration = isVolcengineSeedance25 && isSeedance2EditMode
          ? SEEDANCE25_EDIT_VIDEO_MIN_DURATION_SECONDS
          : localReferenceMinDuration; // Edit has a stricter source-video floor than ordinary 2.5 references.
        const localReferenceMaxDuration = isJimeng25 ? JIMENG_SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS : volcengineReferenceLimits.clipMaxDurationSeconds;
        const localReferenceVideoTotalDuration = isJimeng25 ? JIMENG_SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS : volcengineReferenceLimits.videoTotalDurationSeconds;
        const localReferenceAudioTotalDuration = isJimeng25 ? JIMENG_SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS : volcengineReferenceLimits.audioTotalDurationSeconds;
        const localReferenceDurationTolerance = usingJimeng ? 0.05 : 0; // Match the backend's allowance for media-probe rounding.
        const referenceVideoDurations = await Promise.all(referenceVideoCanvasItems.map(resolveCanvasMediaDurationSeconds)); // Legacy snapshots load only selected video metadata.
        if (referenceVideoDurations.some(durationSeconds => durationSeconds === null || durationSeconds < localReferenceVideoMinDuration - localReferenceDurationTolerance || durationSeconds > localReferenceMaxDuration + localReferenceDurationTolerance)) {
          setError(`${seedance25FamilyLabel} reference videos must each be between ${localReferenceVideoMinDuration} and ${localReferenceMaxDuration} seconds.`);
          return;
        }
        const totalReferenceVideoDurationSeconds = referenceVideoDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
        if (totalReferenceVideoDurationSeconds > localReferenceVideoTotalDuration + localReferenceDurationTolerance) {
          setError(`${seedance25FamilyLabel} reference videos must total ${localReferenceVideoTotalDuration} seconds or less.`);
          return;
        }

        const referenceAudioCanvasItems = localReferenceAudioIds
          .map(id => images.find(img => img.id === id))
          .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'audio'));
        if (referenceAudioCanvasItems.length !== localReferenceAudioIds.length) {
          setError('Seedance 2 audio references must be audio clips on the canvas.');
          return;
        }
        const referenceAudioDurations = referenceAudioCanvasItems.map(getCanvasMediaDurationSeconds); // Seedance validates reference audio duration per clip and in total.
        if (referenceAudioDurations.some(durationSeconds => durationSeconds === null || durationSeconds < localReferenceMinDuration - localReferenceDurationTolerance || durationSeconds > localReferenceMaxDuration + localReferenceDurationTolerance)) {
          setError(`${seedance25FamilyLabel} reference audio clips must each be between ${localReferenceMinDuration} and ${localReferenceMaxDuration} seconds.`);
          return;
        }
        const totalReferenceAudioDurationSeconds = referenceAudioDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
        if (totalReferenceAudioDurationSeconds > localReferenceAudioTotalDuration + localReferenceDurationTolerance) {
          setError(`${seedance25FamilyLabel} reference audio clips must total ${localReferenceAudioTotalDuration} seconds or less.`);
          return;
        }

        const seedanceRequestKey = buildSeedance2RequestKey({
          provider: generationProviderForRun,
          modelId: falModelIdForRun,
          prompt: seedancePromptForRun,
          variant: localVariant,
          jimengModelVersion: isJimengMulti ? undefined : usingJimeng ? localModelVersion : seedance2VolcengineModelForRun, // Multi-frame has no channel; other sub-models remain distinct.
          jimengSessionId: usingJimeng ? jimengSessionIdForRun : undefined,
          aspectRatio: localAspectRatio,
          resolution: localResolution,
          duration: usingJimeng ? localDuration : seedance2VolcengineDurationForRun,
          generateAudio: localSeedance2GenerateAudioForRun,
          cameraFixed: localSeedance2CameraFixedForRun,
          outputFormat: isVolcengineSeedance25 ? seedance2OutputFormatForRun : undefined,
          primaryImageId: submittedPrimaryImageId,
          videoLastFrameImageId: submittedLastFrameImageId,
          referenceImageIds: isJimengMulti ? multiframeImageIds : localReferenceImageIds,
          referenceVideoIds: localReferenceVideoIds,
          referenceAudioIds: localReferenceAudioIds,
          images,
        });

        if (!confirmRepeatedSeedanceRequest(seedanceRequestKey)) {
          return;
        }

        let jobQueued = false;
        const enqueueLocalSeedanceJob = () => {
          if (jobQueued) {
            return;
          }
          const newJob: FalQueueJob = {
            id: queueJobId,
            prompt: seedancePromptForRun,
            modelId: falModelIdForRun,
            modelLabel: jobModelLabel,
            provider: localBackendProvider,
            retryInputs: localSeedanceRetryInputs,
            status: 'IN_QUEUE',
            logs: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          queueJob(newJob);
          addDebugLog({
            direction: 'outbound',
            source: localBackendProvider,
            title: jobModelLabel,
            message: 'Preparing request',
            data: { jobId: queueJobId, kind: 'video', variant: localVariant },
          });
          jobQueued = true;
        };

        try {
          const firstFrameImageFile = activePrimary && (usesSmartPrimaryImage || usesJimengReferencePrimaryImage)
            ? await buildStillImageFile(activePrimary, `seedance2-first-frame-${Date.now()}`)
            : undefined;
          const tailFrameImage = tailFrame && isImageCanvasMedia(tailFrame) ? tailFrame : null;
          const lastFrameImageFile = tailFrameImage && localVariant === 'smart' && !isJimengMulti
            ? await buildStillImageFile(tailFrameImage, `seedance2-last-frame-${Date.now()}`)
            : undefined;

          const referenceImageFiles = isJimengMulti ? [] : await Promise.all(
            referenceImageCanvasItems.map((img, index) => buildStillImageFile(img, `seedance2-reference-image-${index + 1}-${Date.now()}`)),
          ); // Multi-frame images use their dedicated form field and must not be uploaded twice.
          const referenceVideoFiles = await Promise.all(referenceVideoCanvasItems.map(async (img, index) => {
            const realFile = await ensureRealSnapshotFile(img.file);
            return new File([realFile], img.file.name || `seedance2-reference-video-${index + 1}.mp4`, { type: img.file.type || 'video/mp4' });
          }));
          const referenceAudioFiles = await Promise.all(referenceAudioCanvasItems.map(async (img, index) => {
            const realFile = await ensureRealSnapshotFile(img.file);
            if (realFile.type === 'audio/webm') {
              const wavBlob = await convertAudioBlobToWav(realFile);
              return new File([wavBlob], `seedance2-reference-audio-${index + 1}.wav`, { type: 'audio/wav' });
            }
            return new File([realFile], img.file.name || `seedance2-reference-audio-${index + 1}`, { type: img.file.type || 'audio/mpeg' });
          }));
          const multiframeImageFiles = await Promise.all(
            multiframeCanvasItems.map((image, index) => buildStillImageFile(image, `jimeng-multiframe-${index + 1}-${Date.now()}`)),
          );
          if (isVolcengineSeedance25) {
            if (referenceImageFiles.some(file => file.size > SEEDANCE25_REFERENCE_IMAGE_MAX_BYTES)) {
              setError('Seedance 2.5 reference images must be 30 MB or smaller.');
              return;
            }
            const referenceVideoFileErrors = await Promise.all(referenceVideoFiles.map(async (file, index) => {
              const item = referenceVideoCanvasItems[index];
              const hasReliableDimensions = Boolean(item && Number.isFinite(item.naturalWidth) && Number.isFinite(item.naturalHeight) && item.naturalWidth > 0 && item.naturalHeight > 0);
              return getSeedance25VideoReferenceFileError(
                file,
                hasReliableDimensions ? item?.naturalWidth : undefined,
                hasReliableDimensions ? item?.naturalHeight : undefined,
                await readIsoBmffVideoFrameRate(file),
              );
            }));
            const referenceFileError = referenceVideoFileErrors.find(Boolean)
              ?? referenceAudioFiles.map(getSeedance25AudioReferenceFileError).find(Boolean);
            if (referenceFileError) {
              setError(referenceFileError);
              return;
            }
          }
          enqueueLocalSeedanceJob();
          setError(null);

          const jimengPrimaryImageFile = localVariant === 'reference' && activePrimary && localReferenceImageIds.includes(activePrimary.id)
            ? undefined
            : firstFrameImageFile; // Avoid sending the same Jimeng reference image twice.

          const videoResult = usingJimeng
            ? await generateJimengSeedanceVideo(seedancePromptForRun, {
              modelId: falVideoModelIdForRun,
              variant: localVariant,
              modelVersion: localModelVersion,
              aspectRatio: localAspectRatio === 'adaptive' ? '16:9' : localAspectRatio,
              duration: localDuration,
              resolution: localResolution,
              generateAudio: localSeedance2GenerateAudioForRun,
              cameraFixed: localSeedance2CameraFixedForRun,
              session: jimengSessionIdForRun,
              ...(isJimengMulti ? {
                mode: 'multiframe' as const,
                multiframeImageFiles,
                transitionPrompts: multiframeTransitionPrompts,
                transitionDurations: multiframeTransitionPrompts.map(() => Number(jimengMultiframeDurationForRun)),
              } : {}),
              ...(jimengPrimaryImageFile ? { primaryImageFile: jimengPrimaryImageFile } : {}),
              ...(lastFrameImageFile ? { lastFrameImageFile } : {}),
              ...(referenceImageFiles.length ? { referenceImageFiles } : {}),
              ...(referenceVideoFiles.length ? { referenceVideoFiles } : {}),
              ...(referenceAudioFiles.length ? { referenceAudioFiles } : {}),
              onQueueUpdate: (update: JimengQueueUpdate) => {
                setFalJobs(prev => prev.map(job => (
                  job.id === queueJobId ? applyVolcengineQueueUpdateToJob(job, update) : job
                )));
              },
            })
            : await generateSeedanceVideo(seedancePromptForRun, {
              modelId: SEEDANCE2_VOLCENGINE_MODEL_IDS[seedance2VolcengineModelForRun],
              variant: safeVolcengineSettings.seedance2Variant,
              aspectRatio: safeVolcengineSettings.seedance2AspectRatio,
              duration: seedance2VolcengineDurationForRun,
              resolution: safeVolcengineSettings.seedance2Resolution,
              generateAudio: localSeedance2GenerateAudioForRun,
              cameraFixed: safeVolcengineSettings.seedance2CameraFixed,
              ...(isVolcengineSeedance25 ? { outputFormat: seedance2OutputFormatForRun } : {}), // Only Seedance 2.5 sends a container choice.
              ...(firstFrameImageFile ? { primaryImageFile: firstFrameImageFile } : {}),
              ...(lastFrameImageFile ? { lastFrameImageFile } : {}),
              ...(referenceImageFiles.length ? { referenceImageFiles } : {}),
              ...(referenceVideoFiles.length ? { referenceVideoFiles } : {}),
              ...(referenceAudioFiles.length ? { referenceAudioFiles } : {}),
              onQueueUpdate: (update: VolcengineQueueUpdate) => {
                setFalJobs(prev => prev.map(job => (
                  job.id === queueJobId ? applyVolcengineQueueUpdateToJob(job, update) : job
                )));
              },
            });

          setFalJobs(prev => prev.map(job => (
            job.id === queueJobId
              ? {
                ...job,
                ...('providerJobId' in videoResult ? { providerJobId: videoResult.providerJobId } : {}),
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
            const debugContext: GeneratedMediaDebugContext = {
              source: localBackendProvider,
              modelLabel: jobModelLabel,
              jobId: queueJobId,
              requestId: videoResult.requestId,
            };
            logGeneratedVideoDownloaded(debugContext, videoBlob);
            const hasVideoFileType = videoBlob.type.trim().toLowerCase().startsWith('video/');
            const extension = hasVideoFileType
              ? getVideoFileExtension(videoBlob.type)
              : isVolcengineSeedance25 ? seedance2OutputFormatForRun : 'mp4';
            const fileType = hasVideoFileType
              ? videoBlob.type
              : extension === 'mov' ? 'video/quicktime' : 'video/mp4';
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
              ?? multiframeCanvasItems[0]
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
            const hasAudio = hasDetectedAudio || localSeedance2GenerateAudioForRun;

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
                  provider: localBackendProvider,
                  modelId: falModelIdForRun,
                  modelLabel: jobModelLabel,
                  modelMode: falModelModeForRun,
                  url: videoResult.videoUrl,
                  ...(submittedPrimaryImageId ? { primaryImageId: submittedPrimaryImageId } : {}),
                  ...((isJimengMulti ? multiframeImageIds : localReferenceImageIds).length ? { referenceImageIds: isJimengMulti ? multiframeImageIds : localReferenceImageIds } : {}),
                  ...(localReferenceVideoIds.length ? { referenceVideoIds: localReferenceVideoIds } : {}),
                  ...(localReferenceAudioIds.length ? { referenceAudioIds: localReferenceAudioIds } : {}),
                  ...(submittedPrimaryImageId && activePrimary?.metadata?.generation?.originalSourceImageId
                    ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
                    : submittedPrimaryImageId ? { originalSourceImageId: submittedPrimaryImageId } : {}),
                  ...(lastFrameImageFile && submittedLastFrameImageId ? { videoLastFrameImageId: submittedLastFrameImageId } : {}),
                  ...localProviderOptionsForRun,
                },
              },
            };

            setState(prev => ({
              ...prev,
              images: [...prev.images, newVideo],
            }));
            logGeneratedMediaAppended(debugContext, 'video', [newVideo.id]);
            onGenerationPlaced?.({ mediaIds: [newVideo.id], mediaType: 'video', modelLabel: jobModelLabel });
            onGenerationComplete?.();
          } catch (loadErr) {
            console.error('Failed to load generated Seedance 2 video into canvas', loadErr);
            setToastMessage('Video ready! Open from the queue panel.');
            setTimeout(() => setToastMessage(null), 2000);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'An unknown error occurred.';
          if (jobQueued) {
            setFalJobs(prev => prev.map(job => (
              job.id === queueJobId
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

      const falJobId = retryJobId ?? crypto.randomUUID();

      let videoPromptForRequest = trimmedPrompt;
      // Start from the retry overrides; refined below by HeyGen clip-intent extraction so retry
      // inputs and saved metadata always reflect the timing the request actually used.
      let heygenStartTimeForRequest = heygenStartTimeOverride;
      let heygenEndTimeForRequest = heygenEndTimeOverride;
      let heygenTimingResolvedForRequest = heygenTimingResolvedOverride
        || heygenStartTimeOverride !== undefined
        || heygenEndTimeOverride !== undefined; // Legacy retries with saved bounds are already finalized.
      const falSeedance2ResolutionForRun = seedance2ResolutionForRun === '4k'
        ? '1080p'
        : seedance2ResolutionForRun; // Normalize once so request keys, retries, metadata, and provider args agree.
      // Single source of truth for the per-model video options replayed on retry and saved in
      // generation metadata. Keep in sync with the request args passed to generateFalImageToVideo.
      const buildVideoFalOptionsForRun = (): GenerationFalOptions => ({
        ...(videoDurationForRun ? { videoDuration: videoDurationForRun } : {}),
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
        ...(isKlingO3VideoModel ? {
          klingO3Variant: klingO3VariantForRun,
          klingO3Duration: klingO3DurationForRun,
          klingO3GenerateAudio: klingO3GenerateAudioForRun,
        } : {}),
        ...(isKlingO3EditMode ? { klingO3KeepAudio: klingO3KeepAudioForRun } : {}),
        ...(isKlingO3ReferenceMode ? {
          aspectRatioSelection: isKlingO3AspectRatioSelectionValue(falAspectRatioSelectionForRun) ? falAspectRatioSelectionForRun : '16:9',
        } : {}),
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
        ...(isLipsyncVideoModel ? { lipsyncSyncMode: lipsyncSyncModeForRun } : {}),
        ...(isHeygenV3LipsyncVideoModel ? {
          heygenEnableCaption: heygenEnableCaptionForRun,
          heygenEnableDynamicDuration: heygenEnableDynamicDurationForRun,
          heygenDisableMusicTrack: heygenDisableMusicTrackForRun,
          heygenEnableSpeechEnhancement: heygenEnableSpeechEnhancementForRun,
          heygenTimingResolved: heygenTimingResolvedForRequest,
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
        ...(isMiniMaxH3VideoModelForRun ? {
          miniMaxH3Variant: miniMaxH3VariantForRun,
          miniMaxH3AspectRatio: miniMaxH3AspectRatioForRun,
          miniMaxH3Duration: miniMaxH3DurationForRun,
        } : {}),
        ...(isFlux3VideoModelForRun ? {
          flux3Variant: flux3VariantForRun,
          flux3AspectRatio: flux3AspectRatioForRun,
          flux3Resolution: flux3ResolutionForRun,
          flux3Duration: flux3DurationForRun,
          flux3GenerateAudio: flux3GenerateAudioForRun,
          flux3KeyframeTimings: flux3RunPlan.keyframeTimings,
        } : {}),
        ...(isSeedance15VideoModel ? {
          seedance15AspectRatio: seedance15AspectRatioForRun,
          seedance15Resolution: seedance15ResolutionForRun,
          seedance15Duration: seedance15DurationForRun,
          seedance15CameraFixed: seedance15CameraFixedForRun,
          seedance15Audio: seedance15AudioForRun,
        } : {}),
        ...(isFalSeedance2VideoModelForRun ? {
          seedance2Variant: seedance2VariantForRun,
          seedance2AspectRatio: seedance2AspectRatioForRun,
          seedance2Resolution: falSeedance2ResolutionForRun,
          seedance2Duration: seedance2DurationForRun,
          seedance2GenerateAudio: seedance2GenerateAudioForRun,
        } : {}),
        ...(isFalSeedance25VideoModelForRun ? {
          seedance25Variant: seedance25VariantForRun,
          seedance25AspectRatio: seedance25AspectRatioForRun,
          seedance25Resolution: seedance25ResolutionForRun,
          seedance25Duration: seedance25DurationForRun,
          seedance25GenerateAudio: seedance25GenerateAudioForRun,
        } : {}),
        ...(isKlingV3ControlVideoModel ? {
          klingV3ControlKeepSound: klingV3ControlKeepSoundForRun,
          klingV3ControlOrientation: klingV3ControlOrientationForRun,
        } : {}),
      });
      const buildFalVideoRetryInputs = (promptForRetry = videoPromptForRequest): GenerationInputs => ({
        kind: 'video',
        prompt: promptForRetry,
        provider: 'fal',
        modelId: falModelIdForRun,
        modelLabel: jobModelLabel,
        modelMode: falModelModeForRun,
        primaryImageId: isWan27ReferenceModeForRun || isMultimodalReferenceModeForRun ? undefined : primaryImageIdForRun ?? undefined,
        ...(shouldPersistReferenceInputsForRun && referenceImageIdsForRun.length ? { referenceImageIds: referenceImageIdsForRun } : {}),
        ...(shouldPersistReferenceInputsForRun && referenceVideoIdsForRun.length ? { referenceVideoIds: referenceVideoIdsForRun } : {}),
        ...(shouldPersistReferenceInputsForRun && referenceAudioIdsForRun.length ? { referenceAudioIds: referenceAudioIdsForRun } : {}),
        ...(elementImageIdsForRun.length ? { elementImageIds: elementImageIdsForRun } : {}),
        ...(activePrimary?.metadata?.generation?.originalSourceImageId
          ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
          : primaryImageIdForRun && !isWan27ReferenceModeForRun && !isMultimodalReferenceModeForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
        videoLastFrameImageId: videoLastFrameImageIdForRun,
        ...((isKlingO3VideoInputMode || isFalVideoInputMode) && sourceVideoIdForRun ? { sourceVideoId: sourceVideoIdForRun } : {}),
        ...(sourceAudioIdForRun || wan27AudioIdForRun ? { sourceAudioId: sourceAudioIdForRun ?? wan27AudioIdForRun ?? undefined } : {}),
        falOptions: buildVideoFalOptionsForRun(),
      }); // Retry mirrors the saved video generation metadata.
      let jobQueued = false;
      const refreshQueuedFalVideoRetryInputs = () => {
        if (!jobQueued) {
          return;
        }
        const retryInputs = buildFalVideoRetryInputs();
        setFalJobs(prev => prev.map(job => (
          job.id === falJobId
            ? { ...job, prompt: videoPromptForRequest, retryInputs, updatedAt: Date.now() }
            : job
        )));
      }; // Persist refinements made after upload progress creates the queue row.
      const handleFalPhaseUpdate = (update: FalPhaseUpdate) => {
        const wasJobQueued = jobQueued;
        if (!jobQueued) {
          jobQueued = true;
        }
        setFalJobs(prev => {
          const hasJob = prev.some(job => job.id === falJobId);
          if (!hasJob) {
            const newJob: FalQueueJob = {
              id: falJobId,
              prompt: videoPromptForRequest,
              modelId: falModelIdForRun,
              modelLabel: jobModelLabel,
              provider: 'fal',
              retryInputs: buildFalVideoRetryInputs(),
              status: 'IN_QUEUE',
              phase: update.phase,
              phaseMessage: update.message,
              requestId: update.requestId,
              logs: [],
              phaseStartedAt: Date.now(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            return [...prev.slice(-9), newJob];
          }
          return prev.map(job => (
            job.id === falJobId
              ? applyFalPhaseUpdateToJob(
                retryJobId && !wasJobQueued && job.status === 'FAILED'
                  ? {
                    id: falJobId,
                    prompt: videoPromptForRequest,
                    modelId: falModelIdForRun,
                    modelLabel: jobModelLabel,
                    provider: 'fal',
                    retryInputs: buildFalVideoRetryInputs(),
                    status: 'IN_QUEUE',
                    logs: [],
                    phaseStartedAt: Date.now(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  }
                  : job,
                update,
              )
              : job
          ));
        });
      }; // Reflect service phase changes in the queue row.
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
          retryInputs: buildFalVideoRetryInputs(),
          status: 'IN_QUEUE',
          phase: 'submitting',
          phaseMessage: 'Preparing request...',
          logs: [],
          phaseStartedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        queueJob(newJob);
        addDebugLog({
          direction: 'outbound',
          source: 'fal',
          title: jobModelLabel,
          message: 'Submitting request',
          data: { jobId: falJobId, kind: 'video' },
        });
        jobQueued = true;
      };
      const failQueuedJob = (message: string) => {
        if (!jobQueued) {
          return;
        }
        setFalJobs(prev => prev.map(job => (
          job.id === falJobId
            ? {
              ...job,
              status: 'FAILED',
              phase: 'failed',
              phaseMessage: 'Request not submitted',
              error: message,
              updatedAt: Date.now(),
            }
            : job
        )));
      }; // Close provisional upload rows when validation stops submission.

      try {
        // In Kling O3 reference mode, ensure a still image is selected before generation.
        const primarySelection = primaryImageIdForRun ? images.find(img => img.id === primaryImageIdForRun) : null;
        if (isKlingO3ReferenceMode && primarySelection?.mediaType === 'video') {
          setError('Kling O3 Reference requires a still image. Capture a frame from the video and select that snapshot instead.');
          return;
        }
        if (isWanAnimateVideoModel && primarySelection?.mediaType === 'video') {
          setError('Wan Animate Replace requires a still image. Capture a frame or upload an image.');
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

        if (isFalSeedance2VideoModelForRun || isFalSeedance25VideoModelForRun || isMiniMaxH3VideoModelForRun) {
          const multimodalModelLabel = isMiniMaxH3VideoModelForRun ? 'MiniMax H3' : isFalSeedance25VideoModelForRun ? 'Seedance 2.5' : 'Seedance 2';
          const referenceImageLimit = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_IMAGE_LIMIT : SEEDANCE_REFERENCE_IMAGE_LIMIT;
          const referenceVideoLimit = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_VIDEO_LIMIT : SEEDANCE_REFERENCE_VIDEO_LIMIT;
          const referenceAudioLimit = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_AUDIO_LIMIT : SEEDANCE_REFERENCE_AUDIO_LIMIT;
          const referenceTotalLimit = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT : SEEDANCE_REFERENCE_TOTAL_FILE_LIMIT;
          const referenceMinDuration = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_MEDIA_MIN_DURATION_SECONDS : SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS;
          const referenceMaxDuration = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS : SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS;
          const referenceVideoTotalDurationLimit = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS : SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS;
          const referenceAudioTotalDurationLimit = isFalSeedance25VideoModelForRun ? SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS : SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS;
          const referenceAssetCount = referenceImageIdsForRun.length + referenceVideoIdsForRun.length + referenceAudioIdsForRun.length;
          const seedancePromptForRun = isMultimodalReferenceModeForRun
            ? normalizeSeedanceReferencePromptMentions(trimmedPrompt)
            : trimmedPrompt;
          videoPromptForRequest = seedancePromptForRun;

          if (!isMultimodalReferenceModeForRun && primarySelection && primarySelection.mediaType !== 'image') {
            setError(`${multimodalModelLabel} ${isMiniMaxH3VideoModelForRun ? 'Standard' : 'Smart'} uses a still image as the first frame. Select an image or clear the selection.`);
            return;
          }
          if (!isMultimodalReferenceModeForRun && videoLastFrameImageIdForRun && !activePrimary) {
            setError(`${multimodalModelLabel} first/last-frame mode requires a starting still image.`);
            return;
          }
          if (isMultimodalReferenceModeForRun && referenceAssetCount === 0) {
            setError(`${multimodalModelLabel} Reference requires at least one tagged reference asset.`);
            return;
          }
          if (isMultimodalReferenceModeForRun) {
            const promptMentionError = getSeedanceReferencePromptMentionError(seedancePromptForRun, {
              imageCount: referenceImageIdsForRun.length,
              videoCount: referenceVideoIdsForRun.length,
              audioCount: referenceAudioIdsForRun.length,
            }, multimodalModelLabel);
            if (promptMentionError) {
              setError(promptMentionError);
              return;
            }
          }
          if (isMultimodalReferenceModeForRun) {
            if (
              referenceImageIdsForRun.length > referenceImageLimit
              || referenceVideoIdsForRun.length > referenceVideoLimit
              || referenceAudioIdsForRun.length > referenceAudioLimit
            ) {
              setError(`${multimodalModelLabel} Reference supports up to ${referenceImageLimit} images, ${referenceVideoLimit} videos, and ${referenceAudioLimit} audio clips.`);
              return;
            }
            if (referenceAssetCount > referenceTotalLimit) {
              setError(`${multimodalModelLabel} Reference supports up to ${referenceTotalLimit} total reference files.`);
              return;
            }
            if (referenceAudioIdsForRun.length > 0 && referenceImageIdsForRun.length + referenceVideoIdsForRun.length === 0) {
              setError(`${multimodalModelLabel} audio references require at least one image or video reference.`);
              return;
            }

            seedanceReferenceImageCanvasItems = referenceImageIdsForRun
              .map(id => images.find(img => img.id === id))
              .filter(isImageCanvasMedia);
            if (seedanceReferenceImageCanvasItems.length !== referenceImageIdsForRun.length) {
              setError(`${multimodalModelLabel} image references must be still images.`);
              return;
            }

            seedanceReferenceVideoCanvasItems = referenceVideoIdsForRun
              .map(id => images.find(img => img.id === id))
              .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'video'));
            if (seedanceReferenceVideoCanvasItems.length !== referenceVideoIdsForRun.length) {
              setError(`${multimodalModelLabel} video references must be videos on the canvas.`);
              return;
            }
            if (isFalSeedance25VideoModelForRun) {
              const referenceVideoFileErrors = await Promise.all(seedanceReferenceVideoCanvasItems.map(async item => {
                const hasReliableDimensions = Number.isFinite(item.naturalWidth)
                  && Number.isFinite(item.naturalHeight)
                  && item.naturalWidth > 0
                  && item.naturalHeight > 0;
                return getSeedance25VideoReferenceFileError(
                  item.file,
                  hasReliableDimensions ? item.naturalWidth : undefined,
                  hasReliableDimensions ? item.naturalHeight : undefined,
                  await readIsoBmffVideoFrameRate(item.file),
                );
              })); // File metadata is available without materializing snapshot-backed video bytes.
              const referenceVideoFileError = referenceVideoFileErrors.find(Boolean);
              if (referenceVideoFileError) {
                setError(referenceVideoFileError);
                return;
              }
            }
            const referenceVideoDurations = await Promise.all(seedanceReferenceVideoCanvasItems.map(resolveCanvasMediaDurationSeconds)); // Fal validates persisted or on-demand durations.
            if (referenceVideoDurations.some(durationSeconds => durationSeconds === null || durationSeconds < referenceMinDuration || durationSeconds > referenceMaxDuration)) {
              setError(`${multimodalModelLabel} reference videos must each be between ${referenceMinDuration} and ${referenceMaxDuration} seconds.`);
              return;
            }
            const totalReferenceVideoDurationSeconds = referenceVideoDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
            if (totalReferenceVideoDurationSeconds > referenceVideoTotalDurationLimit) {
              setError(`${multimodalModelLabel} reference videos must total ${referenceVideoTotalDurationLimit} seconds or less.`);
              return;
            }

            seedanceReferenceAudioCanvasItems = referenceAudioIdsForRun
              .map(id => images.find(img => img.id === id))
              .filter((img): img is CanvasImage => Boolean(img && img.mediaType === 'audio'));
            if (seedanceReferenceAudioCanvasItems.length !== referenceAudioIdsForRun.length) {
              setError(`${multimodalModelLabel} audio references must be audio clips on the canvas.`);
              return;
            }
            const referenceAudioDurations = seedanceReferenceAudioCanvasItems.map(getCanvasMediaDurationSeconds); // Fal Seedance validates these per-model audio duration limits remotely too.
            if (referenceAudioDurations.some(durationSeconds => durationSeconds === null || durationSeconds < referenceMinDuration || durationSeconds > referenceMaxDuration)) {
              setError(`${multimodalModelLabel} reference audio clips must each be between ${referenceMinDuration} and ${referenceMaxDuration} seconds.`);
              return;
            }
            const totalReferenceAudioDurationSeconds = referenceAudioDurations.reduce((totalDurationSeconds, durationSeconds) => totalDurationSeconds + (durationSeconds ?? 0), 0);
            if (totalReferenceAudioDurationSeconds > referenceAudioTotalDurationLimit) {
              setError(`${multimodalModelLabel} reference audio clips must total ${referenceAudioTotalDurationLimit} seconds or less.`);
              return;
            }
          }

          if (isFalSeedance2VideoModelForRun) {
            const seedanceRequestKey = buildSeedance2RequestKey({
              provider: generationProviderForRun,
              modelId: falModelIdForRun,
              prompt: seedancePromptForRun,
              variant: seedance2VariantForRun,
              aspectRatio: seedance2AspectRatioForRun,
              resolution: falSeedance2ResolutionForRun,
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
          if (isFalSeedance25VideoModelForRun) {
            const seedanceRequestKey = buildSeedance2RequestKey({
              provider: generationProviderForRun,
              modelId: falModelIdForRun,
              prompt: seedancePromptForRun,
              variant: seedance25VariantForRun,
              aspectRatio: seedance25AspectRatioForRun,
              resolution: seedance25ResolutionForRun,
              duration: seedance25DurationForRun,
              generateAudio: seedance25GenerateAudioForRun,
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
        }

        // For video-input modes (Kling O3 edit, Grok edit-video, Wan modes), get source video URL; other modes use a still first frame.
        let sourceVideo: CanvasImage | null = null;
        let sourceVideoUrlForRequest: string | undefined;
        if (isKlingO3VideoInputMode || isFalVideoInputMode || isGrokImagineVideoEditMode) {
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
                            : 'Select a video on the canvas to edit.');
          }
          if (isWanVisionEnhancerVideoModel) {
            const durationSeconds = await resolveOptionalCanvasMediaDurationSeconds(sourceVideo);
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
            sourceVideoUrlForRequest = await uploadVideoToFal(await ensureRealSnapshotFile(sourceVideo.file), {
              jobId: falJobId,
              onPhaseUpdate: handleFalPhaseUpdate,
              label: 'source video',
            });
            setToastMessage(null);
          }
        } else if (!activePrimary && !isKlingV3VideoModel && !isWan27VideoModelForRun && !isMiniMaxH3VideoModelForRun && !isFlux3VideoModelForRun && !(isFalSeedance2VideoModelForRun && (seedance2VariantForRun === 'smart' || isSeedance2ReferenceModeForRun)) && !isFalSeedance25VideoModelForRun) {
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
          const realSourceAudioFile = await ensureRealSnapshotFile(sourceAudio.file);
          const audioFileForUpload = realSourceAudioFile.type === 'audio/webm'
            ? new File([await convertAudioBlobToWav(realSourceAudioFile)], `fal-audio-${Date.now()}.wav`, { type: 'audio/wav' })
            : realSourceAudioFile;
          setToastMessage('Uploading audio...');
          sourceAudioUrlForRequest = await uploadVideoToFal(audioFileForUpload, {
            jobId: falJobId,
            onPhaseUpdate: handleFalPhaseUpdate,
            label: 'source audio',
          });
          setToastMessage(null);
        }

        if (isHeygenV3LipsyncVideoModel && trimmedUserPrompt && !heygenTimingResolvedForRequest) {
          const videoDurationSeconds = sourceVideo ? await resolveOptionalCanvasMediaDurationSeconds(sourceVideo) : null;
          setToastMessage('Reading HeyGen timing intent...');
          try {
            const clipIntent = await extractHeygenClipIntent(trimmedUserPrompt, {
              videoDurationSeconds: typeof videoDurationSeconds === 'number' && Number.isFinite(videoDurationSeconds)
                ? videoDurationSeconds
                : undefined,
            });
            heygenStartTimeForRequest = clipIntent.startTime;
            heygenEndTimeForRequest = clipIntent.endTime;
            heygenTimingResolvedForRequest = true;
            refreshQueuedFalVideoRetryInputs();
          } finally {
            setToastMessage(null);
          }
        }

        const videoSourceImage = ((isFalSeedance2VideoModelForRun || isFalSeedance25VideoModelForRun || isMiniMaxH3VideoModelForRun || isFlux3KeyframesModeForRun) && (!activePrimary || isMultimodalReferenceModeForRun)) || isWan27ReferenceModeForRun
          ? null
          : (isWanAnimateVideoModel || isKlingV3ControlVideoModel || isScailVideoModel)
            ? activePrimary?.element as HTMLImageElement
            : (isKlingO3VideoInputMode || isFalVideoInputMode || isGrokImagineVideoEditMode) ? null : (activePrimary?.element as HTMLImageElement | undefined) ?? null;
        const referenceImagesForRun = referenceImageIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia)
          .map(img => img.element as HTMLImageElement);
        const seedanceReferenceVideoFilesForRun = isMultimodalReferenceModeForRun
          ? isFalSeedance25VideoModelForRun
            ? seedanceReferenceVideoCanvasItems.map(img => img.file) // Fal materializes these lazily inside its bounded upload pool.
            : await Promise.all(seedanceReferenceVideoCanvasItems.map(async (img, index) => {
              const realFile = await ensureRealSnapshotFile(img.file);
              return new File([realFile], img.file.name || `seedance2-fal-reference-video-${index + 1}.mp4`, { type: img.file.type || 'video/mp4' });
            }))
          : [];
        const wan27ReferenceVideoFilesForRun = isWan27ReferenceModeForRun
          ? await Promise.all(wan27ReferenceVideoCanvasItems.map(async (img, index) => {
            const realFile = await ensureRealSnapshotFile(img.file);
            return new File([realFile], img.file.name || `wan27-reference-video-${index + 1}.mp4`, { type: img.file.type || 'video/mp4' });
          }))
          : [];
        const seedanceReferenceAudioFilesForRun = isMultimodalReferenceModeForRun
          ? isFalSeedance25VideoModelForRun
            ? seedanceReferenceAudioCanvasItems.map(img => img.file) // Fal prepares these lazily inside the bounded Seedance 2.5 upload pool.
            : await Promise.all(seedanceReferenceAudioCanvasItems.map(async (img, index) => {
              const realFile = await ensureRealSnapshotFile(img.file);
              if (realFile.type === 'audio/webm') {
                const wavBlob = await convertAudioBlobToWav(realFile);
                return new File([wavBlob], `seedance2-fal-reference-audio-${index + 1}.wav`, { type: 'audio/wav' });
              }
              return new File([realFile], img.file.name || `seedance2-fal-reference-audio-${index + 1}`, { type: img.file.type || 'audio/mpeg' });
            }))
          : [];
        const elementImagesForRun = elementImageIdsForRun
          .map(id => images.find(img => img.id === id))
          .filter(isImageCanvasMedia)
          .map(img => img.element as HTMLImageElement);
        if (isFlux3KeyframesModeForRun && referenceImagesForRun.length !== referenceImageIdsForRun.length) {
          const message = 'Flux 3 Keyframes supports still images only.';
          failQueuedJob(message);
          setError(message);
          return;
        }
        if (isKlingO3VideoModel) {
          if (referenceImagesForRun.length !== referenceImageIdsForRun.length) {
            const message = 'Reference images must be still images.';
            failQueuedJob(message);
            setError(message);
            return;
          }
          if (elementImagesForRun.length !== elementImageIdsForRun.length) {
            const message = 'Element images must be still images.';
            failQueuedJob(message);
            setError(message);
            return;
          }
          const maxSupportImages = getMaxReferenceImages(falModelIdForRun);
          const totalImageCount = referenceImagesForRun.length + elementImagesForRun.length;
          if (totalImageCount > maxSupportImages) {
            const message = `Kling O3 Video ${isKlingO3EditMode ? 'Edit' : 'Reference'} supports up to 4 images total (references + elements).`;
            failQueuedJob(message);
            setError(message);
            return;
          }
        }
        if (isWan27ReferenceModeForRun && referenceImagesForRun.length !== referenceImageIdsForRun.length) {
          const message = 'Wan 2.7 image references must be still images.';
          failQueuedJob(message);
          setError(message);
          return;
        }
        if (isWan27EditModeForRun) {
          if (referenceImagesForRun.length !== referenceImageIdsForRun.length) {
            const message = 'Wan 2.7 Edit reference must be a still image.';
            failQueuedJob(message);
            setError(message);
            return;
          }
          if (referenceImagesForRun.length > 1) {
            const message = 'Wan 2.7 Edit supports one reference image.';
            failQueuedJob(message);
            setError(message);
            return;
          }
          if (referenceVideoIdsForRun.length > 0 || referenceAudioIdsForRun.length > 0) {
            const message = 'Wan 2.7 Edit supports one still reference image.';
            failQueuedJob(message);
            setError(message);
            return;
          }
        }
        let videoTailImageElement: HTMLImageElement | null = null;
        const supportsTailFrame = (isKlingVideoModel && klingVariantForRun === 'pro') || isKlingV3VideoModel || isKlingO3ReferenceMode || isVeo31TailCapable || isFlux3FflfModeForRun || (isWan27VideoModelForRun && !isWan27ReferenceModeForRun && !isWan27EditModeForRun) || isSeedance15VideoModel || (isFalSeedance2VideoModelForRun && seedance2VariantForRun === 'smart') || (isFalSeedance25VideoModelForRun && seedance25VariantForRun === 'smart') || (isMiniMaxH3VideoModelForRun && miniMaxH3VariantForRun === 'standard'); // Allow end-frame input for tail-capable variants.
        if (supportsTailFrame && videoLastFrameImageIdForRun) {
          const tailFrame = images.find(img => img.id === videoLastFrameImageIdForRun);
          if (!isImageCanvasMedia(tailFrame)) {
            const message = 'Select a still image on the canvas to use as the ending frame.';
            failQueuedJob(message);
            setError(message);
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
        const videoModelIdForRequest = actualKlingModelId
          ?? actualKlingO3ModelId
          ?? actualKlingV3ControlModelId
          ?? actualWanAnimateModelId
          ?? actualVeo31ModelId
          ?? actualGrokImagineVideoModelId
          ?? falVideoModelIdForRun;
        const durationForRequest = isKlingVideoModel ? videoDurationForRun : undefined;
        const negativePromptForRequest =
          (isKlingVideoModel || isKlingV3VideoModel || isWanVisionEnhancerVideoModel || isVeo31VideoModelForRun || isWan27VideoModelForRun) && hasVideoNegativePrompt
            ? normalizedVideoNegativePrompt
            : undefined;
        const keepOriginalSoundForRequest = isKlingV3ControlVideoModel ? klingV3ControlKeepSoundForRun : undefined;
        const characterOrientationForRequest = isKlingV3ControlVideoModel ? klingV3ControlOrientationForRun : undefined;
        const videoResult = await generateFalImageToVideo(videoPromptForRequest, videoSourceImage, {
          jobId: falJobId,
          onPhaseUpdate: handleFalPhaseUpdate,
          modelId: videoModelIdForRequest,
          duration: durationForRequest,
          negativePrompt: negativePromptForRequest,
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
          ...(isKlingO3VideoModel ? {
            referenceImages: referenceImagesForRun,
            elementImages: elementImagesForRun,
            klingO3Variant: klingO3VariantForRun,
            klingO3Duration: klingO3DurationForRun,
            klingO3GenerateAudio: klingO3GenerateAudioForRun,
            ...(isKlingO3VideoInputMode ? {
              sourceVideoUrl: sourceVideoUrlForRequest,
              klingO3KeepAudio: klingO3KeepAudioForRun,
            } : {
              aspectRatio: isKlingO3AspectRatioSelectionValue(falAspectRatioSelectionForRun) ? falAspectRatioSelectionForRun : '16:9',
            }),
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
          ...(isMiniMaxH3VideoModelForRun ? {
            miniMaxH3Variant: miniMaxH3VariantForRun,
            miniMaxH3AspectRatio: miniMaxH3AspectRatioForRun,
            miniMaxH3Duration: miniMaxH3DurationForRun,
            ...(isMiniMaxH3ReferenceModeForRun ? {
              referenceImages: referenceImagesForRun,
              referenceVideos: seedanceReferenceVideoFilesForRun,
              referenceAudios: seedanceReferenceAudioFilesForRun,
            } : {}),
          } : {}),
          ...(isFlux3VideoModelForRun ? {
            flux3Variant: flux3VariantForRun,
            flux3AspectRatio: flux3AspectRatioForRun,
            flux3Resolution: flux3ResolutionForRun,
            flux3Duration: flux3DurationForRun,
            flux3GenerateAudio: flux3GenerateAudioForRun,
            ...(isFlux3KeyframesModeForRun ? {
              referenceImages: referenceImagesForRun,
              flux3KeyframeTimestampsSeconds: flux3RunPlan.keyframeTimings.map(timing => timing.timestampSeconds),
            } : {}),
            ...(isFlux3ExtendModeForRun ? { sourceVideoUrl: sourceVideoUrlForRequest } : {}),
          } : {}),
          ...(isSeedance15VideoModel ? {
            seedance15AspectRatio: seedance15AspectRatioForRun,
            seedance15Resolution: seedance15ResolutionForRun,
            seedance15Duration: seedance15DurationForRun,
            seedance15CameraFixed: seedance15CameraFixedForRun,
            seedance15Audio: seedance15AudioForRun,
            ...(videoTailImageElement ? { tailImage: videoTailImageElement } : {}),
          } : {}),
          ...(isFalSeedance2VideoModelForRun ? {
            seedance2Variant: seedance2VariantForRun === 'reference' ? 'reference' : 'smart', // FAL only supports Smart/Reference; Volcengine-only Edit/Extend never route here.
            seedance2AspectRatio: seedance2AspectRatioForRun,
            seedance2Resolution: falSeedance2ResolutionForRun,
            seedance2Duration: seedance2DurationForRun,
            seedance2GenerateAudio: seedance2GenerateAudioForRun,
            ...(isSeedance2ReferenceModeForRun ? {
              referenceImages: referenceImagesForRun,
              referenceVideos: seedanceReferenceVideoFilesForRun,
              referenceAudios: seedanceReferenceAudioFilesForRun,
            } : {}),
          } : {}),
          ...(isFalSeedance25VideoModelForRun ? {
            seedance25Variant: seedance25VariantForRun,
            seedance25AspectRatio: seedance25AspectRatioForRun,
            seedance25Resolution: seedance25ResolutionForRun,
            seedance25Duration: seedance25DurationForRun,
            seedance25GenerateAudio: seedance25GenerateAudioForRun,
            ...(isSeedance25ReferenceModeForRun ? {
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
            status: 'IN_PROGRESS',
            phase: 'downloading',
            phaseMessage: 'Downloading generated video...',
            requestId: videoResult.requestId || job.requestId,
            outputUrl: videoResult.videoUrl,
            updatedAt: Date.now(),
          };
        }));

        try {
          handleFalPhaseUpdate({
            phase: 'downloading',
            message: 'Downloading generated video...',
            requestId: videoResult.requestId,
          });
          const videoBlob = await fetchGeneratedVideoBlob(videoResult.videoUrl, `${jobModelLabel} result`);
          const debugContext: GeneratedMediaDebugContext = {
            source: 'fal',
            modelLabel: jobModelLabel,
            jobId: falJobId,
            requestId: videoResult.requestId,
          };
          logGeneratedVideoDownloaded(debugContext, videoBlob);
          const fileType = videoBlob.type || 'video/mp4';
          const extension = getVideoFileExtension(fileType);
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
            || (isFalSeedance2VideoModelForRun && seedance2GenerateAudioForRun)
            || (isFalSeedance25VideoModelForRun && seedance25GenerateAudioForRun)
            || isMiniMaxH3VideoModelForRun
            || (isFlux3VideoModelForRun && flux3GenerateAudioForRun); // Saved audio settings cover browsers without track introspection.

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
                primaryImageId: isWan27ReferenceModeForRun || isMultimodalReferenceModeForRun ? undefined : primaryImageIdForRun ?? undefined,
                ...(shouldPersistReferenceInputsForRun && referenceImageIdsForRun.length ? { referenceImageIds: referenceImageIdsForRun } : {}),
                ...(shouldPersistReferenceInputsForRun && referenceVideoIdsForRun.length ? { referenceVideoIds: referenceVideoIdsForRun } : {}),
                ...(shouldPersistReferenceInputsForRun && referenceAudioIdsForRun.length ? { referenceAudioIds: referenceAudioIdsForRun } : {}),
                ...(elementImageIdsForRun.length ? { elementImageIds: elementImageIdsForRun } : {}),
                ...(activePrimary?.metadata?.generation?.originalSourceImageId
                  ? { originalSourceImageId: activePrimary.metadata.generation.originalSourceImageId }
                  : primaryImageIdForRun && !isWan27ReferenceModeForRun && !isMultimodalReferenceModeForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                ...(videoLastFrameIdForMetadata ? { videoLastFrameImageId: videoLastFrameIdForMetadata } : {}),
                ...((isKlingO3VideoInputMode || isFalVideoInputMode) && sourceVideoIdForRun ? { sourceVideoId: sourceVideoIdForRun } : {}),
                ...(sourceAudioIdForMetadata ? { sourceAudioId: sourceAudioIdForMetadata } : {}),
                falOptions: buildVideoFalOptionsForRun(),
              },
            },
          };

          setState(prev => ({
            ...prev,
            images: [...prev.images, newVideo],
          }));
          logGeneratedMediaAppended(debugContext, 'video', [newVideo.id]);
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
              phase: 'completed',
              phaseMessage: 'Video ready',
              description: 'Video ready',
              updatedAt: Date.now(),
            };
          }));
          onGenerationPlaced?.({ mediaIds: [newVideo.id], mediaType: 'video', modelLabel: jobModelLabel });
          // Let autosave know a generation completed successfully.
          onGenerationComplete?.();
        } catch (loadErr) {
          console.error('Failed to load generated video into canvas', loadErr);
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
              phase: 'completed',
              phaseMessage: 'Video ready',
              description: 'Video ready',
              updatedAt: Date.now(),
            };
          }));
          setToastMessage('Video ready! Open from the Fal Queue panel.');
          setTimeout(() => setToastMessage(null), 2000);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        const errorPhase = getFalErrorPhase(err);
        const errorRequestId = getFalErrorRequestId(err);
        const userFacingMessage = buildFalDisplayError(message, undefined, {
          phase: errorPhase,
          hasRequestId: Boolean(errorRequestId),
        }) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE;

        if (jobQueued) {
          setFalJobs(prev => prev.map(job => {
            if (job.id !== falJobId) {
              return job;
            }
            return {
              ...job,
              status: 'FAILED',
              phase: 'failed',
              phaseMessage: errorPhase === 'uploading' ? 'Upload failed' : 'Generation failed',
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
      && (isSeedreamModel || isNanoBananaModel || isGrokImagineModel || isGptImage2ModelForRun); // Include image-count models.
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
        if (editAppModeForRun === 'CANVAS' && editToolForRun !== Tool.SELECTION && editToolForRun !== Tool.FREE_SELECTION) {
          setError('In Canvas Mode, please use the Select tool to perform a general image edit.');
          return;
        }

      }
    }

    if (shouldValidateFalOptions && isNumImagesInvalid) {
      setError(`Number of images must be between 1 and ${falNumImageMaxForRun}.`);
      return;
    }

    const falJobId = usingFal ? retryJobId ?? crypto.randomUUID() : null;
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
    // Single source of truth for the per-model image options replayed on retry and saved in
    // generation metadata. Krea2 style strengths depend on which reference ids the caller uses.
    const buildImageFalOptionsForRun = (referenceIdsForStrengths: string[]): GenerationFalOptions => ({
      ...(isKrea2LargeModelForRun ? { aspectRatioSelection: krea2AspectRatioForRun } : falAspectRatioSelectionForRun ? { aspectRatioSelection: falAspectRatioSelectionForRun } : {}),
      ...(normalizedFalImageSizeSelectionForRun ? { imageSizeSelection: normalizedFalImageSizeSelectionForRun } : {}),
      ...(falResolutionSelectionForRun ? { resolutionSelection: falResolutionSelectionForRun } : {}),
      ...(isFlux2MaxModelForRun ? { flux2MaxImageSize: flux2MaxImageSizeForRun } : {}),
      ...(isGptImage2ModelForRun ? { gptImage2Quality: gptImage2QualityForRun } : {}),
      ...(isKrea2LargeModelForRun ? {
        krea2Creativity: krea2CreativityForRun,
        krea2StyleReferenceStrengths: Object.fromEntries(referenceIdsForStrengths.map(id => [id, normalizeKrea2StyleStrength(krea2StrengthsForRun[id])])),
      } : {}),
      ...(generationKind === 'upscale' ? { scaleFactor: falScaleFactorForRun } : {}),
      ...(isSeedvrUpscaleModel ? { noiseScale: falNoiseScaleForRun } : {}),
      ...(isCrystalUpscaleModel ? { creativity: falCreativityForRun } : {}),
      ...(isRecraftV4ProModelForRun ? {
        recraftImageSize: recraftImageSizeForRun,
        recraftBackgroundColor: recraftBackgroundColorForRun,
        recraftColors: recraftColorsForRun,
      } : {}),
      ...(isWan27ImageModelForRun ? {
        wan27ImageAspectRatio: wan27ImageAspectRatioForRun,
        wan27ImageMaxImages: wan27ImageMaxImagesForRun,
        negativePrompt: videoNegativePromptForRun.trim() || undefined,
      } : {}),
      ...(normalizedFalNumImages ? { numImages: normalizedFalNumImages } : {}),
    });
    const imageRetryInputs: GenerationInputs = {
      kind: generationKind,
      prompt: trimmedPrompt,
      provider: generationProviderForRun,
      modelId: falModelIdForRun,
      modelLabel: generationModelLabel,
      modelMode: falModelModeForRun,
      ...(primaryImageIdForRun ? { primaryImageId: primaryImageIdForRun } : {}),
      ...(referenceImageIdsForRun.length ? { referenceImageIds: referenceImageIdsForRun } : {}),
      ...(videoLastFrameImageIdForRun ? { videoLastFrameImageId: videoLastFrameImageIdForRun } : {}),
      ...(primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
      ...(generationKind === 'image_edit' && isReplayableImageEditTool(editToolForRun) ? {
        editAppMode: editAppModeForRun,
        editTool: editToolForRun,
        editPaths: clonePathsForRetry(editPathsForRun),
      } : {}),
      falOptions: buildImageFalOptionsForRun(referenceImageIdsForRun),
    }; // Queue retry mirrors generated-image metadata before output exists.
    const retryableImageInputs = usingFal ? imageRetryInputs : undefined; // Fal image jobs can replay saved request inputs.
    const handleFalPhaseUpdate = (update: FalPhaseUpdate) => {
      if (!falJobId) {
        return;
      }
      setFalJobs(prev => prev.map(job => (
        job.id === falJobId ? applyFalPhaseUpdateToJob(job, update) : job
      )));
    }; // Reflect service phase changes in the queue row.

    if (usingFal && falJobId) {
      const newJob: FalQueueJob = {
        id: falJobId,
        prompt: jobPromptDescription,
        modelId: falModelIdForRun,
        modelLabel: jobModelLabel,
        provider: 'fal',
        ...(retryableImageInputs ? { retryInputs: retryableImageInputs } : {}),
        status: 'IN_QUEUE',
        phase: 'submitting',
        phaseMessage: 'Preparing request...',
        logs: [],
        phaseStartedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      queueJob(newJob);
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
      setFalImageSizeSelection(isSeedreamV5LiteModelId(falModelIdForRun) || isSeedreamV5ProModelId(falModelIdForRun) ? 'auto_2K' : 'default');
    }
    if (rawFalAspectRatioSelection === 'placeholder' && !falOptionsOverride.aspectRatioSelection) {
      setFalAspectRatioSelection(isGrokImagineModel ? '1:1' : 'default'); // Grok uses 1:1 default.
    }

    let referenceIdsUsed: string[] = [];

    try {
      let generationResult: FalImageGenerationResult;
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
              : isKrea2LargeModelForRun
                ? KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID
                : isFlux2MaxModelForRun
                  ? FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID
                  : isWan27ImageModelForRun
                    ? WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID
                    : isRecraftV4ProModelForRun
                      ? RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID
                      : isGptImage2ModelForRun
                        ? getGptImage2TextToImageModelId(falModelIdForRun)
                        : isNanoBananaModel
                          ? getNanoBananaTextToImageModelId(falModelIdForRun)
                          : NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
          const krea2AllReferenceCanvasImages = isKrea2LargeModelForRun
            ? referenceImageIdsForRun
              .map(id => images.find(img => img.id === id))
              .filter((img): img is CanvasImage & { element: HTMLImageElement } => isImageCanvasMedia(img))
            : [];
          if (isKrea2LargeModelForRun && krea2AllReferenceCanvasImages.length !== referenceImageIdsForRun.length) {
            throw new Error('Krea 2 Large style references must be still images.');
          }
          const krea2ReferenceCanvasImages = krea2AllReferenceCanvasImages.slice(0, getMaxReferenceImages(falModelIdForRun));
          const krea2StyleReferences = krea2ReferenceCanvasImages.map(img => ({
            image: img.element,
            strength: normalizeKrea2StyleStrength(krea2StrengthsForRun[img.id]),
          }));
          if (isKrea2LargeModelForRun) {
            referenceIdsUsed = krea2ReferenceCanvasImages.map(img => img.id);
          }

          const falResult = await generateFalImage(trimmedPrompt, {
            jobId: falJobId,
            onPhaseUpdate: handleFalPhaseUpdate,
            onQueueUpdate: (update) => {
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }
                return applyFalQueueUpdateToJob(job, update);
              }));
            },
            modelId: textToImageModelId,
            aspectRatio: isKrea2LargeModelForRun
              ? krea2AspectRatioForRun
              : (isNanoBananaModel || isSeedreamModel || isGrokImagineModel)
              ? (isGrokImagineModel ? grokAspectRatioForRun : falAspectRatioSelectionForRun)
              : 'default', // Include Grok aspect ratios.
            ...(isNanoBananaModel ? { resolution: falResolutionSelectionForRun } : {}),
            ...(isGptImage2ModelForRun ? { imageSize: normalizedFalImageSizeSelectionForRun, gptImage2Quality: gptImage2QualityForRun } : {}),
            ...(isKrea2LargeModelForRun ? { krea2Creativity: krea2CreativityForRun, imageStyleReferences: krea2StyleReferences } : {}),
            ...(isSeedreamModel ? { imageSize: normalizedFalImageSizeSelectionForRun } : {}),
            ...(isFlux2MaxModelForRun ? { flux2MaxImageSize: flux2MaxImageSizeForRun } : {}),
            ...(isWan27ImageModelForRun ? {
              wan27ImageSize: wan27ImageAspectRatioForRun,
              wan27ImageMaxImages: wan27ImageMaxImagesForRun,
              negativePrompt: videoNegativePromptForRun.trim() || undefined,
            } : {}),
            ...(isRecraftV4ProModelForRun ? {
              recraftImageSize: recraftImageSizeForRun,
              recraftBackgroundColor: recraftBackgroundColorForRun,
              recraftColors: recraftColorsForRun,
            } : {}),
            ...(!isKrea2LargeModelForRun ? { numImages: normalizedFalNumImages } : {}),
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
              phase: 'completed',
              phaseMessage: 'Image ready',
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
                { jobId: falJobId, onPhaseUpdate: handleFalPhaseUpdate, onQueueUpdate },
              )
              : await upscaleFalCrystalImage(
                sourceImageForAPI.element,
                falScaleFactorForRun,
                falCreativityForRun,
                { jobId: falJobId, onPhaseUpdate: handleFalPhaseUpdate, onQueueUpdate },
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
                phase: 'completed',
                phaseMessage: 'Image ready',
                requestId: falUpscaleResult.requestId || job.requestId,
                description: falUpscaleResult.text,
                updatedAt: Date.now(),
              };
            }));
          } else {
            const hasEditReferences = referenceImageIdsForRun.length > 0;
            const supportsEditReferenceImages = isNanoBananaModel || isSeedreamModel || isGptImage2ModelForRun || isFlux2MaxModelForRun || isWan27ImageModelForRun;
            let editReferenceImages: HTMLImageElement[] | undefined;
            if (supportsEditReferenceImages && hasEditReferences) {
              const maxReferenceImages = Math.max(0, getMaxReferenceImages(falModelIdForRun) - (isGptImage2ModelForRun && editToolForRun === Tool.ANNOTATE ? 1 : 0)); // Annotate uploads an extra canvas.
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
              tool: editToolForRun,
              paths: editPathsForRun,
              imageDimensions: editImageDimensions,
              referenceImages: editReferenceImages,
            }, {
              jobId: falJobId,
              onPhaseUpdate: handleFalPhaseUpdate,
              modelId: falModelIdForRun,
              ...(falAspectRatioSelectionForRun ? { aspectRatio: falAspectRatioSelectionForRun } : {}),
              ...(normalizedFalImageSizeSelectionForRun ? { imageSize: normalizedFalImageSizeSelectionForRun } : {}),
              ...(falResolutionSelectionForRun ? { resolution: falResolutionSelectionForRun } : {}),
              ...(isGptImage2ModelForRun ? { gptImage2Quality: gptImage2QualityForRun } : {}),
              ...(isWan27ImageModelForRun ? {
                wan27ImageSize: wan27ImageAspectRatioForRun,
                wan27ImageMaxImages: wan27ImageMaxImagesForRun,
                negativePrompt: videoNegativePromptForRun.trim() || undefined,
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
                phase: 'completed',
                phaseMessage: 'Image ready',
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
            tool: editToolForRun,
            paths: editPathsForRun,
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
                ...(generationKind === 'image_edit' && isReplayableImageEditTool(editToolForRun) ? {
                  editAppMode: editAppModeForRun,
                  editTool: editToolForRun,
                  editPaths: clonePathsForRetry(editPathsForRun),
                } : {}),
                ...(videoLastFrameImageIdForRun ? { videoLastFrameImageId: videoLastFrameImageIdForRun } : {}),
                ...(primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                falOptions: {
                  ...buildImageFalOptionsForRun(referenceIdsUsed),
                  // Saved metadata keeps video-model options too so legacy snapshot restores retain them.
                  ...(generationKind === 'video' ? { videoDuration: videoDurationForRun } : {}),
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
          logGeneratedMediaAppended({
            source: generationProviderForRun,
            modelLabel: generationModelLabel,
            ...(falJobId ? { jobId: falJobId } : {}),
            ...(generationResult.requestId ? { requestId: generationResult.requestId } : {}),
          }, 'image', newImages.map(image => image.id));
          onGenerationPlaced?.({
            mediaIds: newImages.map(image => image.id),
            mediaType: 'image',
            modelLabel: generationModelLabel,
          });
        }
      };

      await addGeneratedImages();
      // Let autosave know a generation completed successfully.
      onGenerationComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      const errorPhase = getFalErrorPhase(err);
      const errorRequestId = getFalErrorRequestId(err);
      const userFacingMessage = usingFal
        ? buildFalDisplayError(message, undefined, {
          phase: errorPhase,
          hasRequestId: Boolean(errorRequestId),
        }) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE
        : message;
      if (usingFal) {
        setFalJobs(prev => prev.map(job => {
          if (job.id === falJobId) {
            return {
              ...job,
              status: 'FAILED',
              phase: 'failed',
              phaseMessage: errorPhase === 'uploading' ? 'Upload failed' : 'Generation failed',
              error: userFacingMessage,
              updatedAt: Date.now(),
            };
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
    klingVariant,
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
    klingO3Variant,
    klingO3Duration,
    klingO3GenerateAudio,
    klingO3KeepAudio,
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
    miniMaxH3Variant,
    miniMaxH3AspectRatio,
    miniMaxH3Duration,
    isMiniMaxH3VideoModel,
    flux3Variant,
    flux3AspectRatio,
    flux3Resolution,
    flux3Duration,
    flux3GenerateAudio,
    flux3KeyframeTimings,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    seedance2Variant,
    seedance2JimengModelVersion,
    seedance2VolcengineModel,
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    seedance2OutputFormat,
    seedance25Variant,
    seedance25AspectRatio,
    seedance25Resolution,
    seedance25Duration,
    seedance25GenerateAudio,
    jimengMultiframeDuration,
    jimengMultiframeResolution,
    jimengSessionId,
    isSeedance15VideoModel,
    wan27ImageAspectRatio,
    wan27ImageMaxImages,
    isWan27ImageModel,
    recraftImageSize,
    recraftBackgroundColor,
    recraftColors,
    gptImage2Quality,
    krea2AspectRatio,
    krea2Creativity,
    krea2StyleReferenceStrengths,
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
    setToastMessage,
    onGenerationComplete,
    onGenerationPlaced,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
  ]);

  return {
    handleGenerate,
  };
};
