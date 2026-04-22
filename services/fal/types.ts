import type {
  Tool,
  Path,
  ImageDimensions,
  FalImageSizeOption,
  FalAspectRatioOption,
  FalResolutionOption,
  FalVideoDuration,
} from '../../types'; // Shared app types.
import type {
  GrokImagineVideoAspectRatioSelectionValue,
  GrokImagineVideoDurationSelectionValue,
  GrokImagineVideoResolutionSelectionValue,
  KlingV3CfgScaleSelectionValue,
  KlingV3DurationSelectionValue,
  KlingV3ShotDurationSelectionValue,
  InfinitalkDurationSelectionValue,
  LipsyncSyncMode,
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
  modelId?: string;
  imageSize?: FalImageSizeOption;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  resolution?: FalResolutionOption;
  wan27ImageSize?: string;
  wan27ImageMaxImages?: string;
  negativePrompt?: string;
} // Optional controls for image edits.

export interface GenerateImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  modelId?: string;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  imageSize?: FalImageSizeOption;
  seed?: number;
  resolution?: FalResolutionOption;
  referenceImages?: HTMLImageElement[];
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
} // Optional controls for upscaling.

export interface GenerateVideoOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  promptOptimizer?: boolean;
  modelId?: string;
  duration?: FalVideoDuration;
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
  klingO1Variant?: string;
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
  referenceVideos?: File[];
  referenceAudios?: File[];
} // Optional controls for image-to-video.

export interface RemoveBackgroundOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
} // Optional controls for background removal.
