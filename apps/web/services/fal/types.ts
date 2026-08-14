import type {
  FalJobPhase,
  Tool,
  Path,
  ImageDimensions,
  FalGptImage2QualityOption,
  FalImageSizeOption,
  FalAspectRatioOption,
  FalKrea2CreativityOption,
  FalResolutionOption,
  FalVideoDuration,
  Flux3AspectRatio,
  Flux3Duration,
  Flux3Resolution,
  Flux3Variant,
} from '../../types'; // Shared app types.
import type {
  GrokImagineVideoAspectRatioSelectionValue,
  GrokImagineVideoDurationSelectionValue,
  GrokImagineVideoResolutionSelectionValue,
  KlingO3DurationSelectionValue,
  KlingV3CfgScaleSelectionValue,
  KlingV3DurationSelectionValue,
  KlingV3ShotDurationSelectionValue,
  InfinitalkDurationSelectionValue,
  LipsyncSyncMode,
  MiniMaxH3AspectRatioSelectionValue,
  MiniMaxH3DurationSelectionValue,
  MiniMaxH3Variant,
  RecraftRgbColor,
  RecraftV4ProImageSizeSelectionValue,
  Wan27VideoAudioSettingSelectionValue,
  Wan27VideoAspectRatioSelectionValue,
  Wan27VideoDurationSelectionValue,
  Wan27VideoResolutionSelectionValue,
  Wan27VideoVariant,
} from '../modelConfig'; // Model-specific option types.

export type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'CANCELED'; // Fal queue status enum.
export type FalQueueLogs = Array<{ message?: string }> | Record<string, unknown> | string | undefined; // Fal log payload shapes.

export interface FalQueueUpdate {
  requestId?: string; // Server-generated request id.
  status: FalQueueStatus; // Queue status string.
  position?: number; // Queue position when available.
  eta?: number; // Estimated seconds until completion.
  logs?: FalQueueLogs; // Raw log payloads from Fal.
  [key: string]: unknown; // Allow extra provider fields.
} // Normalized Fal queue update event.

export interface FalPhaseUpdate {
  phase: FalJobPhase; // Current phase in the Fal flow.
  message?: string; // Short detail suitable for queue rows.
  requestId?: string; // Fal request id when available.
  durationMs?: number; // Completed phase duration in milliseconds.
}

export interface FalPhaseOptions {
  jobId?: string; // UI queue job id for debug correlation.
  onPhaseUpdate?: (update: FalPhaseUpdate) => void; // Hook for phase changes.
}

export interface FalGeneratedImageMetadata {
  url: string; // Provider image URL or data URI.
  contentType?: string; // Returned MIME type when available.
  fileName?: string; // Provider file name when available.
  fileSize?: number; // File size in bytes when available.
  width?: number; // Natural output width in pixels.
  height?: number; // Natural output height in pixels.
} // Provider image metadata.

export interface FalImageGenerationResult {
  imageBase64: string; // Primary image payload.
  imagesBase64: string[]; // All image payloads.
  imageDataUrls?: string[]; // Inline image URLs preserving MIME type.
  imagesMetadata?: FalGeneratedImageMetadata[]; // Provider dimensions and file details.
  text: string; // Optional provider description or revised prompt.
  requestId?: string; // Fal request id when available.
} // Shared Fal image result.

export interface GenerateImageEditParams {
  prompt: string;
  image: HTMLImageElement;
  tool: Tool;
  paths: Path[];
  imageDimensions: ImageDimensions;
  referenceImages?: HTMLImageElement[];
} // Inputs for image edit workflows.

export interface GenerateImageEditOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void; // Hook for queue updates.
  onPhaseUpdate?: (update: FalPhaseUpdate) => void; // Hook for phase updates.
  jobId?: string; // UI queue job id for debug correlation.
  modelId?: string;
  imageSize?: FalImageSizeOption;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  resolution?: FalResolutionOption;
  gptImage2Quality?: FalGptImage2QualityOption;
  wan27ImageSize?: string;
  wan27ImageMaxImages?: string;
  negativePrompt?: string;
} // Optional controls for image edits.

export interface GenerateImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  onPhaseUpdate?: (update: FalPhaseUpdate) => void; // Hook for phase updates.
  jobId?: string; // UI queue job id for debug correlation.
  modelId?: string;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  imageSize?: FalImageSizeOption;
  seed?: number;
  resolution?: FalResolutionOption;
  referenceImages?: HTMLImageElement[];
  gptImage2Quality?: FalGptImage2QualityOption;
  krea2Creativity?: FalKrea2CreativityOption;
  imageStyleReferences?: Array<{ image: HTMLImageElement; strength: number }>;
  flux2MaxImageSize?: string;
  wan27ImageSize?: string;
  wan27ImageMaxImages?: string;
  negativePrompt?: string;
  recraftImageSize?: RecraftV4ProImageSizeSelectionValue;
  recraftBackgroundColor?: RecraftRgbColor;
  recraftColors?: RecraftRgbColor[];
} // Optional controls for text-to-image.

export interface UpscaleImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  onPhaseUpdate?: (update: FalPhaseUpdate) => void;
  jobId?: string;
} // Optional controls for upscaling.

export interface GenerateVideoOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  onPhaseUpdate?: (update: FalPhaseUpdate) => void;
  jobId?: string;
  promptOptimizer?: boolean;
  modelId?: string;
  duration?: FalVideoDuration | KlingO3DurationSelectionValue;
  negativePrompt?: string;
  numInferenceSteps?: number;
  resolution?: '480p' | '580p' | '720p';
  seed?: number;
  acceleration?: 'none' | 'regular' | 'high';
  shift?: number;
  videoQuality?: 'high' | 'maximum';
  useTurbo?: boolean;
  targetResolution?: '720p' | '1080p';
  creativity?: number;
  cfgScale?: number;
  tailImage?: HTMLImageElement;
  generateAudio?: boolean;
  referenceImages?: HTMLImageElement[];
  elementImages?: HTMLImageElement[];
  klingO3Variant?: string;
  klingO3Duration?: KlingO3DurationSelectionValue;
  klingO3GenerateAudio?: boolean;
  klingV3Duration?: KlingV3DurationSelectionValue;
  klingV3GenerateAudio?: boolean;
  klingV3CfgScale?: KlingV3CfgScaleSelectionValue;
  klingV3MultiPromptEnabled?: boolean;
  klingV3MultiPrompt?: string;
  klingV3Shot1Duration?: KlingV3ShotDurationSelectionValue;
  klingV3Shot2Duration?: KlingV3ShotDurationSelectionValue;
  sourceVideoUrl?: string;
  sourceAudioUrl?: string;
  keepAudio?: boolean;
  klingO3KeepAudio?: boolean;
  keepOriginalSound?: boolean;
  characterOrientation?: 'image' | 'video';
  aspectRatio?: FalAspectRatioOption;
  lipsyncSyncMode?: LipsyncSyncMode; // Sync v3 duration behavior.
  heygenEnableCaption?: boolean;
  heygenEnableDynamicDuration?: boolean;
  heygenDisableMusicTrack?: boolean;
  heygenEnableSpeechEnhancement?: boolean;
  heygenStartTime?: number;
  heygenEndTime?: number;
  infinitalkDuration?: InfinitalkDurationSelectionValue;
  grokImagineVideoDuration?: GrokImagineVideoDurationSelectionValue;
  grokImagineVideoResolution?: GrokImagineVideoResolutionSelectionValue;
  grokImagineVideoAspectRatio?: GrokImagineVideoAspectRatioSelectionValue;
  veo31Duration?: '4s' | '6s' | '8s' | '7s';
  veo31Resolution?: '720p' | '1080p' | '4k';
  veo31AspectRatio?: 'auto' | '16:9' | '9:16';
  veo31GenerateAudio?: boolean;
  wan27VideoResolution?: Wan27VideoResolutionSelectionValue;
  wan27VideoDuration?: Wan27VideoDurationSelectionValue;
  wan27VideoAspectRatio?: Wan27VideoAspectRatioSelectionValue;
  wan27VideoPromptExpansion?: boolean;
  wan27VideoVariant?: Wan27VideoVariant;
  wan27VideoAudioSetting?: Wan27VideoAudioSettingSelectionValue;
  miniMaxH3Variant?: MiniMaxH3Variant;
  miniMaxH3AspectRatio?: MiniMaxH3AspectRatioSelectionValue;
  miniMaxH3Duration?: MiniMaxH3DurationSelectionValue;
  flux3Variant?: Flux3Variant;
  flux3AspectRatio?: Flux3AspectRatio;
  flux3Resolution?: Flux3Resolution;
  flux3Duration?: Flux3Duration;
  flux3GenerateAudio?: boolean;
  flux3KeyframeTimestampsSeconds?: number[];
  seedance15AspectRatio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  seedance15Resolution?: '480p' | '720p' | '1080p';
  seedance15Duration?: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
  seedance15CameraFixed?: boolean;
  seedance15Audio?: boolean;
  seedance2Variant?: 'smart' | 'reference';
  seedance2AspectRatio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  seedance2Resolution?: '480p' | '720p' | '1080p';
  seedance2Duration?: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  seedance2GenerateAudio?: boolean;
  seedance25Variant?: 'smart' | 'reference';
  seedance25AspectRatio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  seedance25Resolution?: '480p' | '720p';
  seedance25Duration?: 'auto' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '29' | '30';
  seedance25GenerateAudio?: boolean;
  referenceVideos?: File[];
  referenceAudios?: File[];
} // Optional controls for the video generation models.

export interface RemoveBackgroundOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  onPhaseUpdate?: (update: FalPhaseUpdate) => void; // Hook for phase updates.
  jobId?: string; // UI queue job id for debug correlation.
} // Optional controls for background removal.
