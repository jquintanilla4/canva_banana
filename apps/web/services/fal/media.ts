import { fal } from '@fal-ai/client'; // Fal SDK client.
import { Tool, type Path, type ImageDimensions } from '../../types'; // Canvas types.
import { ensureFalClientConfigured } from './client'; // Fal config helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import type { FalPhaseOptions } from './types'; // Phase callback options.

const REFERENCE_UPLOAD_CONCURRENCY = 3; // Keep browser uploads from saturating the connection.

export interface FalUploadOptions extends FalPhaseOptions {
  label?: string; // Human-readable upload label.
}

const uploadBlobToFal = async (blob: Blob, options: FalUploadOptions = {}): Promise<string> => { // Upload one blob with phase logs.
  ensureFalClientConfigured();
  const label = options.label ?? 'Fal media'; // Fallback label for debug logs.
  const startedAt = Date.now();
  emitFalPhase(options, 'fal-storage', {
    phase: 'uploading',
    message: `Uploading ${label}...`,
  });
  logFalEvent('outbound', 'fal-storage', 'Upload started', {
    jobId: options.jobId,
    label,
    bytes: blob.size,
    type: blob.type || undefined,
  });
  try {
    const url = await fal.storage.upload(blob);
    const durationMs = Date.now() - startedAt;
    logFalEvent('inbound', 'fal-storage', 'Upload finished', {
      jobId: options.jobId,
      label,
      bytes: blob.size,
      durationMs,
    });
    return url;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logFalEvent('error', 'fal-storage', 'Upload failed', {
      jobId: options.jobId,
      label,
      bytes: blob.size,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError('uploading', error);
  }
};

const imageToCanvas = (image: HTMLImageElement): HTMLCanvasElement => { // Rasterize image into canvas.
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create canvas context');
  }
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string = 'image/png'): Promise<Blob> => { // Convert canvas to blob.
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to Blob.'));
        return;
      }
      resolve(blob);
    }, mimeType);
  });
};

const uploadCanvasToFal = async (canvas: HTMLCanvasElement, options?: FalUploadOptions): Promise<string> => { // Upload canvas via Fal storage.
  const blob = await canvasToBlob(canvas);
  return uploadBlobToFal(blob, { ...options, label: options?.label ?? 'image' });
};

const createTransparentPlaceholderUrl = async (options?: FalUploadOptions): Promise<string> => { // Create placeholder for missing references.
  const canvas = document.createElement('canvas');
  const size = 512; // Kling O1 requires >=300px dimensions.
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create placeholder image.');
  }
  ctx.clearRect(0, 0, size, size);
  return uploadCanvasToFal(canvas, { ...options, label: options?.label ?? 'placeholder image' });
};

const uploadImageElementToFal = async (image: HTMLImageElement, options?: FalUploadOptions): Promise<string> => { // Upload HTMLImageElement.
  const canvas = imageToCanvas(image);
  return uploadCanvasToFal(canvas, { ...options, label: options?.label ?? 'image' });
};

export const uploadVideoToFal = async (videoFile: File, options?: FalUploadOptions): Promise<string> => { // Upload a video file.
  return uploadBlobToFal(videoFile, { ...options, label: options?.label ?? 'video' });
};

const buildAnnotationCanvas = (baseImage: HTMLImageElement, paths: Path[], dimensions: ImageDimensions) => { // Render annotations.
  const canvas = document.createElement('canvas');
  const width = dimensions.width || baseImage.naturalWidth || baseImage.width || 1;
  const height = dimensions.height || baseImage.naturalHeight || baseImage.height || 1;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create annotation canvas context');
  }

  const baseWidth = baseImage.naturalWidth || baseImage.width || width;
  const baseHeight = baseImage.naturalHeight || baseImage.height || height;
  ctx.drawImage(baseImage, 0, 0, baseWidth, baseHeight);

  paths.forEach(path => {
    if (path.points.length === 0) return;

    ctx.lineWidth = path.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (path.tool === Tool.ERASE) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = path.color;
    }

    ctx.beginPath();
    path.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  });

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => { // Run async work with a small concurrency cap.
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));
  return results;
};

const collectReferenceUploadUrls = async (
  referenceImages: HTMLImageElement[] = [],
  options?: FalUploadOptions,
) => { // Upload reference images with capped concurrency.
  return mapWithConcurrency(referenceImages, REFERENCE_UPLOAD_CONCURRENCY, (img, index) => (
    uploadImageElementToFal(img, { ...options, label: `reference image ${index + 1}` })
  ));
};

export {
  imageToCanvas,
  canvasToBlob,
  uploadCanvasToFal,
  createTransparentPlaceholderUrl,
  uploadImageElementToFal,
  buildAnnotationCanvas,
  collectReferenceUploadUrls,
};
