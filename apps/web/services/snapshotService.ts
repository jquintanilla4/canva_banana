import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasImageMetadata,
  CanvasMediaType,
  CanvasNote,
  CanvasVideoPromptArea,
  CanvasVideoPromptBar,
  GenerationInputs,
  Path,
  Point,
} from '../types';
import { Tool } from '../types';
import {
  getFalNumImageMaxForModel,
  isFalAspectRatioSelectionValue,
  isFalImageSizeSelectionValue,
  isFalModelMode,
  isFalVideoModelId,
  isFalResolutionSelectionValue,
  isFlux2MaxImageSizeSelectionValue,
  isGenerationProvider,
  isJimengSeedance2ModelVersion,
  isGptImage2QualitySelectionValue,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isInfinitalkAccelerationSelectionValue,
  isInfinitalkResolutionSelectionValue,
  isInfinitalkSeedSelectionValue,
  isKrea2CreativitySelectionValue,
  isKlingO3DurationSelectionValue,
  isKlingV3CfgScaleSelectionValue,
  isKlingV3DurationSelectionValue,
  isKlingV3ShotDurationSelectionValue,
  isLipsyncSyncMode,
  isRecraftV4ProImageSizeSelectionValue,
  isSeedance2AspectRatioSelectionValue,
  isSeedance2DurationSelectionValue,
  isSeedance2ResolutionSelectionValue,
  isSeedance2Variant,
  isWan27ImageAspectRatioSelectionValue,
  isWan27ImageMaxImagesSelectionValue,
  isVeo31AspectRatioSelectionValue,
  isVeo31DurationSelectionValue,
  isVeo31ResolutionSelectionValue,
  isVeo31Variant,
  normalizeKlingO3Variant,
  normalizeVeo31Variant,
  normalizeRecraftRgbColor,
  RECRAFT_V4_PRO_MAX_COLORS,
  isGenerationKind,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from './modelConfig';
import { mapWithConcurrency } from '../utils/mapWithConcurrency';
import {
  createLazyVideoFromUrl,
  dataUrlToFile,
  getMediaTypeFromFileType,
  getNaturalSize,
  loadMediaFromBlob,
  loadMediaFromDataUrl,
  loadMediaFromUrl,
} from './mediaService';
import { generateWaveformImage, loadAudioFromBlob, loadAudioFromUrl } from './audioService';
import { createSnapshotRangeCursor } from './snapshotRangeReader';
import { DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR } from '../utils/canvasColorOptions';
import { getCanvasMediaDurationSeconds } from '../utils/canvasMediaDuration';

const isVideoPromptAreaMediaRole = (value: unknown): value is CanvasVideoPromptArea['mediaRoles'][string] =>
  value === 'primary'
  || value === 'reference'
  || value === 'element'
  || value === 'tail'
  || value === 'sourceVideo'
  || value === 'sourceAudio'; // Snapshot role guard.

// Handles snapshot serialization/deserialization so canvases can be saved/restored across sessions.
export type SnapshotImageManifest = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth?: number; // Intrinsic source width in pixels.
  naturalHeight?: number; // Intrinsic source height in pixels.
  rotation?: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  metadata?: CanvasImage['metadata'];
  mediaType?: CanvasMediaType;
  isPlaying?: boolean;
  hasAudio?: boolean;
  videoDuration?: number;
  currentPlaybackTime?: number;
  audioDuration?: number;
  fallbackForMediaType?: CanvasMediaType;
  fallbackReason?: string;
};

export type SnapshotManifestV2 = {
  version: 2;
  createdAt: string;
  state: {
      images: SnapshotImageManifest[];
      notes: CanvasNote[];
      paths: Path[];
      videoPromptAreas?: CanvasVideoPromptArea[];
      videoPromptBars?: CanvasVideoPromptBar[];
      meta?: {
      appMode: string;
      tool: string;
      brushSize: number;
      eraserSize: number;
      brushColor: string;
      prompt: string;
      apiProvider: string;
      falModelId: string;
      falImageSizeSelection: string;
      falAspectRatioSelection: string;
      falResolutionSelection: string;
      falNumImages: number;
	      falScaleFactor: number;
	      falNoiseScale: number;
	      falCreativity: number;
	      wanTargetResolution?: string;
	      wanCreativity?: number;
	      wanAnimateVariant?: string;
	      wanAnimateSteps?: string;
	      wanAnimateResolution?: string;
        oneToAllAnimateResolution?: string;
	      wanAnimateShift?: string;
	      wanAnimateQuality?: string;
	      wanAnimateUseTurbo?: boolean;
        heygenEnableCaption?: boolean;
        heygenEnableDynamicDuration?: boolean;
        heygenDisableMusicTrack?: boolean;
        heygenEnableSpeechEnhancement?: boolean;
        heygenStartTime?: number;
        heygenEndTime?: number;
        infinitalkResolution?: string;
        infinitalkSeed?: string;
        infinitalkAcceleration?: string;
        grokImagineVideoDuration?: string;
        grokImagineVideoResolution?: string;
        grokImagineVideoAspectRatio?: string;
        veo31Variant?: string;
        veo31Duration?: string;
        veo31Resolution?: string;
        veo31AspectRatio?: string;
        veo31GenerateAudio?: boolean;
        wan27VideoResolution?: string;
        wan27VideoDuration?: string;
        wan27VideoAspectRatio?: string;
        wan27VideoPromptExpansion?: boolean;
        wan27VideoVariant?: string;
        seedance2Variant?: string;
        seedance2AspectRatio?: string;
        seedance2Resolution?: string;
        seedance2Duration?: string;
        seedance2GenerateAudio?: boolean;
        seedance2CameraFixed?: boolean;
        klingV3Duration?: string;
        klingV3GenerateAudio?: boolean;
        klingV3CfgScale?: string;
        klingV3MultiPromptEnabled?: boolean;
        klingV3MultiPrompt?: string;
        klingV3Shot1Duration?: string;
        klingV3Shot2Duration?: string;
	      selectedImageIds: string[];
	      noteLabelCounter?: number;
	      referenceImageIds: string[];
      referenceVideoIds?: string[];
      referenceAudioIds?: string[];
      seedanceReferenceOrderIds?: string[];
      elementImageIds?: string[];
      videoLastFrameImageId?: string | null;
    } | undefined;
  };
};

export type SnapshotMediaBlob = {
  readonly size: number;
  readonly type: string;
  readonly name?: string;
  readonly lastModified?: number;
  readonly snapshotObjectUrl?: string;
  slice: (start?: number, end?: number, contentType?: string) => SnapshotMediaBlob;
  arrayBuffer: () => Promise<ArrayBuffer>;
  stream: () => ReadableStream<Uint8Array>;
  text: () => Promise<string>;
  readonly snapshotLeaseSource?: SnapshotSourceLeaseProvider;
  withSourceLease?: <T>(operation: () => Promise<T>) => Promise<T>;
};

export type SnapshotSourceLease = () => Promise<void>;

export interface SnapshotSourceLeaseProvider {
  acquireLease: () => SnapshotSourceLease | Promise<SnapshotSourceLease>;
}

export type SnapshotBinary = {
  manifest: SnapshotManifestV2;
  images: Array<{ manifest: SnapshotImageManifest; blob: SnapshotMediaBlob }>;
};

export type SnapshotBuildOptions = {
  fallbackMediaIds?: ReadonlySet<string>;
};

export class SnapshotMediaReadError extends Error {
  mediaId: string;
  fileName: string;
  mediaType?: CanvasMediaType;
  cause: unknown;

  constructor(manifest: SnapshotImageManifest, cause: unknown) {
    super(`Snapshot media "${manifest.fileName || manifest.id}" could not be read.`);
    this.name = 'SnapshotMediaReadError';
    this.mediaId = manifest.id;
    this.fileName = manifest.fileName;
    this.mediaType = manifest.mediaType;
    this.cause = cause;
  }
}

export const isSnapshotMediaReadError = (error: unknown): error is SnapshotMediaReadError =>
  error instanceof SnapshotMediaReadError;

export interface SnapshotRangeSource {
  fileName: string;
  size: number;
  type?: string;
  maxMediaBytes?: number; // Range sources without media URLs keep a bounded renderer memory cap.
  getMediaUrl?: (offset: number, length: number, type: string, fileName: string) => Promise<string>;
  readRange: (offset: number, length: number) => Promise<ArrayBuffer>;
  retain?: () => Promise<void>;
  acquireLease?: () => SnapshotSourceLease | Promise<SnapshotSourceLease>;
  close?: () => Promise<void>;
}

export type SnapshotByteSource = File | SnapshotRangeSource;

export type SerializedCanvasImageV1 = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth?: number; // Intrinsic source width in pixels.
  naturalHeight?: number; // Intrinsic source height in pixels.
  rotation?: number;
  fileName: string;
  fileType: string;
  dataUrl: string;
  metadata?: CanvasImage['metadata'];
  mediaType?: CanvasMediaType;
  isPlaying?: boolean;
  hasAudio?: boolean;
  videoDuration?: number;
  currentPlaybackTime?: number;
};

export type SerializedSnapshotV1 = {
  version: 1;
  createdAt: string;
  state: {
    images: SerializedCanvasImageV1[];
    notes: CanvasNote[];
    paths: Path[];
    videoPromptAreas?: CanvasVideoPromptArea[];
    videoPromptBars?: CanvasVideoPromptBar[];
    meta?: SnapshotMetaState;
  };
};

export type SnapshotMetaState = {
  appMode: AppMode;
  tool: Tool;
  brushSize: number;
  eraserSize: number;
  brushColor: string;
  prompt: string;
  apiProvider: ApiProviderId;
  falModelId: string;
  falImageSizeSelection: string;
  falAspectRatioSelection: string;
  falResolutionSelection: string;
  falNumImages: number;
  falScaleFactor: number;
  falNoiseScale: number;
  falCreativity: number;
  wanTargetResolution?: string;
  wanCreativity?: number;
  wanAnimateVariant?: string;
  wanAnimateSteps?: string;
  wanAnimateResolution?: string;
  oneToAllAnimateResolution?: string;
  wanAnimateShift?: string;
  wanAnimateQuality?: string;
  wanAnimateUseTurbo?: boolean;
  heygenEnableCaption?: boolean;
  heygenEnableDynamicDuration?: boolean;
  heygenDisableMusicTrack?: boolean;
  heygenEnableSpeechEnhancement?: boolean;
  heygenStartTime?: number;
  heygenEndTime?: number;
  infinitalkResolution?: string;
  infinitalkSeed?: string;
  infinitalkAcceleration?: string;
  grokImagineVideoDuration?: string;
  grokImagineVideoResolution?: string;
  grokImagineVideoAspectRatio?: string;
  veo31Variant?: string;
  veo31Duration?: string;
  veo31Resolution?: string;
  veo31AspectRatio?: string;
  veo31GenerateAudio?: boolean;
  wan27VideoResolution?: string;
  wan27VideoDuration?: string;
  wan27VideoAspectRatio?: string;
  wan27VideoPromptExpansion?: boolean;
  wan27VideoVariant?: string;
  wan27VideoAudioSetting?: string;
  seedance2Variant?: string;
  seedance2JimengModelVersion?: string;
  seedance2AspectRatio?: string;
  seedance2Resolution?: string;
  seedance2Duration?: string;
  seedance2GenerateAudio?: boolean;
  seedance2CameraFixed?: boolean;
  klingV3Duration?: string;
  klingV3GenerateAudio?: boolean;
  klingV3CfgScale?: string;
  klingV3MultiPromptEnabled?: boolean;
  klingV3MultiPrompt?: string;
  klingV3Shot1Duration?: string;
  klingV3Shot2Duration?: string;
  selectedImageIds: string[];
  noteLabelCounter?: number;
  referenceImageIds: string[];
  referenceVideoIds?: string[];
  referenceAudioIds?: string[];
  seedanceReferenceOrderIds?: string[];
  elementImageIds?: string[];
  videoLastFrameImageId?: string | null;
};

export type RestoredSnapshotState = {
  images: CanvasImage[];
  notes: CanvasNote[];
  paths: Path[];
  videoPromptAreas: CanvasVideoPromptArea[];
  videoPromptBars: CanvasVideoPromptBar[];
  meta?: SerializedSnapshotV1['state']['meta'];
  sourceRetention: 'required' | 'not-required'; // Lazy desktop binary media keeps its range source open.
  droppedLegacyNoteCount: number; // Pre-pin sticky notes are dropped on load; callers should tell the user.
};

const SNAPSHOT_MAGIC = 'BANANA_SNAPSHOT_V2\n';
const snapshotEncoder = new TextEncoder();
const snapshotDecoder = new TextDecoder();
const SNAPSHOT_MAX_JSON_SECTION_BYTES = 64 * 1024 * 1024; // Bounds one metadata JSON read.
const SNAPSHOT_MAX_TOTAL_JSON_BYTES = 128 * 1024 * 1024; // Bounds all imported metadata JSON.
const SNAPSHOT_MAX_LEGACY_JSON_BYTES = 512 * 1024 * 1024; // Matches the old non-binary import cap.
const SNAPSHOT_MAX_RANGE_MEDIA_BYTES = 512 * 1024 * 1024; // Caps eager range sources only; desktop URL media must remain uncapped.
const SNAPSHOT_MAX_AUDIO_WAVEFORM_BYTES = 64 * 1024 * 1024; // Decoding compressed audio can expand far beyond its file size.
const SNAPSHOT_MAX_WAVEFORM_WIDTH = 4096; // Bounds canvas memory for crafted snapshot dimensions.
const SNAPSHOT_MAX_WAVEFORM_HEIGHT = 1024; // Bounds canvas memory for crafted snapshot dimensions.
const SNAPSHOT_MEDIA_READ_CHUNK_BYTES = 8 * 1024 * 1024; // Keeps large media imports off one huge buffer.
const SNAPSHOT_METADATA_READ_AHEAD_BYTES = 64 * 1024; // Amortizes compact records without reading large media eagerly.
const SNAPSHOT_READ_AHEAD_MAX_MEDIA_BYTES = 4 * 1024; // Large images and videos remain fully lazy.
const SNAPSHOT_MIN_BINARY_IMAGE_RECORD_BYTES = 14; // Four length bytes, one metadata byte, eight size bytes, and one media byte.
const SNAPSHOT_PARSE_YIELD_INTERVAL = 1_000; // Large valid manifests periodically return control to the browser.
const SNAPSHOT_MEDIA_RESTORE_CONCURRENCY = 4; // Match the preload read budget while every valid media item waits its turn.
const fallbackPngBytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 96, 0, 0, 0, 2,
  0, 1, 226, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66,
  96, 130,
]);

class SnapshotRangeBlob implements SnapshotMediaBlob {
  readonly size: number;
  readonly type: string;
  readonly name: string;
  readonly lastModified: number;
  readonly snapshotObjectUrl?: string;
  readonly snapshotLeaseSource?: SnapshotSourceLeaseProvider;
  private readonly source: Exclude<SnapshotByteSource, File>;
  private readonly offset: number;

  constructor(params: {
    source: Exclude<SnapshotByteSource, File>;
    offset: number;
    length: number;
    type: string;
    name: string;
    objectUrl?: string;
  }) {
    this.source = params.source;
    this.offset = params.offset;
    this.size = params.length;
    this.type = params.type;
    this.name = params.name;
    this.lastModified = Date.now();
    this.snapshotObjectUrl = params.objectUrl;
    this.snapshotLeaseSource = params.source.acquireLease ? params.source as SnapshotSourceLeaseProvider : undefined; // Share one source lease across all media entries.
  }

  slice(start = 0, end = this.size, contentType = this.type): SnapshotMediaBlob {
    const normalizedStart = Math.min(Math.max(0, start < 0 ? this.size + start : start), this.size);
    const normalizedEnd = Math.min(Math.max(normalizedStart, end < 0 ? this.size + end : end), this.size);
    return new SnapshotRangeBlob({
      source: this.source,
      offset: this.offset + normalizedStart,
      length: normalizedEnd - normalizedStart,
      type: contentType || this.type,
      name: this.name,
      objectUrl: undefined,
    });
  }

  async withSourceLease<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.source.acquireLease?.();
    try {
      return await operation();
    } finally {
      await release?.();
    }
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return this.withSourceLease(async () => {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      for (let cursor = 0; cursor < this.size; cursor += SNAPSHOT_MEDIA_READ_CHUNK_BYTES) {
        const chunkLength = Math.min(SNAPSHOT_MEDIA_READ_CHUNK_BYTES, this.size - cursor);
        const chunk = await this.source.readRange(this.offset + cursor, chunkLength);
        chunks.push(new Uint8Array(chunk));
        totalBytes += chunk.byteLength;
      }
      const merged = new Uint8Array(totalBytes);
      let mergeOffset = 0;
      chunks.forEach(chunk => {
        merged.set(chunk, mergeOffset);
        mergeOffset += chunk.byteLength;
      });
      return merged.buffer;
    });
  }

  stream(): ReadableStream<Uint8Array> {
    let cursor = 0;
    let released = false;
    const releasePromise = Promise.resolve(this.source.acquireLease?.()); // Acquire before the first asynchronous range read.
    const release = async () => {
      if (released) return;
      released = true;
      const releaseLease = await releasePromise;
      await releaseLease?.();
    };
    return new ReadableStream<Uint8Array>({
      start: async () => {
        await releasePromise;
      },
      pull: async (controller) => {
        try {
          if (cursor >= this.size) {
            controller.close();
            await release();
            return;
          }
          const chunkLength = Math.min(SNAPSHOT_MEDIA_READ_CHUNK_BYTES, this.size - cursor);
          const chunk = await this.source.readRange(this.offset + cursor, chunkLength);
          cursor += chunkLength;
          controller.enqueue(new Uint8Array(chunk));
        } catch (error) {
          await release();
          controller.error(error);
        }
      },
      cancel: release,
    });
  }

  async text(): Promise<string> {
    return snapshotDecoder.decode(new Uint8Array(await this.arrayBuffer()));
  }
}

const materializedSnapshotFiles = new WeakMap<SnapshotMediaBlob, Promise<File>>();

export const withSnapshotMediaLease = async <T>(blob: SnapshotMediaBlob, operation: () => Promise<T>): Promise<T> => (
  typeof blob.withSourceLease === 'function' ? blob.withSourceLease(operation) : operation()
); // One lease spans every chunk in a logical media operation.

export const withSnapshotMediaLeases = async <T>(
  blobs: readonly SnapshotMediaBlob[],
  operation: () => Promise<T>,
): Promise<T> => {
  const leaseSources = [...new Set(blobs.flatMap(blob => blob.snapshotLeaseSource ? [blob.snapshotLeaseSource] : []))];
  const leaseResults = await Promise.allSettled(leaseSources.map(source => source.acquireLease())); // Reserve every source before queued work can be overtaken by replacement.
  const releases = leaseResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const ungroupedBlobs = blobs.filter(blob => !blob.snapshotLeaseSource);
  const runUngrouped = (index: number): Promise<T> => {
    if (index >= ungroupedBlobs.length) return operation();
    return withSnapshotMediaLease(ungroupedBlobs[index], () => runUngrouped(index + 1));
  };
  try {
    const failedLease = leaseResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failedLease) throw failedLease.reason;
    return await runUngrouped(0);
  } finally {
    await Promise.allSettled(releases.reverse().map(release => release())); // Release every acquired source even when another acquisition or the operation fails.
  }
}; // Snapshot-wide writes keep all source files alive between sequential media entries.

// Desktop-restored CanvasImage.file may be a lazy snapshot-backed pseudo-File (SnapshotRangeBlob
// cast to File), which is not a real Blob. Call this before handing the file to any Blob API
// (URL.createObjectURL, FileReader, new File([...]), fal.storage.upload).
export const ensureRealSnapshotFile = (file: File): Promise<File> => {
  if (file instanceof Blob) {
    return Promise.resolve(file);
  }
  const lazy = file as unknown as SnapshotMediaBlob; // Do not reject by size: large desktop snapshot media is an intentional product requirement.
  let pending = materializedSnapshotFiles.get(lazy);
  if (!pending) {
    pending = withSnapshotMediaLease(lazy, async () => {
      const parts: BlobPart[] = [];
      for (let cursor = 0; cursor < lazy.size; cursor += SNAPSHOT_MEDIA_READ_CHUNK_BYTES) {
        const chunkEnd = Math.min(cursor + SNAPSHOT_MEDIA_READ_CHUNK_BYTES, lazy.size);
        parts.push(await lazy.slice(cursor, chunkEnd).arrayBuffer());
      }
      return new File(parts, lazy.name || 'snapshot-media', {
        type: lazy.type || 'application/octet-stream',
        lastModified: lazy.lastModified,
      });
    });
    materializedSnapshotFiles.set(lazy, pending);
    pending.catch(() => materializedSnapshotFiles.delete(lazy)); // Allow retry after a failed read.
  }
  return pending;
};

const createTransparentPngBlob = (): Blob => new Blob([fallbackPngBytes], { type: 'image/png' });

const toFallbackFileName = (fileName: string, mediaId: string): string => {
  const baseName = (fileName || mediaId || 'media').replace(/\.[^./\\]+$/, '');
  return `${baseName || 'media'}-snapshot-fallback.png`;
};

const canvasToPngBlob = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      return blob;
    }
  }
  if (typeof canvas.toDataURL === 'function' && typeof fetch === 'function') {
    return fetch(canvas.toDataURL('image/png')).then(response => response.blob());
  }
  return createTransparentPngBlob();
};

const createPlaceholderPngBlob = async (width: number, height: number, label: string): Promise<Blob> => {
  if (typeof document === 'undefined') {
    return createTransparentPngBlob();
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context) {
      return createTransparentPngBlob();
    }
    context.fillStyle = '#111827';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#64748b';
    context.strokeRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#e5e7eb';
    context.font = '16px sans-serif';
    context.fillText(label, 12, Math.min(canvas.height - 12, 28));
    return canvasToPngBlob(canvas);
  } catch {
    return createTransparentPngBlob();
  }
};

const createMediaPreviewPngBlob = async (image: CanvasImage): Promise<Blob> => {
  const width = Math.max(1, Math.round(image.naturalWidth || image.width || 1));
  const height = Math.max(1, Math.round(image.naturalHeight || image.height || 1));
  if (typeof document === 'undefined') {
    return createTransparentPngBlob();
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return createPlaceholderPngBlob(width, height, `${image.mediaType} unavailable`);
    }
    context.drawImage(image.element, 0, 0, width, height);
    return canvasToPngBlob(canvas);
  } catch {
    return createPlaceholderPngBlob(width, height, `${image.mediaType} unavailable`);
  }
};

const getPositiveSnapshotDimension = (value: unknown, fallback = 1): number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
); // Snapshot dimensions must remain finite and drawable.

const getSnapshotNaturalDimensions = (img: CanvasImage): { naturalWidth: number; naturalHeight: number } => {
  const decodedNaturalWidth = img.mediaType === 'video'
    ? (img.element as HTMLVideoElement).videoWidth
    : (img.element as HTMLImageElement).naturalWidth;
  const decodedNaturalHeight = img.mediaType === 'video'
    ? (img.element as HTMLVideoElement).videoHeight
    : (img.element as HTMLImageElement).naturalHeight;
  return {
    naturalWidth: getPositiveSnapshotDimension(decodedNaturalWidth, getPositiveSnapshotDimension(img.naturalWidth, getPositiveSnapshotDimension(img.width))),
    naturalHeight: getPositiveSnapshotDimension(decodedNaturalHeight, getPositiveSnapshotDimension(img.naturalHeight, getPositiveSnapshotDimension(img.height))),
  }; // Decoded metadata repairs legacy fallback dimensions after a video is opened.
};

const buildSnapshotImageManifest = (img: CanvasImage): SnapshotImageManifest => {
  const { naturalWidth, naturalHeight } = getSnapshotNaturalDimensions(img);
  return {
    id: img.id,
    x: img.x,
    y: img.y,
    width: img.width,
    height: img.height,
    naturalWidth,
    naturalHeight,
    rotation: img.rotation ?? 0,
    fileName: img.file.name,
    fileType: img.file.type || 'application/octet-stream',
    fileSize: img.file.size,
    metadata: img.metadata ? { ...img.metadata } : undefined,
    mediaType: img.mediaType,
    isPlaying: img.isPlaying ?? false,
    hasAudio: img.hasAudio,
    videoDuration: img.mediaType === 'video' ? getCanvasMediaDurationSeconds(img) ?? undefined : undefined,
    currentPlaybackTime: img.mediaType === 'audio' && typeof img.currentPlaybackTime === 'number' && Number.isFinite(img.currentPlaybackTime)
      ? img.currentPlaybackTime
      : undefined, // Audio restores should resume from the saved playhead.
    audioDuration: img.mediaType === 'audio' && typeof img.audioDuration === 'number' && Number.isFinite(img.audioDuration)
      ? img.audioDuration
      : undefined, // Large audio can restore duration without waveform decoding.
  };
};

const createAudioWaveformPlaceholderDataUrl = (width: number, height: number): string => {
  const renderWidth = Math.min(Math.max(1, Math.round(width)), SNAPSHOT_MAX_WAVEFORM_WIDTH);
  const renderHeight = Math.min(Math.max(1, Math.round(height)), SNAPSHOT_MAX_WAVEFORM_HEIGHT);
  const centerY = Math.round(renderHeight / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderWidth}" height="${renderHeight}" viewBox="0 0 ${renderWidth} ${renderHeight}"><rect width="100%" height="100%" rx="8" fill="#1f2937"/><path d="M16 ${centerY} H${Math.max(16, renderWidth - 16)}" stroke="#4ade80" stroke-width="3" stroke-dasharray="6 6"/><text x="16" y="${Math.min(renderHeight - 10, centerY + 24)}" fill="#d1d5db" font-family="sans-serif" font-size="14">Waveform preview unavailable</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}; // Keeps oversized audio playable without decoding it into renderer memory.

const buildFallbackSnapshotImage = async (img: CanvasImage): Promise<SnapshotBinary['images'][number]> => {
  const blob = await createMediaPreviewPngBlob(img);
  const manifest = buildSnapshotImageManifest(img);
  return {
    manifest: {
      ...manifest,
      fileName: toFallbackFileName(manifest.fileName, manifest.id),
      fileType: 'image/png',
      fileSize: blob.size,
      mediaType: 'image',
      isPlaying: false,
      hasAudio: false,
      videoDuration: undefined,
      currentPlaybackTime: undefined,
      fallbackForMediaType: img.mediaType,
      fallbackReason: 'source-unreadable',
    },
    blob,
  };
};

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

const isSnapshotRangeOutOfBounds = (offset: number, length: number, sourceSize: number): boolean => (
  !Number.isSafeInteger(offset)
  || !Number.isSafeInteger(length)
  || !Number.isSafeInteger(sourceSize)
  || offset < 0
  || length < 0
  || offset > sourceSize
  || length > sourceSize - offset
); // Avoids unsafe offset + length arithmetic.

const isSnapshotMetadataLengthInvalid = (
  offset: number,
  length: number,
  sourceSize: number,
  totalMetadataBytes: number,
): boolean => (
  length <= 0
  || length > SNAPSHOT_MAX_JSON_SECTION_BYTES
  || totalMetadataBytes + length > SNAPSHOT_MAX_TOTAL_JSON_BYTES
  || isSnapshotRangeOutOfBounds(offset, length, sourceSize)
); // Keeps JSON metadata bounded while media remains uncapped.

const isFileSnapshotSource = (source: SnapshotByteSource): source is File => (
  (typeof File !== 'undefined' && source instanceof File)
  || ('slice' in source && 'text' in source)
);

const getSnapshotSourceSize = (source: SnapshotByteSource): number => (
  isFileSnapshotSource(source) ? source.size : source.size
);

const getSnapshotRangeMediaLimit = (source: SnapshotByteSource): number | null => {
  if (isFileSnapshotSource(source) || typeof source.getMediaUrl === 'function') {
    return null;
  }
  return Number.isSafeInteger(source.maxMediaBytes) && source.maxMediaBytes >= 0
    ? source.maxMediaBytes
    : SNAPSHOT_MAX_RANGE_MEDIA_BYTES; // Unmarked range sources keep the conservative memory guard.
};

const readSnapshotSourceRange = async (
  source: SnapshotByteSource,
  offset: number,
  length: number,
): Promise<ArrayBuffer> => {
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(length) || length < 0) {
    throw new Error('Snapshot byte range is invalid.');
  }
  if (isFileSnapshotSource(source)) {
    const blob = source.slice(offset, offset + length);
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read snapshot data.'));
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
  }
  return source.readRange(offset, length);
};

const readSnapshotSourceBlob = async (
  source: SnapshotByteSource,
  offset: number,
  length: number,
  type: string,
  fileName: string,
): Promise<SnapshotMediaBlob> => {
  if (isFileSnapshotSource(source)) {
    return source.slice(offset, offset + length, type);
  }
  if (typeof source.getMediaUrl === 'function') {
    const objectUrl = await source.getMediaUrl(offset, length, type, fileName);
    return new SnapshotRangeBlob({ source, offset, length, type, name: fileName, objectUrl });
  }
  const parts: BlobPart[] = [];
  for (let cursor = 0; cursor < length; cursor += SNAPSHOT_MEDIA_READ_CHUNK_BYTES) {
    const chunkLength = Math.min(SNAPSHOT_MEDIA_READ_CHUNK_BYTES, length - cursor);
    parts.push(await readSnapshotSourceRange(source, offset + cursor, chunkLength));
  }
  return new Blob(parts, { type });
};

const assertSnapshotSourceTextCanBeRead = (source: SnapshotByteSource): void => {
  if (isFileSnapshotSource(source)) {
    return; // Product requirement: user-selected legacy files stay unlimited despite renderer memory use.
  }
  if (getSnapshotSourceSize(source) > SNAPSHOT_MAX_LEGACY_JSON_BYTES) {
    throw new Error('Snapshot file is too large to import safely.');
  }
}; // Legacy JSON fallback must stay bounded because it is read as one string.

const readSnapshotSourceText = async (source: SnapshotByteSource): Promise<string> => {
  assertSnapshotSourceTextCanBeRead(source);
  if (isFileSnapshotSource(source)) {
    return source.text();
  }
  const sourceSize = getSnapshotSourceSize(source);
  const textDecoder = new TextDecoder();
  const chunks: string[] = [];
  for (let offset = 0; offset < sourceSize; offset += SNAPSHOT_MEDIA_READ_CHUNK_BYTES) {
    const chunkLength = Math.min(SNAPSHOT_MEDIA_READ_CHUNK_BYTES, sourceSize - offset);
    const buffer = await readSnapshotSourceRange(source, offset, chunkLength);
    chunks.push(textDecoder.decode(new Uint8Array(buffer), { stream: offset + chunkLength < sourceSize })); // Preserve UTF-8 characters split across chunks.
  }
  chunks.push(textDecoder.decode());
  return chunks.join('');
};

export const isBinarySnapshotFile = async (file: SnapshotByteSource): Promise<boolean> => {
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  const headBuffer = await readSnapshotSourceRange(file, 0, magicBytes.length);
  const head = new Uint8Array(headBuffer);
  if (head.length !== magicBytes.length) return false;
  for (let i = 0; i < magicBytes.length; i += 1) {
    if (head[i] !== magicBytes[i]) {
      return false;
    }
  }
  return true;
};

export const parseBinarySnapshotFile = async (file: SnapshotByteSource): Promise<SnapshotBinary> => {
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  const sourceSize = getSnapshotSourceSize(file);
  const rangeMediaLimit = getSnapshotRangeMediaLimit(file);
  let offset = 0;
  let totalMetadataBytes = 0;
  let rangeMediaBytes = 0;

  if (sourceSize < magicBytes.length + 4) {
    throw new Error('Snapshot file is too small.');
  }

  const headerBuffer = await readSnapshotSourceRange(file, 0, magicBytes.length + 4);
  const view = new DataView(headerBuffer);
  for (let i = 0; i < magicBytes.length; i += 1) {
    if (view.getUint8(i) !== magicBytes[i]) {
      throw new Error('Snapshot file format is invalid.');
    }
  }
  offset += magicBytes.length;

  const manifestLength = readUint32BE(view, offset);
  offset += 4;
  if (isSnapshotMetadataLengthInvalid(offset, manifestLength, sourceSize, totalMetadataBytes)) {
    throw new Error('Snapshot manifest length is invalid.');
  }
  totalMetadataBytes += manifestLength;

  const manifestBytes = new Uint8Array(await readSnapshotSourceRange(file, offset, manifestLength));
  offset += manifestLength;
  const manifestJson = snapshotDecoder.decode(manifestBytes);
  const manifest = JSON.parse(manifestJson) as SnapshotManifestV2;

  if (!manifest || manifest.version !== 2 || !manifest.state) {
    throw new Error('Snapshot manifest is invalid.');
  }
  if (!Array.isArray(manifest.state.images)) {
    throw new Error('Snapshot manifest images are invalid.');
  }
  const remainingBytes = sourceSize - offset;
  if (manifest.state.images.length > Math.floor(remainingBytes / SNAPSHOT_MIN_BINARY_IMAGE_RECORD_BYTES)) {
    throw new Error('Snapshot image count cannot fit in the file.');
  }
  const cursor = createSnapshotRangeCursor({
    size: sourceSize,
    readRange: (rangeOffset, length) => readSnapshotSourceRange(file, rangeOffset, length),
  }, {
    start: offset,
  });

  const images: SnapshotBinary['images'] = [];
  for (let index = 0; index < manifest.state.images.length; index += 1) {
    if (isSnapshotRangeOutOfBounds(cursor.position, 4, sourceSize)) {
      throw new Error(`Snapshot image ${index + 1} metadata length is invalid.`);
    }
    const metaLengthBuffer = await cursor.read(4);
    const metaLength = readUint32BE(new DataView(metaLengthBuffer), 0);
    if (isSnapshotMetadataLengthInvalid(cursor.position, metaLength, sourceSize, totalMetadataBytes)) {
      throw new Error(`Snapshot image ${index + 1} metadata is invalid.`);
    }
    totalMetadataBytes += metaLength;
    const metaBytes = new Uint8Array(await cursor.read(metaLength));
    const imageManifest = JSON.parse(snapshotDecoder.decode(metaBytes)) as SnapshotImageManifest;

    if (isSnapshotRangeOutOfBounds(cursor.position, 8, sourceSize)) {
      throw new Error(`Snapshot image ${index + 1} data length is invalid.`);
    }
    const dataLengthBuffer = await cursor.read(8);
    const dataLength = readUint64BE(new DataView(dataLengthBuffer), 0);
    if (dataLength <= 0 || isSnapshotRangeOutOfBounds(cursor.position, dataLength, sourceSize)) {
      throw new Error(`Snapshot image ${index + 1} data is invalid.`);
    }
    if (rangeMediaLimit !== null && rangeMediaBytes + dataLength > rangeMediaLimit) {
      throw new Error('Snapshot media is too large to import safely.');
    }
    if (rangeMediaLimit !== null) {
      rangeMediaBytes += dataLength;
    }
    const fileType = imageManifest.fileType || 'application/octet-stream';
    const fileName = imageManifest.fileName || `snapshot-image-${index + 1}`;
    const dataBlob = await readSnapshotSourceBlob(file, cursor.position, dataLength, fileType, fileName);
    if (!isFileSnapshotSource(file) && typeof file.getMediaUrl === 'function' && dataLength <= SNAPSHOT_READ_AHEAD_MAX_MEDIA_BYTES) {
      await cursor.readAhead(SNAPSHOT_METADATA_READ_AHEAD_BYTES); // Compact URL-backed records share one range read; large media is never probed.
    }
    cursor.skip(dataLength); // Media stays lazy while the metadata cursor advances to the next record.

    images.push({
      manifest: imageManifest,
      blob: dataBlob,
    });
    if ((index + 1) % SNAPSHOT_PARSE_YIELD_INTERVAL === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0)); // Keep very large valid snapshots responsive without a hard count cap.
    }
  }

  return { manifest, images };
};

// Import enforces the same caps (isSnapshotMetadataLengthInvalid); encoding through this helper
// makes exports fail loudly instead of producing a file that can never be re-imported.
const encodeSnapshotMetadataSections = (binary: SnapshotBinary): { manifestBytes: Uint8Array; imageMetaBytes: Uint8Array[] } => {
  let totalMetadataBytes = 0;
  const encodeSection = (value: unknown, label: string): Uint8Array => {
    const bytes = snapshotEncoder.encode(JSON.stringify(value));
    totalMetadataBytes += bytes.byteLength;
    if (bytes.byteLength > SNAPSHOT_MAX_JSON_SECTION_BYTES || totalMetadataBytes > SNAPSHOT_MAX_TOTAL_JSON_BYTES) {
      throw new Error(`Snapshot ${label} is too large to export and re-import. Reduce notes, drawn paths, or prompt text.`);
    }
    return bytes;
  };
  return {
    manifestBytes: encodeSection(binary.manifest, 'canvas metadata'),
    imageMetaBytes: binary.images.map(({ manifest }) => encodeSection(manifest, `media metadata for "${manifest.fileName || manifest.id}"`)),
  };
};

export const snapshotBinaryToBlob = (binary: SnapshotBinary): Blob => {
  const { manifestBytes, imageMetaBytes } = encodeSnapshotMetadataSections(binary);
  const parts: BlobPart[] = [];
  const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
  parts.push(magicBytes);

  parts.push(writeUint32BE(manifestBytes.length));
  parts.push(manifestBytes);

  binary.images.forEach(({ blob }, index) => {
    if (!(blob instanceof Blob)) {
      throw new Error('Snapshot media must be streamed for this export path.');
    }
    const metaBytes = imageMetaBytes[index];
    parts.push(writeUint32BE(metaBytes.length));
    parts.push(metaBytes);
    parts.push(writeUint64BE(blob.size));
    parts.push(blob);
  });

  return new Blob(parts, { type: 'application/octet-stream' });
};

export const getSnapshotBinaryByteLength = (binary: SnapshotBinary): number => {
  const { manifestBytes, imageMetaBytes } = encodeSnapshotMetadataSections(binary);
  return binary.images.reduce((sum, { blob }, index) => (
    sum + 4 + imageMetaBytes[index].byteLength + 8 + blob.size
  ), snapshotEncoder.encode(SNAPSHOT_MAGIC).byteLength + 4 + manifestBytes.byteLength);
};

const readSnapshotBlobAsArrayBuffer = (blob: SnapshotMediaBlob): Promise<ArrayBuffer> => {
  const reader = (blob as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer;
  if (typeof reader === 'function') {
    return reader.call(blob);
  }
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onerror = () => reject(fileReader.error ?? new Error('Failed to read snapshot media.'));
    fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
    fileReader.readAsArrayBuffer(blob as Blob);
  });
};

export const readSnapshotBlobPartAsArrayBuffer = (blob: SnapshotMediaBlob, start: number, end: number): Promise<ArrayBuffer> => {
  const part = start === 0 && end === blob.size ? blob : blob.slice(start, end);
  return readSnapshotBlobAsArrayBuffer(part);
};

export const getSnapshotMediaObjectUrl = (blob: File | SnapshotMediaBlob): string | undefined => {
  const objectUrl = (blob as { snapshotObjectUrl?: unknown }).snapshotObjectUrl;
  return typeof objectUrl === 'string' && objectUrl.length > 0
    ? objectUrl
    : undefined
}; // Desktop snapshot media keeps a source-scoped URL for lazy reuse.

const createRestoredSnapshotFile = (blob: SnapshotMediaBlob, fileName: string, fileType: string): File => {
  if (blob instanceof Blob) {
    return new File([blob], fileName, { type: fileType });
  }
  return Object.assign(blob, {
    name: fileName,
    lastModified: Date.now(),
    webkitRelativePath: '',
  }) as unknown as File;
};

const readSnapshotMediaProbe = async (blob: SnapshotMediaBlob, manifest: SnapshotImageManifest, offset: number): Promise<void> => {
  try {
    const probe = blob.slice(offset, offset + 1);
    await readSnapshotBlobAsArrayBuffer(probe);
  } catch (error) {
    throw new SnapshotMediaReadError(manifest, error);
  }
};

export const assertSnapshotBinaryMediaReadable = async (binary: SnapshotBinary): Promise<void> => {
  for (const { manifest, blob } of binary.images) {
    await readSnapshotMediaProbe(blob, manifest, 0);
    if (blob.size > 1) {
      await readSnapshotMediaProbe(blob, manifest, blob.size - 1);
    }
  }
};

const isMissingSourceFileError = (error: unknown): boolean => {
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'NotFoundError'
    || /requested file or directory could not be found/i.test(message)
    || /could not be found at the time an operation was processed/i.test(message)
    // Desktop IPC reads fail with this once a snapshot read source is closed (Electron wraps the
    // message, so match by substring). Treat it as a media-read error so writes fall back per-media.
    || /snapshot read source is no longer available/i.test(message);
};

export type SnapshotWritableData = Blob | Uint8Array | string;
export type SnapshotStreamingWritableData = SnapshotMediaBlob | Uint8Array | string;
type SnapshotWritable = { write: (data: SnapshotWritableData, manifest?: SnapshotImageManifest) => Promise<void> };
type SnapshotStreamingWritable = { write: (data: SnapshotStreamingWritableData, manifest?: SnapshotImageManifest) => Promise<void> };
export const isSnapshotMediaBlob = (data: SnapshotStreamingWritableData | SnapshotWritableData): data is SnapshotMediaBlob => (
  typeof data !== 'string' && 'size' in data && typeof data.slice === 'function'
);
const writeSnapshotBinaryWithMedia = async (binary: SnapshotBinary, writable: SnapshotStreamingWritable) => {
  const { manifestBytes, imageMetaBytes } = encodeSnapshotMetadataSections(binary); // Validate metadata before acquiring sources or writing bytes.
  return withSnapshotMediaLeases(binary.images.map(({ blob }) => blob), async () => {
    const magicBytes = snapshotEncoder.encode(SNAPSHOT_MAGIC);
    await writable.write(magicBytes);

    await writable.write(writeUint32BE(manifestBytes.length));
    await writable.write(manifestBytes);

    for (const [index, { manifest, blob }] of binary.images.entries()) {
      const metaBytes = imageMetaBytes[index];
      await writable.write(writeUint32BE(metaBytes.length));
      await writable.write(metaBytes);
      await writable.write(writeUint64BE(blob.size));
      try {
        await writable.write(blob, manifest);
      } catch (error) {
        if (isSnapshotMediaReadError(error) || isMissingSourceFileError(error)) {
          throw isSnapshotMediaReadError(error) ? error : new SnapshotMediaReadError(manifest, error);
        }
        throw error;
      }
    }
  });
};

export const writeSnapshotBinaryStreaming = async (binary: SnapshotBinary, writable: SnapshotStreamingWritable) => {
  await writeSnapshotBinaryWithMedia(binary, writable); // Allows callers to stream lazy range-backed media.
};

export const writeSnapshotBinary = async (binary: SnapshotBinary, writable: SnapshotWritable) => {
  await writeSnapshotBinaryWithMedia(binary, {
    write: async (data, manifest) => {
      if (isSnapshotMediaBlob(data)) {
        if (typeof Blob === 'undefined' || !(data instanceof Blob)) {
          throw new Error('Snapshot media must be streamed for this export path.');
        }
        await writable.write(data, manifest);
        return;
      }
      await writable.write(data, manifest);
    },
  });
};

export const buildSnapshotBinaryFromState = async (params: {
  images: CanvasImage[];
  notes: CanvasNote[];
  paths: Path[];
  videoPromptAreas: CanvasVideoPromptArea[];
  videoPromptBars: CanvasVideoPromptBar[];
  meta: SnapshotMetaState;
}, options: SnapshotBuildOptions = {}): Promise<SnapshotBinary> => {
  const { images, notes, paths, videoPromptAreas, videoPromptBars, meta } = params;
  const imagesWithManifests: SnapshotBinary['images'] = await Promise.all(
    images.map(async (img) => {
      if (options.fallbackMediaIds?.has(img.id)) {
        return buildFallbackSnapshotImage(img);
      }
      const manifest = buildSnapshotImageManifest(img);

      return { manifest, blob: img.file };
    })
  );

  const manifest: SnapshotManifestV2 = {
    version: 2,
    createdAt: new Date().toISOString(),
    state: {
      images: imagesWithManifests.map(item => item.manifest),
      notes: notes.map(note => ({ ...note })),
      paths: paths.map(path => ({
        ...path,
        points: path.points.map(point => ({ ...point })),
      })),
      videoPromptAreas: videoPromptAreas.map(area => ({ ...area, orderedMediaIds: [...area.orderedMediaIds] })),
      videoPromptBars: videoPromptBars.map(bar => ({ ...bar })),
      meta,
    },
  };

  return { manifest, images: imagesWithManifests };
};

export const restoreSnapshotFromFile = async (
  file: SnapshotByteSource,
  options: {
    brushSize: number;
    eraserSize: number;
    brushColor: string;
  },
): Promise<RestoredSnapshotState> => {
  const { brushSize, eraserSize, brushColor } = options;
  const isBinarySnapshot = await isBinarySnapshotFile(file).catch(() => false);

  let restoredImages: CanvasImage[] = [];
  let snapshotNotes: CanvasNote[] = [];
  let snapshotPaths: Path[] = [];
  let snapshotVideoPromptAreas: CanvasVideoPromptArea[] = [];
  let snapshotVideoPromptBars: CanvasVideoPromptBar[] = [];
  let meta: SerializedSnapshotV1['state']['meta'] | undefined;
  let sourceRetentionRequired = false;
  // Audio snapshots need special handling because they render as waveform images.
  const restoreAudioImage = async (params: {
    img: {
      id?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
      metadata?: CanvasImage['metadata'];
      currentPlaybackTime?: number;
      audioDuration?: number;
    };
    file: File;
    audioUrl?: string;
    waveformSource?: Pick<Blob, 'arrayBuffer' | 'size'>;
  }): Promise<CanvasImage> => {
    const { img, file: audioFile, audioUrl, waveformSource = audioFile } = params;
    const width = typeof img.width === 'number' && Number.isFinite(img.width) ? Math.max(1, img.width) : 400;
    const height = typeof img.height === 'number' && Number.isFinite(img.height) ? Math.max(1, img.height) : 80;
    const rotation = typeof img.rotation === 'number' && Number.isFinite(img.rotation) ? img.rotation : 0;
    // Rebuild the audio element from the stored blob.
    const audioElement = audioUrl ? await loadAudioFromUrl(audioUrl) : await loadAudioFromBlob(audioFile);
    const waveformWidth = Math.min(width, SNAPSHOT_MAX_WAVEFORM_WIDTH);
    const waveformHeight = Math.min(height, SNAPSHOT_MAX_WAVEFORM_HEIGHT);
    const shouldDecodeWaveform = waveformSource.size <= SNAPSHOT_MAX_AUDIO_WAVEFORM_BYTES;
    const waveform = shouldDecodeWaveform
      ? await generateWaveformImage(waveformSource, waveformWidth, waveformHeight)
      : { dataUrl: createAudioWaveformPlaceholderDataUrl(waveformWidth, waveformHeight), duration: img.audioDuration ?? Number.NaN };
    const { dataUrl: waveformImageData, duration: waveformDuration } = waveform;
    // Turn the waveform data URL into a drawable element.
    const waveformImg = new Image();
    await new Promise<void>((resolve, reject) => {
      waveformImg.onload = () => resolve();
      waveformImg.onerror = () => reject(new Error('Failed to load waveform image.'));
      waveformImg.src = waveformImageData;
    });
    const naturalWidth = waveformImg.naturalWidth || width;
    const naturalHeight = waveformImg.naturalHeight || height;
    const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : waveformDuration;
    const audioDuration = Number.isFinite(duration) ? duration : undefined;
    const currentPlaybackTime = typeof img.currentPlaybackTime === 'number' && Number.isFinite(img.currentPlaybackTime)
      ? Math.min(Math.max(0, img.currentPlaybackTime), audioDuration ?? img.currentPlaybackTime)
      : 0; // Older snapshots did not store audio playhead position.
    audioElement.currentTime = currentPlaybackTime; // Keep actual playback aligned with restored canvas state.

    return {
      id: typeof img.id === 'string' && img.id.length > 0 ? img.id : crypto.randomUUID(),
      element: waveformImg,
      mediaType: 'audio',
      x: typeof img.x === 'number' ? img.x : 0,
      y: typeof img.y === 'number' ? img.y : 0,
      width,
      height,
      rotation,
      naturalWidth,
      naturalHeight,
      file: audioFile,
      isPlaying: false,
      hasAudio: true,
      audioElement,
      waveformImageData,
      audioDuration,
      currentPlaybackTime,
      metadata: normalizeSnapshotImageMetadata(img.metadata),
    };
  };

  if (isBinarySnapshot) {
    const parsed = await parseBinarySnapshotFile(file);
    sourceRetentionRequired = parsed.images.some(({ blob }) => blob instanceof SnapshotRangeBlob); // Retain only sources that still back lazy media.
    const { state } = parsed.manifest;
    const manifestImages = Array.isArray(state.images) ? state.images : [];
    const blobsById = new Map(parsed.images.map(entry => [entry.manifest.id, entry.blob]));

    restoredImages = await mapWithConcurrency(
      manifestImages,
      SNAPSHOT_MEDIA_RESTORE_CONCURRENCY,
      async (img, index) => {
        const snapshotEntry = parsed.images[index];
        const imageManifest = snapshotEntry?.manifest ?? img;
        const blob = blobsById.get(img.id) ?? snapshotEntry?.blob;
        if (!blob) {
          throw new Error(`Snapshot image "${img.fileName || img.id}" is missing data.`);
        }

        const fileType = typeof imageManifest.fileType === 'string' && imageManifest.fileType.length > 0
          ? imageManifest.fileType
          : blob.type || 'application/octet-stream';
        const fileName = typeof imageManifest.fileName === 'string' && imageManifest.fileName.length > 0
          ? imageManifest.fileName
          : `snapshot-image-${index + 1}.png`;
        const mediaType = imageManifest.mediaType ?? getMediaTypeFromFileType(fileType);

        const snapshotFile = createRestoredSnapshotFile(blob, fileName, fileType);
        // Audio snapshots are stored as blobs but must be rehydrated as waveform images.
        if (mediaType === 'audio') {
          const objectUrl = getSnapshotMediaObjectUrl(blob);
          return restoreAudioImage({
            img: imageManifest,
            file: snapshotFile,
            audioUrl: objectUrl,
            waveformSource: blob,
          });
        }
        // Non-audio media can be rehydrated directly as an image/video element.
        const objectUrl = getSnapshotMediaObjectUrl(blob);
        const savedNaturalWidth = getPositiveSnapshotDimension(imageManifest.naturalWidth, getPositiveSnapshotDimension(imageManifest.width)); // Legacy snapshots fall back to display width.
        const savedNaturalHeight = getPositiveSnapshotDimension(imageManifest.naturalHeight, getPositiveSnapshotDimension(imageManifest.height)); // Legacy snapshots fall back to display height.
        const element = objectUrl && mediaType === 'video'
          ? createLazyVideoFromUrl(objectUrl, savedNaturalWidth, savedNaturalHeight)
          : objectUrl
          ? await loadMediaFromUrl(objectUrl, mediaType)
          : await loadMediaFromBlob(blob as Blob, mediaType);
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        const width = typeof imageManifest.width === 'number' ? imageManifest.width : naturalWidth;
        const height = typeof imageManifest.height === 'number' ? imageManifest.height : naturalHeight;
        const rotation = typeof imageManifest.rotation === 'number' && Number.isFinite(imageManifest.rotation) ? imageManifest.rotation : 0;
        if (element instanceof HTMLVideoElement) {
          element.pause();
          element.currentTime = 0;
          element.loop = true;
          element.muted = true;
          element.playsInline = true;
        }

        return {
          id: typeof imageManifest.id === 'string' && imageManifest.id.length > 0 ? imageManifest.id : crypto.randomUUID(),
          element,
          mediaType,
          x: typeof imageManifest.x === 'number' ? imageManifest.x : 0,
          y: typeof imageManifest.y === 'number' ? imageManifest.y : 0,
          width,
          height,
          rotation,
          naturalWidth,
          naturalHeight,
          file: snapshotFile,
          isPlaying: mediaType === 'video' ? Boolean(imageManifest.isPlaying) : false,
          hasAudio: mediaType === 'video' ? imageManifest.hasAudio : false,
          videoDuration: mediaType === 'video' && typeof imageManifest.videoDuration === 'number' && Number.isFinite(imageManifest.videoDuration)
            ? imageManifest.videoDuration
            : undefined, // Persisted metadata keeps restored videos dormant until playback.
          metadata: normalizeSnapshotImageMetadata(imageManifest.metadata),
        };
      },
    );

    snapshotNotes = Array.isArray(state.notes) ? state.notes.map(note => ({ ...note })) : [];
    snapshotPaths = Array.isArray(state.paths)
      ? state.paths.map(path => ({
        ...path,
        points: Array.isArray(path.points) ? path.points.map(point => ({ ...point })) : [],
      }))
      : [];
    snapshotVideoPromptAreas = Array.isArray(state.videoPromptAreas)
      ? state.videoPromptAreas.map(area => ({ ...area, orderedMediaIds: Array.isArray(area.orderedMediaIds) ? [...area.orderedMediaIds] : [] }))
      : [];
    snapshotVideoPromptBars = Array.isArray(state.videoPromptBars)
      ? state.videoPromptBars.map(bar => ({ ...bar }))
      : [];
    meta = state.meta as SerializedSnapshotV1['state']['meta'];
  } else {
    const raw = await readSnapshotSourceText(file);
    const parsed = JSON.parse(raw) as Partial<SerializedSnapshotV1>;
    if (!parsed || typeof parsed !== 'object' || !parsed.state) {
      throw new Error('Snapshot file is invalid.');
    }

    const { images = [], notes = [], paths = [], videoPromptAreas = [], videoPromptBars = [], meta: parsedMeta } = parsed.state;

    if (!Array.isArray(images) || !Array.isArray(notes) || !Array.isArray(paths)) {
      throw new Error('Snapshot data is incomplete.');
    }

    restoredImages = await Promise.all(
      images.map(async (img, index) => {
        if (!img || typeof img !== 'object' || typeof (img as SerializedCanvasImageV1).dataUrl !== 'string') {
          throw new Error(`Snapshot image at index ${index} is invalid.`);
        }

        const fileType = typeof (img as SerializedCanvasImageV1).fileType === 'string' && (img as SerializedCanvasImageV1).fileType.length > 0
          ? (img as SerializedCanvasImageV1).fileType
          : 'image/png';
        const mediaType = (img as SerializedCanvasImageV1).mediaType ?? getMediaTypeFromFileType(fileType);
        const fileName = typeof (img as SerializedCanvasImageV1).fileName === 'string' && (img as SerializedCanvasImageV1).fileName.length > 0
          ? (img as SerializedCanvasImageV1).fileName
          : `snapshot-image-${index + 1}.png`;
        // V1 snapshots store audio as data URLs; rebuild waveform + audio elements.
        if (mediaType === 'audio') {
          const snapshotFile = await dataUrlToFile((img as SerializedCanvasImageV1).dataUrl, fileName, fileType);
          return restoreAudioImage({
            img: img as SerializedCanvasImageV1,
            file: snapshotFile,
          });
        }
        // Non-audio media can be rehydrated directly from the data URL.
        const element = await loadMediaFromDataUrl((img as SerializedCanvasImageV1).dataUrl, mediaType);
        if (element instanceof HTMLVideoElement) {
          element.pause();
          element.currentTime = 0;
          element.loop = true;
          element.muted = true;
          element.playsInline = true;
        }
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        const snapshotFile = await dataUrlToFile((img as SerializedCanvasImageV1).dataUrl, fileName, fileType);
        const width = typeof (img as SerializedCanvasImageV1).width === 'number' ? (img as SerializedCanvasImageV1).width : naturalWidth;
        const height = typeof (img as SerializedCanvasImageV1).height === 'number' ? (img as SerializedCanvasImageV1).height : naturalHeight;
        const rawMetadata = (img as SerializedCanvasImageV1).metadata as CanvasImage['metadata'] | undefined;
        const rotation = typeof (img as SerializedCanvasImageV1).rotation === 'number' && Number.isFinite((img as SerializedCanvasImageV1).rotation)
          ? (img as SerializedCanvasImageV1).rotation
          : 0;

        return {
          id: typeof (img as SerializedCanvasImageV1).id === 'string' && (img as SerializedCanvasImageV1).id.length > 0 ? (img as SerializedCanvasImageV1).id : crypto.randomUUID(),
          element,
          mediaType,
          x: typeof (img as SerializedCanvasImageV1).x === 'number' ? (img as SerializedCanvasImageV1).x : 0,
          y: typeof (img as SerializedCanvasImageV1).y === 'number' ? (img as SerializedCanvasImageV1).y : 0,
          width,
          height,
          rotation,
          naturalWidth,
          naturalHeight,
          file: snapshotFile,
          isPlaying: mediaType === 'video' ? Boolean((img as SerializedCanvasImageV1).isPlaying) : false,
          hasAudio: mediaType === 'video' ? (img as SerializedCanvasImageV1).hasAudio : false,
          videoDuration: mediaType === 'video' && typeof (img as SerializedCanvasImageV1).videoDuration === 'number' && Number.isFinite((img as SerializedCanvasImageV1).videoDuration)
            ? (img as SerializedCanvasImageV1).videoDuration
            : undefined,
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
    snapshotVideoPromptAreas = Array.isArray(videoPromptAreas)
      ? videoPromptAreas.map(area => ({ ...area, orderedMediaIds: Array.isArray(area.orderedMediaIds) ? [...area.orderedMediaIds] : [] }))
      : [];
    snapshotVideoPromptBars = Array.isArray(videoPromptBars)
      ? videoPromptBars.map(bar => ({ ...bar }))
      : [];
    meta = parsedMeta as SerializedSnapshotV1['state']['meta'];
  }

  // Legacy canvas-rectangle notes (pre side-panel) are dropped rather than migrated.
  const isLegacyNote = (note: CanvasNote) => !note || typeof note !== 'object' || 'width' in note || 'backgroundColor' in note;
  const droppedLegacyNoteCount = snapshotNotes.filter(isLegacyNote).length;
  const sanitizedNotes: CanvasNote[] = snapshotNotes
    .filter(note => !isLegacyNote(note))
    .map(note => {
      const rawAnchor = (note as { anchor?: unknown }).anchor as { x?: unknown; y?: unknown } | undefined;
      const anchor = rawAnchor
        && typeof rawAnchor.x === 'number' && Number.isFinite(rawAnchor.x)
        && typeof rawAnchor.y === 'number' && Number.isFinite(rawAnchor.y)
        ? { x: rawAnchor.x, y: rawAnchor.y }
        : undefined;
      const rawLabel = (note as { label?: unknown }).label;
      const label = anchor && typeof rawLabel === 'number' && Number.isInteger(rawLabel) && rawLabel > 0
        ? rawLabel
        : undefined;
      const pinnedFields = anchor && label !== undefined ? { label, anchor } : {}; // Keep pin identity and position atomic.
      return {
        id: typeof note?.id === 'string' && note.id.length > 0 ? note.id : crypto.randomUUID(),
        text: typeof note?.text === 'string' ? note.text : '',
        ...pinnedFields,
      };
    });

  const sanitizedPaths: Path[] = snapshotPaths.map(path => {
    const rawPoints = Array.isArray(path?.points) ? path.points : [];
    const points: Point[] = rawPoints
      .map(point => (point && typeof point === 'object' ? point : null))
      .filter((point): point is Point => point !== null && typeof point.x === 'number' && typeof point.y === 'number')
      .map(point => ({ x: point.x, y: point.y }));

    const fallbackTool = Tool.BRUSH;
    const rawTool = (path as { tool?: unknown })?.tool;
    const toolValue = rawTool === 'INPAINT'
      ? Tool.ANNOTATE
      : Object.values(Tool).includes(rawTool as Tool)
        ? (rawTool as Tool)
        : fallbackTool;
    const fallbackSize = toolValue === Tool.ERASE ? eraserSize : brushSize;

    return {
      points,
      color: typeof path?.color === 'string' && path.color.length > 0 ? path.color : brushColor,
      size: typeof path?.size === 'number' ? path.size : fallbackSize,
      tool: toolValue,
    };
  });

  const sanitizedVideoPromptAreas: CanvasVideoPromptArea[] = snapshotVideoPromptAreas.map((area, index) => {
    const orderedMediaIds = Array.isArray(area?.orderedMediaIds) ? area.orderedMediaIds.filter((id): id is string => typeof id === 'string') : [];
    const rawMediaRoles = area?.mediaRoles && typeof area.mediaRoles === 'object' ? area.mediaRoles : {};
    const mediaRoles = Object.entries(rawMediaRoles).reduce<NonNullable<CanvasVideoPromptArea['mediaRoles']>>((acc, [mediaId, role]) => {
      if (orderedMediaIds.includes(mediaId) && isVideoPromptAreaMediaRole(role)) {
        acc[mediaId] = role;
      }
      return acc;
    }, {}); // Keep only roles for media still in the area.
    return {
      id: typeof area?.id === 'string' && area.id.length > 0 ? area.id : crypto.randomUUID(),
      sequence: typeof area?.sequence === 'number' && Number.isFinite(area.sequence) ? area.sequence : index + 1,
      label: typeof area?.label === 'string' && area.label.length > 0 ? area.label : `Video prompt area ${String(index + 1).padStart(2, '0')}`,
      borderColor: typeof area?.borderColor === 'string' && area.borderColor.length > 0 ? area.borderColor : DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR,
      x: typeof area?.x === 'number' ? area.x : 0,
      y: typeof area?.y === 'number' ? area.y : 0,
      width: typeof area?.width === 'number' ? area.width : 280,
      height: typeof area?.height === 'number' ? area.height : 220,
      promptBarId: typeof area?.promptBarId === 'string' ? area.promptBarId : null,
      orderedMediaIds,
      mediaRoles,
    };
  });
  const sanitizedVideoPromptBars: CanvasVideoPromptBar[] = snapshotVideoPromptBars.map(bar => {
    const modelId = typeof bar?.modelId === 'string' && isFalVideoModelId(bar.modelId) ? bar.modelId : SEEDANCE_2_VIDEO_MODEL_ID;
    const isJimengBar = modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    const falOptions = bar?.falOptions && typeof bar.falOptions === 'object' ? { ...bar.falOptions } : undefined;
    const falJimengModelVersion: CanvasVideoPromptBar['seedance2JimengModelVersion'] | undefined = falOptions && isJimengSeedance2ModelVersion((falOptions as { seedance2JimengModelVersion?: unknown }).seedance2JimengModelVersion)
      ? (falOptions as { seedance2JimengModelVersion: CanvasVideoPromptBar['seedance2JimengModelVersion'] }).seedance2JimengModelVersion
      : undefined; // Older embedded bars kept the Jimeng channel inside falOptions.
    const seedance2JimengModelVersion = isJimengSeedance2ModelVersion(bar?.seedance2JimengModelVersion) ? bar.seedance2JimengModelVersion : falJimengModelVersion;
    const seedance2AspectRatioRaw = isSeedance2AspectRatioSelectionValue(bar?.seedance2AspectRatio) ? bar.seedance2AspectRatio : '16:9';
    const seedance2ResolutionRaw = isSeedance2ResolutionSelectionValue(bar?.seedance2Resolution) ? bar.seedance2Resolution : '720p';
    const seedance2AspectRatio = isJimengBar && seedance2AspectRatioRaw === 'adaptive' ? '16:9' : seedance2AspectRatioRaw; // Jimeng snapshots cannot restore adaptive.
    const seedance2Resolution = isJimengBar && seedance2ResolutionRaw === '1080p' && seedance2JimengModelVersion !== 'seedance2.0_vip' ? '720p' : seedance2ResolutionRaw; // Only VIP restores 1080p.
    return {
      id: typeof bar?.id === 'string' && bar.id.length > 0 ? bar.id : crypto.randomUUID(),
      assignedAreaId: typeof bar?.assignedAreaId === 'string' ? bar.assignedAreaId : null,
      x: typeof bar?.x === 'number' ? bar.x : 0,
      y: typeof bar?.y === 'number' ? bar.y : 0,
      width: typeof bar?.width === 'number' ? bar.width : 920,
      height: typeof bar?.height === 'number' ? bar.height : 190,
      prompt: typeof bar?.prompt === 'string' ? bar.prompt : '',
      negativePrompt: typeof bar?.negativePrompt === 'string' ? bar.negativePrompt : '',
      modelId,
      falOptions,
      klingV3MultiPrompt: typeof bar?.klingV3MultiPrompt === 'string' ? bar.klingV3MultiPrompt : '',
      klingV3Duration: isKlingV3DurationSelectionValue(bar?.klingV3Duration) ? bar.klingV3Duration : '5',
      klingV3GenerateAudio: typeof bar?.klingV3GenerateAudio === 'boolean' ? bar.klingV3GenerateAudio : true,
      klingV3CfgScale: isKlingV3CfgScaleSelectionValue(bar?.klingV3CfgScale) ? bar.klingV3CfgScale : '0.5',
      klingV3MultiPromptEnabled: Boolean(bar?.klingV3MultiPromptEnabled),
      klingV3Shot1Duration: isKlingV3ShotDurationSelectionValue(bar?.klingV3Shot1Duration) ? bar.klingV3Shot1Duration : '5',
      klingV3Shot2Duration: isKlingV3ShotDurationSelectionValue(bar?.klingV3Shot2Duration) ? bar.klingV3Shot2Duration : '5',
      seedance2Variant: bar?.seedance2Variant === 'smart' ? 'smart' : 'reference',
      seedance2JimengModelVersion,
      seedance2AspectRatio,
      seedance2Resolution,
      seedance2Duration: isSeedance2DurationSelectionValue(bar?.seedance2Duration) ? bar.seedance2Duration : '5',
      seedance2GenerateAudio: Boolean(bar?.seedance2GenerateAudio),
      seedance2CameraFixed: Boolean(bar?.seedance2CameraFixed),
    };
  });

  return {
    images: restoredImages,
    notes: sanitizedNotes,
    paths: sanitizedPaths,
    videoPromptAreas: sanitizedVideoPromptAreas,
    videoPromptBars: sanitizedVideoPromptBars,
    meta,
    sourceRetention: sourceRetentionRequired ? 'required' : 'not-required', // Empty, materialized, and legacy imports no longer own a source handle.
    droppedLegacyNoteCount,
  };
};

export const normalizeSnapshotImageMetadata = (
  rawMetadata: CanvasImageMetadata | undefined,
): CanvasImage['metadata'] | undefined => {
  const normalizeGenerationInputs = (rawGeneration: unknown): GenerationInputs | undefined => {
    if (!rawGeneration || typeof rawGeneration !== 'object') {
      return undefined;
    }
    const raw = rawGeneration as Partial<GenerationInputs>;
    const kind = isGenerationKind(raw.kind) ? raw.kind : undefined;
    const provider = isGenerationProvider(raw.provider) ? raw.provider : undefined;
    if (!kind || !provider) {
      return undefined;
    }

    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    const modelId = typeof raw.modelId === 'string' ? raw.modelId : undefined;
    const modelLabel = typeof raw.modelLabel === 'string' ? raw.modelLabel.trim() : undefined;
    const modelMode = isFalModelMode(raw.modelMode) ? raw.modelMode : undefined;
    const primaryImageId = typeof raw.primaryImageId === 'string' ? raw.primaryImageId : undefined;
    const originalSourceImageId = typeof raw.originalSourceImageId === 'string' ? raw.originalSourceImageId : undefined;
    const referenceImageIds = Array.isArray(raw.referenceImageIds)
      ? raw.referenceImageIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    const editAppMode = raw.editAppMode === 'CANVAS' || raw.editAppMode === 'ANNOTATE'
      ? raw.editAppMode
      : undefined; // Preserve saved edit mode for reruns.
    const rawEditTool = (raw as { editTool?: unknown }).editTool;
    const editTool = rawEditTool === Tool.SELECTION || rawEditTool === Tool.FREE_SELECTION || rawEditTool === Tool.ANNOTATE
      ? rawEditTool
      : undefined; // Preserve only tools that image edits can replay.
    const editPaths = Array.isArray((raw as { editPaths?: unknown }).editPaths)
      ? (raw as { editPaths: unknown[] }).editPaths.map(path => {
        const rawPath = path && typeof path === 'object' ? path as Partial<Path> : {};
        const rawPoints = Array.isArray(rawPath.points) ? rawPath.points : [];
        return {
          points: rawPoints
            .filter((point): point is Point => !!point && typeof point === 'object' && typeof (point as Point).x === 'number' && typeof (point as Point).y === 'number')
            .map(point => ({ x: point.x, y: point.y })),
          color: typeof rawPath.color === 'string' && rawPath.color.length > 0 ? rawPath.color : '#ff0000',
          size: typeof rawPath.size === 'number' ? rawPath.size : 8,
          tool: Object.values(Tool).includes(rawPath.tool as Tool) ? rawPath.tool as Tool : Tool.BRUSH,
        };
      })
      : undefined; // Preserve edit masks without trusting malformed snapshots.
    const referenceVideoIds = Array.isArray(raw.referenceVideoIds)
      ? raw.referenceVideoIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    const referenceAudioIds = Array.isArray(raw.referenceAudioIds)
      ? raw.referenceAudioIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    const elementImageIds = Array.isArray(raw.elementImageIds)
      ? raw.elementImageIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    const videoLastFrameImageId = typeof raw.videoLastFrameImageId === 'string'
      ? raw.videoLastFrameImageId
      : undefined;
    const sourceVideoId = typeof raw.sourceVideoId === 'string' ? raw.sourceVideoId : undefined;
    const sourceAudioId = typeof raw.sourceAudioId === 'string' ? raw.sourceAudioId : undefined;
    const url = typeof raw.url === 'string' ? raw.url : undefined;

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
      if (isFlux2MaxImageSizeSelectionValue((typed as { flux2MaxImageSize?: unknown }).flux2MaxImageSize)) {
        normalizedOptions.flux2MaxImageSize = typed.flux2MaxImageSize; // Keep the saved Flux output dimensions for reruns.
      }
      if (isGptImage2QualitySelectionValue((typed as { gptImage2Quality?: unknown }).gptImage2Quality)) {
        normalizedOptions.gptImage2Quality = typed.gptImage2Quality;
      }
      if (isKrea2CreativitySelectionValue((typed as { krea2Creativity?: unknown }).krea2Creativity)) {
        normalizedOptions.krea2Creativity = typed.krea2Creativity;
      }
      const normalizeNumberOption = (value: unknown, min: number, max: number) => {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
          return undefined;
        }
        return Math.min(max, Math.max(min, parsed));
      };
      const krea2StyleReferenceStrengths = (typed as { krea2StyleReferenceStrengths?: unknown }).krea2StyleReferenceStrengths;
      if (krea2StyleReferenceStrengths && typeof krea2StyleReferenceStrengths === 'object' && !Array.isArray(krea2StyleReferenceStrengths)) {
        const normalizedStrengths = Object.fromEntries(Object.entries(krea2StyleReferenceStrengths)
          .filter((entry): entry is [string, unknown] => typeof entry[0] === 'string')
          .map(([id, value]) => [id, normalizeNumberOption(value, -2, 2)])
          .filter((entry): entry is [string, number] => entry[1] !== undefined)
          .map(([id, value]) => [id, Math.round(value * 10) / 10])); // Krea strength slider uses tenths.
        if (Object.keys(normalizedStrengths).length > 0) {
          normalizedOptions.krea2StyleReferenceStrengths = normalizedStrengths;
        }
      }
      const maxFalNumImages = getFalNumImageMaxForModel(modelId); // Resolve output cap from stored model id.
      const numImages = normalizeNumberOption((typed as { numImages?: unknown }).numImages, 1, maxFalNumImages);
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
      const videoDurationRaw = (typed as { videoDuration?: unknown }).videoDuration;
      const videoDuration = videoDurationRaw === '10'
        ? '10'
        : videoDurationRaw === '6'
          ? '6'
          : videoDurationRaw === '5'
            ? '5'
            : undefined;
      if (videoDuration) {
        normalizedOptions.videoDuration = videoDuration;
      }
      const hailuoVariantValue = (typed as { hailuoVariant?: unknown }).hailuoVariant;
      if (hailuoVariantValue === 'standard' || hailuoVariantValue === 'pro') {
        normalizedOptions.hailuoVariant = hailuoVariantValue;
      }
      const klingVariantValue = (typed as { klingVariant?: unknown }).klingVariant;
      if (klingVariantValue === 'standard' || klingVariantValue === 'pro') {
        normalizedOptions.klingVariant = klingVariantValue;
      }
      const klingO3VariantValue = (typed as { klingO3Variant?: unknown; klingO1Variant?: unknown }).klingO3Variant
        ?? (typed as { klingO1Variant?: unknown }).klingO1Variant; // Old snapshots used Kling O1 names.
      if (klingO3VariantValue === 'refV2V') {
        normalizedOptions.klingO1Variant = 'refV2V';
      } else if (klingO3VariantValue === 'reference' || klingO3VariantValue === 'edit' || klingO3VariantValue === 'refI2V' || klingO3VariantValue === 'fflf') {
        normalizedOptions.klingO3Variant = normalizeKlingO3Variant(klingO3VariantValue);
      }
      const klingO3DurationValue = (typed as { klingO3Duration?: unknown }).klingO3Duration;
      if (isKlingO3DurationSelectionValue(klingO3DurationValue)) {
        normalizedOptions.klingO3Duration = klingO3DurationValue;
      }
      const klingO3GenerateAudioValue = (typed as { klingO3GenerateAudio?: unknown }).klingO3GenerateAudio;
      if (typeof klingO3GenerateAudioValue === 'boolean') {
        normalizedOptions.klingO3GenerateAudio = klingO3GenerateAudioValue;
      }
      const klingO3KeepAudioValue = (typed as { klingO3KeepAudio?: unknown; klingO1KeepAudio?: unknown }).klingO3KeepAudio
        ?? (typed as { klingO1KeepAudio?: unknown }).klingO1KeepAudio; // Old snapshots used Kling O1 names.
      if (typeof klingO3KeepAudioValue === 'boolean') {
        normalizedOptions.klingO3KeepAudio = klingO3KeepAudioValue;
      }
      const klingV3DurationValue = (typed as { klingV3Duration?: unknown }).klingV3Duration;
      if (isKlingV3DurationSelectionValue(klingV3DurationValue)) {
        normalizedOptions.klingV3Duration = klingV3DurationValue;
      }
      const klingV3GenerateAudioValue = (typed as { klingV3GenerateAudio?: unknown }).klingV3GenerateAudio;
      if (typeof klingV3GenerateAudioValue === 'boolean') {
        normalizedOptions.klingV3GenerateAudio = klingV3GenerateAudioValue;
      }
      const klingV3CfgScaleValue = (typed as { klingV3CfgScale?: unknown }).klingV3CfgScale;
      if (isKlingV3CfgScaleSelectionValue(klingV3CfgScaleValue)) {
        normalizedOptions.klingV3CfgScale = klingV3CfgScaleValue;
      }
      const klingV3MultiPromptEnabledValue = (typed as { klingV3MultiPromptEnabled?: unknown }).klingV3MultiPromptEnabled;
      if (typeof klingV3MultiPromptEnabledValue === 'boolean') {
        normalizedOptions.klingV3MultiPromptEnabled = klingV3MultiPromptEnabledValue;
      }
      const klingV3MultiPromptValue = (typed as { klingV3MultiPrompt?: unknown }).klingV3MultiPrompt;
      if (typeof klingV3MultiPromptValue === 'string') {
        normalizedOptions.klingV3MultiPrompt = klingV3MultiPromptValue;
      }
      const klingV3Shot1DurationValue = (typed as { klingV3Shot1Duration?: unknown }).klingV3Shot1Duration;
      if (isKlingV3ShotDurationSelectionValue(klingV3Shot1DurationValue)) {
        normalizedOptions.klingV3Shot1Duration = klingV3Shot1DurationValue;
      }
      const klingV3Shot2DurationValue = (typed as { klingV3Shot2Duration?: unknown }).klingV3Shot2Duration;
      if (isKlingV3ShotDurationSelectionValue(klingV3Shot2DurationValue)) {
        normalizedOptions.klingV3Shot2Duration = klingV3Shot2DurationValue;
      }
      const negativePrompt = (typed as { negativePrompt?: unknown }).negativePrompt;
      if (typeof negativePrompt === 'string' && negativePrompt.trim().length > 0) {
        normalizedOptions.negativePrompt = negativePrompt.trim();
      }

      const wan27VideoResolutionValue = (typed as { wan27VideoResolution?: unknown; wan26Resolution?: unknown }).wan27VideoResolution
        ?? (typed as { wan26Resolution?: unknown }).wan26Resolution;
      if (wan27VideoResolutionValue === '720p' || wan27VideoResolutionValue === '1080p') {
        normalizedOptions.wan27VideoResolution = wan27VideoResolutionValue;
      }

      const wan27VideoDurationValue = (typed as { wan27VideoDuration?: unknown; wan26Duration?: unknown }).wan27VideoDuration
        ?? (typed as { wan26Duration?: unknown }).wan26Duration;
      if (
        wan27VideoDurationValue === '0' || wan27VideoDurationValue === '2' || wan27VideoDurationValue === '3' || wan27VideoDurationValue === '4'
        || wan27VideoDurationValue === '5' || wan27VideoDurationValue === '6' || wan27VideoDurationValue === '7'
        || wan27VideoDurationValue === '8' || wan27VideoDurationValue === '9' || wan27VideoDurationValue === '10'
        || wan27VideoDurationValue === '11' || wan27VideoDurationValue === '12' || wan27VideoDurationValue === '13'
        || wan27VideoDurationValue === '14' || wan27VideoDurationValue === '15'
      ) {
        normalizedOptions.wan27VideoDuration = wan27VideoDurationValue;
      }

      const wan27VideoAspectRatioValue = (typed as { wan27VideoAspectRatio?: unknown }).wan27VideoAspectRatio;
      if (wan27VideoAspectRatioValue === 'source' || wan27VideoAspectRatioValue === '16:9' || wan27VideoAspectRatioValue === '9:16' || wan27VideoAspectRatioValue === '1:1' || wan27VideoAspectRatioValue === '4:3' || wan27VideoAspectRatioValue === '3:4') {
        normalizedOptions.wan27VideoAspectRatio = wan27VideoAspectRatioValue;
      }

      const wan27VideoPromptExpansionValue = (typed as { wan27VideoPromptExpansion?: unknown; wan26PromptExpansion?: unknown }).wan27VideoPromptExpansion
        ?? (typed as { wan26PromptExpansion?: unknown }).wan26PromptExpansion;
      if (typeof wan27VideoPromptExpansionValue === 'boolean') {
        normalizedOptions.wan27VideoPromptExpansion = wan27VideoPromptExpansionValue;
      }

      const wan27VideoVariantValue = (typed as { wan27VideoVariant?: unknown }).wan27VideoVariant;
      if (wan27VideoVariantValue === 'smart' || wan27VideoVariantValue === 'reference' || wan27VideoVariantValue === 'edit') {
        normalizedOptions.wan27VideoVariant = wan27VideoVariantValue;
      }

      const wan27VideoAudioSettingValue = (typed as { wan27VideoAudioSetting?: unknown }).wan27VideoAudioSetting;
      if (wan27VideoAudioSettingValue === 'auto' || wan27VideoAudioSettingValue === 'origin') {
        normalizedOptions.wan27VideoAudioSetting = wan27VideoAudioSettingValue;
      }

      const wanTargetResolution = (typed as { wanTargetResolution?: unknown }).wanTargetResolution;
      if (wanTargetResolution === '720p' || wanTargetResolution === '1080p') {
        normalizedOptions.wanTargetResolution = wanTargetResolution;
      }

      const wanCreativityRaw = normalizeNumberOption((typed as { wanCreativity?: unknown }).wanCreativity, 0, 4);
      if (wanCreativityRaw !== undefined) {
        normalizedOptions.wanCreativity = Math.round(wanCreativityRaw) as 0 | 1 | 2 | 3 | 4;
      }

      const wanAnimateVariantValue = (typed as { wanAnimateVariant?: unknown }).wanAnimateVariant;
      if (wanAnimateVariantValue === 'replace' || wanAnimateVariantValue === 'move') {
        normalizedOptions.wanAnimateVariant = wanAnimateVariantValue;
      }

      const wanAnimateStepsValue = (typed as { wanAnimateSteps?: unknown }).wanAnimateSteps;
      if (wanAnimateStepsValue === '10' || wanAnimateStepsValue === '20' || wanAnimateStepsValue === '30' || wanAnimateStepsValue === '40') {
        normalizedOptions.wanAnimateSteps = wanAnimateStepsValue;
      }

      const wanAnimateResolutionValue = (typed as { wanAnimateResolution?: unknown }).wanAnimateResolution;
      if (wanAnimateResolutionValue === '480p' || wanAnimateResolutionValue === '580p' || wanAnimateResolutionValue === '720p') {
        normalizedOptions.wanAnimateResolution = wanAnimateResolutionValue;
      }

      const oneToAllAnimateResolutionValue = (typed as { oneToAllAnimateResolution?: unknown }).oneToAllAnimateResolution;
      if (oneToAllAnimateResolutionValue === '480p' || oneToAllAnimateResolutionValue === '580p' || oneToAllAnimateResolutionValue === '720p') {
        normalizedOptions.oneToAllAnimateResolution = oneToAllAnimateResolutionValue;
      }

      const wanAnimateShiftValue = (typed as { wanAnimateShift?: unknown }).wanAnimateShift;
      if (wanAnimateShiftValue === '5.0' || wanAnimateShiftValue === '6.0' || wanAnimateShiftValue === '7.0' || wanAnimateShiftValue === '8.0' || wanAnimateShiftValue === '9.0' || wanAnimateShiftValue === '10.0') {
        normalizedOptions.wanAnimateShift = wanAnimateShiftValue;
      }

      const wanAnimateQualityValue = (typed as { wanAnimateQuality?: unknown }).wanAnimateQuality;
      if (wanAnimateQualityValue === 'high' || wanAnimateQualityValue === 'maximum') {
        normalizedOptions.wanAnimateQuality = wanAnimateQualityValue;
      }

      const wanAnimateUseTurboValue = (typed as { wanAnimateUseTurbo?: unknown }).wanAnimateUseTurbo;
      if (typeof wanAnimateUseTurboValue === 'boolean') {
        normalizedOptions.wanAnimateUseTurbo = wanAnimateUseTurboValue;
      }

      const heygenEnableCaptionValue = (typed as { heygenEnableCaption?: unknown }).heygenEnableCaption;
      if (typeof heygenEnableCaptionValue === 'boolean') {
        normalizedOptions.heygenEnableCaption = heygenEnableCaptionValue;
      }

      const heygenEnableDynamicDurationValue = (typed as { heygenEnableDynamicDuration?: unknown }).heygenEnableDynamicDuration;
      if (typeof heygenEnableDynamicDurationValue === 'boolean') {
        normalizedOptions.heygenEnableDynamicDuration = heygenEnableDynamicDurationValue;
      }

      const heygenDisableMusicTrackValue = (typed as { heygenDisableMusicTrack?: unknown }).heygenDisableMusicTrack;
      if (typeof heygenDisableMusicTrackValue === 'boolean') {
        normalizedOptions.heygenDisableMusicTrack = heygenDisableMusicTrackValue;
      }

      const heygenEnableSpeechEnhancementValue = (typed as { heygenEnableSpeechEnhancement?: unknown }).heygenEnableSpeechEnhancement;
      if (typeof heygenEnableSpeechEnhancementValue === 'boolean') {
        normalizedOptions.heygenEnableSpeechEnhancement = heygenEnableSpeechEnhancementValue;
      }

      const heygenTimingResolvedValue = (typed as { heygenTimingResolved?: unknown }).heygenTimingResolved;
      if (typeof heygenTimingResolvedValue === 'boolean') {
        normalizedOptions.heygenTimingResolved = heygenTimingResolvedValue;
      }

      const heygenStartTimeValue = (typed as { heygenStartTime?: unknown }).heygenStartTime;
      if (typeof heygenStartTimeValue === 'number' && Number.isFinite(heygenStartTimeValue) && heygenStartTimeValue >= 0) {
        normalizedOptions.heygenStartTime = heygenStartTimeValue;
      }

      const heygenEndTimeValue = (typed as { heygenEndTime?: unknown }).heygenEndTime;
      if (typeof heygenEndTimeValue === 'number' && Number.isFinite(heygenEndTimeValue) && heygenEndTimeValue >= 0) {
        normalizedOptions.heygenEndTime = heygenEndTimeValue;
      }

      const lipsyncSyncModeValue = (typed as { lipsyncSyncMode?: unknown }).lipsyncSyncMode;
      const legacyLipsyncAudioModeValue = (typed as { lipsyncAudioMode?: unknown }).lipsyncAudioMode; // React-1 snapshot field.
      const normalizedLipsyncSyncMode = isLipsyncSyncMode(lipsyncSyncModeValue)
        ? lipsyncSyncModeValue
        : isLipsyncSyncMode(legacyLipsyncAudioModeValue)
          ? legacyLipsyncAudioModeValue
          : undefined;
      if (normalizedLipsyncSyncMode) {
        normalizedOptions.lipsyncSyncMode = normalizedLipsyncSyncMode;
      }

      const infinitalkResolutionValue = (typed as { infinitalkResolution?: unknown }).infinitalkResolution;
      if (isInfinitalkResolutionSelectionValue(infinitalkResolutionValue)) {
        normalizedOptions.infinitalkResolution = infinitalkResolutionValue;
      }

      const infinitalkSeedValue = (typed as { infinitalkSeed?: unknown }).infinitalkSeed;
      if (isInfinitalkSeedSelectionValue(infinitalkSeedValue)) {
        normalizedOptions.infinitalkSeed = infinitalkSeedValue;
      }

      const infinitalkAccelerationValue = (typed as { infinitalkAcceleration?: unknown }).infinitalkAcceleration;
      if (isInfinitalkAccelerationSelectionValue(infinitalkAccelerationValue)) {
        normalizedOptions.infinitalkAcceleration = infinitalkAccelerationValue;
      }

      const grokImagineVideoDurationValue = (typed as { grokImagineVideoDuration?: unknown }).grokImagineVideoDuration;
      if (isGrokImagineVideoDurationSelectionValue(grokImagineVideoDurationValue)) {
        normalizedOptions.grokImagineVideoDuration = grokImagineVideoDurationValue;
      }

      const grokImagineVideoResolutionValue = (typed as { grokImagineVideoResolution?: unknown }).grokImagineVideoResolution;
      if (isGrokImagineVideoResolutionSelectionValue(grokImagineVideoResolutionValue)) {
        normalizedOptions.grokImagineVideoResolution = grokImagineVideoResolutionValue;
      }

      const grokImagineVideoAspectRatioValue = (typed as { grokImagineVideoAspectRatio?: unknown }).grokImagineVideoAspectRatio;
      if (isGrokImagineVideoAspectRatioSelectionValue(grokImagineVideoAspectRatioValue)) {
        normalizedOptions.grokImagineVideoAspectRatio = grokImagineVideoAspectRatioValue;
      }

      const veo31VariantValue = (typed as { veo31Variant?: unknown }).veo31Variant;
      const normalizedVeo31Variant = normalizeVeo31Variant(veo31VariantValue);
      if (normalizedVeo31Variant) {
        normalizedOptions.veo31Variant = normalizedVeo31Variant;
      }
      const veo31DurationValue = (typed as { veo31Duration?: unknown }).veo31Duration;
      if (isVeo31DurationSelectionValue(veo31DurationValue)) {
        normalizedOptions.veo31Duration = veo31DurationValue;
      }
      const veo31ResolutionValue = (typed as { veo31Resolution?: unknown }).veo31Resolution;
      if (isVeo31ResolutionSelectionValue(veo31ResolutionValue)) {
        normalizedOptions.veo31Resolution = veo31ResolutionValue;
      }
      const veo31AspectRatioValue = (typed as { veo31AspectRatio?: unknown }).veo31AspectRatio;
      if (isVeo31AspectRatioSelectionValue(veo31AspectRatioValue)) {
        normalizedOptions.veo31AspectRatio = veo31AspectRatioValue;
      }
      const veo31GenerateAudioValue = (typed as { veo31GenerateAudio?: unknown }).veo31GenerateAudio;
      if (typeof veo31GenerateAudioValue === 'boolean') {
        normalizedOptions.veo31GenerateAudio = veo31GenerateAudioValue;
      }

      const recraftImageSizeValue = (typed as { recraftImageSize?: unknown }).recraftImageSize;
      if (isRecraftV4ProImageSizeSelectionValue(recraftImageSizeValue)) {
        normalizedOptions.recraftImageSize = recraftImageSizeValue;
      }
      const recraftBackgroundColor = normalizeRecraftRgbColor((typed as { recraftBackgroundColor?: unknown }).recraftBackgroundColor);
      if (recraftBackgroundColor) {
        normalizedOptions.recraftBackgroundColor = recraftBackgroundColor;
      }
      const recraftColorsRaw = (typed as { recraftColors?: unknown }).recraftColors;
      if (Array.isArray(recraftColorsRaw)) {
        const recraftColors = recraftColorsRaw
          .map(normalizeRecraftRgbColor)
          .filter((color): color is NonNullable<typeof color> => Boolean(color))
          .slice(0, RECRAFT_V4_PRO_MAX_COLORS);
        if (recraftColors.length > 0) {
          normalizedOptions.recraftColors = recraftColors;
        }
      }
      if (isWan27ImageAspectRatioSelectionValue((typed as { wan27ImageAspectRatio?: unknown }).wan27ImageAspectRatio)) {
        normalizedOptions.wan27ImageAspectRatio = typed.wan27ImageAspectRatio;
      }
      if (isWan27ImageMaxImagesSelectionValue((typed as { wan27ImageMaxImages?: unknown }).wan27ImageMaxImages)) {
        normalizedOptions.wan27ImageMaxImages = typed.wan27ImageMaxImages;
      }

      if (isSeedance2Variant((typed as { seedance2Variant?: unknown }).seedance2Variant)) {
        normalizedOptions.seedance2Variant = typed.seedance2Variant;
      }
      if (isSeedance2AspectRatioSelectionValue((typed as { seedance2AspectRatio?: unknown }).seedance2AspectRatio)) {
        normalizedOptions.seedance2AspectRatio = typed.seedance2AspectRatio;
      }
      if (isSeedance2ResolutionSelectionValue((typed as { seedance2Resolution?: unknown }).seedance2Resolution)) {
        normalizedOptions.seedance2Resolution = typed.seedance2Resolution;
      }
      if (isSeedance2DurationSelectionValue((typed as { seedance2Duration?: unknown }).seedance2Duration)) {
        normalizedOptions.seedance2Duration = typed.seedance2Duration;
      }
      const seedance2GenerateAudioValue = (typed as { seedance2GenerateAudio?: unknown }).seedance2GenerateAudio;
      if (typeof seedance2GenerateAudioValue === 'boolean') {
        normalizedOptions.seedance2GenerateAudio = seedance2GenerateAudioValue;
      }

      falOptions = Object.keys(normalizedOptions).length > 0 ? normalizedOptions : undefined;
    }

    const volcengineOptionsRaw = raw.volcengineOptions;
    let volcengineOptions: GenerationInputs['volcengineOptions'] | undefined;
    if (volcengineOptionsRaw && typeof volcengineOptionsRaw === 'object') {
      const typed = volcengineOptionsRaw as GenerationInputs['volcengineOptions'];
      const normalizedOptions: GenerationInputs['volcengineOptions'] = {};
      if (isSeedance2Variant((typed as { seedance2Variant?: unknown }).seedance2Variant)) {
        normalizedOptions.seedance2Variant = typed.seedance2Variant;
      }
      if (isSeedance2AspectRatioSelectionValue((typed as { seedance2AspectRatio?: unknown }).seedance2AspectRatio)) {
        normalizedOptions.seedance2AspectRatio = typed.seedance2AspectRatio;
      }
      if (isSeedance2ResolutionSelectionValue((typed as { seedance2Resolution?: unknown }).seedance2Resolution)) {
        normalizedOptions.seedance2Resolution = typed.seedance2Resolution;
      }
      if (isSeedance2DurationSelectionValue((typed as { seedance2Duration?: unknown }).seedance2Duration)) {
        normalizedOptions.seedance2Duration = typed.seedance2Duration;
      }
      const seedance2GenerateAudioValue = (typed as { seedance2GenerateAudio?: unknown }).seedance2GenerateAudio;
      if (typeof seedance2GenerateAudioValue === 'boolean') {
        normalizedOptions.seedance2GenerateAudio = seedance2GenerateAudioValue;
      }
      const seedance2CameraFixedValue = (typed as { seedance2CameraFixed?: unknown }).seedance2CameraFixed;
      if (typeof seedance2CameraFixedValue === 'boolean') {
        normalizedOptions.seedance2CameraFixed = seedance2CameraFixedValue;
      }
      volcengineOptions = Object.keys(normalizedOptions).length > 0 ? normalizedOptions : undefined;
    }

    const jimengOptionsRaw = raw.jimengOptions;
    let jimengOptions: GenerationInputs['jimengOptions'] | undefined;
    if (jimengOptionsRaw && typeof jimengOptionsRaw === 'object') {
      const typed = jimengOptionsRaw as GenerationInputs['jimengOptions'];
      const normalizedOptions: GenerationInputs['jimengOptions'] = {};
      if (isSeedance2Variant((typed as { seedance2Variant?: unknown }).seedance2Variant)) {
        normalizedOptions.seedance2Variant = typed.seedance2Variant;
      }
      if (isJimengSeedance2ModelVersion((typed as { seedance2JimengModelVersion?: unknown }).seedance2JimengModelVersion)) {
        normalizedOptions.seedance2JimengModelVersion = typed.seedance2JimengModelVersion;
      }
      if (isSeedance2AspectRatioSelectionValue((typed as { seedance2AspectRatio?: unknown }).seedance2AspectRatio)) {
        normalizedOptions.seedance2AspectRatio = typed.seedance2AspectRatio;
      }
      if (isSeedance2ResolutionSelectionValue((typed as { seedance2Resolution?: unknown }).seedance2Resolution)) {
        normalizedOptions.seedance2Resolution = typed.seedance2Resolution;
      }
      if (isSeedance2DurationSelectionValue((typed as { seedance2Duration?: unknown }).seedance2Duration)) {
        normalizedOptions.seedance2Duration = typed.seedance2Duration;
      }
      const seedance2GenerateAudioValue = (typed as { seedance2GenerateAudio?: unknown }).seedance2GenerateAudio;
      if (typeof seedance2GenerateAudioValue === 'boolean') {
        normalizedOptions.seedance2GenerateAudio = seedance2GenerateAudioValue;
      }
      const seedance2CameraFixedValue = (typed as { seedance2CameraFixed?: unknown }).seedance2CameraFixed;
      if (typeof seedance2CameraFixedValue === 'boolean') {
        normalizedOptions.seedance2CameraFixed = seedance2CameraFixedValue;
      }
      if (normalizedOptions.seedance2AspectRatio === 'adaptive') {
        normalizedOptions.seedance2AspectRatio = '16:9'; // Jimeng reruns cannot submit adaptive.
      }
      if (normalizedOptions.seedance2Resolution === '1080p' && normalizedOptions.seedance2JimengModelVersion !== 'seedance2.0_vip') {
        normalizedOptions.seedance2Resolution = '720p'; // Only VIP reruns can keep 1080p.
      }
      jimengOptions = Object.keys(normalizedOptions).length > 0 ? normalizedOptions : undefined;
    }

    return {
      kind,
      prompt,
      provider,
      ...(modelId ? { modelId } : {}),
      ...(modelLabel ? { modelLabel } : {}),
      ...(modelMode ? { modelMode } : {}),
      ...(primaryImageId ? { primaryImageId } : {}),
      ...(originalSourceImageId ? { originalSourceImageId } : {}),
      ...(referenceImageIds && referenceImageIds.length > 0 ? { referenceImageIds } : {}),
      ...(editAppMode ? { editAppMode } : {}),
      ...(editTool ? { editTool } : {}),
      ...(editPaths ? { editPaths } : {}),
      ...(referenceVideoIds && referenceVideoIds.length > 0 ? { referenceVideoIds } : {}),
      ...(referenceAudioIds && referenceAudioIds.length > 0 ? { referenceAudioIds } : {}),
      ...(elementImageIds && elementImageIds.length > 0 ? { elementImageIds } : {}),
      ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
      ...(sourceVideoId ? { sourceVideoId } : {}),
      ...(sourceAudioId ? { sourceAudioId } : {}),
      ...(url ? { url } : {}),
      ...(falOptions ? { falOptions } : {}),
      ...(volcengineOptions ? { volcengineOptions } : {}),
      ...(jimengOptions ? { jimengOptions } : {}),
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
  const source = rawSource === 'generated' || rawSource === 'imported' || rawSource === 'snapshot' || rawSource === 'derived'
    ? rawSource
    : 'snapshot';
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
