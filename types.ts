export enum Tool {
  SELECTION = 'SELECTION',
  PAN = 'PAN',
  ANNOTATE = 'ANNOTATE',
  BRUSH = 'BRUSH',
  FREE_SELECTION = 'FREE_SELECTION',
  NOTE = 'NOTE',
  ERASE = 'ERASE',
  VIDEO_PROMPT_AREA = 'VIDEO_PROMPT_AREA',
}

export type AppMode = 'CANVAS' | 'ANNOTATE';

export interface Point {
  x: number;
  y: number;
}

export interface Path {
  points: Point[];
  color: string;
  size: number;
  tool: Tool;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export type CanvasImageSource = 'generated' | 'imported' | 'snapshot' | 'derived';
export type ApiProviderId = 'google' | 'fal';
export type GenerationProviderId = ApiProviderId | 'volcengine';

export interface CanvasImageMetadata {
  source: CanvasImageSource;
  prompt?: string;
  modelLabel?: string;
  upscaleFactor?: number;
  noiseScale?: number;
  creativity?: number;
  generation?: GenerationInputs;
}

export type CanvasMediaType = 'image' | 'video' | 'audio';

export type FalImageSizePreset =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'
  | '2560x1440'
  | '1440x2560'
  | 'auto'
  | 'auto_2K'
  | 'auto_3K'
  | 'auto_4K';

export type FalImageSizeOption = 'default' | FalImageSizePreset;

export type FalAspectRatioPreset =
  | '21:9'
  | '1:1'
  | '4:3'
  | '3:2'
  | '2:3'
  | '2:1' // Grok aspect ratio.
  | '20:9' // Grok aspect ratio.
  | '19.5:9' // Grok aspect ratio.
  | '5:4'
  | '4:5'
  | '3:4'
  | '16:9'
  | '9:16'
  | '9:19.5' // Grok aspect ratio.
  | '9:20' // Grok aspect ratio.
  | '1:2' // Grok aspect ratio.
  | '2560x1440'
  | '1440x2560';

export type FalAspectRatioOption = 'default' | FalAspectRatioPreset;

export type FalResolutionOption = '1K' | '2K' | '4K';

export type FalVideoDuration = '5' | '6' | '10';

export type GenerationKind = 'text_to_image' | 'image_edit' | 'upscale' | 'video';
export type Seedance2Variant = 'smart' | 'reference';

export type GenerationFalOptions = Partial<{
  imageSizeSelection: FalImageSizeOption;
  aspectRatioSelection: FalAspectRatioOption;
  resolutionSelection: FalResolutionOption;
  numImages: number;
  scaleFactor: number;
  noiseScale: number;
  creativity: number;
  videoDuration: FalVideoDuration;
  hailuoVariant: 'standard' | 'pro';
  klingVariant: 'standard' | 'pro';
  klingO1Variant: 'refI2V' | 'edit' | 'fflf' | 'refV2V';
  klingO1KeepAudio: boolean;
  negativePrompt: string;
  wanTargetResolution: '720p' | '1080p';
  wanCreativity: 0 | 1 | 2 | 3 | 4;
  wanAnimateVariant: 'replace' | 'move';
  wanAnimateSteps: '10' | '20' | '30' | '40';
  wanAnimateResolution: '480p' | '580p' | '720p';
  oneToAllAnimateResolution: '480p' | '580p' | '720p';
  wanAnimateShift: '5.0' | '6.0' | '7.0' | '8.0' | '9.0' | '10.0';
  wanAnimateQuality: 'high' | 'maximum';
  wanAnimateUseTurbo: boolean;
  kling26Audio: boolean;
  kling26ControlVariant: 'standard' | 'pro';
  kling26ControlKeepSound: boolean;
  kling26ControlDriver: 'video' | 'image';
  infinitalkResolution: '480p' | '720p';
  infinitalkSeed: '42' | 'random';
  infinitalkAcceleration: 'none' | 'regular' | 'high';
  infinitalkDuration: '5s' | '6s' | '10s' | '12s';
  grokImagineVideoDuration: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  grokImagineVideoResolution: '480p' | '720p';
  grokImagineVideoAspectRatio: 'auto' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16';
  sora2ProResolution: 'auto' | '720p' | '1080p';
  sora2ProAspectRatio: 'auto' | '9:16' | '16:9';
  sora2ProDuration: '4' | '8' | '12';
  veo31Variant: 'i2v-fflf' | 'extend';
  veo31Duration: '4s' | '6s' | '8s' | '7s';
  veo31Resolution: '720p' | '1080p' | '4k';
  veo31AspectRatio: 'auto' | '16:9' | '9:16';
  veo31GenerateAudio: boolean;
  wan26Resolution: '720p' | '1080p';
  wan26Duration: '5' | '10' | '15';
  wan26PromptExpansion: boolean;
  wan26MultiShots: boolean;
  seedance15AspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  seedance15Resolution: '480p' | '720p' | '1080p';
  seedance15Duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
  seedance15CameraFixed: boolean;
  seedance15Audio: boolean;
}>;

export type GenerationVolcengineOptions = Partial<{
  seedance2Variant: Seedance2Variant;
  seedance2AspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  seedance2Resolution: '480p' | '720p' | '1080p';
  seedance2Duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  seedance2GenerateAudio: boolean;
  seedance2CameraFixed: boolean;
}>;

export interface GenerationInputs {
  kind: GenerationKind;
  prompt: string;
  provider: GenerationProviderId;
  modelId?: string;
  modelLabel?: string;
  modelMode?: 'image' | 'video';
  primaryImageId?: string;
  originalSourceImageId?: string;
  referenceImageIds?: string[];
  referenceVideoIds?: string[];
  referenceAudioIds?: string[];
  elementImageIds?: string[];
  videoLastFrameImageId?: string;
  sourceVideoId?: string;
  sourceAudioId?: string;
  url?: string;
  falOptions?: GenerationFalOptions;
  volcengineOptions?: GenerationVolcengineOptions;
}

export interface CanvasImage {
  id: string;
  element: HTMLImageElement | HTMLVideoElement;
  mediaType: CanvasMediaType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  naturalWidth: number;
  naturalHeight: number;
  file: File;
  isPlaying?: boolean;
  hasAudio?: boolean;
  metadata?: CanvasImageMetadata;
  // Audio-specific properties
  audioElement?: HTMLAudioElement;
  waveformImageData?: string;
  audioDuration?: number;
  currentPlaybackTime?: number;
}

export interface CanvasNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  backgroundColor: string;
  fontSize?: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasVideoPromptArea extends CanvasRect {
  id: string;
  sequence: number;
  label: string;
  orderedMediaIds: string[]; // Preserves entry order even when some items are ignored.
  promptBarId: string | null; // Each area can own at most one embedded prompt bar.
}

export interface CanvasVideoPromptBar extends CanvasRect {
  id: string;
  assignedAreaId: string | null; // Null means the bar is still a draggable draft.
  prompt: string;
  negativePrompt: string;
  seedance2Variant: Seedance2Variant;
  seedance2AspectRatio: GenerationVolcengineOptions['seedance2AspectRatio'];
  seedance2Resolution: GenerationVolcengineOptions['seedance2Resolution'];
  seedance2Duration: GenerationVolcengineOptions['seedance2Duration'];
  seedance2GenerateAudio: boolean;
  seedance2CameraFixed: boolean;
}

export interface VideoPromptAreaMembership {
  orderedMediaIds: string[];
  acceptedImageIds: string[];
  acceptedVideoIds: string[];
  acceptedAudioIds: string[];
  ignoredMediaIds: string[];
  orderLabels: Record<string, string>;
}

export interface VideoModelCapabilityProfile {
  id: string;
  supportedMediaTypes: ReadonlyArray<CanvasMediaType>;
  maxImages: number;
  maxVideos: number;
  maxAudios: number;
}

export type FalJobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface FalQueueJob {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  provider: GenerationProviderId;
  status: FalJobStatus;
  requestId?: string;
  logs: string[];
  description?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  outputUrl?: string;
}
