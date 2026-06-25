import type { CanvasImage } from '../types';

type CanvasMediaPlaybackRejectedHandler = (image: CanvasImage, err: unknown) => void;

export const stopCanvasMediaPlayback = (image: CanvasImage): void => {
  if (image.mediaType === 'video' && image.element instanceof HTMLVideoElement) {
    image.element.pause(); // Stop hidden videos from continuing after canvas removal.
    return;
  }

  if (image.mediaType === 'audio' && image.audioElement instanceof HTMLAudioElement) {
    image.audioElement.pause(); // Stop hidden audio items after canvas removal.
  }
};

export const stopCanvasMediaPlaybackByIds = (images: CanvasImage[], imageIds: string[]): void => {
  const targetIds = new Set(imageIds); // Lookup selected media quickly.
  images.forEach(image => {
    if (targetIds.has(image.id)) {
      stopCanvasMediaPlayback(image);
    }
  });
};

export const syncCanvasMediaElementPlayback = (
  image: CanvasImage,
  onPlaybackRejected?: CanvasMediaPlaybackRejectedHandler,
): void => {
  if (image.mediaType === 'video' && image.element instanceof HTMLVideoElement) {
    image.element.loop = true; // Keep restored videos behaving like manually-started canvas videos.
    image.element.playsInline = true; // Avoid fullscreen takeover on mobile browsers.
    if (image.isPlaying && image.element.paused) {
      image.element.muted = true; // Let restored videos autoplay before hover can re-enable sound.
      image.element.play().catch(err => {
        console.error('Failed to play video', err);
        onPlaybackRejected?.(image, err); // Let state match the paused DOM element after autoplay denial.
      }); // Resume DOM playback from saved state.
    } else if (!image.isPlaying && !image.element.paused) {
      image.element.pause(); // Keep paused saved state matched to the DOM node.
    }
    return;
  }

  if (image.mediaType === 'audio' && image.audioElement instanceof HTMLAudioElement) {
    image.audioElement.loop = true; // Keep restored audio behaving like manually-started canvas audio.
    if (image.isPlaying && image.audioElement.paused) {
      image.audioElement.play().catch(err => {
        console.error('Failed to play audio', err);
        onPlaybackRejected?.(image, err); // Let state match the paused DOM element after autoplay denial.
      }); // Resume DOM playback from saved state.
    } else if (!image.isPlaying && !image.audioElement.paused) {
      image.audioElement.pause(); // Keep paused saved state matched to the DOM node.
    }
  }
};

export const markCanvasMediaStoppedByIds = (images: CanvasImage[], imageIds: string[]): CanvasImage[] => {
  const targetIds = new Set(imageIds); // Lookup selected media quickly.
  let changed = false; // Reuse the same array when no playback flag changes.
  const nextImages = images.map(image => {
    const isTargetMedia = targetIds.has(image.id) && (image.mediaType === 'video' || image.mediaType === 'audio'); // Only playable media owns playback state.
    if (!isTargetMedia || !image.isPlaying) {
      return image;
    }
    changed = true;
    return { ...image, isPlaying: false }; // Match saved state to paused DOM media.
  });
  return changed ? nextImages : images;
};
