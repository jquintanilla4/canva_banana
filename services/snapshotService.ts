import type {
  ApiProviderId,
  AppMode,
  CanvasImage,
  CanvasImageMetadata,
  CanvasMediaType,
  CanvasNote,
  GenerationInputs,
  Path,
  Point,
} from '../types';
import { Tool } from '../types';
import {
  isApiProvider,
  isFalAspectRatioSelectionValue,
  isFalImageSizeSelectionValue,
  isFalModelMode,
  isFalResolutionSelectionValue,
  isInfinitalkAccelerationSelectionValue,
  isInfinitalkResolutionSelectionValue,
  isInfinitalkSeedSelectionValue,
  isSora2ProAspectRatioSelectionValue,
  isSora2ProDurationSelectionValue,
  isSora2ProResolutionSelectionValue,
  isGenerationKind,
} from './modelConfig';
import {
  dataUrlToFile,
  getMediaTypeFromFileType,
  getNaturalSize,
  loadMediaFromBlob,
  loadMediaFromDataUrl,
} from './mediaService';
import { generateWaveformImage, loadAudioFromBlob } from './audioService';

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
        infinitalkResolution?: string;
        infinitalkSeed?: string;
        infinitalkAcceleration?: string;
        sora2ProResolution?: string;
        sora2ProAspectRatio?: string;
        sora2ProDuration?: string;
	      selectedImageIds: string[];
	      selectedNoteIds: string[];
	      referenceImageIds: string[];
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
  infinitalkResolution?: string;
  infinitalkSeed?: string;
  infinitalkAcceleration?: string;
  sora2ProResolution?: string;
  sora2ProAspectRatio?: string;
  sora2ProDuration?: string;
  selectedImageIds: string[];
  selectedNoteIds: string[];
  referenceImageIds: string[];
  elementImageIds?: string[];
  videoLastFrameImageId?: string | null;
};

export type RestoredSnapshotState = {
  images: CanvasImage[];
  notes: CanvasNote[];
  paths: Path[];
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
  meta: SnapshotMetaState;
}): Promise<SnapshotBinary> => {
  const { images, notes, paths, meta } = params;
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
    meta = state.meta as SerializedSnapshotV1['state']['meta'];
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

  return {
    images: restoredImages,
    notes: sanitizedNotes,
    paths: sanitizedPaths,
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
      const negativePrompt = (typed as { negativePrompt?: unknown }).negativePrompt;
      if (typeof negativePrompt === 'string' && negativePrompt.trim().length > 0) {
        normalizedOptions.negativePrompt = negativePrompt.trim();
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

      const sora2ProResolutionValue = (typed as { sora2ProResolution?: unknown }).sora2ProResolution;
      if (isSora2ProResolutionSelectionValue(sora2ProResolutionValue)) {
        normalizedOptions.sora2ProResolution = sora2ProResolutionValue;
      }

      const sora2ProAspectRatioValue = (typed as { sora2ProAspectRatio?: unknown }).sora2ProAspectRatio;
      if (isSora2ProAspectRatioSelectionValue(sora2ProAspectRatioValue)) {
        normalizedOptions.sora2ProAspectRatio = sora2ProAspectRatioValue;
      }

      const sora2ProDurationValue = (typed as { sora2ProDuration?: unknown }).sora2ProDuration;
      if (isSora2ProDurationSelectionValue(sora2ProDurationValue)) {
        normalizedOptions.sora2ProDuration = sora2ProDurationValue;
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
