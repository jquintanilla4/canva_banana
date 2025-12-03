import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { Canvas } from './components/Canvas';
import {
  Tool,
  Path,
  CanvasImage,
  InpaintMode,
  Point,
  CanvasNote,
  FalImageSizePreset,
  FalAspectRatioOption,
  FalResolutionOption,
  CanvasImageSource,
  CanvasMediaType,
  GenerationInputs,
  GenerationKind,
  ApiProviderId,
} from './types';
import { generateImageEdit as generateGoogleImageEdit, generateImage as generateGoogleImage } from './services/geminiService';
import {
  generateImageEdit as generateFalImageEdit,
  generateImage as generateFalImage,
  generateImageToVideo as generateFalImageToVideo,
  removeBackground as removeFalBackground,
  upscaleCrystalImage as upscaleFalCrystalImage,
  upscaleSeedvrImage as upscaleFalSeedvrImage,
  type FalQueueUpdate,
} from './services/falService';
import { FalQueuePanel } from './components/FalQueuePanel';
import { DebugLogPanel } from './components/DebugLogPanel';
import { addDebugLog, clearDebugLogs, getDebugLogs, subscribeToDebugLogs } from './services/debugLog';
import { buildFalDisplayError, FAL_PROVIDER_DOWN_MESSAGE, formatFalLogMessage } from './services/falConstants';
import type { FalQueueJob, FalJobStatus } from './types';
import { ZoomToFitIcon, HamburgerIcon, MetadataIcon } from './components/Icons';

const GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID = 'fal-ai/gemini-3-pro-image-preview/edit' as const;
const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit' as const;
const SEEDREAM_V45_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/edit' as const;
const GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/gemini-3-pro-image-preview' as const;
const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image' as const;
const SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/text-to-image' as const;
const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image' as const;
const KLING_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1' as const;
const CRYSTAL_UPSCALER_MODEL_ID = 'clarityai/crystal-upscaler' as const;
const SEEDVR_UPSCALER_MODEL_ID = 'fal-ai/seedvr/upscale/image' as const;
const HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video' as const;
const HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video' as const;
const UPSCALE_MODEL_HIGHLIGHT_COLOR = '#3596F8' as const;

const FAL_IMAGE_MODEL_OPTIONS = [
  { value: GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID, label: 'NanoBanana Pro' },
  { value: SEEDREAM_MODEL_ID, label: 'Seedream v4' },
  { value: SEEDREAM_V45_MODEL_ID, label: 'Seedream v4.5' },
  { value: KLING_IMAGE_MODEL_ID, label: 'Kling O1 Image' },
  { value: REVE_TEXT_TO_IMAGE_MODEL_ID, label: 'Reve Image' },
  { value: CRYSTAL_UPSCALER_MODEL_ID, label: 'Crystal Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
  { value: SEEDVR_UPSCALER_MODEL_ID, label: 'SeedVR2 Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
] as const;

const FAL_VIDEO_MODEL_OPTIONS = [
  { value: HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID, label: 'Hailuo 2.3 Standard' },
  { value: HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID, label: 'Hailuo 2.3 Pro' },
] as const;

const FAL_MODEL_OPTIONS = [...FAL_IMAGE_MODEL_OPTIONS, ...FAL_VIDEO_MODEL_OPTIONS] as const;
const SEEDREAM_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID] as const;
type SeedreamModelId = typeof SEEDREAM_MODEL_IDS[number];
const SEEDREAM_TEXT_TO_IMAGE_MAP: Record<SeedreamModelId, string> = {
  [SEEDREAM_MODEL_ID]: SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  [SEEDREAM_V45_MODEL_ID]: SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
};

type FalModelMode = 'image' | 'video';
type FalImageSizeSelectionValue = 'placeholder' | 'default' | FalImageSizePreset;

type FalAspectRatioSelectionValue = 'placeholder' | FalAspectRatioOption;
type FalResolutionSelectionValue = FalResolutionOption;

const FAL_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: FalImageSizeSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Match Source' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'auto', label: 'Auto' },
  { value: 'auto_2K', label: 'Auto 2K' },
  { value: 'auto_4K', label: 'Auto 4K' },
] as const;

const FAL_NUM_IMAGE_OPTIONS = [1, 2, 3, 4] as const;
const FAL_CRYSTAL_SCALE_FACTOR_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const factor = index + 1;
  return { value: `${factor}`, label: `${factor}x` } as const;
});
const FAL_CRYSTAL_CREATIVITY_OPTIONS = Array.from({ length: 21 }, (_, index) => {
  const value = (index * 0.5);
  const formatted = value.toFixed(1);
  return { value: formatted, label: formatted } as const;
});
const FAL_SEEDVR_NOISE_SCALE_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const value = (index + 1) / 10;
  return { value: value.toFixed(1), label: value.toFixed(1) } as const;
});

const FAL_RESOLUTION_OPTIONS: ReadonlyArray<{ value: FalResolutionSelectionValue; label: string }> = [
  { value: '1K', label: '1K (default)' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const;

const FAL_KLING_RESOLUTION_OPTIONS: ReadonlyArray<{ value: FalResolutionSelectionValue; label: string }> = [
  { value: '1K', label: '1K (default)' },
  { value: '2K', label: '2K' },
] as const;

const FAL_GEMINI_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Auto (default)' },
  { value: '21:9', label: '21:9' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
] as const;

const FAL_REVE_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Default (3:2)' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
] as const;

const FAL_KLING_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Auto (default)' },
  { value: '21:9', label: '21:9' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
] as const;

const FAL_ASPECT_RATIO_VALUES = new Set<FalAspectRatioSelectionValue>([
  ...FAL_GEMINI_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_REVE_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_KLING_ASPECT_RATIO_OPTIONS.map(option => option.value),
]);

const MIN_STROKE_SIZE = 1;
const MAX_STROKE_SIZE = 100;
const clampStrokeSize = (value: number) =>
  Math.min(MAX_STROKE_SIZE, Math.max(MIN_STROKE_SIZE, value));

type FalModelId = typeof FAL_MODEL_OPTIONS[number]['value'];
type FalImageModelId = typeof FAL_IMAGE_MODEL_OPTIONS[number]['value'];
type FalVideoModelId = typeof FAL_VIDEO_MODEL_OPTIONS[number]['value'];
const isFalImageSizeSelectionValue = (value: unknown): value is FalImageSizeSelectionValue =>
  typeof value === 'string' && FAL_IMAGE_SIZE_OPTIONS.some(option => option.value === value);

const isFalAspectRatioSelectionValue = (value: unknown): value is FalAspectRatioSelectionValue =>
  typeof value === 'string' && FAL_ASPECT_RATIO_VALUES.has(value as FalAspectRatioSelectionValue);

const isFalResolutionSelectionValue = (value: unknown): value is FalResolutionSelectionValue =>
  typeof value === 'string' && FAL_RESOLUTION_OPTIONS.some(option => option.value === value);

type PromptBarModelControl = {
  id: string;
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
};

const isFalModelId = (value: string | undefined): value is FalModelId =>
  typeof value === 'string' && FAL_MODEL_OPTIONS.some(option => option.value === value);
const isFalImageModelId = (value: string | undefined): value is FalImageModelId =>
  typeof value === 'string' && FAL_IMAGE_MODEL_OPTIONS.some(option => option.value === value);
const isFalVideoModelId = (value: string | undefined): value is FalVideoModelId =>
  typeof value === 'string' && FAL_VIDEO_MODEL_OPTIONS.some(option => option.value === value);
const isSeedreamModelId = (value: FalModelId | undefined): value is SeedreamModelId =>
  !!value && (SEEDREAM_MODEL_IDS as readonly string[]).includes(value);
const getSeedreamTextToImageModelId = (modelId: SeedreamModelId): string =>
  SEEDREAM_TEXT_TO_IMAGE_MAP[modelId];
const isApiProvider = (value: unknown): value is ApiProvider =>
  value === 'google' || value === 'fal';
const isFalModelMode = (value: unknown): value is FalModelMode =>
  value === 'image' || value === 'video';
const isGenerationKind = (value: unknown): value is GenerationKind =>
  value === 'text_to_image' || value === 'image_edit' || value === 'upscale' || value === 'video';

const LEGACY_NANO_BANANA_MODEL_ID = 'fal-ai/nano-banana/edit' as const;
const normalizeFalModelId = (value: string | undefined): FalModelId | undefined => {
  if (value === LEGACY_NANO_BANANA_MODEL_ID) {
    return GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  }
  return isFalModelId(value) ? value : undefined;
};

const ENV_FAL_MODEL_ID = normalizeFalModelId(process.env.FAL_MODEL_ID);
const DEFAULT_FAL_IMAGE_MODEL_ID: FalImageModelId =
  isFalImageModelId(ENV_FAL_MODEL_ID) ? ENV_FAL_MODEL_ID : GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
const DEFAULT_FAL_VIDEO_MODEL_ID: FalVideoModelId =
  FAL_VIDEO_MODEL_OPTIONS[0]?.value ?? HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID;

const isCanvasImageSource = (value: unknown): value is CanvasImageSource => {
  return value === 'generated' || value === 'imported' || value === 'snapshot' || value === 'derived';
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';
const isVideoCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLVideoElement } =>
  !!img && img.mediaType === 'video';

const getFalModelLabel = (modelId: FalModelId): string => {
  const match = FAL_MODEL_OPTIONS.find(option => option.value === modelId);
  return match ? match.label : 'FAL Model';
};

const GOOGLE_MODEL_LABEL = 'Google Gemini';

type ApiProvider = ApiProviderId;

const PROVIDER_ORDER: ReadonlyArray<ApiProviderId> = ['google', 'fal'];

const hasEnvValue = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

const providerAvailability: Record<ApiProvider, boolean> = {
  google: hasEnvValue(process.env.GEMINI_API_KEY ?? process.env.API_KEY),
  fal: hasEnvValue(process.env.FAL_API_KEY),
};

const AVAILABLE_PROVIDERS = PROVIDER_ORDER.filter(provider => providerAvailability[provider]) as ApiProvider[];
const PROVIDER_LABELS: Record<ApiProvider, string> = {
  google: 'Google',
  fal: 'FAL',
};
const DEFAULT_API_PROVIDER: ApiProvider = AVAILABLE_PROVIDERS[0] ?? 'google';

interface ViewToolbarProps {
  onZoomToFit: () => void;
  disabled: boolean;
  metadataVisible: boolean;
  onToggleMetadata: () => void;
}

const ViewToolbar: React.FC<ViewToolbarProps> = ({ onZoomToFit, disabled, metadataVisible, onToggleMetadata }) => {
  const metadataButtonClasses = metadataVisible
    ? 'bg-blue-500 hover:bg-blue-400'
    : 'bg-gray-700 hover:bg-gray-600';

  return (
    <div className="absolute bottom-4 right-4 z-10 flex items-center space-x-2">
      <button
        type="button"
        onClick={onToggleMetadata}
        aria-pressed={metadataVisible}
        className={`p-2 rounded-md border-none outline-none focus:outline-none focus:ring-0 shadow-none transition-colors duration-200 text-white ${metadataButtonClasses}`}
        title={metadataVisible ? 'Hide Generation Prompt Metadata' : 'Show Generation Prompt Metadata'}
      >
        <MetadataIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={onZoomToFit}
        disabled={disabled}
        className="p-2 rounded-md border-none outline-none focus:outline-none focus:ring-0 shadow-none transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        title="Zoom to Fit (.)"
      >
        <ZoomToFitIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

const MAX_HISTORY_SIZE = 30;
const DEFAULT_MAX_REFERENCE_IMAGES = 13;
const MODEL_REFERENCE_IMAGE_LIMITS: Partial<Record<FalModelId, number>> = {
  [SEEDREAM_MODEL_ID]: 7, // 7 references + 1 primary = 8 total
  [SEEDREAM_V45_MODEL_ID]: 8, // v4.5 allows up to 10 inputs; leave headroom for base/mask images
  [KLING_IMAGE_MODEL_ID]: 10, // Kling O1 allows up to 10 reference images
  [HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID]: 0,
  [HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID]: 0,
};
const getMaxReferenceImages = (modelId: FalModelId | undefined): number =>
  modelId && MODEL_REFERENCE_IMAGE_LIMITS[modelId] !== undefined
    ? MODEL_REFERENCE_IMAGE_LIMITS[modelId] as number
    : DEFAULT_MAX_REFERENCE_IMAGES;
const DEFAULT_NOTE_BACKGROUND = '#1f2937';

type SerializedCanvasImageV1 = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fileName: string;
  fileType: string;
  dataUrl: string;
  metadata?: CanvasImage['metadata'];
  mediaType?: CanvasMediaType;
  isPlaying?: boolean;
  hasAudio?: boolean;
};

type SerializedSnapshotV1 = {
  version: 1;
  createdAt: string;
  state: {
    images: SerializedCanvasImageV1[];
    notes: CanvasNote[];
    paths: Path[];
    meta?: {
      appMode: AppMode;
      tool: Tool;
      brushSize: number;
      eraserSize: number;
      brushColor: string;
      prompt: string;
      inpaintMode: InpaintMode;
      apiProvider: ApiProvider;
      falModelId: FalModelId;
      falImageSizeSelection: FalImageSizeSelectionValue;
      falAspectRatioSelection: FalAspectRatioSelectionValue;
      falResolutionSelection: FalResolutionSelectionValue;
      falNumImages: number;
      falScaleFactor: number;
      falNoiseScale: number;
      falCreativity: number;
      selectedImageIds: string[];
      selectedNoteIds: string[];
      referenceImageIds: string[];
    };
  };
};

type SnapshotImageManifest = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  metadata?: CanvasImage['metadata'];
  mediaType?: CanvasMediaType;
  isPlaying?: boolean;
  hasAudio?: boolean;
};

type SnapshotManifestV2 = {
  version: 2;
  createdAt: string;
  state: {
    images: SnapshotImageManifest[];
    notes: CanvasNote[];
    paths: Path[];
    meta?: SerializedSnapshotV1['state']['meta'];
  };
};

type SnapshotBinary = {
  manifest: SnapshotManifestV2;
  images: Array<{ manifest: SnapshotImageManifest; blob: Blob }>;
};

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) {
        reject(new Error('Failed to read file.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file.'));
    };
    reader.readAsDataURL(file);
  });
};

const dataUrlToFile = async (dataUrl: string, fileName: string, fileType: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = fileType || blob.type || 'application/octet-stream';
  return new File([blob], fileName, { type });
};

const isVideoFileType = (fileType: string): boolean =>
  typeof fileType === 'string' && /video\//.test(fileType);
const getMediaTypeFromFileType = (fileType: string): CanvasMediaType => (isVideoFileType(fileType) ? 'video' : 'image');

const getNaturalSize = (element: HTMLImageElement | HTMLVideoElement) => {
  if (element instanceof HTMLVideoElement) {
    const naturalWidth = element.videoWidth || element.width || 1;
    const naturalHeight = element.videoHeight || element.height || 1;
    return { naturalWidth, naturalHeight };
  }

  const naturalWidth = element.naturalWidth || element.width || 1;
  const naturalHeight = element.naturalHeight || element.height || 1;
  return { naturalWidth, naturalHeight };
};

const loadMediaFromBlob = (
  blob: Blob,
  mediaType: CanvasMediaType = getMediaTypeFromFileType(blob.type),
): Promise<HTMLImageElement | HTMLVideoElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);

    if (mediaType === 'video') {
      const video = document.createElement('video');
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = objectUrl;

      video.onloadeddata = () => {
        resolve(video);
      };
      video.onerror = (err) => {
        reject(err ?? new Error('Failed to load video.'));
      };
      return;
    }

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err ?? new Error('Failed to load image.'));
    };
    img.src = objectUrl;
  });
};

const loadMediaFromDataUrl = (
  dataUrl: string,
  mediaType: CanvasMediaType = getMediaTypeFromFileType(dataUrl),
): Promise<HTMLImageElement | HTMLVideoElement> => {
  return new Promise((resolve, reject) => {
    if (mediaType === 'video') {
      const video = document.createElement('video');
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = dataUrl;
      video.onloadeddata = () => resolve(video);
      video.onerror = (err) => reject(err ?? new Error('Failed to load video.'));
      return;
    }

    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = dataUrl;
  });
};

const loadImageFromBlob = (blob: Blob) => loadMediaFromBlob(blob, 'image') as Promise<HTMLImageElement>;
const loadImageFromDataUrl = (dataUrl: string) => loadMediaFromDataUrl(dataUrl, 'image') as Promise<HTMLImageElement>;

const SNAPSHOT_MAGIC = 'BANANA_SNAPSHOT_V2\n';
const snapshotEncoder = new TextEncoder();
const snapshotDecoder = new TextDecoder();

const writeUint32BE = (value: number): Uint8Array<ArrayBuffer> => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, false);
  return new Uint8Array(buffer);
};

const writeUint64BE = (value: number): Uint8Array<ArrayBuffer> => {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, BigInt(value), false);
  return new Uint8Array(buffer);
};

const readUint32BE = (view: DataView, offset: number): number => view.getUint32(offset, false);
const readUint64BE = (view: DataView, offset: number): number => Number(view.getBigUint64(offset, false));

const isBinarySnapshotFile = async (file: File): Promise<boolean> => {
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  const headBuffer = await file.slice(0, magicBytes.length).arrayBuffer();
  const head = new Uint8Array(headBuffer);
  if (head.length !== magicBytes.length) return false;
  for (let i = 0; i < magicBytes.length; i += 1) {
    if (head[i] !== magicBytes[i]) {
      return false;
    }
  }
  return true;
};

const parseBinarySnapshotFile = async (file: File): Promise<SnapshotBinary> => {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  let offset = 0;

  if (buffer.byteLength < magicBytes.length + 4) {
    throw new Error('Snapshot file is too small.');
  }

  for (let i = 0; i < magicBytes.length; i += 1) {
    if (view.getUint8(i) !== magicBytes[i]) {
      throw new Error('Snapshot file format is invalid.');
    }
  }
  offset += magicBytes.length;

  const manifestLength = readUint32BE(view, offset);
  offset += 4;
  if (manifestLength <= 0 || offset + manifestLength > buffer.byteLength) {
    throw new Error('Snapshot manifest length is invalid.');
  }

  const manifestBytes = new Uint8Array(buffer, offset, manifestLength);
  offset += manifestLength;
  const manifestJson = snapshotDecoder.decode(manifestBytes);
  const manifest = JSON.parse(manifestJson) as SnapshotManifestV2;

  if (!manifest || manifest.version !== 2 || !manifest.state) {
    throw new Error('Snapshot manifest is invalid.');
  }

  const images: SnapshotBinary['images'] = [];
  for (let index = 0; index < manifest.state.images.length; index += 1) {
    if (offset + 4 > buffer.byteLength) {
      throw new Error(`Snapshot image ${index + 1} metadata length is invalid.`);
    }
    const metaLength = readUint32BE(view, offset);
    offset += 4;
    if (metaLength <= 0 || offset + metaLength > buffer.byteLength) {
      throw new Error(`Snapshot image ${index + 1} metadata is invalid.`);
    }
    const metaBytes = new Uint8Array(buffer, offset, metaLength);
    offset += metaLength;
    const imageManifest = JSON.parse(snapshotDecoder.decode(metaBytes)) as SnapshotImageManifest;

    if (offset + 8 > buffer.byteLength) {
      throw new Error(`Snapshot image ${index + 1} data length is invalid.`);
    }
    const dataLength = readUint64BE(view, offset);
    offset += 8;
    if (dataLength <= 0 || offset + dataLength > buffer.byteLength) {
      throw new Error(`Snapshot image ${index + 1} data is invalid.`);
    }
    const dataBytes = buffer.slice(offset, offset + dataLength);
    offset += dataLength;

    images.push({
      manifest: imageManifest,
      blob: new Blob([dataBytes], { type: imageManifest.fileType || 'application/octet-stream' }),
    });
  }

  return { manifest, images };
};

const snapshotBinaryToBlob = (binary: SnapshotBinary): Blob => {
  const parts: BlobPart[] = [];
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  parts.push(magicBytes);

  const manifestJson = JSON.stringify(binary.manifest);
  const manifestBytes = snapshotEncoder.encode(manifestJson);
  parts.push(writeUint32BE(manifestBytes.length));
  parts.push(manifestBytes);

  binary.images.forEach(({ manifest, blob }) => {
    const metaBytes = snapshotEncoder.encode(JSON.stringify(manifest));
    parts.push(writeUint32BE(metaBytes.length));
    parts.push(metaBytes);
    parts.push(writeUint64BE(blob.size));
    parts.push(blob);
  });

  return new Blob(parts, { type: 'application/octet-stream' });
};

type SnapshotWritable = { write: (data: Blob | Uint8Array | string) => Promise<void> };
const writeSnapshotBinary = async (binary: SnapshotBinary, writable: SnapshotWritable) => {
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  await writable.write(magicBytes);

  const manifestJson = JSON.stringify(binary.manifest);
  const manifestBytes = snapshotEncoder.encode(manifestJson);
  await writable.write(writeUint32BE(manifestBytes.length));
  await writable.write(manifestBytes);

  for (const { manifest, blob } of binary.images) {
    const metaBytes = snapshotEncoder.encode(JSON.stringify(manifest));
    await writable.write(writeUint32BE(metaBytes.length));
    await writable.write(metaBytes);
    await writable.write(writeUint64BE(blob.size));
    await writable.write(blob);
  }
};

const normalizeSnapshotImageMetadata = (
  rawMetadata: CanvasImage['metadata'] | undefined,
): CanvasImage['metadata'] | undefined => {
  const normalizeGenerationInputs = (rawGeneration: unknown): GenerationInputs | undefined => {
    if (!rawGeneration || typeof rawGeneration !== 'object') {
      return undefined;
    }
    const raw = rawGeneration as Partial<GenerationInputs>;
    const kind = isGenerationKind(raw.kind) ? raw.kind : undefined;
    const provider = isApiProvider(raw.provider) ? raw.provider : undefined;
    if (!kind || !provider) {
      return undefined;
    }

    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    const modelId = typeof raw.modelId === 'string' ? raw.modelId : undefined;
    const modelLabel = typeof raw.modelLabel === 'string' ? raw.modelLabel.trim() : undefined;
    const modelMode = isFalModelMode(raw.modelMode) ? raw.modelMode : undefined;
    const primaryImageId = typeof raw.primaryImageId === 'string' ? raw.primaryImageId : undefined;
    const referenceImageIds = Array.isArray(raw.referenceImageIds)
      ? raw.referenceImageIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    const videoLastFrameImageId = typeof raw.videoLastFrameImageId === 'string'
      ? raw.videoLastFrameImageId
      : undefined;

    const falOptionsRaw = raw.falOptions;
    let falOptions: GenerationInputs['falOptions'] | undefined;
    if (falOptionsRaw && typeof falOptionsRaw === 'object') {
      const typed = falOptionsRaw as GenerationInputs['falOptions'];
      const normalizedOptions: GenerationInputs['falOptions'] = {};
      if (isFalImageSizeSelectionValue((typed as { imageSizeSelection?: unknown }).imageSizeSelection)) {
        normalizedOptions.imageSizeSelection = typed.imageSizeSelection;
      }
      if (isFalAspectRatioSelectionValue((typed as { aspectRatioSelection?: unknown }).aspectRatioSelection)) {
        normalizedOptions.aspectRatioSelection = typed.aspectRatioSelection;
      }
      if (isFalResolutionSelectionValue((typed as { resolutionSelection?: unknown }).resolutionSelection)) {
        normalizedOptions.resolutionSelection = typed.resolutionSelection;
      }
      const normalizeNumberOption = (value: unknown, min: number, max: number) => {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
          return undefined;
        }
        return Math.min(max, Math.max(min, parsed));
      };
      const numImages = normalizeNumberOption((typed as { numImages?: unknown }).numImages, 1, 4);
      if (numImages !== undefined) {
        normalizedOptions.numImages = Math.floor(numImages);
      }
      const scaleFactor = normalizeNumberOption((typed as { scaleFactor?: unknown }).scaleFactor, 1, 10);
      if (scaleFactor !== undefined) {
        normalizedOptions.scaleFactor = Math.round(scaleFactor * 100) / 100;
      }
      const noiseScale = normalizeNumberOption((typed as { noiseScale?: unknown }).noiseScale, 0.1, 1);
      if (noiseScale !== undefined) {
        normalizedOptions.noiseScale = Math.round(noiseScale * 10) / 10;
      }
      const creativity = normalizeNumberOption((typed as { creativity?: unknown }).creativity, 0, 10);
      if (creativity !== undefined) {
        normalizedOptions.creativity = Math.max(0, Math.min(10, Math.round(creativity * 2) / 2));
      }
      const videoDuration = (typed as { videoDuration?: unknown }).videoDuration === '10' ? '10' : (typed as { videoDuration?: unknown }).videoDuration === '6' ? '6' : undefined;
      if (videoDuration) {
        normalizedOptions.videoDuration = videoDuration;
      }

      falOptions = Object.keys(normalizedOptions).length > 0 ? normalizedOptions : undefined;
    }

    return {
      kind,
      prompt,
      provider,
      ...(modelId ? { modelId } : {}),
      ...(modelLabel ? { modelLabel } : {}),
      ...(modelMode ? { modelMode } : {}),
      ...(primaryImageId ? { primaryImageId } : {}),
      ...(referenceImageIds && referenceImageIds.length > 0 ? { referenceImageIds } : {}),
      ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
      ...(falOptions ? { falOptions } : {}),
    };
  };

  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return undefined;
  }

  const rawSource = rawMetadata.source;
  const rawPrompt = rawMetadata.prompt;
  const rawModelLabel = rawMetadata.modelLabel;
  const rawUpscaleFactor = rawMetadata.upscaleFactor;
  const rawNoiseScale = rawMetadata.noiseScale;
  const rawCreativity = rawMetadata.creativity;
  const source = isCanvasImageSource(rawSource) ? rawSource : 'snapshot';
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  const modelLabel = typeof rawModelLabel === 'string' ? rawModelLabel.trim() : '';
  const hasValidUpscaleFactor = typeof rawUpscaleFactor === 'number'
    && Number.isFinite(rawUpscaleFactor)
    && rawUpscaleFactor > 0;
  const normalizedNoiseScale = typeof rawNoiseScale === 'number' && Number.isFinite(rawNoiseScale)
    ? Math.round(rawNoiseScale * 10) / 10
    : undefined;
  const normalizedCreativity = typeof rawCreativity === 'number' && Number.isFinite(rawCreativity)
    ? Math.max(0, Math.min(10, Math.round(rawCreativity * 2) / 2))
    : undefined;
  const generation = normalizeGenerationInputs((rawMetadata as { generation?: unknown }).generation);

  const metadata: CanvasImage['metadata'] = {
    source,
    ...(prompt.length > 0 ? { prompt } : {}),
    ...(modelLabel.length > 0 ? { modelLabel } : {}),
    ...(hasValidUpscaleFactor ? { upscaleFactor: rawUpscaleFactor } : {}),
    ...(normalizedNoiseScale !== undefined ? { noiseScale: normalizedNoiseScale } : {}),
    ...(normalizedCreativity !== undefined ? { creativity: normalizedCreativity } : {}),
    ...(generation ? { generation } : {}),
  };

  return metadata;
};

type AppMode = 'CANVAS' | 'ANNOTATE' | 'INPAINT';
type AppState = { images: CanvasImage[], paths: Path[], notes: CanvasNote[] };
type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };
type TransformModeState = { imageId: string; };

const getStateSignature = (state: AppState): string => {
  const imageSignature = state.images
    .map(img => `${img.id},${img.x.toFixed(2)},${img.y.toFixed(2)},${img.width},${img.height},${(img.rotation ?? 0).toFixed(3)}`)
    .join(';');
  const pathSignature = state.paths.map(p => `${p.points.length},${p.tool}`).join(',');
  const noteSignature = state.notes.map(n => `${n.id},${n.x.toFixed(2)},${n.y.toFixed(2)},${n.width.toFixed(0)},${n.height.toFixed(0)},${n.text.length}`).join(';');
  return `${imageSignature}|${pathSignature}|${noteSignature}`;
};

const getImageRotation = (img: CanvasImage): number => img.rotation ?? 0;

const getImageBounds = (img: CanvasImage) => {
  const rotation = getImageRotation(img);
  const centerX = img.x + img.width / 2;
  const centerY = img.y + img.height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const corners = [
    { x: -img.width / 2, y: -img.height / 2 },
    { x: img.width / 2, y: -img.height / 2 },
    { x: -img.width / 2, y: img.height / 2 },
    { x: img.width / 2, y: img.height / 2 },
  ].map(({ x, y }) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos,
  }));

  const xs = corners.map(corner => corner.x);
  const ys = corners.map(corner => corner.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const isOverlapping = (img1: CanvasImage, img2: CanvasImage): boolean => {
  const a = getImageBounds(img1);
  const b = getImageBounds(img2);
  return !(a.minX > b.maxX || a.maxX < b.minX || a.minY > b.maxY || a.maxY < b.minY);
};

const mapFalStatusToJobStatus = (status: FalQueueUpdate['status'] | undefined): FalJobStatus => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'FAILED';
    default:
      return 'IN_QUEUE';
  }
};

const mergeFalLogMessages = (existing: string[], updateLogs?: FalQueueUpdate['logs']): string[] => {
  if (!updateLogs || updateLogs.length === 0) {
    return existing;
  }

  const next = [...existing];
  updateLogs.forEach(log => {
    const rawMessage = typeof log?.message === 'string' ? log.message.trim() : '';
    if (!rawMessage) {
      return;
    }
    const { displayMessage, debugMessage } = formatFalLogMessage(rawMessage);
    if (debugMessage) {
      const title = displayMessage ? 'Queue log (sanitized)' : 'Queue log (suppressed)';
      addDebugLog({
        direction: 'info',
        source: 'fal',
        title,
        message: debugMessage,
      });
    }
    if (!displayMessage) {
      return;
    }
    if (!next.includes(displayMessage)) {
      next.push(displayMessage);
    }
  });
  return next;
};

const applyFalQueueUpdateToJob = (job: FalQueueJob, update: FalQueueUpdate): FalQueueJob => {
  const status = mapFalStatusToJobStatus(update.status);
  const mergedLogs = mergeFalLogMessages(job.logs, update.logs);
  const updateMessage = typeof (update as { message?: unknown }).message === 'string'
    ? (update as { message?: string }).message
    : undefined;
  const error = status === 'FAILED'
    ? buildFalDisplayError(updateMessage ?? job.error, mergedLogs)
    ?? job.error
    ?? FAL_PROVIDER_DOWN_MESSAGE
    : job.error;

  return {
    ...job,
    status,
    requestId: update.requestId || job.requestId,
    logs: mergedLogs,
    error,
    updatedAt: Date.now(),
  };
};

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('CANVAS');
  const [tool, setTool] = useState<Tool>(Tool.PAN);
  const [brushSize, setBrushSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(20);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [prompt, setPrompt] = useState('');
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>('STRICT');

  const adjustBrushSize = useCallback(
    (delta: number) => {
      setBrushSize(prev => clampStrokeSize(prev + delta));
    },
    [setBrushSize],
  );

  const adjustEraserSize = useCallback(
    (delta: number) => {
      setEraserSize(prev => clampStrokeSize(prev + delta));
    },
    [setEraserSize],
  );

  const [historyState, setHistoryState] = useState<{
    history: AppState[],
    index: number,
  }>({
    history: [{ images: [], paths: [], notes: [] }],
    index: 0,
  });

  const { history, index: historyIndex } = historyState;
  const { images, paths, notes } = history[historyIndex];

  const [liveImages, setLiveImages] = useState<CanvasImage[] | null>(null);
  const [livePaths, setLivePaths] = useState<Path[] | null>(null);
  const [liveNotes, setLiveNotes] = useState<CanvasNote[] | null>(null);

  const displayedImages = liveImages ?? images;
  const displayedPaths = livePaths ?? paths;
  const displayedNotes = liveNotes ?? notes;
  const hasClearablePaths = displayedPaths.some(
    path =>
      (path.tool === Tool.ANNOTATE || path.tool === Tool.INPAINT) &&
      path.points.length > 0
  );

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const primaryImageId = selectedImageIds[0] ?? null;
  const primaryNoteId = selectedNoteIds[0] ?? null;
  const hasSingleImageSelected = selectedImageIds.length === 1;
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [cropMode, setCropMode] = useState<CropModeState | null>(null);
  const [transformMode, setTransformMode] = useState<TransformModeState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [apiProvider, setApiProvider] = useState<ApiProvider>(DEFAULT_API_PROVIDER);
  const [falJobs, setFalJobs] = useState<FalQueueJob[]>([]);
  const falAutoDismissTimeouts = useRef<Map<string, number>>(new Map());
  const [falModelMode, setFalModelMode] = useState<FalModelMode>('image');
  const [falImageModelId, setFalImageModelId] = useState<FalImageModelId>(DEFAULT_FAL_IMAGE_MODEL_ID);
  const [falVideoModelId, setFalVideoModelId] = useState<FalVideoModelId>(DEFAULT_FAL_VIDEO_MODEL_ID);
  const [falVideoDuration, setFalVideoDuration] = useState<'6' | '10'>('6');
  const [falImageSizeSelection, setFalImageSizeSelection] = useState<FalImageSizeSelectionValue>('placeholder');
  const [falAspectRatioSelection, setFalAspectRatioSelection] = useState<FalAspectRatioSelectionValue>('placeholder');
  const [falResolutionSelection, setFalResolutionSelection] = useState<FalResolutionSelectionValue>('1K');
  const [falNumImages, setFalNumImages] = useState(1);
  const [falScaleFactor, setFalScaleFactor] = useState(2);
  const [falNoiseScale, setFalNoiseScale] = useState(0.1);
  const [falCreativity, setFalCreativity] = useState(0);
  const [showMetadataOverlay, setShowMetadataOverlay] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false);
  const [debugLogEntries, setDebugLogEntries] = useState(() => getDebugLogs());
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const requestZoomIn = useCallback(() => {
    setZoomInTrigger(prev => prev + 1);
  }, []);
  const requestZoomOut = useCallback(() => {
    setZoomOutTrigger(prev => prev + 1);
  }, []);

  const falModelId: FalModelId = falModelMode === 'video' ? falVideoModelId : falImageModelId;

  const showReferenceLimitToast = useCallback((maxReferenceImages: number) => {
    const totalLimit = maxReferenceImages + 1;
    setToastMessage(`${getFalModelLabel(falModelId)} supports up to ${maxReferenceImages} reference images (${totalLimit} total including the primary).`);
    setTimeout(() => setToastMessage(null), 2000);
  }, [falModelId, setToastMessage]);

  useEffect(() => {
    const maxReferenceImages = getMaxReferenceImages(falModelId);
    setReferenceImageIds(prevIds => {
      if (prevIds.length <= maxReferenceImages) {
        return prevIds;
      }
      showReferenceLimitToast(maxReferenceImages);
      return prevIds.slice(0, maxReferenceImages);
    });
  }, [falModelId, showReferenceLimitToast]);

  useEffect(() => {
    if (apiProvider !== 'fal' && falModelMode !== 'image') {
      setFalModelMode('image');
    }
  }, [apiProvider, falModelMode]);

  useEffect(() => {
    if (falModelId === KLING_IMAGE_MODEL_ID && falResolutionSelection === '4K') {
      setFalResolutionSelection('2K');
    }
  }, [falModelId, falResolutionSelection]);

  const primaryImage = useMemo(() => {
    if (!primaryImageId) return null;
    return images.find(img => img.id === primaryImageId) || null;
  }, [images, primaryImageId]);

  const activePrimaryImage = useMemo(() => {
    return isImageCanvasMedia(primaryImage) ? primaryImage : null;
  }, [primaryImage]);

  useEffect(() => {
    if (selectedImageIds.length === 0 && referenceImageIds.length === 0) {
      return;
    }
    const imageIdSet = new Set(images.map(img => img.id));
    setSelectedImageIds(prevIds => {
      const validIds = prevIds.filter(id => imageIdSet.has(id));
      return validIds.length === prevIds.length ? prevIds : validIds;
    });
    setReferenceImageIds(prevIds => {
      const validIds = prevIds.filter(id => imageIdSet.has(id));
      return validIds.length === prevIds.length ? prevIds : validIds;
    });
  }, [images, referenceImageIds, selectedImageIds]);

  const handleModelModeChange = useCallback((mode: FalModelMode) => {
    setFalModelMode(mode);
    setReferenceImageIds([]);
  }, []);

  const handleFalVideoDurationChange = useCallback((value: string) => {
    setFalVideoDuration(value === '10' ? '10' : '6');
  }, []);

  const handleFalImageSizeChange = useCallback((value: string) => {
    setFalImageSizeSelection(value as FalImageSizeSelectionValue);
  }, []);

  const handleFalAspectRatioChange = useCallback((value: string) => {
    setFalAspectRatioSelection(value as FalAspectRatioSelectionValue);
  }, []);
  const handleFalResolutionChange = useCallback((value: string) => {
    const nextValue = value === '4K' && falModelId === KLING_IMAGE_MODEL_ID ? '2K' : value;
    setFalResolutionSelection(nextValue as FalResolutionSelectionValue);
  }, [falModelId]);

  const handleFalNumImagesChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      setFalNumImages(1);
      return;
    }
    const clamped = Math.min(4, Math.max(1, Math.floor(value)));
    setFalNumImages(clamped);
  }, []);

  const handleFalScaleFactorChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalScaleFactor(2);
      return;
    }
    const clamped = Math.min(10, Math.max(1, Math.round(parsed)));
    setFalScaleFactor(clamped);
  }, []);

  const handleFalNoiseScaleChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalNoiseScale(0.1);
      return;
    }
    const rounded = Math.round(parsed * 10) / 10;
    const clamped = Math.min(1, Math.max(0.1, rounded));
    setFalNoiseScale(clamped);
  }, []);

  const handleFalCreativityChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalCreativity(0);
      return;
    }
    const rounded = Math.round(parsed * 2) / 2;
    const clamped = Math.min(10, Math.max(0, rounded));
    setFalCreativity(clamped);
  }, []);

  useEffect(() => {
    setFalScaleFactor(prev => {
      const normalizedPrev = Number.isFinite(prev) ? Math.round(prev) : 2;
      const clamped = Math.min(10, Math.max(1, normalizedPrev));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  useEffect(() => {
    setFalNoiseScale(prev => {
      const normalizedPrev = Number.isFinite(prev) ? prev : 0.1;
      const rounded = Math.round(normalizedPrev * 10) / 10;
      const clamped = Math.min(1, Math.max(0.1, rounded));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  useEffect(() => {
    const unsubscribe = subscribeToDebugLogs(setDebugLogEntries);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (falModelMode === 'video') {
      return;
    }
    const aspectRatioOptions = falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : falModelId === KLING_IMAGE_MODEL_ID
        ? FAL_KLING_ASPECT_RATIO_OPTIONS
        : FAL_GEMINI_ASPECT_RATIO_OPTIONS;
    const validOptions = aspectRatioOptions.map(option => option.value);
    if (!validOptions.includes(falAspectRatioSelection)) {
      setFalAspectRatioSelection('default');
    }
  }, [falModelId, falModelMode, falAspectRatioSelection, setFalAspectRatioSelection]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const prevDisplayedNotesLength = useRef(displayedNotes.length);

  const setState = useCallback((updater: (prevState: AppState) => AppState) => {
    setHistoryState(currentState => {
      const { history: prevHistory, index: prevIndex } = currentState;
      const prevState = prevHistory[prevIndex];
      const newState = updater(prevState);

      if (getStateSignature(newState) === getStateSignature(prevState)) {
        return currentState;
      }

      const newHistory = prevHistory.slice(0, prevIndex + 1);
      newHistory.push(newState);

      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });
  }, []);

  const handleClear = useCallback(() => {
    setState(prevState => ({ ...prevState, paths: [] }));
  }, [setState]);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === appMode) return;

    setAppMode(newMode);
    handleClear();
    if (newMode === 'CANVAS') {
      setTool(Tool.PAN);
    } else { // ANNOTATE or INPAINT
      setTool(Tool.BRUSH);
    }
  }, [appMode, handleClear]);

  const handleDelete = useCallback(() => {
    if (selectedImageIds.length === 0 && selectedNoteIds.length === 0) {
      return;
    }

    setState(prevState => ({
      ...prevState,
      images: selectedImageIds.length
        ? prevState.images.filter(img => !selectedImageIds.includes(img.id))
        : prevState.images,
      notes: selectedNoteIds.length
        ? prevState.notes.filter(note => !selectedNoteIds.includes(note.id))
        : prevState.notes,
    }));

    if (selectedImageIds.length) {
      setSelectedImageIds([]);
      setReferenceImageIds([]);
    }
    if (selectedNoteIds.length) {
      setSelectedNoteIds([]);
    }
  }, [selectedImageIds, selectedNoteIds, setState]);

  const handleZoomToFit = useCallback(() => {
    setZoomToFitTrigger(c => c + 1);
  }, []);

  const handleImageOrderChange = useCallback((imageId: string, direction: 'up' | 'down') => {
    setState(prevState => {
      const newImages = [...prevState.images];
      const index = newImages.findIndex(img => img.id === imageId);

      if (direction === 'up' && index < newImages.length - 1) {
        [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      } else if (direction === 'down' && index > 0) {
        [newImages[index], newImages[index - 1]] = [newImages[index - 1], newImages[index]];
      }

      return { ...prevState, images: newImages };
    });
  }, [setState]);

  const handleNoteCopy = useCallback((noteId: string) => {
    const note = displayedNotes.find(n => n.id === noteId);
    if (note && note.text) {
      navigator.clipboard.writeText(note.text)
        .then(() => {
          setToastMessage("Copied to clipboard!");
          setTimeout(() => setToastMessage(null), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          setToastMessage("Failed to copy text.");
          setTimeout(() => setToastMessage(null), 2000);
        });
    }
  }, [displayedNotes]);

  const handleImagePromptCopy = useCallback((imageId: string) => {
    const image = displayedImages.find(img => img.id === imageId);
    const promptText = image?.metadata?.prompt?.trim();

    if (!promptText) {
      setToastMessage('No prompt found for this media.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }

    navigator.clipboard.writeText(promptText)
      .then(() => {
        setToastMessage('Prompt copied to clipboard!');
        setTimeout(() => setToastMessage(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy prompt: ', err);
        setToastMessage('Failed to copy prompt.');
        setTimeout(() => setToastMessage(null), 2000);
      });
  }, [displayedImages]);

  const buildSnapshotBinary = useCallback(async (): Promise<SnapshotBinary> => {
    const imagesWithManifests: SnapshotBinary['images'] = await Promise.all(
      displayedImages.map(async (img) => {
        const manifest: SnapshotImageManifest = {
          id: img.id,
          x: img.x,
          y: img.y,
          width: img.width,
          height: img.height,
          rotation: img.rotation ?? 0,
          fileName: img.file.name,
          fileType: img.file.type || 'application/octet-stream',
          fileSize: img.file.size,
          metadata: img.metadata ? { ...img.metadata } : undefined,
          mediaType: img.mediaType,
          isPlaying: img.isPlaying ?? false,
          hasAudio: img.hasAudio,
        };

        return { manifest, blob: img.file };
      })
    );

    const manifest: SnapshotManifestV2 = {
      version: 2,
      createdAt: new Date().toISOString(),
      state: {
        images: imagesWithManifests.map(item => item.manifest),
        notes: displayedNotes.map(note => ({ ...note })),
        paths: displayedPaths.map(path => ({
          ...path,
          points: path.points.map(point => ({ ...point })),
        })),
        meta: {
          appMode,
          tool,
          brushSize,
          eraserSize,
          brushColor,
          prompt,
          inpaintMode,
          apiProvider,
          falModelId,
          falImageSizeSelection,
          falAspectRatioSelection,
          falResolutionSelection,
          falNumImages,
          falScaleFactor,
          falNoiseScale,
          falCreativity,
          selectedImageIds: [...selectedImageIds],
          selectedNoteIds: [...selectedNoteIds],
          referenceImageIds: [...referenceImageIds],
        },
      },
    };

    return { manifest, images: imagesWithManifests };
  }, [
    displayedImages,
    displayedNotes,
    displayedPaths,
    appMode,
    tool,
    brushSize,
    eraserSize,
    brushColor,
    prompt,
    inpaintMode,
    apiProvider,
    falModelId,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
  ]);

  const handleExportSnapshot = useCallback(async () => {
    try {
      const snapshotBinary = await buildSnapshotBinary();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestedName = `banana-canvas-snapshot-${timestamp}.bcsnap`;

      const win = window as unknown as { showSaveFilePicker?: (options?: unknown) => Promise<any> };
      if (typeof win.showSaveFilePicker === 'function') {
        const saveHandle = await win.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: { 'application/octet-stream': ['.bcsnap'] },
            },
          ],
        });
        const writable = await saveHandle.createWritable();
        await writeSnapshotBinary(snapshotBinary, writable);
        await writable.close();
      } else {
        const blob = snapshotBinaryToBlob(snapshotBinary);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = suggestedName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setError(null);
      setToastMessage('Snapshot exported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to export snapshot.';
      setError(message);
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [buildSnapshotBinary]);

  const handleImportSnapshotFromFile = useCallback(async (file: File) => {
    try {
      const isBinarySnapshot = await isBinarySnapshotFile(file).catch(() => false);

      let restoredImages: CanvasImage[] = [];
      let snapshotNotes: CanvasNote[] = [];
      let snapshotPaths: Path[] = [];
      let meta: SerializedSnapshotV1['state']['meta'] | undefined;

      if (isBinarySnapshot) {
        const parsed = await parseBinarySnapshotFile(file);
        const { state } = parsed.manifest;
        const manifestImages = Array.isArray(state.images) ? state.images : [];
        const blobsById = new Map(parsed.images.map(entry => [entry.manifest.id, entry.blob]));

        restoredImages = await Promise.all(
          manifestImages.map(async (img, index) => {
            const blob = blobsById.get(img.id) ?? parsed.images[index]?.blob;
            if (!blob) {
              throw new Error(`Snapshot image "${img.fileName || img.id}" is missing data.`);
            }

            const fileType = typeof img.fileType === 'string' && img.fileType.length > 0
              ? img.fileType
              : blob.type || 'application/octet-stream';
            const fileName = typeof img.fileName === 'string' && img.fileName.length > 0
              ? img.fileName
              : `snapshot-image-${index + 1}.png`;
            const mediaType = img.mediaType ?? getMediaTypeFromFileType(fileType);

            const snapshotFile = new File([blob], fileName, { type: fileType });
            const element = await loadMediaFromBlob(blob, mediaType);
            const { naturalWidth, naturalHeight } = getNaturalSize(element);
            const width = typeof img.width === 'number' ? img.width : naturalWidth;
            const height = typeof img.height === 'number' ? img.height : naturalHeight;
            const rotation = typeof img.rotation === 'number' && Number.isFinite(img.rotation) ? img.rotation : 0;
            if (element instanceof HTMLVideoElement) {
              element.pause();
              element.currentTime = 0;
              element.loop = true;
              element.muted = true;
              element.playsInline = true;
            }

            return {
              id: typeof img.id === 'string' && img.id.length > 0 ? img.id : crypto.randomUUID(),
              element,
              mediaType,
              x: typeof img.x === 'number' ? img.x : 0,
              y: typeof img.y === 'number' ? img.y : 0,
              width,
              height,
              rotation,
              naturalWidth,
              naturalHeight,
              file: snapshotFile,
              isPlaying: mediaType === 'video' ? Boolean(img.isPlaying) : false,
              hasAudio: mediaType === 'video' ? img.hasAudio : false,
              metadata: normalizeSnapshotImageMetadata(img.metadata),
            };
          })
        );

        snapshotNotes = Array.isArray(state.notes) ? state.notes.map(note => ({ ...note })) : [];
        snapshotPaths = Array.isArray(state.paths)
          ? state.paths.map(path => ({
            ...path,
            points: Array.isArray(path.points) ? path.points.map(point => ({ ...point })) : [],
          }))
          : [];
        meta = state.meta;
      } else {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as Partial<SerializedSnapshotV1>;
        if (!parsed || typeof parsed !== 'object' || !parsed.state) {
          throw new Error('Snapshot file is invalid.');
        }

        const { images = [], notes = [], paths = [], meta: parsedMeta } = parsed.state;

        if (!Array.isArray(images) || !Array.isArray(notes) || !Array.isArray(paths)) {
          throw new Error('Snapshot data is incomplete.');
        }

        restoredImages = await Promise.all(
          images.map(async (img, index) => {
            if (!img || typeof img !== 'object' || typeof img.dataUrl !== 'string') {
              throw new Error(`Snapshot image at index ${index} is invalid.`);
            }

            const fileType = typeof img.fileType === 'string' && img.fileType.length > 0
              ? img.fileType
              : 'image/png';
            const mediaType = img.mediaType ?? getMediaTypeFromFileType(fileType);
            const element = await loadMediaFromDataUrl(img.dataUrl, mediaType);
            if (element instanceof HTMLVideoElement) {
              element.pause();
              element.currentTime = 0;
              element.loop = true;
              element.muted = true;
              element.playsInline = true;
            }
            const { naturalWidth, naturalHeight } = getNaturalSize(element);
            const fileName = typeof img.fileName === 'string' && img.fileName.length > 0
              ? img.fileName
              : `snapshot-image-${index + 1}.png`;
            const snapshotFile = await dataUrlToFile(img.dataUrl, fileName, fileType);
            const width = typeof img.width === 'number' ? img.width : naturalWidth;
            const height = typeof img.height === 'number' ? img.height : naturalHeight;
            const rawMetadata = (img as SerializedCanvasImageV1).metadata as CanvasImage['metadata'] | undefined;
            const rotation = typeof (img as SerializedCanvasImageV1).rotation === 'number' && Number.isFinite((img as SerializedCanvasImageV1).rotation)
              ? (img as SerializedCanvasImageV1).rotation
              : 0;

            return {
              id: typeof img.id === 'string' && img.id.length > 0 ? img.id : crypto.randomUUID(),
              element,
              mediaType,
              x: typeof img.x === 'number' ? img.x : 0,
              y: typeof img.y === 'number' ? img.y : 0,
              width,
              height,
              rotation,
              naturalWidth,
              naturalHeight,
              file: snapshotFile,
              isPlaying: mediaType === 'video' ? Boolean(img.isPlaying) : false,
              hasAudio: mediaType === 'video' ? img.hasAudio : false,
              metadata: normalizeSnapshotImageMetadata(rawMetadata),
            };
          })
        );

        snapshotNotes = notes.map(note => ({ ...note }));
        snapshotPaths = paths.map(path => ({
          ...path,
          points: Array.isArray(path.points)
            ? path.points.map(point => ({ ...point }))
            : [],
        }));
        meta = parsedMeta;
      }

      const sanitizedNotes: CanvasNote[] = snapshotNotes.map(note => ({
        id: typeof note?.id === 'string' && note.id.length > 0 ? note.id : crypto.randomUUID(),
        x: typeof note?.x === 'number' ? note.x : 0,
        y: typeof note?.y === 'number' ? note.y : 0,
        width: typeof note?.width === 'number' ? note.width : 200,
        height: typeof note?.height === 'number' ? note.height : 120,
        text: typeof note?.text === 'string' ? note.text : '',
        backgroundColor: typeof note?.backgroundColor === 'string' && note.backgroundColor.length > 0
          ? note.backgroundColor
          : DEFAULT_NOTE_BACKGROUND,
      }));

      const sanitizedPaths: Path[] = snapshotPaths.map(path => {
        const rawPoints = Array.isArray(path?.points) ? path.points : [];
        const points: Point[] = rawPoints
          .map(point => (point && typeof point === 'object' ? point : null))
          .filter((point): point is Point => point !== null && typeof point.x === 'number' && typeof point.y === 'number')
          .map(point => ({ x: point.x, y: point.y }));

        const fallbackTool = Tool.BRUSH;
        const toolValue = Object.values(Tool).includes(path?.tool as Tool)
          ? (path?.tool as Tool)
          : fallbackTool;
        const fallbackSize = toolValue === Tool.ERASE ? eraserSize : brushSize;

        return {
          points,
          color: typeof path?.color === 'string' && path.color.length > 0 ? path.color : brushColor,
          size: typeof path?.size === 'number' ? path.size : fallbackSize,
          tool: toolValue,
        };
      });

      const nextState: AppState = {
        images: restoredImages,
        paths: sanitizedPaths,
        notes: sanitizedNotes,
      };

      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState({ history: [nextState], index: 0 });

      if (meta) {
        const validAppMode: AppMode =
          meta.appMode === 'CANVAS' || meta.appMode === 'ANNOTATE' || meta.appMode === 'INPAINT'
            ? meta.appMode
            : 'CANVAS';
        setAppMode(validAppMode);

        const validTool = Object.values(Tool).includes(meta.tool) ? meta.tool : Tool.PAN;
        setTool(validTool);

        if (typeof meta.brushSize === 'number' && Number.isFinite(meta.brushSize) && meta.brushSize > 0) {
          setBrushSize(meta.brushSize);
        }
        if (typeof meta.eraserSize === 'number' && Number.isFinite(meta.eraserSize) && meta.eraserSize > 0) {
          setEraserSize(meta.eraserSize);
        }
        if (typeof meta.brushColor === 'string' && meta.brushColor.length > 0) {
          setBrushColor(meta.brushColor);
        }
        if (typeof meta.prompt === 'string') {
          setPrompt(meta.prompt);
        }
        if (meta.inpaintMode === 'STRICT' || meta.inpaintMode === 'CREATIVE') {
          setInpaintMode(meta.inpaintMode);
        }
        if (meta.apiProvider === 'google' || meta.apiProvider === 'fal') {
          if (providerAvailability[meta.apiProvider]) {
            setApiProvider(meta.apiProvider);
          } else if (AVAILABLE_PROVIDERS.length > 0) {
            setApiProvider(AVAILABLE_PROVIDERS[0]);
          }
        }
        const normalizedFalModelId = normalizeFalModelId(meta.falModelId);
        if (normalizedFalModelId) {
          if (isFalVideoModelId(normalizedFalModelId)) {
            setFalModelMode('video');
            setFalVideoModelId(normalizedFalModelId);
          } else if (isFalImageModelId(normalizedFalModelId)) {
            setFalModelMode('image');
            setFalImageModelId(normalizedFalModelId);
          }
        }
        if (isFalImageSizeSelectionValue(meta.falImageSizeSelection)) {
          setFalImageSizeSelection(meta.falImageSizeSelection);
        }
        if (isFalAspectRatioSelectionValue(meta.falAspectRatioSelection)) {
          setFalAspectRatioSelection(meta.falAspectRatioSelection);
        }
        if (isFalResolutionSelectionValue(meta.falResolutionSelection)) {
          setFalResolutionSelection(meta.falResolutionSelection);
        }
        if (typeof meta.falNumImages === 'number') {
          setFalNumImages(Math.min(4, Math.max(1, Math.floor(meta.falNumImages))));
        }
        if (typeof meta.falScaleFactor === 'number') {
          setFalScaleFactor(Math.min(10, Math.max(1, Math.round(meta.falScaleFactor))));
        }
        if (typeof meta.falNoiseScale === 'number') {
          const normalizedNoise = Number.isFinite(meta.falNoiseScale) ? meta.falNoiseScale : 0.1;
          const roundedNoise = Math.round(normalizedNoise * 10) / 10;
          setFalNoiseScale(Math.min(1, Math.max(0.1, roundedNoise)));
        }
        if (typeof meta.falCreativity === 'number') {
          const normalizedCreativity = Number.isFinite(meta.falCreativity)
            ? Math.round(meta.falCreativity * 2) / 2
            : 0;
          setFalCreativity(Math.min(10, Math.max(0, normalizedCreativity)));
        }
        setSelectedImageIds(Array.isArray(meta.selectedImageIds) ? [...meta.selectedImageIds] : []);
        setSelectedNoteIds(Array.isArray(meta.selectedNoteIds) ? [...meta.selectedNoteIds] : []);
        setReferenceImageIds(Array.isArray(meta.referenceImageIds) ? [...meta.referenceImageIds] : []);
      } else {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
      }

      setError(null);
      setToastMessage('Snapshot imported');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to import snapshot.');
      }
    } finally {
      setIsFileMenuOpen(false);
    }
  }, [
    brushColor,
    brushSize,
    eraserSize,
    setLiveImages,
    setLivePaths,
    setLiveNotes,
    setHistoryState,
    setAppMode,
    setTool,
    setBrushSize,
    setEraserSize,
    setBrushColor,
    setPrompt,
    setInpaintMode,
    setApiProvider,
    setFalModelMode,
    setFalImageModelId,
    setFalVideoModelId,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setError,
    setToastMessage,
  ]);

  const handleSnapshotFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImportSnapshotFromFile(file).catch(err => {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      });
    }
    e.target.value = '';
  }, [handleImportSnapshotFromFile, setError]);

  const closeFileMenu = useCallback(() => {
    setIsFileMenuOpen(false);
  }, []);

  const toggleFileMenu = useCallback(() => {
    setIsFileMenuOpen(prev => !prev);
  }, []);

  const openDebugLogPanel = useCallback(() => {
    setIsDebugLogOpen(true);
    setIsFileMenuOpen(false);
  }, []);

  const closeDebugLogPanel = useCallback(() => {
    setIsDebugLogOpen(false);
  }, []);

  const handleImportSnapshot = useCallback(async () => {
    const win = window as unknown as { showOpenFilePicker?: (options?: unknown) => Promise<any[]> };
    if (typeof win.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await win.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Canvas Snapshot',
              accept: {
                'application/octet-stream': ['.bcsnap'],
                'application/json': ['.json'],
              },
            },
          ],
        });
        if (fileHandle) {
          const file = await fileHandle.getFile();
          await handleImportSnapshotFromFile(file);
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to import snapshot.');
        }
      }
    } else {
      closeFileMenu();
      snapshotInputRef.current?.click();
    }
  }, [closeFileMenu, handleImportSnapshotFromFile, setError]);

  useEffect(() => {
    if (!isFileMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        closeFileMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFileMenu();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeFileMenu, isFileMenuOpen]);

  const handleDismissFalJob = useCallback((jobId: string) => {
    const timeoutId = falAutoDismissTimeouts.current.get(jobId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      falAutoDismissTimeouts.current.delete(jobId);
    }

    setFalJobs(prev => prev.filter(job => job.id !== jobId));
  }, [setFalJobs]);

  useEffect(() => {
    const timeoutMap = falAutoDismissTimeouts.current;

    timeoutMap.forEach((timeoutId, jobId) => {
      const job = falJobs.find(j => j.id === jobId);
      if (!job || job.status !== 'COMPLETED') {
        window.clearTimeout(timeoutId);
        timeoutMap.delete(jobId);
      }
    });

    falJobs.forEach(job => {
      if (job.status !== 'COMPLETED') {
        return;
      }

      if (timeoutMap.has(job.id)) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        timeoutMap.delete(job.id);
        setFalJobs(prev => prev.filter(j => j.id !== job.id));
      }, 1000);

      timeoutMap.set(job.id, timeoutId);
    });
  }, [falJobs, setFalJobs]);

  useEffect(() => {
    return () => {
      falAutoDismissTimeouts.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      falAutoDismissTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isDebugLogOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDebugLogOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isDebugLogOpen]);

  const rasterizeImages = (imagesToCompose: CanvasImage[]): Promise<{
    element: HTMLImageElement;
    mediaType: 'image';
    x: number;
    y: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    file: File;
    isPlaying: false;
    hasAudio: false;
  }> => {
    return new Promise((resolve, reject) => {
      if (imagesToCompose.length === 0) {
        return reject(new Error("No images to rasterize."));
      }

      const boundsList = imagesToCompose.map(getImageBounds);
      const minX = Math.min(...boundsList.map(b => b.minX));
      const minY = Math.min(...boundsList.map(b => b.minY));
      const maxX = Math.max(...boundsList.map(b => b.maxX));
      const maxY = Math.max(...boundsList.map(b => b.maxY));

      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error("Could not create canvas context for rasterization."));
      }

      imagesToCompose.forEach(img => {
        const rotation = getImageRotation(img);
        const centerX = img.x + img.width / 2;
        const centerY = img.y + img.height / 2;
        ctx.save();
        ctx.translate(centerX - minX, centerY - minY);
        ctx.rotate(rotation);
        ctx.drawImage(img.element, -img.width / 2, -img.height / 2, img.width, img.height);
        ctx.restore();
      });

      const newImg = new Image();
      newImg.onload = async () => {
        try {
          // FIX: Await the fetch call before calling .blob()
          const blob = await (await fetch(newImg.src)).blob();
          const newFile = new File([blob], 'composite.png', { type: 'image/png' });
          const naturalWidth = newImg.naturalWidth || newImg.width || width;
          const naturalHeight = newImg.naturalHeight || newImg.height || height;
          const displayWidth = newImg.width || naturalWidth;
          const displayHeight = newImg.height || naturalHeight;
          resolve({
            element: newImg,
            mediaType: 'image',
            x: minX,
            y: minY,
            width: displayWidth,
            height: displayHeight,
            naturalWidth,
            naturalHeight,
            file: newFile,
            isPlaying: false,
            hasAudio: false,
          });
        } catch (e) {
          reject(e);
        }
      };
      newImg.onerror = (err) => reject(err);
      newImg.src = canvas.toDataURL('image/png');
    });
  };

  const handleCommit = useCallback(() => {
    if (liveImages !== null || livePaths !== null || liveNotes !== null) {
      setState(prevState => ({
        images: liveImages ?? prevState.images,
        paths: livePaths ?? prevState.paths,
        notes: liveNotes ?? prevState.notes,
      }));
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
    }
  }, [liveImages, livePaths, liveNotes, setState]);

  const handleToolChange = useCallback((newTool: Tool) => {
    setTool(newTool);
    if (editingNoteId) {
      setEditingNoteId(null);
      handleCommit();
    }
    if (cropMode) {
      setCropMode(null);
    }
  }, [editingNoteId, handleCommit, cropMode]);

  const handleGenerate = useCallback(async (generationOverrideOrEvent?: GenerationInputs | React.SyntheticEvent) => {
    // Ignore React synthetic events passed from onClick handlers
    const generationOverride = generationOverrideOrEvent && 'kind' in generationOverrideOrEvent
      ? generationOverrideOrEvent
      : undefined;
    const overrideKind = generationOverride?.kind;
    const promptForRun = generationOverride?.prompt ?? prompt;
    const trimmedPrompt = promptForRun.trim();
    const apiProviderForRun = isApiProvider(generationOverride?.provider) ? generationOverride.provider : apiProvider;
    const overrideModelId = generationOverride?.modelId;
    const falModelModeForRun = isFalModelMode(generationOverride?.modelMode) ? generationOverride.modelMode : falModelMode;
    const falImageModelIdForRun = isFalImageModelId(overrideModelId) ? overrideModelId : falImageModelId;
    const falVideoModelIdForRun = isFalVideoModelId(overrideModelId) ? overrideModelId : falVideoModelId;
    const falModelIdForRun: FalModelId = falModelModeForRun === 'video' ? falVideoModelIdForRun : falImageModelIdForRun;
    const falOptionsOverride = generationOverride?.falOptions ?? {};
    // Map placeholder to default for actual generation
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
    const primaryImageIdForRun = generationOverride ? generationOverride.primaryImageId ?? null : primaryImageId;
    const primaryImageForRun = primaryImageIdForRun
      ? images.find(img => img.id === primaryImageIdForRun) || null
      : null;
    const activePrimaryImage = isImageCanvasMedia(primaryImageForRun) ? primaryImageForRun : null;

    // Debug logging for generation source tracking
    // if (generationOverride) {
    //   console.log('[Generate] Using override - primaryImageId:', generationOverride.primaryImageId);
    //   console.log('[Generate] Resolved primaryImageIdForRun:', primaryImageIdForRun);
    //   console.log('[Generate] Found primaryImageForRun:', primaryImageForRun?.id);
    //   console.log('[Generate] activePrimaryImage:', activePrimaryImage?.id);
    // }
    const referenceImageIdsForRun = generationOverride ? generationOverride.referenceImageIds ?? [] : referenceImageIds;
    const videoLastFrameImageId = generationOverride?.videoLastFrameImageId;

    const usingFal = apiProviderForRun === 'fal';
    const isVideoMode = usingFal && falModelModeForRun === 'video';
    const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelIdForRun);
    const isGeminiModel = !isVideoMode && falModelIdForRun === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
    const isReveModel = !isVideoMode && falModelIdForRun === REVE_TEXT_TO_IMAGE_MODEL_ID;
    const isKlingModel = !isVideoMode && falModelIdForRun === KLING_IMAGE_MODEL_ID;
    const normalizedFalResolutionSelectionForRun =
      isKlingModel && falResolutionSelectionForRun === '4K' ? '2K' : falResolutionSelectionForRun;
    const isCrystalUpscaleModel = !isVideoMode && falModelIdForRun === CRYSTAL_UPSCALER_MODEL_ID;
    const isSeedvrUpscaleModel = !isVideoMode && falModelIdForRun === SEEDVR_UPSCALER_MODEL_ID;
    const isUpscaleModel = isCrystalUpscaleModel || isSeedvrUpscaleModel;
    const isHailuoStandardVideoModel = isVideoMode && falModelIdForRun === HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID;
    const isTextToImage = overrideKind ? overrideKind === 'text_to_image' : !activePrimaryImage;
    const requiresPrompt = !(usingFal && isUpscaleModel);
    const requiresVideoSourceImage = usingFal && isVideoMode;
    const generationKind: GenerationKind = overrideKind
      ?? (isVideoMode ? 'video' : isTextToImage ? 'text_to_image' : isUpscaleModel ? 'upscale' : 'image_edit');

    if (requiresPrompt && !trimmedPrompt) {
      setError(isTextToImage ? 'Please describe the image you want to create.' : 'Please write a prompt to describe your edit.');
      return;
    }

    if (requiresVideoSourceImage && !activePrimaryImage) {
      setError('Select an image to use as the first frame for your video.');
      return;
    }

    if (isVideoMode) {
      const falJobId = crypto.randomUUID();
      const jobModelLabel = getFalModelLabel(falModelIdForRun);
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

      const newJob: FalQueueJob = {
        id: falJobId,
        prompt: trimmedPrompt,
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

      setError(null);

      try {
        if (!activePrimaryImage) {
          throw new Error('Unable to find the starting frame for this video.');
        }
        const videoSourceImage = activePrimaryImage.element as HTMLImageElement;
        const videoResult = await generateFalImageToVideo(trimmedPrompt, videoSourceImage, {
          modelId: falVideoModelIdForRun,
          duration: isHailuoStandardVideoModel ? falVideoDurationForRun : undefined,
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
          } catch (playErr) {
            console.error('Failed to autoplay generated video', playErr);
            videoElement.pause();
            isPlaying = false;
          }

          const { naturalWidth, naturalHeight } = getNaturalSize(videoElement);
          const displayWidth = naturalWidth || 1;
          const displayHeight = naturalHeight || 1;
          const primaryBounds = getImageBounds(activePrimaryImage);
          const placementX = primaryBounds.maxX + 20;
          const placementY = primaryBounds.minY;
          const placement = findNonOverlappingPlacement(displayWidth, displayHeight, placementX, placementY);
          const audioTrackInfo = (videoElement as unknown as { audioTracks?: { length?: number } }).audioTracks;
          const hasAudio = Boolean(
            (videoElement as unknown as { mozHasAudio?: boolean }).mozHasAudio ||
            (audioTrackInfo && typeof audioTrackInfo.length === 'number' && audioTrackInfo.length > 0)
          );

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
                primaryImageId: primaryImageIdForRun ?? undefined,
                // Track original source through chains (e.g., if source was itself a generated edit)
                ...(activePrimaryImage?.metadata?.generation?.originalSourceImageId
                  ? { originalSourceImageId: activePrimaryImage.metadata.generation.originalSourceImageId }
                  : primaryImageIdForRun ? { originalSourceImageId: primaryImageIdForRun } : {}),
                ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
                falOptions: { videoDuration: falVideoDurationForRun },
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
          setTool(Tool.SELECTION);

          setToastMessage('Video added to canvas');
        } catch (loadErr) {
          console.error('Failed to load generated video into canvas', loadErr);
          setToastMessage('Video ready! Open from the Fal Queue panel.');
        }
        setTimeout(() => setToastMessage(null), 2000);
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        const userFacingMessage = buildFalDisplayError(message) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE;

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

        setError(userFacingMessage);
      }

      return;
    }

    if (usingFal && isUpscaleModel && isTextToImage) {
      setError('Please select an image to upscale.');
      return;
    }

    const generationModelLabel = usingFal ? getFalModelLabel(falModelIdForRun) : GOOGLE_MODEL_LABEL;
    const shouldValidateFalOptions = usingFal && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
    const isNumImagesInvalid =
      !Number.isFinite(falNumImagesForRun) ||
      falNumImagesForRun < 1 ||
      falNumImagesForRun > 4;
    const normalizedFalNumImages = Math.min(4, Math.max(1, Math.floor(Number.isFinite(falNumImagesForRun) ? falNumImagesForRun :
      1)));
    const googleAspectRatio = isGeminiModel && falAspectRatioSelectionForRun !== 'default'
      ? falAspectRatioSelectionForRun
      : undefined;

    if (!isTextToImage) {
      if (!primaryImageIdForRun || !activePrimaryImage) {
        setError('Please select an image to edit.');
        return;
      }

      if (usingFal && !isUpscaleModel && isReveModel) {
        setError('Reve Image only supports text-to-image generation. Please switch to Gemini 3 Pro Image Preview or Seedream for edits.');
        return;
      }

      if (!isUpscaleModel) {
        if (appMode === 'CANVAS' && tool !== Tool.SELECTION && tool !== Tool.FREE_SELECTION) {
          setError('In Canvas Mode, please use the Select tool to perform a general image edit.');
          return;
        }

        const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);

        if (appMode === 'INPAINT' && !hasInpaintMask) {
          setError('Please use the Brush tool to draw an inpaint mask before generating.');
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

    // After generation starts, update placeholder to default so user sees "Match Source"
    if (rawFalImageSizeSelection === 'placeholder' && !falOptionsOverride.imageSizeSelection) {
      setFalImageSizeSelection('default');
    }
    if (rawFalAspectRatioSelection === 'placeholder' && !falOptionsOverride.aspectRatioSelection) {
      setFalAspectRatioSelection('default');
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
              : isKlingModel
                ? KLING_IMAGE_MODEL_ID
                : GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID;

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
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }
                return applyFalQueueUpdateToJob(job, update);
              }));
            },
            modelId: textToImageModelId,
            aspectRatio: (isGeminiModel || isReveModel || isKlingModel) ? falAspectRatioSelectionForRun : 'default',
            ...(isGeminiModel ? { resolution: falResolutionSelectionForRun } : {}),
            ...(isKlingModel ? { resolution: normalizedFalResolutionSelectionForRun } : {}),
            ...(isSeedreamModel ? { imageSize: falImageSizeSelectionForRun } : {}),
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
        if (!primaryImageIdForRun || !activePrimaryImage) {
          throw new Error('Unable to locate selected image for editing.');
        }

        if (usingFal && isUpscaleModel) {
          if (!falJobId) {
            throw new Error('Unable to create Fal job identifier.');
          }

          const primaryBounds = getImageBounds(activePrimaryImage);
          placementOrigin = {
            x: primaryBounds.maxX + 20,
            y: primaryBounds.minY,
          };

          const queueOptions = {
            onQueueUpdate: (update: FalQueueUpdate) => {
              setFalJobs(prev => prev.map(job => {
                if (job.id !== falJobId) {
                  return job;
                }
                return applyFalQueueUpdateToJob(job, update);
              }));
            },
          };

          const falResult = isSeedvrUpscaleModel
            ? await upscaleFalSeedvrImage(activePrimaryImage.element, falScaleFactorForRun, falNoiseScaleForRun, queueOptions)
            : await upscaleFalCrystalImage(activePrimaryImage.element, falScaleFactorForRun, falCreativityForRun, queueOptions);

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
          const maxReferenceImages = getMaxReferenceImages(falModelIdForRun);
          const referenceCanvasImages = referenceImageIdsForRun
            .map(id => images.find(img => img.id === id))
            .filter((img): img is CanvasImage & { element: HTMLImageElement } => isImageCanvasMedia(img))
            .slice(0, maxReferenceImages);

          if (generationOverride && referenceImageIdsForRun.length > referenceCanvasImages.length) {
            setError('One or more reference images for this generation are missing from the canvas.');
            return;
          }

          referenceIdsUsed = referenceCanvasImages.map(img => img.id);

          const allSelectedImages = [activePrimaryImage, ...referenceCanvasImages];

          const shouldCompose = referenceCanvasImages.length > 0 &&
            referenceCanvasImages.some(refImg => isOverlapping(activePrimaryImage, refImg));
          const activeNeedsRasterize = (activePrimaryImage.rotation ?? 0) !== 0;

          let referenceImagesForAPI: HTMLImageElement[] = [];

          const prepareReferenceImage = async (img: CanvasImage & { element: HTMLImageElement }): Promise<HTMLImageElement> => {
            if ((img.rotation ?? 0) === 0) {
              return img.element;
            }
            const rasterized = await rasterizeImages([img]);
            return rasterized.element;
          };

          if (shouldCompose || activeNeedsRasterize) {
            const imageIdsToCompose = shouldCompose
              ? allSelectedImages.map(img => img.id)
              : [activePrimaryImage.id];
            const imagesToCompose = images.filter(img => imageIdsToCompose.includes(img.id));
            const composed = await rasterizeImages(imagesToCompose);
            sourceImageForAPI = composed;
            referenceImagesForAPI = shouldCompose
              ? []
              : await Promise.all(referenceCanvasImages.map(prepareReferenceImage));
          } else {
            sourceImageForAPI = {
              element: activePrimaryImage.element,
              x: activePrimaryImage.x,
              y: activePrimaryImage.y,
              width: activePrimaryImage.width,
              height: activePrimaryImage.height,
              naturalWidth: activePrimaryImage.naturalWidth,
              naturalHeight: activePrimaryImage.naturalHeight,
              file: activePrimaryImage.file,
            };
            referenceImagesForAPI = await Promise.all(referenceCanvasImages.map(prepareReferenceImage));
          }

          if (!sourceImageForAPI) {
            throw new Error('Failed to prepare source image for editing.');
          }

          const translatedPaths = paths.map(path => ({
            ...path,
            points: path.points.map(point => ({
              x: point.x - sourceImageForAPI.x,
              y: point.y - sourceImageForAPI.y,
            })),
          }));

          const naturalWidth = sourceImageForAPI.naturalWidth || sourceImageForAPI.element.naturalWidth || sourceImageForAPI.width;
          const naturalHeight = sourceImageForAPI.naturalHeight || sourceImageForAPI.element.naturalHeight || sourceImageForAPI.height;
          const scaleX = sourceImageForAPI.width === 0 ? 1 : naturalWidth / sourceImageForAPI.width;
          const scaleY = sourceImageForAPI.height === 0 ? 1 : naturalHeight / sourceImageForAPI.height;

          const scaledPaths = translatedPaths.map(path => ({
            ...path,
            size: path.size * scaleX,
            points: path.points.map(point => ({
              x: point.x * scaleX,
              y: point.y * scaleY,
            })),
          }));

          const hasAnnotationStrokes = paths.some(path => path.tool === Tool.ANNOTATE && path.points.length > 0);

          const toolForApi =
            appMode === 'ANNOTATE'
              ? (hasAnnotationStrokes ? Tool.ANNOTATE : Tool.SELECTION)
              : appMode === 'INPAINT'
                ? Tool.INPAINT
                : tool;

          const basePayload = {
            prompt: trimmedPrompt,
            image: sourceImageForAPI.element,
            tool: toolForApi,
            paths: scaledPaths,
            imageDimensions: { width: naturalWidth, height: naturalHeight },
            inpaintMode,
            referenceImages: referenceImagesForAPI,
          } as const;

          placementOrigin = {
            x: sourceImageForAPI.x + sourceImageForAPI.width + 20,
            y: sourceImageForAPI.y,
          };

          if (usingFal) {
            if (!falJobId) {
              throw new Error('Unable to create Fal job identifier.');
            }

            const falResult = await generateFalImageEdit(basePayload, {
              modelId: falModelIdForRun,
              onQueueUpdate: (update) => {
                setFalJobs(prev => prev.map(job => {
                  if (job.id !== falJobId) {
                    return job;
                  }
                  return applyFalQueueUpdateToJob(job, update);
                }));
              },
              ...(isSeedreamModel
                ? {
                  imageSize: falImageSizeSelectionForRun === 'default'
                    ? 'default'
                    : falImageSizeSelectionForRun,
                }
                : {}),
              ...(isGeminiModel || isKlingModel
                ? {
                  aspectRatio: falAspectRatioSelectionForRun,
                  resolution: isKlingModel ? normalizedFalResolutionSelectionForRun : falResolutionSelectionForRun,
                }
                : {}),
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
            generationResult = await generateGoogleImageEdit({
              ...basePayload,
              mimeType: sourceImageForAPI.file.type || 'image/png',
            });
          }
        }
      }

      const falOptionsForGeneration = usingFal
        ? {
          ...(isSeedreamModel ? { imageSizeSelection: falImageSizeSelectionForRun } : {}),
          ...(isGeminiModel || isReveModel || isKlingModel ? { aspectRatioSelection: falAspectRatioSelectionForRun } : {}),
          ...(isGeminiModel || isKlingModel
            ? { resolutionSelection: isKlingModel ? normalizedFalResolutionSelectionForRun : falResolutionSelectionForRun }
            : {}),
          numImages: normalizedFalNumImages,
          ...(isUpscaleModel ? { scaleFactor: falScaleFactorForRun } : {}),
          ...(isSeedvrUpscaleModel ? { noiseScale: falNoiseScaleForRun } : {}),
          ...(isCrystalUpscaleModel ? { creativity: falCreativityForRun } : {}),
        }
        : undefined;

      // Track the original source image through chains of edits
      // If the source image was itself an edit, use its originalSourceImageId
      // Otherwise, the source image is the original
      const sourceOriginalId = activePrimaryImage?.metadata?.generation?.originalSourceImageId;
      const originalSourceImageId = activePrimaryImage && !isTextToImage
        ? (sourceOriginalId ?? activePrimaryImage.id)
        : undefined;

      const generationDetails: GenerationInputs = {
        kind: generationKind,
        prompt: trimmedPrompt,
        provider: apiProviderForRun,
        modelLabel: generationModelLabel,
        ...(usingFal ? { modelId: falModelIdForRun, modelMode: falModelModeForRun } : {}),
        ...(activePrimaryImage && !isTextToImage ? { primaryImageId: activePrimaryImage.id } : {}),
        ...(originalSourceImageId ? { originalSourceImageId } : {}),
        ...(referenceIdsUsed.length > 0 ? { referenceImageIds: referenceIdsUsed } : {}),
        ...(falOptionsForGeneration ? { falOptions: falOptionsForGeneration } : {}),
      };

      const generatedBase64Images = generationResult.imagesBase64.length > 0
        ? generationResult.imagesBase64
        : [generationResult.imageBase64];

      const generatedCanvasImages: CanvasImage[] = [];
      let yOffset = 0;

      for (let index = 0; index < generatedBase64Images.length; index += 1) {
        const base64 = generatedBase64Images[index];
        const dataUrl = `data:image/png;base64,${base64}`;
        const element = await loadImageFromDataUrl(dataUrl);
        const blob = await (await fetch(dataUrl)).blob();
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        const displayWidth = (element as HTMLImageElement).width || naturalWidth;
        const displayHeight = (element as HTMLImageElement).height || naturalHeight;
        const fileSuffix = generatedBase64Images.length === 1 ? '' : `_${index + 1}`;
        const file = new File([blob], `generated_image${fileSuffix}.png`, { type: 'image/png' });

        const metadata: CanvasImage['metadata'] = {
          source: 'generated',
          modelLabel: generationModelLabel,
          ...(requiresPrompt ? { prompt: trimmedPrompt } : {}),
          generation: generationDetails,
        };

        if (usingFal && isUpscaleModel) {
          if (Number.isFinite(falScaleFactorForRun) && falScaleFactorForRun > 0) {
            metadata.upscaleFactor = falScaleFactorForRun;
          }
          if (isSeedvrUpscaleModel && Number.isFinite(falNoiseScaleForRun)) {
            metadata.noiseScale = Math.round(falNoiseScaleForRun * 10) / 10;
          }
          if (isCrystalUpscaleModel && Number.isFinite(falCreativityForRun)) {
            const normalizedCreativity = Math.round(falCreativityForRun * 2) / 2;
            metadata.creativity = Math.min(10, Math.max(0, normalizedCreativity));
          }
        }

        generatedCanvasImages.push({
          id: crypto.randomUUID(),
          element,
          mediaType: 'image',
          x: placementOrigin.x,
          y: placementOrigin.y + yOffset,
          width: displayWidth,
          height: displayHeight,
          rotation: 0,
          naturalWidth,
          naturalHeight,
          file,
          isPlaying: false,
          hasAudio: false,
          metadata,
        });

        yOffset += displayHeight + 20;
      }

      if (generatedCanvasImages.length > 0) {
        setState(prevState => ({
          ...prevState,
          images: [...prevState.images, ...generatedCanvasImages],
        }));
      }

      setReferenceImageIds([]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      const userFacingMessage = usingFal
        ? (buildFalDisplayError(message) ?? message ?? FAL_PROVIDER_DOWN_MESSAGE)
        : message;

      if (usingFal && falJobId) {
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
    } finally {
      if (!usingFal) {
        setIsLoading(false);
      }
    }
  }, [
    apiProvider,
    appMode,
    falAspectRatioSelection,
    falImageSizeSelection,
    falResolutionSelection,
    falImageModelId,
    falModelMode,
    falVideoDuration,
    falVideoModelId,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    images,
    inpaintMode,
    paths,
    primaryImageId,
    prompt,
    referenceImageIds,
    setError,
    setFalJobs,
    setIsLoading,
    setReferenceImageIds,
    setSelectedImageIds,
    setSelectedNoteIds,
    setState,
    setToastMessage,
    tool,
  ]);

  const handleRerunGeneration = useCallback((imageId: string) => {
    const targetImage = displayedImages.find(img => img.id === imageId);
    const generation = targetImage?.metadata?.generation;

    // Debug logging for re-run troubleshooting
    // console.log('[Re-run] Target image ID:', imageId);
    // console.log('[Re-run] Generation metadata:', generation);
    // console.log('[Re-run] Primary image ID (source):', generation?.primaryImageId);
    // console.log('[Re-run] Original source ID:', generation?.originalSourceImageId);

    if (!targetImage || !generation) {
      setToastMessage('No generation data stored for this media.');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }

    const provider = isApiProvider(generation.provider) ? generation.provider : null;
    if (!provider || !AVAILABLE_PROVIDERS.includes(provider)) {
      setError('Saved generation provider is not available. Please regenerate with the current settings.');
      return;
    }

    const storedModelId = generation.modelId;
    const storedModelMode: FalModelMode = isFalModelMode(generation.modelMode)
      ? generation.modelMode
      : isFalVideoModelId(storedModelId)
        ? 'video'
        : 'image';
    const modelIdForOverride = provider === 'fal'
      ? (storedModelMode === 'video'
        ? (isFalVideoModelId(storedModelId) ? storedModelId : falVideoModelId)
        : (isFalImageModelId(storedModelId) ? storedModelId : falImageModelId))
      : undefined;

    const falOptions = generation.falOptions ?? {};
    const overrideFalOptions = provider === 'fal'
      ? {
        ...(isFalImageSizeSelectionValue((falOptions as { imageSizeSelection?: unknown }).imageSizeSelection)
          ? { imageSizeSelection: falOptions.imageSizeSelection }
          : {}),
        ...(isFalAspectRatioSelectionValue((falOptions as { aspectRatioSelection?: unknown }).aspectRatioSelection)
          ? { aspectRatioSelection: falOptions.aspectRatioSelection }
          : {}),
        ...(isFalResolutionSelectionValue((falOptions as { resolutionSelection?: unknown }).resolutionSelection)
          ? { resolutionSelection: falOptions.resolutionSelection }
          : {}),
        ...(typeof falOptions.numImages === 'number' && Number.isFinite(falOptions.numImages)
          ? { numImages: falOptions.numImages }
          : {}),
        ...(typeof falOptions.scaleFactor === 'number' && Number.isFinite(falOptions.scaleFactor)
          ? { scaleFactor: falOptions.scaleFactor }
          : {}),
        ...(typeof falOptions.noiseScale === 'number' && Number.isFinite(falOptions.noiseScale)
          ? { noiseScale: falOptions.noiseScale }
          : {}),
        ...(typeof falOptions.creativity === 'number' && Number.isFinite(falOptions.creativity)
          ? { creativity: falOptions.creativity }
          : {}),
        ...(falOptions.videoDuration === '10' || falOptions.videoDuration === '6'
          ? { videoDuration: falOptions.videoDuration }
          : {}),
      }
      : undefined;

    const primaryId = generation.kind === 'text_to_image' ? null : generation.primaryImageId ?? null;
    // console.log('[Re-run] Resolved primaryId for generation:', primaryId);

    if (generation.kind !== 'text_to_image' && !primaryId) {
      setError('This media is missing its original source image and cannot be re-run.');
      return;
    }

    if (primaryId) {
      const sourceImage = images.find(img => img.id === primaryId);
      // console.log('[Re-run] Found source image:', sourceImage?.id, 'mediaType:', sourceImage?.mediaType);
      if (!sourceImage) {
        setError('The original source image is no longer on the canvas.');
        return;
      }
      if (generation.kind === 'video' && sourceImage.mediaType !== 'image') {
        setError('The saved starting frame for this video is not available.');
        return;
      }
    }

    if (generation.kind === 'video' && generation.videoLastFrameImageId) {
      const lastFrame = images.find(img => img.id === generation.videoLastFrameImageId);
      if (!lastFrame) {
        setError('The saved ending frame for this video is missing.');
        return;
      }
    }

    const referenceIds = Array.isArray(generation.referenceImageIds) ? generation.referenceImageIds : [];
    const missingReferenceIds = referenceIds.filter(id => !images.some(img => img.id === id));
    if (missingReferenceIds.length > 0) {
      setError('Some reference images from the original generation are missing from the canvas.');
      return;
    }

    setPrompt(generation.prompt ?? '');
    setApiProvider(provider);
    setReferenceImageIds(referenceIds);

    if (provider === 'fal') {
      setFalModelMode(storedModelMode);
      if (storedModelMode === 'video') {
        if (isFalVideoModelId(modelIdForOverride)) {
          setFalVideoModelId(modelIdForOverride);
        }
        if (overrideFalOptions?.videoDuration) {
          setFalVideoDuration(overrideFalOptions.videoDuration);
        }
      } else if (isFalImageModelId(modelIdForOverride)) {
        setFalImageModelId(modelIdForOverride);
      }

      if (overrideFalOptions?.imageSizeSelection) {
        setFalImageSizeSelection(overrideFalOptions.imageSizeSelection);
      }
      if (overrideFalOptions?.aspectRatioSelection) {
        setFalAspectRatioSelection(overrideFalOptions.aspectRatioSelection);
      }
      if (overrideFalOptions?.resolutionSelection) {
        setFalResolutionSelection(overrideFalOptions.resolutionSelection);
      }
      if (overrideFalOptions?.numImages !== undefined) {
        setFalNumImages(overrideFalOptions.numImages);
      }
      if (overrideFalOptions?.scaleFactor !== undefined) {
        setFalScaleFactor(overrideFalOptions.scaleFactor);
      }
      if (overrideFalOptions?.noiseScale !== undefined) {
        setFalNoiseScale(overrideFalOptions.noiseScale);
      }
      if (overrideFalOptions?.creativity !== undefined) {
        setFalCreativity(overrideFalOptions.creativity);
      }
    } else if (falModelMode === 'video') {
      setFalModelMode('image');
    }

    handleGenerate({
      kind: generation.kind,
      prompt: generation.prompt ?? '',
      provider,
      modelId: provider === 'fal' ? modelIdForOverride : undefined,
      modelMode: provider === 'fal' ? storedModelMode : 'image',
      primaryImageId: primaryId,
      referenceImageIds: referenceIds,
      videoLastFrameImageId: generation.videoLastFrameImageId,
      falOptions: provider === 'fal' ? overrideFalOptions : undefined,
    });
  }, [
    displayedImages,
    handleGenerate,
    falImageModelId,
    falModelMode,
    falVideoDuration,
    falVideoModelId,
    images,
    setApiProvider,
    setError,
    setFalAspectRatioSelection,
    setFalCreativity,
    setFalImageModelId,
    setFalImageSizeSelection,
    setFalModelMode,
    setFalNoiseScale,
    setFalNumImages,
    setFalResolutionSelection,
    setFalScaleFactor,
    setFalVideoDuration,
    setFalVideoModelId,
    setPrompt,
    setReferenceImageIds,
    setToastMessage,
  ]);

  const handleBackgroundRemoval = useCallback(async () => {
    if (!hasSingleImageSelected || !primaryImageId) {
      setError('Please select an image to remove the background.');
      return;
    }

    if (!primaryImage) {
      setError('Selected image not found. Please select another image.');
      return;
    }

    if (!isImageCanvasMedia(primaryImage)) {
      setError('Background removal is only available for images.');
      return;
    }

    setError(null);
    setIsRemovingBackground(true);

    try {
      const removalResult = await removeFalBackground(primaryImage.element);
      const dataUrl = `data:image/png;base64,${removalResult.imageBase64}`;
      const element = await loadImageFromDataUrl(dataUrl);
      const blob = await (await fetch(dataUrl)).blob();
      const { naturalWidth, naturalHeight } = getNaturalSize(element);
      const displayWidth = element.width || naturalWidth;
      const displayHeight = element.height || naturalHeight;

      const originalName = primaryImage.file?.name || 'image.png';
      const baseName = originalName.includes('.')
        ? originalName.slice(0, originalName.lastIndexOf('.'))
        : originalName;
      const fileName = `${baseName || 'image'}_no_bg.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const primaryBounds = getImageBounds(primaryImage);
      const targetX = primaryBounds.maxX + 20;
      const spacing = 20;
      const existingImages = displayedImages;
      let offsetMultiplier = 0;
      let placementY = primaryBounds.minY;
      const maxAttempts = existingImages.length + 10;

      const createCandidate = (y: number): CanvasImage => ({
        id: 'candidate',
        element,
        mediaType: 'image',
        x: targetX,
        y,
        width: displayWidth,
        height: displayHeight,
        rotation: primaryImage.rotation ?? 0,
        naturalWidth,
        naturalHeight,
        file,
        isPlaying: false,
        hasAudio: false,
        metadata: primaryImage.metadata
          ? { ...primaryImage.metadata }
          : { source: 'derived' },
      });

      while (
        offsetMultiplier <= maxAttempts &&
        existingImages.some(img => isOverlapping(img, createCandidate(placementY)))
      ) {
        offsetMultiplier += 1;
        placementY = primaryBounds.minY + offsetMultiplier * (element.height + spacing);
      }

      const newImage: CanvasImage = {
        ...createCandidate(placementY),
        id: crypto.randomUUID(),
      };

      setState(prevState => ({
        ...prevState,
        images: [...prevState.images, newImage],
      }));

      setSelectedImageIds([newImage.id]);
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to remove background.';
      setError(message);
    } finally {
      setIsRemovingBackground(false);
    }
  }, [
    hasSingleImageSelected,
    primaryImageId,
    primaryImage,
    displayedImages,
    getImageBounds,
    setError,
    setIsRemovingBackground,
    setReferenceImageIds,
    setSelectedImageIds,
    setSelectedNoteIds,
    setState,
  ]);

  // Crop handlers
  const handleStartCrop = useCallback((imageId: string) => {
    const imageToCrop = displayedImages.find(img => img.id === imageId);
    if (!imageToCrop) return;
    if (imageToCrop.mediaType !== 'image') {
      setError('Cropping is only available for images.');
      return;
    }
    setCropMode({
      imageId: imageId,
      rect: { x: 0, y: 0, width: imageToCrop.width, height: imageToCrop.height },
    });
  }, [displayedImages, setError]);

  const handleCropRectChange = useCallback((rect: { x: number; y: number; width: number; height: number; }) => {
    setCropMode(prev => prev ? { ...prev, rect } : null);
  }, []);

  const handleCancelCrop = useCallback(() => {
    setCropMode(null);
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!cropMode) return;

    const originalImage = history[historyIndex].images.find(img => img.id === cropMode.imageId);
    if (!originalImage) return;
    if (originalImage.mediaType !== 'image') {
      setError('Cropping is only available for images.');
      handleCancelCrop();
      return;
    }

    const { rect } = cropMode;
    if (rect.width <= 0 || rect.height <= 0) {
      handleCancelCrop();
      return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.width;
    tempCanvas.height = rect.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      originalImage.element,
      rect.x, rect.y, rect.width, rect.height,
      0, 0, rect.width, rect.height
    );

    const croppedImageURL = tempCanvas.toDataURL('image/png');
    const newImg = new Image();
    newImg.onload = async () => {
      const blob = await (await fetch(newImg.src)).blob();
      const newFile = new File([blob], "cropped_image.png", { type: "image/png" });
      const naturalWidth = newImg.naturalWidth || newImg.width || 1;
      const naturalHeight = newImg.naturalHeight || newImg.height || 1;
      const displayWidth = newImg.width || naturalWidth;
      const displayHeight = newImg.height || naturalHeight;

      const updatedImage: CanvasImage = {
        ...originalImage,
        element: newImg,
        mediaType: 'image',
        x: originalImage.x + rect.x,
        y: originalImage.y + rect.y,
        width: displayWidth,
        height: displayHeight,
        naturalWidth,
        naturalHeight,
        file: newFile,
        isPlaying: false,
        hasAudio: false,
      };

      setState(prevState => ({
        ...prevState,
        images: prevState.images.map(img => img.id === originalImage.id ? updatedImage : img),
      }));
      setSelectedImageIds([originalImage.id]);
      setCropMode(null);
    };
    newImg.src = croppedImageURL;

  }, [cropMode, handleCancelCrop, history, historyIndex, setError, setState]);

  // Transform handlers
  const handleStartTransform = useCallback((imageId: string) => {
    const imageToTransform = displayedImages.find(img => img.id === imageId);
    if (!imageToTransform) return;
    setTransformMode({ imageId });
  }, [displayedImages]);

  const handleExitTransform = useCallback(() => {
    setTransformMode(null);
  }, []);

  useEffect(() => {
    // When a new note is added using the Note tool, switch to the free selection tool
    // to prevent accidental creation of multiple notes.
    if (tool === Tool.NOTE && displayedNotes.length > prevDisplayedNotesLength.current) {
      handleToolChange(Tool.FREE_SELECTION);
    }
    // Update the ref for the next render.
    prevDisplayedNotesLength.current = displayedNotes.length;
  }, [displayedNotes, tool, handleToolChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (cropMode) {
        if (e.key === 'Enter') handleConfirmCrop();
        if (e.key === 'Escape') handleCancelCrop();
        return;
      }
      if (transformMode) {
        if (e.key === 'Enter' || e.key === 'Escape') handleExitTransform();
        return;
      }
      if (editingNoteId) return; // Don't handle shortcuts while editing a note
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = e.key;
      const keyLower = key.toLowerCase();

      if (keyLower === 'escape' && tool === Tool.NOTE) {
        handleToolChange(Tool.SELECTION);
        return;
      }

      const isDecreaseKey = key === '[' || key === '{';
      const isIncreaseKey = key === ']' || key === '}';
      const isBrushToolActive = tool === Tool.BRUSH;
      const isEraserToolActive = tool === Tool.ERASE;

      if ((isDecreaseKey || isIncreaseKey) && (isBrushToolActive || isEraserToolActive)) {
        e.preventDefault();
        const delta = isDecreaseKey ? -1 : 1;
        if (isBrushToolActive) {
          adjustBrushSize(delta);
        } else {
          adjustEraserSize(delta);
        }
        return;
      }

      switch (keyLower) {
        case 'v': handleToolChange(Tool.SELECTION); break;
        case 'f': handleToolChange(Tool.FREE_SELECTION); break;
        case 'h': handleToolChange(Tool.PAN); break;
        case 'b': if (appMode !== 'CANVAS') handleToolChange(Tool.BRUSH); break;
        case 'e': handleToolChange(Tool.ERASE); break;
        case 'n': handleToolChange(Tool.NOTE); break;
        case '=':
        case '+':
          e.preventDefault();
          requestZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          requestZoomOut();
          break;
        case 'delete':
        case 'backspace':
          handleDelete();
          break;
        case '.':
          if (images.length > 0 || notes.length > 0) {
            handleZoomToFit();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleDelete,
    handleZoomToFit,
    images,
    notes,
    editingNoteId,
    tool,
    handleToolChange,
    appMode,
    cropMode,
    handleConfirmCrop,
    handleCancelCrop,
    transformMode,
    handleExitTransform,
    requestZoomIn,
    requestZoomOut,
    adjustBrushSize,
    adjustEraserSize,
  ]);

  useEffect(() => {
    const handleGlobalSubmit = (e: KeyboardEvent) => {
      if (cropMode || transformMode) return;

      const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
      const isVideoMode = falModelMode === 'video';
      const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelId);
      const isGeminiModel = !isVideoMode && falModelId === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
      const isReveModel = !isVideoMode && falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
      const isKlingModel = !isVideoMode && falModelId === KLING_IMAGE_MODEL_ID;
      const shouldValidateFalOptions = apiProvider === 'fal' && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
      const isNumImagesInvalid =
        !Number.isFinite(falNumImages) ||
        falNumImages < 1 ||
        falNumImages > 4;

      const isTextToImage = !activePrimaryImage;
      const promptEmpty = prompt.trim().length === 0;
      const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);
      const requiresSelectedImageForVideo = apiProvider === 'fal' && isVideoMode && isTextToImage;

      const submitDisabled = promptEmpty ||
        (shouldValidateFalOptions && isNumImagesInvalid) ||
        requiresSelectedImageForVideo ||
        (!isVideoMode && !isTextToImage && (
          (apiProvider === 'fal' && isReveModel) ||
          (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
          (appMode === 'INPAINT' && !hasInpaintMask)
        ));

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();

        if (!isLoading && !submitDisabled) {
          handleGenerate();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalSubmit);
    return () => {
      window.removeEventListener('keydown', handleGlobalSubmit);
    };
  }, [
    isLoading,
    activePrimaryImage,
    tool,
    appMode,
    paths,
    handleGenerate,
    cropMode,
    transformMode,
    apiProvider,
    falModelId,
    falModelMode,
    falNumImages,
    prompt,
  ]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (canUndo) {
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState(prev => ({ ...prev, index: prev.index - 1 }));
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setLiveImages(null);
      setLivePaths(null);
      setLiveNotes(null);
      setHistoryState(prev => ({ ...prev, index: prev.index + 1 }));
    }
  }, [canRedo]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const { naturalWidth, naturalHeight } = getNaturalSize(img);
          const displayWidth = img.width || naturalWidth;
          const displayHeight = img.height || naturalHeight;
          setState(prevState => {
            let newX = 0;
            let newY = 0;
            if (prevState.images.length > 0) {
              const lastImage = prevState.images[prevState.images.length - 1];
              const lastBounds = getImageBounds(lastImage);
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
              metadata: { source: 'imported' },
            };
            setSelectedImageIds([newCanvasImage.id]);
            setSelectedNoteIds([]);
            setReferenceImageIds([]);
            return {
              ...prevState,
              images: [...prevState.images, newCanvasImage],
              paths: [],
            };
          });
          setTool(Tool.SELECTION);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset file input
    }
  };

  const handleFilesDrop = useCallback((files: FileList, point: Point) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let lastAddedImageId: string | null = null;
    const newImages: CanvasImage[] = [];
    let imagesProcessed = 0;

    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const { naturalWidth, naturalHeight } = getNaturalSize(img);
          const displayWidth = img.width || naturalWidth;
          const displayHeight = img.height || naturalHeight;
          const newCanvasImage: CanvasImage = {
            id: crypto.randomUUID(),
            element: img,
            mediaType: 'image',
            x: point.x - (displayWidth / 2) + (index * 20),
            y: point.y - (displayHeight / 2) + (index * 20),
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth,
            naturalHeight,
            file: file,
            isPlaying: false,
            hasAudio: false,
            metadata: { source: 'imported' },
          };
          newImages.push(newCanvasImage);
          lastAddedImageId = newCanvasImage.id;
          imagesProcessed++;

          if (imagesProcessed === imageFiles.length) {
            setState(prevState => ({
              ...prevState,
              images: [...prevState.images, ...newImages],
              paths: [],
            }));
            setSelectedImageIds(lastAddedImageId ? [lastAddedImageId] : []);
            setSelectedNoteIds([]);
            setReferenceImageIds([]);
            setTool(Tool.SELECTION);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, [setState]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownload = useCallback(() => {
    if (!hasSingleImageSelected || !primaryImageId) return;
    const imageToDownload = images.find(img => img.id === primaryImageId);
    if (!imageToDownload) return;

    const mediaElement = imageToDownload.element;
    const href = mediaElement instanceof HTMLVideoElement
      ? (mediaElement.currentSrc || mediaElement.src)
      : mediaElement.src;
    if (!href) {
      setError('No downloadable source found for this item.');
      return;
    }

    const link = document.createElement('a');
    link.href = href;
    link.download = imageToDownload.file.name || (imageToDownload.mediaType === 'video' ? 'video.mp4' : 'download.png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [hasSingleImageSelected, images, primaryImageId, setError]);

  const handleImageSelection = useCallback((
    imageId: string | null,
    options: { multi?: boolean; reference?: boolean } = {},
  ) => {
    const { multi = false, reference = false } = options;
    const targetImage = imageId ? images.find(img => img.id === imageId) : null;

    if (reference && targetImage?.mediaType === 'video') {
      setError('Reference images must be still images.');
      return;
    }

    if (reference) {
      if (primaryImageId && imageId === primaryImageId) {
        return;
      }
      if (!imageId) {
        setReferenceImageIds([]);
        return;
      }
      const maxReferenceImages = getMaxReferenceImages(falModelId);
      setReferenceImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < maxReferenceImages) {
          return [...prevIds, imageId];
        }
        showReferenceLimitToast(maxReferenceImages);
        return prevIds;
      });
      return;
    }

    if (!imageId) {
      if (!multi) {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
      }
      return;
    }

    if (multi) {
      setReferenceImageIds([]);
      setSelectedImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        return [...prevIds, imageId];
      });
      return;
    }

    if (primaryImageId === imageId && selectedImageIds.length === 1) {
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
      return;
    }

    setSelectedImageIds([imageId]);
    setSelectedNoteIds([]);
    setReferenceImageIds([]);
  }, [falModelId, images, primaryImageId, selectedImageIds.length, setError, showReferenceLimitToast]);

  const handleNoteSelection = useCallback((
    noteId: string | null,
    options: { multi?: boolean } = {},
  ) => {
    const { multi = false } = options;

    if (!noteId) {
      if (!multi) {
        setSelectedNoteIds([]);
        setSelectedImageIds([]);
        setReferenceImageIds([]);
      }
      return;
    }

    if (multi) {
      setSelectedNoteIds(prevIds => {
        if (prevIds.includes(noteId)) {
          return prevIds.filter(id => id !== noteId);
        }
        return [...prevIds, noteId];
      });
      return;
    }

    if (primaryNoteId === noteId && selectedNoteIds.length === 1) {
      setSelectedImageIds([]);
      setReferenceImageIds([]);
      return;
    }

    setSelectedNoteIds([noteId]);
    setSelectedImageIds([]);
    setReferenceImageIds([]);
  }, [primaryNoteId, selectedNoteIds.length]);

  const handleNoteTextChange = useCallback((noteId: string, text: string) => {
    const targetNotes = liveNotes ?? displayedNotes;
    const noteIndex = targetNotes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;

    const newNotes = [...targetNotes];
    newNotes[noteIndex] = { ...newNotes[noteIndex], text };
    setLiveNotes(newNotes);
  }, [liveNotes, displayedNotes]);

  const selectedImageIndex = primaryImageId ? images.findIndex(img => img.id === primaryImageId) : -1;
  const isImageOverlapping = primaryImageId && selectedImageIndex !== -1 ? images.some(other => other.id !== primaryImageId && isOverlapping(images[selectedImageIndex], other)) : false;
  const canMoveUp = selectedImageIndex > -1 && selectedImageIndex < images.length - 1;
  const canMoveDown = selectedImageIndex > -1 && selectedImageIndex > 0;

  const usingFal = apiProvider === 'fal';
  const isVideoMode = falModelMode === 'video';
  const isCanvasGenerationTool = tool === Tool.SELECTION || tool === Tool.FREE_SELECTION;
  const isTextToImage = !activePrimaryImage;
  const promptEmpty = prompt.trim().length === 0;
  const isSeedreamModel = !isVideoMode && isSeedreamModelId(falModelId);
  const isGeminiModel = !isVideoMode && falModelId === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  const isReveModel = !isVideoMode && falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const isKlingModel = !isVideoMode && falModelId === KLING_IMAGE_MODEL_ID;
  const isCrystalUpscaleModel = !isVideoMode && falModelId === CRYSTAL_UPSCALER_MODEL_ID;
  const isSeedvrUpscaleModel = !isVideoMode && falModelId === SEEDVR_UPSCALER_MODEL_ID;
  const isUpscaleModel = isCrystalUpscaleModel || isSeedvrUpscaleModel;
  const shouldValidateFalOptions = usingFal && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
  const isNumImagesInvalid =
    !Number.isFinite(falNumImages) ||
    falNumImages < 1 ||
    falNumImages > 4;
  const hasInpaintMask = paths.some(path => path.tool === Tool.INPAINT && path.points.length > 0);
  const requiresPrompt = !(usingFal && isUpscaleModel);
  const isPromptMissing = requiresPrompt && promptEmpty;
  const requiresSelectedImageForUpscale = usingFal && isUpscaleModel && isTextToImage;
  const requiresSelectedImageForVideo = usingFal && isVideoMode && isTextToImage;
  const editConstraintsActive = !isVideoMode && !isTextToImage && !isUpscaleModel && (
    (usingFal && isReveModel) ||
    (appMode === 'CANVAS' && !isCanvasGenerationTool) ||
    (appMode === 'INPAINT' && !hasInpaintMask)
  );

  const submitDisabled = isPromptMissing ||
    (shouldValidateFalOptions && isNumImagesInvalid) ||
    requiresSelectedImageForUpscale ||
    requiresSelectedImageForVideo ||
    editConstraintsActive;

  const promptPlaceholderText = isVideoMode
    ? (activePrimaryImage
      ? 'Describe the motion or scene you want this image to turn into...'
      : 'Select an image and describe the video you want to create...')
    : usingFal && isUpscaleModel
      ? `Prompt disabled for ${getFalModelLabel(falModelId)}. Select an image and scale factor.`
      : isTextToImage
        ? 'Describe the image you want to create... (Cmd/Ctrl + Enter to generate)'
        : 'Describe your edit... (Cmd/Ctrl + Enter to generate)';
  const disablePromptInput = usingFal && isUpscaleModel;

  const shouldShowSeedreamImageSizeControl = apiProvider === 'fal' && isSeedreamModel;
  const supportsAspectRatioControl = isGeminiModel || isReveModel || isKlingModel;
  const shouldShowAspectRatioControl = supportsAspectRatioControl && (apiProvider === 'fal' || isTextToImage);
  const shouldShowResolutionControl = apiProvider === 'fal' && (isGeminiModel || isKlingModel);
  const shouldShowNumImagesControl = apiProvider === 'fal' && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);

  const promptBarModelControlsList: PromptBarModelControl[] = [];

  if (isVideoMode && usingFal && falVideoModelId === HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID) {
    promptBarModelControlsList.push({
      id: 'fal-video-duration-select',
      ariaLabel: 'Select Hailuo 2.3 Standard duration',
      options: [
        { value: '6', label: '6s' },
        { value: '10', label: '10s' },
      ],
      value: falVideoDuration,
      onChange: handleFalVideoDurationChange,
      disabled: isLoading,
    });
  }

  if (!isVideoMode && usingFal && isUpscaleModel) {
    promptBarModelControlsList.push({
      id: 'fal-scale-factor-select',
      ariaLabel: `Select ${getFalModelLabel(falModelId)} scale factor`,
      options: FAL_CRYSTAL_SCALE_FACTOR_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: `${falScaleFactor}`,
      onChange: handleFalScaleFactorChange,
      disabled: isLoading,
    });

    if (isCrystalUpscaleModel) {
      promptBarModelControlsList.push({
        id: 'fal-creativity-select',
        ariaLabel: 'Select Crystal Upscaler creativity',
        options: FAL_CRYSTAL_CREATIVITY_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: falCreativity.toFixed(1),
        onChange: handleFalCreativityChange,
        disabled: isLoading,
      });
    }
  }

  if (!isVideoMode && usingFal && isSeedvrUpscaleModel) {
    promptBarModelControlsList.push({
      id: 'fal-noise-scale-select',
      ariaLabel: 'Select SeedVR2 noise scale',
      options: FAL_SEEDVR_NOISE_SCALE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: falNoiseScale.toFixed(1),
      onChange: handleFalNoiseScaleChange,
      disabled: isLoading,
    });
  }

  if (shouldShowSeedreamImageSizeControl) {
    promptBarModelControlsList.push({
      id: 'fal-image-size-select',
      ariaLabel: 'Select Seedream image size',
      options: FAL_IMAGE_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: falImageSizeSelection,
      onChange: handleFalImageSizeChange,
      disabled: isLoading,
    });
  }

  if (shouldShowAspectRatioControl) {
    const aspectRatioOptions = isReveModel
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : isGeminiModel
        ? FAL_GEMINI_ASPECT_RATIO_OPTIONS
        : FAL_KLING_ASPECT_RATIO_OPTIONS;
    promptBarModelControlsList.push({
      id: 'fal-aspect-ratio-select',
      ariaLabel: `Select ${getFalModelLabel(falModelId)} aspect ratio`,
      options: aspectRatioOptions.map(option => ({ value: option.value, label: option.label })),
      value: falAspectRatioSelection,
      onChange: handleFalAspectRatioChange,
      disabled: isLoading,
    });
  }

  if (shouldShowResolutionControl) {
    const resolutionOptions = isKlingModel ? FAL_KLING_RESOLUTION_OPTIONS : FAL_RESOLUTION_OPTIONS;
    const resolutionValue = isKlingModel && falResolutionSelection === '4K' ? '2K' : falResolutionSelection;
    promptBarModelControlsList.push({
      id: 'fal-resolution-select',
      ariaLabel: `Select ${getFalModelLabel(falModelId)} resolution`,
      options: resolutionOptions.map(option => ({ value: option.value, label: option.label })),
      value: resolutionValue,
      onChange: handleFalResolutionChange,
      disabled: isLoading,
    });
  }

  if (shouldShowNumImagesControl) {
    promptBarModelControlsList.push({
      id: 'fal-num-images-select',
      ariaLabel: 'Select number of images to generate',
      options: FAL_NUM_IMAGE_OPTIONS.map(option => ({ value: `${option}`, label: `${option}` })),
      value: falNumImages.toString(),
      onChange: (value: string) => handleFalNumImagesChange(Number(value)),
      disabled: isLoading,
      errorMessage: shouldValidateFalOptions && isNumImagesInvalid ? 'Num images must be between 1 and 4.' : undefined,
    });
  }

  const promptBarModelControls: ReadonlyArray<PromptBarModelControl> | undefined =
    promptBarModelControlsList.length > 0 ? promptBarModelControlsList : undefined;
  const promptBarModelOptions = falModelMode === 'video' ? FAL_VIDEO_MODEL_OPTIONS : FAL_IMAGE_MODEL_OPTIONS;

  return (
    <div className="h-screen w-screen bg-gray-800 text-white flex flex-col overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      <input
        type="file"
        ref={snapshotInputRef}
        onChange={handleSnapshotFileChange}
        accept=".bcsnap,application/octet-stream,application/json,.json"
        className="hidden"
      />
      <div ref={fileMenuRef} className="absolute top-4 left-4 z-30">
        <button
          type="button"
          onClick={toggleFileMenu}
          aria-haspopup="menu"
          aria-expanded={isFileMenuOpen}
          aria-label="Snapshot menu"
          className="p-2 text-white bg-transparent hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-md transition-colors"
        >
          <HamburgerIcon className="w-6 h-6" />
        </button>
        {isFileMenuOpen && (
          <div
            role="menu"
            className="mt-2 w-40 rounded-md border border-gray-700 bg-gray-900/95 shadow-lg overflow-hidden"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleImportSnapshot}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
            >
              Import Snapshot
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleExportSnapshot}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
            >
              Export Snapshot
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={openDebugLogPanel}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
            >
              Debug Log
            </button>
          </div>
        )}
      </div>

      {!cropMode && !transformMode && (
        <Toolbar
          activeTool={tool}
          onToolChange={handleToolChange}
          appMode={appMode}
          onModeChange={handleModeChange}
          brushSize={brushSize}
          eraserSize={eraserSize}
          onBrushSizeChange={setBrushSize}
          onEraserSizeChange={setEraserSize}
          brushColor={brushColor}
          onBrushColorChange={setBrushColor}
          onClear={handleClear}
          hasClearablePaths={hasClearablePaths}
          onUploadClick={handleUploadClick}
          inpaintMode={inpaintMode}
          onInpaintModeChange={setInpaintMode}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onDownload={handleDownload}
          isImageSelected={hasSingleImageSelected}
          isObjectSelected={selectedImageIds.length > 0 || selectedNoteIds.length > 0}
          onDelete={handleDelete}
          onRemoveBackground={handleBackgroundRemoval}
          isBackgroundRemovalDisabled={!hasSingleImageSelected || isRemovingBackground || isLoading}
          isBackgroundRemovalLoading={isRemovingBackground}
        />
      )}

      <main className="relative flex-1 min-h-0">
        <Canvas
          images={displayedImages}
          onImagesChange={setLiveImages}
          notes={displayedNotes}
          onNotesChange={setLiveNotes}
          tool={tool}
          appMode={appMode}
          paths={displayedPaths}
          onPathsChange={setLivePaths}
          brushSize={brushSize}
          eraserSize={eraserSize}
          brushColor={brushColor}
          selectedImageIds={selectedImageIds}
          selectedNoteIds={selectedNoteIds}
          referenceImageIds={referenceImageIds}
          onImageSelect={handleImageSelection}
          onNoteSelect={handleNoteSelection}

          onCommit={handleCommit}
          onFilesDrop={handleFilesDrop}
          zoomToFitTrigger={zoomToFitTrigger}
          zoomInTrigger={zoomInTrigger}
          zoomOutTrigger={zoomOutTrigger}
          editingNoteId={editingNoteId}
          onNoteDoubleClick={setEditingNoteId}
          onNoteTextChange={handleNoteTextChange}
          onNoteEditEnd={() => setEditingNoteId(null)}
          onImageOrderChange={handleImageOrderChange}
          isImageOverlapping={isImageOverlapping}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          cropMode={cropMode}
          onStartCrop={handleStartCrop}
          onCropRectChange={handleCropRectChange}
          onConfirmCrop={handleConfirmCrop}
          onCancelCrop={handleCancelCrop}
          onNoteCopy={handleNoteCopy}
          onImagePromptCopy={handleImagePromptCopy}
          onRerunGeneration={handleRerunGeneration}
          showMetadataOverlay={showMetadataOverlay}
          transformMode={transformMode}
          onStartTransform={handleStartTransform}
          onExitTransform={handleExitTransform}
        />
        <ViewToolbar
          onZoomToFit={handleZoomToFit}
          disabled={images.length === 0 && notes.length === 0}
          metadataVisible={showMetadataOverlay}
          onToggleMetadata={() => setShowMetadataOverlay(prev => !prev)}
        />
      </main>

      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white p-3 rounded-md shadow-lg z-20 max-w-md text-center">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="absolute -top-1 -right-1 text-2xl font-bold bg-red-700 rounded-full h-6 w-6 flex items-center justify-center leading-none">&times;</button>
        </div>
      )}

      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-500 text-white p-3 rounded-md shadow-lg z-20 max-w-md text-center">
          <p>{toastMessage}</p>
        </div>
      )}

      <FalQueuePanel jobs={falJobs} onDismiss={handleDismissFalJob} />

      {isDebugLogOpen && (
        <DebugLogPanel
          entries={debugLogEntries}
          onClose={closeDebugLogPanel}
          onClear={clearDebugLogs}
        />
      )}

      {!cropMode && !transformMode && AVAILABLE_PROVIDERS.length > 0 && (
        <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-2">
          {AVAILABLE_PROVIDERS.map((provider) => {
            const isActive = apiProvider === provider;
            return (
              <button
                key={provider}
                type="button"
                onClick={() => setApiProvider(provider)}
                disabled={isLoading}
                aria-pressed={isActive}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed`}
              >
                {PROVIDER_LABELS[provider]}
              </button>
            );
          })}
        </div>
      )}

      {!cropMode && !transformMode && (
        <PromptBar
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleGenerate}
          isLoading={isLoading}
          inputDisabled={disablePromptInput}
          submitDisabled={submitDisabled}
          modelOptions={promptBarModelOptions}
          selectedModel={falModelId}
          onModelChange={(modelId) => {
            const normalizedModelId = normalizeFalModelId(modelId);
            if (normalizedModelId) {
              if (isFalVideoModelId(normalizedModelId)) {
                setFalModelMode('video');
                setFalVideoModelId(normalizedModelId);
              } else if (isFalImageModelId(normalizedModelId)) {
                setFalModelMode('image');
                setFalImageModelId(normalizedModelId);
              }
            }
          }}
          modelSelectDisabled={apiProvider !== 'fal' || isLoading}
          modelMode={falModelMode}
          onModelModeChange={handleModelModeChange}
          modelModeDisabled={apiProvider !== 'fal' || isLoading}
          modelControls={promptBarModelControls}
          promptPlaceholder={promptPlaceholderText}
        />
      )}
    </div>
  );
}
