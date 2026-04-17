import type { CanvasImage } from '../types';

export const SEEDANCE_REFERENCE_IMAGE_LIMIT = 9; // Seedance 2 docs allow up to 9 image refs.
export const SEEDANCE_REFERENCE_VIDEO_LIMIT = 3; // Seedance 2 docs allow up to 3 video refs.
export const SEEDANCE_REFERENCE_AUDIO_LIMIT = 3; // Seedance 2 docs allow up to 3 audio refs.
export const SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS = 2; // Reference videos and audios must be at least 2s.
export const SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS = 15; // Reference videos and audios must be at most 15s.
export const SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS = 15; // All reference videos combined must stay within 15s.
export const SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS = 15; // All reference audios combined must stay within 15s.

type BuildEffectiveSeedanceReferenceIdsArgs = {
  enabled: boolean;
  images: CanvasImage[];
  selectedImageIds: string[];
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
};

type SeedanceReferenceIds = {
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
};

const dedupeIds = (ids: string[]): string[] => Array.from(new Set(ids)); // Keeps labels and payload order stable.

export const getCanvasMediaDurationSeconds = (canvasItem: CanvasImage): number | null => {
  if (canvasItem.mediaType === 'video') {
    const durationSeconds = (canvasItem.element as HTMLVideoElement | undefined)?.duration;
    return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? durationSeconds : null;
  }
  if (canvasItem.mediaType === 'audio') {
    const durationSeconds = canvasItem.audioDuration ?? canvasItem.audioElement?.duration;
    return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? durationSeconds : null;
  }
  return null; // Still images do not have media duration.
};

export const buildEffectiveSeedanceReferenceIds = ({
  enabled,
  images,
  selectedImageIds,
  referenceImageIds,
  referenceVideoIds,
  referenceAudioIds,
}: BuildEffectiveSeedanceReferenceIdsArgs): SeedanceReferenceIds => {
  if (!enabled) {
    return {
      referenceImageIds,
      referenceVideoIds,
      referenceAudioIds,
    };
  }

  const selectedReferenceImageIds: string[] = [];
  const selectedReferenceVideoIds: string[] = [];
  const selectedReferenceAudioIds: string[] = [];

  selectedImageIds.forEach(id => {
    const canvasItem = images.find(image => image.id === id);
    if (!canvasItem) {
      return;
    }
    if (canvasItem.mediaType === 'image') {
      selectedReferenceImageIds.push(id);
      return;
    }
    if (canvasItem.mediaType === 'video') {
      selectedReferenceVideoIds.push(id);
      return;
    }
    if (canvasItem.mediaType === 'audio') {
      selectedReferenceAudioIds.push(id);
    }
  });

  return {
    referenceImageIds: dedupeIds([...referenceImageIds, ...selectedReferenceImageIds]), // Keep explicitly tagged refs stable before transient selection refs.
    referenceVideoIds: dedupeIds([...referenceVideoIds, ...selectedReferenceVideoIds]), // Keep explicitly tagged refs stable before transient selection refs.
    referenceAudioIds: dedupeIds([...referenceAudioIds, ...selectedReferenceAudioIds]), // Keep explicitly tagged refs stable before transient selection refs.
  };
};
