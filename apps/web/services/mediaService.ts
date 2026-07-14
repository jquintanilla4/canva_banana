import { CanvasMediaType, CanvasImage } from '../types';
import { getImageBounds, getImageRotation } from '../utils/canvasGeometry';

// Utilities for loading media into elements and rasterizing canvas items for API compatibility.
export const isVideoFileType = (fileType: string): boolean =>
  typeof fileType === 'string' && /video\//.test(fileType);

export const isAudioFileType = (fileType: string): boolean =>
  typeof fileType === 'string' && /audio\//.test(fileType);

export const getMediaTypeFromFileType = (fileType: string): CanvasMediaType =>
  isVideoFileType(fileType) ? 'video' : isAudioFileType(fileType) ? 'audio' : 'image';

const VIDEO_OBJECT_URL_KEY = '__videoObjectUrl' as const;
type VideoWithObjectUrl = HTMLVideoElement & { [key in typeof VIDEO_OBJECT_URL_KEY]?: string };
const pendingVideoMetadataLoads = new WeakMap<HTMLVideoElement, Promise<void>>(); // Share one metadata request per video.

export const getVideoObjectUrl = (element: HTMLVideoElement): string | undefined =>
  (element as VideoWithObjectUrl)[VIDEO_OBJECT_URL_KEY];

export const revokeVideoObjectUrl = (element: HTMLVideoElement): void => {
  const url = getVideoObjectUrl(element);
  if (!url) {
    return;
  }
  URL.revokeObjectURL(url);
  delete (element as VideoWithObjectUrl)[VIDEO_OBJECT_URL_KEY];
};

export const createLazyVideoFromUrl = (
  objectUrl: string,
  naturalWidth: number,
  naturalHeight: number,
): HTMLVideoElement => {
  const video = document.createElement('video');
  (video as VideoWithObjectUrl)[VIDEO_OBJECT_URL_KEY] = objectUrl;
  video.crossOrigin = 'anonymous'; // Snapshot URLs are cross-origin to the desktop renderer.
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'none'; // Defer every video stream until the user starts playback.
  video.width = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 1; // Preserve intrinsic width before metadata loads.
  video.height = Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : 1; // Preserve intrinsic height before metadata loads.
  video.src = objectUrl;
  return video;
};

export const ensureVideoMetadataLoaded = (video: HTMLVideoElement): Promise<void> => {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve(); // Existing metadata needs no extra protocol request.
  }
  const existingLoad = pendingVideoMetadataLoads.get(video);
  if (existingLoad) {
    return existingLoad; // Concurrent duration consumers await the same stream.
  }

  const previousPreload = video.preload;
  const metadataLoad = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.preload = previousPreload; // Preserve the caller's long-term loading policy.
    };
    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Failed to load video metadata.'));
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.preload = 'metadata'; // Fetch only metadata for a selected legacy snapshot video.
    try {
      if (video.paused) {
        video.load(); // A dormant video needs an explicit metadata request.
      }
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
  const trackedLoad = metadataLoad.finally(() => pendingVideoMetadataLoads.delete(video));
  pendingVideoMetadataLoads.set(video, trackedLoad);
  return trackedLoad;
};

export const getNaturalSize = (element: HTMLImageElement | HTMLVideoElement) => {
  if (element instanceof HTMLVideoElement) {
    const naturalWidth = element.videoWidth || element.width || 1;
    const naturalHeight = element.videoHeight || element.height || 1;
    return { naturalWidth, naturalHeight };
  }

  const naturalWidth = element.naturalWidth || element.width || 1;
  const naturalHeight = element.naturalHeight || element.height || 1;
  return { naturalWidth, naturalHeight };
};

export const loadMediaFromBlob = (
  blob: Blob,
  mediaType: CanvasMediaType = getMediaTypeFromFileType(blob.type),
): Promise<HTMLImageElement | HTMLVideoElement> => {
  const objectUrl = URL.createObjectURL(blob);
  const revokeOnLoad = mediaType !== 'video';
  return loadMediaFromUrl(objectUrl, mediaType, revokeOnLoad).catch(error => {
    if (!revokeOnLoad) {
      URL.revokeObjectURL(objectUrl); // loadMediaFromUrl only revokes when revokeOnLoad is set.
    }
    throw error;
  });
};

export const loadMediaFromUrl = (
  objectUrl: string,
  mediaType: CanvasMediaType,
  revokeOnLoad = false,
  videoPreload: HTMLMediaElement['preload'] = 'auto',
): Promise<HTMLImageElement | HTMLVideoElement> => {
  return new Promise((resolve, reject) => {
    if (mediaType === 'video') {
      const video = document.createElement('video');
      (video as VideoWithObjectUrl)[VIDEO_OBJECT_URL_KEY] = objectUrl;
      video.crossOrigin = 'anonymous'; // Desktop snapshot protocol URLs are cross-origin; without this, drawing taints the canvas.
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = videoPreload;
      const clearLoadHandlers = () => {
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.onerror = null;
      }; // Release event closures after the one-shot load completes.
      const resolveVideo = () => {
        clearLoadHandlers();
        resolve(video);
      };
      video.onerror = (err) => {
        clearLoadHandlers();
        if (revokeOnLoad) {
          URL.revokeObjectURL(objectUrl);
        }
        reject(err ?? new Error('Failed to load video.'));
      };
      if (videoPreload === 'metadata') {
        video.onloadedmetadata = resolveVideo; // Dimensions are ready without fetching a video frame from a large snapshot.
      } else {
        video.onloadeddata = resolveVideo; // Normal playback callers still wait until the first frame is ready.
      }
      video.src = objectUrl;
      return;
    }

    const cleanup = () => {
      if (revokeOnLoad) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Desktop snapshot protocol URLs are cross-origin; without this, drawing taints the canvas.
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('Failed to load image.'));
    };
    img.src = objectUrl;
  });
};

export const loadMediaFromDataUrl = (
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

export const loadImageFromBlob = (blob: Blob) =>
  loadMediaFromBlob(blob, 'image') as Promise<HTMLImageElement>;

export const loadImageFromDataUrl = (dataUrl: string) =>
  loadMediaFromDataUrl(dataUrl, 'image') as Promise<HTMLImageElement>;

export const dataUrlToFile = async (dataUrl: string, fileName: string, fileType: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = fileType || blob.type || 'application/octet-stream';
  return new File([blob], fileName, { type });
};

export const fileToDataUrl = (file: File): Promise<string> => {
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

export const rasterizeImages = (imagesToCompose: CanvasImage[]): Promise<{
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
      return reject(new Error('No images to rasterize.'));
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
      return reject(new Error('Could not create canvas context for rasterization.'));
    }

    imagesToCompose.forEach(img => {
      const rotation = getImageRotation(img);
      const centerX = img.x + img.width / 2;
      const centerY = img.y + img.height / 2;
      // Draw each image in its own rotated context so composite respects transforms.
      ctx.save();
      ctx.translate(centerX - minX, centerY - minY);
      ctx.rotate(rotation);
      ctx.drawImage(img.element, -img.width / 2, -img.height / 2, img.width, img.height);
      ctx.restore();
    });

    const newImg = new Image();
    newImg.onload = async () => {
      try {
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
