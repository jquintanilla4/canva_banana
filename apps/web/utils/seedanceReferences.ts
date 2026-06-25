import type { CanvasImage } from '../types';

export const SEEDANCE_REFERENCE_IMAGE_LIMIT = 9; // Seedance 2 docs allow up to 9 image refs.
export const SEEDANCE_REFERENCE_VIDEO_LIMIT = 3; // Seedance 2 docs allow up to 3 video refs.
export const SEEDANCE_REFERENCE_AUDIO_LIMIT = 3; // Seedance 2 docs allow up to 3 audio refs.
export const SEEDANCE_REFERENCE_TOTAL_FILE_LIMIT = 12; // Fal Seedance 2 caps files across all reference modalities.
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
  orderedReferenceIds?: string[];
};

type SeedanceReferenceIds = {
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
};

const dedupeIds = (ids: string[]): string[] => Array.from(new Set(ids)); // Keeps labels and payload order stable.

const orderSeedanceReferenceIds = (
  effectiveReferenceIds: string[],
  orderedReferenceIds: string[],
): string[] => {
  const effectiveReferenceIdSet = new Set(effectiveReferenceIds); // Fast membership keeps order rebuilds cheap.
  const preservedIds = orderedReferenceIds.filter(id => effectiveReferenceIdSet.has(id)); // Keep the user's original pick order first.
  const preservedIdSet = new Set(preservedIds); // Track preserved ids so new ones append once.
  const appendedIds = effectiveReferenceIds.filter(id => !preservedIdSet.has(id)); // New picks join at the end.
  return [...preservedIds, ...appendedIds];
};

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
  orderedReferenceIds = [],
}: BuildEffectiveSeedanceReferenceIdsArgs): SeedanceReferenceIds => {
  if (!enabled) {
    return {
      referenceImageIds,
      referenceVideoIds,
      referenceAudioIds,
    };
  }

  const canvasItemById = new Map(images.map(image => [image.id, image])); // Lookup by id avoids repeated linear scans.
  const effectiveReferenceIds = orderSeedanceReferenceIds(dedupeIds([
    ...selectedImageIds,
    ...referenceImageIds,
    ...referenceVideoIds,
    ...referenceAudioIds,
  ]), orderedReferenceIds);
  const nextReferenceImageIds: string[] = [];
  const nextReferenceVideoIds: string[] = [];
  const nextReferenceAudioIds: string[] = [];

  effectiveReferenceIds.forEach(id => {
    const canvasItem = canvasItemById.get(id);
    if (!canvasItem) {
      return;
    }
    if (canvasItem.mediaType === 'image') {
      nextReferenceImageIds.push(id);
      return;
    }
    if (canvasItem.mediaType === 'video') {
      nextReferenceVideoIds.push(id);
      return;
    }
    if (canvasItem.mediaType === 'audio') {
      nextReferenceAudioIds.push(id);
    }
  });

  return {
    referenceImageIds: nextReferenceImageIds, // Image labels now follow the actual pick order across selection styles.
    referenceVideoIds: nextReferenceVideoIds, // Video labels follow the same stable ordering rule.
    referenceAudioIds: nextReferenceAudioIds, // Audio labels stay aligned with user pick order too.
  };
};
