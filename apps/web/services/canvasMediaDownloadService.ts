import type { CanvasImage } from '../types';
import { ensureRealSnapshotFile, getSnapshotMediaDownloadUrl } from './snapshotService';

export class CanvasMediaDownloadError extends Error {
  readonly code: 'source-unavailable';

  constructor(message: string) {
    super(message);
    this.name = 'CanvasMediaDownloadError';
    this.code = 'source-unavailable';
  }
}

const getDownloadName = (image: CanvasImage): string => {
  if (image.file?.name) return image.file.name;
  if (image.mediaType === 'video') return 'video.mp4';
  if (image.mediaType === 'audio') return 'audio.webm';
  return 'download.png';
}; // Preserve the original media filename whenever the canvas still has it.

const getElementSource = (element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement | undefined): string => {
  if (!element) return '';
  return element instanceof HTMLVideoElement || element instanceof HTMLAudioElement
    ? element.currentSrc || element.src
    : element.src;
}; // Current source wins for media elements whose selected source may differ from src.

const clickDownloadLink = (href: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}; // A DOM-attached anchor preserves browser and Electron download behavior.

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

export const downloadCanvasMedia = async (image: CanvasImage): Promise<void> => {
  const fileName = getDownloadName(image);
  const snapshotDownloadUrl = image.file
    ? getSnapshotMediaDownloadUrl(image.file, fileName)
    : undefined;
  if (snapshotDownloadUrl) {
    const nativeDownload = window.canvaBananaDesktop?.fileMenu?.downloadSnapshotMedia;
    if (nativeDownload) {
      const result = await nativeDownload({ url: snapshotDownloadUrl });
      if (result.started !== true) {
        throw new CanvasMediaDownloadError('Could not start the snapshot media download.');
      }
      return;
    }
    clickDownloadLink(snapshotDownloadUrl, fileName);
    return;
  }

  let objectUrl: string | null = null;
  if (image.file) {
    try {
      objectUrl = URL.createObjectURL(await ensureRealSnapshotFile(image.file));
    } catch {
      objectUrl = null;
    }
  }
  const fallbackElement = image.mediaType === 'audio' ? image.audioElement : image.element;
  const href = objectUrl || getElementSource(fallbackElement);
  if (!href) {
    throw new CanvasMediaDownloadError('No downloadable source found for this item.');
  }

  const waitsForDesktopDownload = objectUrl ? revokeObjectUrlAfterDesktopDownload(objectUrl) : false;
  clickDownloadLink(href, fileName);
  if (objectUrl && !waitsForDesktopDownload) {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}; // Lazy snapshot URLs stream directly; other canvas media uses a real Blob when available.
