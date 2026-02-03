import { fal } from '@fal-ai/client'; // Fal SDK client.
import { Tool, type Path, type ImageDimensions } from '../../types'; // Canvas types.
import { ensureFalClientConfigured } from './client'; // Fal config helper.

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

const uploadCanvasToFal = async (canvas: HTMLCanvasElement): Promise<string> => { // Upload canvas via Fal storage.
  const blob = await canvasToBlob(canvas);
  return fal.storage.upload(blob);
};

const createTransparentPlaceholderUrl = async (): Promise<string> => { // Create placeholder for missing references.
  const canvas = document.createElement('canvas');
  const size = 512; // Kling O1 requires >=300px dimensions.
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create placeholder image.');
  }
  ctx.clearRect(0, 0, size, size);
  return uploadCanvasToFal(canvas);
};

const uploadImageElementToFal = async (image: HTMLImageElement): Promise<string> => { // Upload HTMLImageElement.
  const canvas = imageToCanvas(image);
  return uploadCanvasToFal(canvas);
};

export const uploadVideoToFal = async (videoFile: File): Promise<string> => { // Upload a video file.
  ensureFalClientConfigured();
  return fal.storage.upload(videoFile);
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

const collectReferenceUploadUrls = async (referenceImages: HTMLImageElement[] = []) => { // Upload reference images.
  return Promise.all(referenceImages.map(img => uploadImageElementToFal(img)));
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
