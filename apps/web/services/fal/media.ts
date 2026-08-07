import { fal } from '@fal-ai/client'; // Fal SDK client.
import { Tool, type Path, type ImageDimensions } from '../../types'; // Canvas types.
import { ensureFalClientConfigured } from './client'; // Fal config helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import type { FalPhaseOptions } from './types'; // Phase callback options.
import { mapWithConcurrency } from '../../utils/mapWithConcurrency';

export const REFERENCE_UPLOAD_CONCURRENCY = 3; // Keep browser uploads from saturating the connection.
const COMPRESSED_IMAGE_MIME_TYPES = ['image/webp', 'image/jpeg'] as const;
const MIN_COMPRESSED_IMAGE_QUALITY = 0.02;
const MAX_COMPRESSED_IMAGE_QUALITY = 0.92;
const COMPRESSED_IMAGE_QUALITY_SEARCH_STEPS = 6;

export interface FalUploadOptions extends FalPhaseOptions {
  label?: string; // Human-readable upload label.
  maxBytes?: number; // Optional endpoint-specific upload cap.
  maxBytesError?: string; // User-facing message when the cap is exceeded.
}

const uploadBlobToFal = async (blob: Blob, options: FalUploadOptions = {}): Promise<string> => { // Upload one blob with phase logs.
  ensureFalClientConfigured();
  if (options.maxBytes !== undefined && blob.size > options.maxBytes) {
    throw new Error(options.maxBytesError ?? `${options.label ?? 'Fal media'} is too large.`);
  }
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

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string = 'image/png', quality?: number): Promise<Blob> => { // Convert canvas to blob.
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to Blob.'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
};

const canvasToBlobWithinMaxBytes = async (canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> => {
  const pngBlob = await canvasToBlob(canvas);
  if (pngBlob.size <= maxBytes) {
    return pngBlob;
  }

  for (const mimeType of COMPRESSED_IMAGE_MIME_TYPES) {
    const highestQualityBlob = await canvasToBlob(canvas, mimeType, MAX_COMPRESSED_IMAGE_QUALITY);
    if (highestQualityBlob.type === mimeType && highestQualityBlob.size <= maxBytes) {
      return highestQualityBlob;
    }
    const lowestQualityBlob = await canvasToBlob(canvas, mimeType, MIN_COMPRESSED_IMAGE_QUALITY);
    if (lowestQualityBlob.type !== mimeType || lowestQualityBlob.size > maxBytes) {
      continue; // Try the next browser-supported compressed format.
    }

    let bestBlob = lowestQualityBlob;
    let lowerQuality = MIN_COMPRESSED_IMAGE_QUALITY;
    let upperQuality = MAX_COMPRESSED_IMAGE_QUALITY;
    for (let step = 0; step < COMPRESSED_IMAGE_QUALITY_SEARCH_STEPS; step += 1) {
      const candidateQuality = (lowerQuality + upperQuality) / 2;
      const candidateBlob = await canvasToBlob(canvas, mimeType, candidateQuality);
      if (candidateBlob.type !== mimeType) {
        break;
      }
      if (candidateBlob.size <= maxBytes) {
        bestBlob = candidateBlob;
        lowerQuality = candidateQuality;
      } else {
        upperQuality = candidateQuality;
      }
    }
    return bestBlob; // Keep the highest bounded quality found for the first supported format.
  }

  return pngBlob; // The upload guard reports the configured size error when compression cannot fit.
};

const uploadCanvasToFal = async (canvas: HTMLCanvasElement, options?: FalUploadOptions): Promise<string> => { // Upload canvas via Fal storage.
  const blob = options?.maxBytes === undefined
    ? await canvasToBlob(canvas)
    : await canvasToBlobWithinMaxBytes(canvas, options.maxBytes);
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
