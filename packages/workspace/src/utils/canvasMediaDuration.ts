import type { CanvasImage } from '../types';
import { ensureVideoMetadataLoaded } from '../services/mediaService';

const asFiniteDuration = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null; // Reject unknown and live-stream durations.

export const getCanvasMediaDurationSeconds = (canvasItem: CanvasImage): number | null => {
  if (canvasItem.mediaType === 'video') {
    return asFiniteDuration(canvasItem.videoDuration)
      ?? asFiniteDuration((canvasItem.element as HTMLVideoElement).duration); // Prefer persisted metadata for lazy videos.
  }
  if (canvasItem.mediaType === 'audio') {
    return asFiniteDuration(canvasItem.audioDuration ?? canvasItem.audioElement?.duration);
  }
  return null; // Still images have no media duration.
};

export const resolveCanvasMediaDurationSeconds = async (canvasItem: CanvasImage): Promise<number | null> => {
  const knownDuration = getCanvasMediaDurationSeconds(canvasItem);
  if (knownDuration !== null || canvasItem.mediaType !== 'video') {
    return knownDuration;
  }

  const video = canvasItem.element as HTMLVideoElement;
  await ensureVideoMetadataLoaded(video); // Legacy snapshots fetch metadata only when duration is required.
  return asFiniteDuration(video.duration);
};

export const resolveOptionalCanvasMediaDurationSeconds = async (canvasItem: CanvasImage): Promise<number | null> => {
  try {
    return await resolveCanvasMediaDurationSeconds(canvasItem);
  } catch {
    return null; // Optional warnings and context must not block otherwise valid media workflows.
  }
};
