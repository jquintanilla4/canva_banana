import type { CanvasImage } from '../types';
import {
  getSnapshotMediaDownloadUrl,
  ensureRealSnapshotFile,
  withSnapshotMediaLeases,
  type SnapshotMediaBlob,
} from './snapshotService';
import {
  clickDownloadLink,
  createCanvasMediaArchiveDestination,
  createTempStreamFactories,
  getRenderedCanvasMediaSource,
  stageCanvasMedia,
  type StagedMedia,
} from './canvasMediaArchiveIO';

export { CanvasMediaDownloadCancelledError } from './canvasMediaArchiveIO';

export type CanvasMediaDownloadProgress = {
  phase: 'preparing' | 'archiving' | 'saving';
  completedItems: number;
  totalItems: number;
};

export type CanvasMediaDownloadSkippedItem = {
  id: string;
  fileName: string;
  message: string;
};

export type CanvasMediaDownloadResult = {
  downloadedCount: number;
  skipped: CanvasMediaDownloadSkippedItem[];
};

type DownloadProgressCallback = (progress: CanvasMediaDownloadProgress) => void;

export class CanvasMediaDownloadError extends Error {
  readonly code: 'source-unavailable' | 'archive-empty';

  constructor(message: string, code: 'source-unavailable' | 'archive-empty' = 'source-unavailable') {
    super(message);
    this.name = 'CanvasMediaDownloadError';
    this.code = code;
  }
}

const MAX_ARCHIVE_FILE_NAME_BYTES = 255; // Keep each ZIP entry extractable on common filesystems.
const MAX_ARCHIVE_EXTENSION_BYTES = 64;
const INVALID_FILE_NAME_CHARACTERS = /[\p{Cc}<>:"/\\|?*]/gu;
const WINDOWS_RESERVED_FILE_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu; // Windows reserves these basenames even when they have extensions.
const COMPRESSED_MEDIA_EXTENSIONS = new Set([
  'aac', 'avif', 'flac', 'gif', 'heic', 'jpeg', 'jpg', 'm4a', 'm4v', 'mkv', 'mov', 'mp3', 'mp4',
  'ogg', 'opus', 'png', 'webm', 'webp', 'wmv',
]);
const COMPRESSED_MEDIA_TYPES = new Set([
  'audio/aac', 'audio/flac', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/opus', 'audio/webm',
  'image/avif', 'image/gif', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-ms-wmv',
]);

const getDownloadName = (image: CanvasImage): string => {
  if (image.file?.name) return image.file.name;
  if (image.mediaType === 'video') return 'video.mp4';
  if (image.mediaType === 'audio') return 'audio.webm';
  return 'download.png';
}; // Preserve the original media filename whenever the canvas still has it.

const revokeObjectUrlAfterDesktopDownload = (objectUrl: string): boolean => {
  const subscribe = window.canvaBananaDesktop?.fileMenu?.onMediaDownloadFinished;
  if (!subscribe) return false;
  let unsubscribe = (): void => {};
  unsubscribe = subscribe((payload) => {
    if (payload.url !== objectUrl) return;
    unsubscribe();
    URL.revokeObjectURL(objectUrl);
  });
  return true;
}; // The macOS save dialog may stay open long after the anchor click returns.

const truncateUtf8 = (value: string, maxBytes: number): string => {
  const encoder = new TextEncoder();
  let result = '';
  let byteLength = 0;
  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;
    if (byteLength + characterBytes > maxBytes) break;
    result += character;
    byteLength += characterBytes;
  }
  return result;
};

const limitArchiveFileNameBytes = (fileName: string, suffix = ''): string => {
  const extensionIndex = fileName.lastIndexOf('.');
  const rawExtension = extensionIndex > 0 ? fileName.slice(extensionIndex) : '';
  const extension = new TextEncoder().encode(rawExtension).byteLength <= MAX_ARCHIVE_EXTENSION_BYTES ? rawExtension : '';
  const stem = extension ? fileName.slice(0, extensionIndex) : fileName;
  const reservedBytes = new TextEncoder().encode(`${suffix}${extension}`).byteLength;
  return `${truncateUtf8(stem, Math.max(0, MAX_ARCHIVE_FILE_NAME_BYTES - reservedBytes))}${suffix}${extension}`;
};

export const sanitizeCanvasMediaFileName = (value: string, fallback: string): string => {
  const normalize = (candidate: string): string => {
    const leafName = candidate.split(/[\\/]/).pop()?.replace(INVALID_FILE_NAME_CHARACTERS, '_').trim() ?? '';
    const safeName = leafName.replace(/[. ]+$/g, '');
    if (!safeName || safeName === '.' || safeName === '..') return '';
    const stem = safeName.split('.', 1)[0] ?? '';
    return WINDOWS_RESERVED_FILE_STEM.test(stem) ? `_${safeName}` : safeName;
  };
  return limitArchiveFileNameBytes(normalize(value) || normalize(fallback) || 'download');
};

const reserveUniqueFileName = (fileName: string, usedNames: Set<string>): string => {
  let candidate = fileName;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = limitArchiveFileNameBytes(fileName, ` (${suffix})`);
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
};

export const createCanvasMediaArchiveName = (date = new Date()): string => (
  `canvas-media-${date.toISOString().replace(/[:.]/g, '-')}.zip`
);

const isAlreadyCompressedMedia = (fileName: string, image: CanvasImage): boolean => {
  if (image.mediaType === 'video') return true; // Encoded video containers do not benefit from another DEFLATE pass.
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (COMPRESSED_MEDIA_EXTENSIONS.has(extension)) return true;
  return COMPRESSED_MEDIA_TYPES.has(image.file?.type.toLowerCase() ?? '');
};

export const downloadCanvasMedia = async (image: CanvasImage): Promise<void> => {
  const fileName = getDownloadName(image);
  const snapshotDownloadUrl = image.file
    ? getSnapshotMediaDownloadUrl(image.file, fileName)
    : undefined;
  if (snapshotDownloadUrl) {
    const nativeDownload = window.canvaBananaDesktop?.fileMenu?.downloadSnapshotMedia;
    if (nativeDownload) {
      const result = await nativeDownload({ url: snapshotDownloadUrl });
      if (result.started !== true) throw new CanvasMediaDownloadError('Could not start the snapshot media download.');
      return;
    }
    clickDownloadLink(snapshotDownloadUrl, fileName);
    return;
  }

  let objectUrl: string | null = null;
  if (image.file) {
    try {
      const file = await ensureRealSnapshotFile(image.file);
      objectUrl = URL.createObjectURL(file);
    } catch {
      objectUrl = null;
    }
  }
  const href = objectUrl || getRenderedCanvasMediaSource(image);
  if (!href) throw new CanvasMediaDownloadError('No downloadable source found for this item.');

  const waitsForDesktopDownload = objectUrl ? revokeObjectUrlAfterDesktopDownload(objectUrl) : false;
  clickDownloadLink(href, fileName);
  if (objectUrl && !waitsForDesktopDownload) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}; // Lazy snapshot URLs stream directly; other canvas media uses a real Blob when available.

export const downloadCanvasMediaSelection = async (
  images: readonly CanvasImage[],
  onProgress?: DownloadProgressCallback,
): Promise<CanvasMediaDownloadResult> => {
  if (images.length === 0) throw new CanvasMediaDownloadError('Select media to download.');
  if (images.length === 1) {
    onProgress?.({ phase: 'preparing', completedItems: 0, totalItems: 1 });
    await downloadCanvasMedia(images[0]);
    onProgress?.({ phase: 'saving', completedItems: 1, totalItems: 1 });
    return { downloadedCount: 1, skipped: [] };
  }

  const totalItems = images.length;
  const archiveName = createCanvasMediaArchiveName();
  const zipModulePromise = import('@zip.js/zip.js'); // ZIP code loads only after a bulk-download gesture.
  const lazyMedia = images.flatMap(image => (
    image.file && !(image.file instanceof Blob) ? [image.file as unknown as SnapshotMediaBlob] : []
  ));
  /*
   * Lease setup is intentionally all-or-nothing. Active lazy media shares the retained
   * document source, which closes only when the document is replaced. Read failures
   * after a successful lease are still skipped per item below.
   */
  return withSnapshotMediaLeases(lazyMedia, async () => {
    onProgress?.({ phase: 'preparing', completedItems: 0, totalItems });
    const destination = await createCanvasMediaArchiveDestination(archiveName, zipModulePromise);
    try {
      const zipModule = await zipModulePromise;
      const tempStreams = createTempStreamFactories(zipModule);
      const zipWriter = new zipModule.ZipWriter(destination.writer, {
        zip64: true,
      });
      const skipped: CanvasMediaDownloadSkippedItem[] = [];
      const usedNames = new Set<string>();
      let downloadedCount = 0;

      for (const image of images) {
        const fallbackName = getDownloadName(image);
        const defaultName = image.mediaType === 'video' ? 'video.mp4' : image.mediaType === 'audio' ? 'audio.webm' : 'download.png';
        const baseFileName = sanitizeCanvasMediaFileName(fallbackName, defaultName);
        let staged: StagedMedia;
        try {
          staged = await stageCanvasMedia(image, tempStreams.preferred, tempStreams.fallback);
        } catch (error) {
          skipped.push({
            id: image.id,
            fileName: baseFileName,
            message: error instanceof Error ? error.message : 'The media could not be read.',
          });
          onProgress?.({ phase: 'archiving', completedItems: downloadedCount + skipped.length, totalItems });
          continue;
        }

        const fileName = reserveUniqueFileName(baseFileName, usedNames);
        try {
          await zipWriter.add(fileName, staged.readable, {
            level: isAlreadyCompressedMedia(fileName, image) ? 0 : 6,
            lastModDate: image.file?.lastModified ? new Date(image.file.lastModified) : undefined,
          });
          downloadedCount += 1;
        } finally {
          await staged.dispose();
          onProgress?.({ phase: 'archiving', completedItems: downloadedCount + skipped.length, totalItems });
        }
      }

      if (downloadedCount === 0) {
        const failureSummary = skipped.slice(0, 2).map(item => `${item.fileName}: ${item.message}`).join('; ');
        throw new CanvasMediaDownloadError(
          failureSummary ? `None of the selected media could be downloaded. ${failureSummary}` : 'None of the selected media could be downloaded.',
          'archive-empty',
        );
      }

      onProgress?.({ phase: 'saving', completedItems: totalItems, totalItems });
      const zipOutput = await zipWriter.close(undefined, { zip64: true });
      await destination.finish(zipOutput);
      return { downloadedCount, skipped };
    } catch (error) {
      await destination.abort().catch(() => {});
      throw error;
    }
  });
};
