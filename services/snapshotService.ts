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
  isGenerationProvider,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isInfinitalkAccelerationSelectionValue,
  isInfinitalkResolutionSelectionValue,
  isInfinitalkSeedSelectionValue,
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
  isVeo31AspectRatioSelectionValue,
  isVeo31DurationSelectionValue,
  isVeo31ResolutionSelectionValue,
  isVeo31Variant,
  normalizeKlingO3Variant,
  normalizeVeo31Variant,
  normalizeRecraftRgbColor,
  RECRAFT_V4_PRO_MAX_COLORS,
  isGenerationKind,
  KLING_V3_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from './modelConfig';
import {
  dataUrlToFile,
  getMediaTypeFromFileType,
  getNaturalSize,
  loadMediaFromBlob,
  loadMediaFromDataUrl,
} from './mediaService';
import { generateWaveformImage, loadAudioFromBlob } from './audioService';
import { DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR } from '../utils/canvasColorOptions';

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
  rotation?: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  metadata?: CanvasImage['metadata'];
  mediaType?: CanvasMediaType;
  isPlaying?: boolean;
  hasAudio?: boolean;
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
	      selectedNoteIds: string[];
	      referenceImageIds: string[];
      referenceVideoIds?: string[];
      referenceAudioIds?: string[];
      seedanceReferenceOrderIds?: string[];
      elementImageIds?: string[];
      videoLastFrameImageId?: string | null;
    } | undefined;
  };
};

export type SnapshotBinary = {
  manifest: SnapshotManifestV2;
  images: Array<{ manifest: SnapshotImageManifest; blob: Blob }>;
};

export type SerializedCanvasImageV1 = {
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
  selectedNoteIds: string[];
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
};

export const DEFAULT_NOTE_BACKGROUND = '#1f2937';

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

export const isBinarySnapshotFile = async (file: File): Promise<boolean> => {
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

export const parseBinarySnapshotFile = async (file: File): Promise<SnapshotBinary> => {
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

export const snapshotBinaryToBlob = (binary: SnapshotBinary): Blob => {
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
export const writeSnapshotBinary = async (binary: SnapshotBinary, writable: SnapshotWritable) => {
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

export const buildSnapshotBinaryFromState = async (params: {
  images: CanvasImage[];
  notes: CanvasNote[];
  paths: Path[];
  videoPromptAreas: CanvasVideoPromptArea[];
  videoPromptBars: CanvasVideoPromptBar[];
  meta: SnapshotMetaState;
}): Promise<SnapshotBinary> => {
  const { images, notes, paths, videoPromptAreas, videoPromptBars, meta } = params;
  const imagesWithManifests: SnapshotBinary['images'] = await Promise.all(
    images.map(async (img) => {
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
  file: File,
  options: {
    brushSize: number;
    eraserSize: number;
    brushColor: string;
    defaultNoteBackground?: string;
  },
): Promise<RestoredSnapshotState> => {
  const { brushSize, eraserSize, brushColor, defaultNoteBackground = DEFAULT_NOTE_BACKGROUND } = options;
  const isBinarySnapshot = await isBinarySnapshotFile(file).catch(() => false);

  let restoredImages: CanvasImage[] = [];
  let snapshotNotes: CanvasNote[] = [];
  let snapshotPaths: Path[] = [];
  let snapshotVideoPromptAreas: CanvasVideoPromptArea[] = [];
  let snapshotVideoPromptBars: CanvasVideoPromptBar[] = [];
  let meta: SerializedSnapshotV1['state']['meta'] | undefined;
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
    };
    file: File;
  }): Promise<CanvasImage> => {
    const { img, file: audioFile } = params;
    const width = typeof img.width === 'number' && Number.isFinite(img.width) ? Math.max(1, img.width) : 400;
    const height = typeof img.height === 'number' && Number.isFinite(img.height) ? Math.max(1, img.height) : 80;
    const rotation = typeof img.rotation === 'number' && Number.isFinite(img.rotation) ? img.rotation : 0;
    // Rebuild the audio element from the stored blob.
    const audioElement = await loadAudioFromBlob(audioFile);
    // Regenerate the waveform preview so the canvas can draw the audio item.
    const { dataUrl: waveformImageData, duration: waveformDuration } = await generateWaveformImage(
      audioFile,
      width,
      height,
    );
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
      audioDuration: Number.isFinite(duration) ? duration : undefined,
      currentPlaybackTime: 0,
      metadata: normalizeSnapshotImageMetadata(img.metadata),
    };
  };

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
        // Audio snapshots are stored as blobs but must be rehydrated as waveform images.
        if (mediaType === 'audio') {
          return restoreAudioImage({
            img,
            file: snapshotFile,
          });
        }
        // Non-audio media can be rehydrated directly as an image/video element.
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
    snapshotVideoPromptAreas = Array.isArray(state.videoPromptAreas)
      ? state.videoPromptAreas.map(area => ({ ...area, orderedMediaIds: Array.isArray(area.orderedMediaIds) ? [...area.orderedMediaIds] : [] }))
      : [];
    snapshotVideoPromptBars = Array.isArray(state.videoPromptBars)
      ? state.videoPromptBars.map(bar => ({ ...bar }))
      : [];
    meta = state.meta as SerializedSnapshotV1['state']['meta'];
  } else {
    const raw = await file.text();
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

  const sanitizedNotes: CanvasNote[] = snapshotNotes.map(note => ({
    id: typeof note?.id === 'string' && note.id.length > 0 ? note.id : crypto.randomUUID(),
    x: typeof note?.x === 'number' ? note.x : 0,
    y: typeof note?.y === 'number' ? note.y : 0,
    width: typeof note?.width === 'number' ? note.width : 200,
    height: typeof note?.height === 'number' ? note.height : 120,
    text: typeof note?.text === 'string' ? note.text : '',
    backgroundColor: typeof note?.backgroundColor === 'string' && note.backgroundColor.length > 0
      ? note.backgroundColor
      : defaultNoteBackground,
  }));

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
  const sanitizedVideoPromptBars: CanvasVideoPromptBar[] = snapshotVideoPromptBars.map(bar => ({
    id: typeof bar?.id === 'string' && bar.id.length > 0 ? bar.id : crypto.randomUUID(),
    assignedAreaId: typeof bar?.assignedAreaId === 'string' ? bar.assignedAreaId : null,
    x: typeof bar?.x === 'number' ? bar.x : 0,
    y: typeof bar?.y === 'number' ? bar.y : 0,
    width: typeof bar?.width === 'number' ? bar.width : 920,
    height: typeof bar?.height === 'number' ? bar.height : 190,
    prompt: typeof bar?.prompt === 'string' ? bar.prompt : '',
    negativePrompt: typeof bar?.negativePrompt === 'string' ? bar.negativePrompt : '',
    modelId: typeof bar?.modelId === 'string' && isFalVideoModelId(bar.modelId) ? bar.modelId : SEEDANCE_2_VIDEO_MODEL_ID,
    falOptions: bar?.falOptions && typeof bar.falOptions === 'object' ? { ...bar.falOptions } : undefined,
    klingV3MultiPrompt: typeof bar?.klingV3MultiPrompt === 'string' ? bar.klingV3MultiPrompt : '',
    klingV3Duration: isKlingV3DurationSelectionValue(bar?.klingV3Duration) ? bar.klingV3Duration : '5',
    klingV3GenerateAudio: typeof bar?.klingV3GenerateAudio === 'boolean' ? bar.klingV3GenerateAudio : true,
    klingV3CfgScale: isKlingV3CfgScaleSelectionValue(bar?.klingV3CfgScale) ? bar.klingV3CfgScale : '0.5',
    klingV3MultiPromptEnabled: Boolean(bar?.klingV3MultiPromptEnabled),
    klingV3Shot1Duration: isKlingV3ShotDurationSelectionValue(bar?.klingV3Shot1Duration) ? bar.klingV3Shot1Duration : '5',
    klingV3Shot2Duration: isKlingV3ShotDurationSelectionValue(bar?.klingV3Shot2Duration) ? bar.klingV3Shot2Duration : '5',
    seedance2Variant: bar?.seedance2Variant === 'smart' ? 'smart' : 'reference',
    seedance2AspectRatio: typeof bar?.seedance2AspectRatio === 'string' ? bar.seedance2AspectRatio : '16:9',
    seedance2Resolution: typeof bar?.seedance2Resolution === 'string' ? bar.seedance2Resolution : '720p',
    seedance2Duration: typeof bar?.seedance2Duration === 'string' ? bar.seedance2Duration : '5',
    seedance2GenerateAudio: Boolean(bar?.seedance2GenerateAudio),
    seedance2CameraFixed: Boolean(bar?.seedance2CameraFixed),
  }));

  return {
    images: restoredImages,
    notes: sanitizedNotes,
    paths: sanitizedPaths,
    videoPromptAreas: sanitizedVideoPromptAreas,
    videoPromptBars: sanitizedVideoPromptBars,
    meta,
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
      const normalizeNumberOption = (value: unknown, min: number, max: number) => {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
          return undefined;
        }
        return Math.min(max, Math.max(min, parsed));
      };
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
      ...(referenceVideoIds && referenceVideoIds.length > 0 ? { referenceVideoIds } : {}),
      ...(referenceAudioIds && referenceAudioIds.length > 0 ? { referenceAudioIds } : {}),
      ...(elementImageIds && elementImageIds.length > 0 ? { elementImageIds } : {}),
      ...(videoLastFrameImageId ? { videoLastFrameImageId } : {}),
      ...(sourceVideoId ? { sourceVideoId } : {}),
      ...(sourceAudioId ? { sourceAudioId } : {}),
      ...(url ? { url } : {}),
      ...(falOptions ? { falOptions } : {}),
      ...(volcengineOptions ? { volcengineOptions } : {}),
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
