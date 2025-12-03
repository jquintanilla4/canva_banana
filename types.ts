export enum Tool {
  SELECTION = 'SELECTION',
  PAN = 'PAN',
  ANNOTATE = 'ANNOTATE',
  INPAINT = 'INPAINT',
  BRUSH = 'BRUSH',
  FREE_SELECTION = 'FREE_SELECTION',
  NOTE = 'NOTE',
  ERASE = 'ERASE',
}

export type InpaintMode = 'STRICT' | 'CREATIVE';

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

export interface CanvasImageMetadata {
  source: CanvasImageSource;
  prompt?: string;
  modelLabel?: string;
  upscaleFactor?: number;
  noiseScale?: number;
  creativity?: number;
  generation?: GenerationInputs;
}

export type CanvasMediaType = 'image' | 'video';

export type FalImageSizePreset =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'
  | 'auto'
  | 'auto_2K'
  | 'auto_4K';

export type FalImageSizeOption = 'default' | FalImageSizePreset;

export type FalAspectRatioPreset =
  | '21:9'
  | '1:1'
  | '4:3'
  | '3:2'
  | '2:3'
  | '5:4'
  | '4:5'
  | '3:4'
  | '16:9'
  | '9:16';

export type FalAspectRatioOption = 'default' | FalAspectRatioPreset;

export type FalResolutionOption = '1K' | '2K' | '4K';

export type FalVideoDuration = '5' | '6' | '10';

export type GenerationKind = 'text_to_image' | 'image_edit' | 'upscale' | 'video';

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
  negativePrompt: string;
}>;

export interface GenerationInputs {
  kind: GenerationKind;
  prompt: string;
  provider: ApiProviderId;
  modelId?: string;
  modelLabel?: string;
  modelMode?: 'image' | 'video';
  primaryImageId?: string;
  originalSourceImageId?: string;
  referenceImageIds?: string[];
  videoLastFrameImageId?: string;
  falOptions?: GenerationFalOptions;
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
}

export interface CanvasNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  backgroundColor: string;
}

export type FalJobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface FalQueueJob {
  id: string;
  prompt: string;
  modelLabel: string;
  status: FalJobStatus;
  requestId?: string;
  logs: string[];
  description?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  outputUrl?: string;
}
