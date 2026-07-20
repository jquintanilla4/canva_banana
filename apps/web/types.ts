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
export type GenerationProviderId = ApiProviderId | 'volcengine' | 'jimeng';

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
  | '2048x2048'
  | '2048x1152'
  | '1152x2048'
  | '2560x1440'
  | '1440x2560'
  | 'auto'
  | 'auto_1K'
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
  | '2.35:1'
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
export type FalGptImage2QualityOption = 'low' | 'medium' | 'high';
export type FalKrea2CreativityOption = 'raw' | 'low' | 'medium' | 'high';
export type Flux2MaxImageSizeOption = Extract<FalImageSizePreset, 'landscape_4_3' | 'landscape_16_9' | 'portrait_4_3' | 'portrait_16_9' | 'square' | 'square_hd'>;

export type FalVideoDuration = '5' | '6' | '10';

export type GenerationKind = 'text_to_image' | 'image_edit' | 'upscale' | 'video';
export type Seedance2Variant = 'smart' | 'reference';
export type JimengSeedance2ModelVersion = 'seedance2.0fast' | 'seedance2.0' | 'seedance2.0_vip' | 'seedance2.0fast_vip';
export type Wan27VideoVariant = 'smart' | 'reference' | 'edit';
export type RecraftRgbColor = { r: number; g: number; b: number };

export type GenerationFalOptions = Partial<{
  imageSizeSelection: FalImageSizeOption;
  aspectRatioSelection: FalAspectRatioOption;
  resolutionSelection: FalResolutionOption;
  flux2MaxImageSize: Flux2MaxImageSizeOption; // Flux 2 Max output size replayed by retries.
  gptImage2Quality: FalGptImage2QualityOption;
  krea2Creativity: FalKrea2CreativityOption;
  krea2StyleReferenceStrengths: Record<string, number>;
  numImages: number;
  scaleFactor: number;
  noiseScale: number;
  creativity: number;
  videoDuration: FalVideoDuration;
  hailuoVariant: 'standard' | 'pro';
  klingVariant: 'standard' | 'pro';
  klingO3Variant: 'reference' | 'edit';
  klingO3Duration: '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  klingO3GenerateAudio: boolean;
  klingO3KeepAudio: boolean;
  klingO1Variant: 'refI2V' | 'edit' | 'fflf' | 'refV2V';
  klingO1KeepAudio: boolean;
  klingV3Duration: '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  klingV3GenerateAudio: boolean;
  klingV3CfgScale: '0' | '0.25' | '0.5' | '0.75' | '1';
  klingV3MultiPromptEnabled: boolean;
  klingV3MultiPrompt: string;
  klingV3Shot1Duration: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  klingV3Shot2Duration: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
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
  lipsyncSyncMode: 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap'; // Sync v3 duration behavior.
  heygenEnableCaption: boolean;
  heygenEnableDynamicDuration: boolean;
  heygenDisableMusicTrack: boolean;
  heygenEnableSpeechEnhancement: boolean;
  heygenTimingResolved: boolean; // True once prompt timing intent has been finalized.
  heygenStartTime: number;
  heygenEndTime: number;
  klingV3ControlKeepSound: boolean;
  klingV3ControlOrientation: 'video' | 'image';
  infinitalkResolution: '480p' | '720p';
  infinitalkSeed: '42' | 'random';
  infinitalkAcceleration: 'none' | 'regular' | 'high';
  infinitalkDuration: '5s' | '6s' | '10s' | '12s';
  grokImagineVideoDuration: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  grokImagineVideoResolution: '480p' | '720p';
  grokImagineVideoAspectRatio: 'auto' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16';
  veo31Variant: 'i2v-fflf' | 'extend';
  veo31Duration: '4s' | '6s' | '8s' | '7s';
  veo31Resolution: '720p' | '1080p' | '4k';
  veo31AspectRatio: 'auto' | '16:9' | '9:16';
  veo31GenerateAudio: boolean;
  wan27VideoResolution: '720p' | '1080p';
  wan27VideoDuration: '0' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  wan27VideoAspectRatio: 'source' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  wan27VideoPromptExpansion: boolean;
  wan27VideoVariant: Wan27VideoVariant;
  wan27VideoAudioSetting: 'auto' | 'origin';
  seedance15AspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  seedance15Resolution: '480p' | '720p' | '1080p';
  seedance15Duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
  seedance15CameraFixed: boolean;
  seedance15Audio: boolean;
  seedance2Variant: Seedance2Variant;
  seedance2AspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  seedance2Resolution: '480p' | '720p' | '1080p';
  seedance2Duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  seedance2GenerateAudio: boolean;
  seedance2JimengModelVersion: JimengSeedance2ModelVersion;
  recraftImageSize: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
  recraftBackgroundColor: RecraftRgbColor;
  recraftColors: RecraftRgbColor[];
  wan27ImageAspectRatio: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
  wan27ImageMaxImages: '1' | '2' | '3' | '4' | '5';
}>;

export type GenerationVolcengineOptions = Partial<{
  seedance2Variant: Seedance2Variant;
  seedance2AspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  seedance2Resolution: '480p' | '720p' | '1080p';
  seedance2Duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  seedance2GenerateAudio: boolean;
  seedance2CameraFixed: boolean;
}>;

export type GenerationJimengOptions = GenerationVolcengineOptions & Partial<{
  seedance2JimengModelVersion: JimengSeedance2ModelVersion;
}>; // Jimeng reuses Seedance 2 controls plus the CLI model_version channel.

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
  editAppMode?: AppMode; // App mode used when replaying an edit.
  editTool?: Tool.SELECTION | Tool.FREE_SELECTION | Tool.ANNOTATE; // Tool used to build the edit request.
  editPaths?: Path[]; // Saved edit strokes for retry.
  referenceVideoIds?: string[];
  referenceAudioIds?: string[];
  elementImageIds?: string[];
  videoLastFrameImageId?: string | null;
  sourceVideoId?: string;
  sourceAudioId?: string;
  url?: string;
  falOptions?: GenerationFalOptions;
  volcengineOptions?: GenerationVolcengineOptions;
  jimengOptions?: GenerationJimengOptions;
}

export interface GenerationPlacedPayload {
  mediaIds: string[];
  mediaType: 'image' | 'video';
  modelLabel?: string;
}

export type VideoPromptAreaMediaRole =
  | 'primary'
  | 'reference'
  | 'element'
  | 'tail'
  | 'sourceVideo'
  | 'sourceAudio';

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
  // May be a lazy snapshot-backed pseudo-File (not a real Blob) after a desktop snapshot import;
  // pass through ensureRealSnapshotFile() from snapshotService before using it with Blob APIs.
  file: File;
  isPlaying?: boolean;
  isFavorite?: boolean;
  hasAudio?: boolean;
  videoDuration?: number; // Saved seconds keep lazy snapshot videos metadata-free on restore.
  metadata?: CanvasImageMetadata;
  // Audio-specific properties
  audioElement?: HTMLAudioElement;
  waveformImageData?: string;
  audioDuration?: number;
  currentPlaybackTime?: number;
}

export interface CanvasNote {
  id: string;
  text: string;
  label?: number; // Sequential pin number — present iff anchored.
  anchor?: Point; // World coords of the pin tip — present iff anchored.
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
  borderColor?: string; // Hex border color for the prompt area shell.
  orderedMediaIds: string[]; // Preserves entry order even when some items are ignored.
  mediaRoles?: Record<string, VideoPromptAreaMediaRole>; // Optional per-media role chosen by modifier keys.
  promptBarId: string | null; // Each area can own at most one embedded prompt bar.
}

export interface CanvasVideoPromptBar extends CanvasRect {
  id: string;
  assignedAreaId: string | null; // Null means the bar is still a draggable draft.
  modelId?: string; // Missing means the legacy Volcengine Seedance 2 bar.
  prompt: string;
  negativePrompt: string;
  falOptions?: GenerationFalOptions; // Embedded bars store model-specific FAL controls here.
  klingV3MultiPrompt?: string;
  klingV3Duration?: '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  klingV3GenerateAudio?: boolean;
  klingV3CfgScale?: '0' | '0.25' | '0.5' | '0.75' | '1';
  klingV3MultiPromptEnabled?: boolean;
  klingV3Shot1Duration?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  klingV3Shot2Duration?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  seedance2Variant: Seedance2Variant;
  seedance2JimengModelVersion?: JimengSeedance2ModelVersion;
  seedance2AspectRatio: GenerationVolcengineOptions['seedance2AspectRatio'];
  seedance2Resolution: GenerationVolcengineOptions['seedance2Resolution'];
  seedance2Duration: GenerationVolcengineOptions['seedance2Duration'];
  seedance2GenerateAudio: boolean;
  seedance2CameraFixed: boolean;
}

export interface VideoPromptAreaMembership {
  orderedMediaIds: string[];
  primaryImageId?: string;
  acceptedImageIds: string[];
  acceptedVideoIds: string[];
  acceptedAudioIds: string[];
  elementImageIds: string[];
  tailImageId?: string;
  sourceVideoId?: string;
  sourceAudioId?: string;
  ignoredMediaIds: string[];
  orderLabels: Record<string, string>;
}

export interface VideoModelCapabilityProfile {
  id: string;
  defaultImageRole: VideoPromptAreaMediaRole | null;
  defaultVideoRole: VideoPromptAreaMediaRole | null;
  defaultAudioRole: VideoPromptAreaMediaRole | null;
  shiftImageRole: VideoPromptAreaMediaRole | null;
  altImageRole: VideoPromptAreaMediaRole | null;
  supportedMediaTypes: ReadonlyArray<CanvasMediaType>;
  maxImages: number;
  maxVideos: number;
  maxAudios: number;
  maxElements: number;
  supportsTextOnly?: boolean;
}

export type FalJobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type FalJobPhase = 'uploading' | 'submitting' | 'queued' | 'processing' | 'downloading' | 'completed' | 'failed'; // UI phase label for Fal jobs.

export interface FalQueueJob {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  provider: GenerationProviderId;
  retryInputs?: GenerationInputs; // Original request inputs for queue retry.
  status: FalJobStatus;
  phase?: FalJobPhase; // Current user-visible Fal phase.
  phaseMessage?: string; // Short phase detail for the queue row.
  requestId?: string;
  logs: string[];
  phaseStartedAt?: number; // Timestamp when the current phase began.
  lastPhaseDurationMs?: number; // Duration of the previous phase in milliseconds.
  description?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  outputUrl?: string;
}
