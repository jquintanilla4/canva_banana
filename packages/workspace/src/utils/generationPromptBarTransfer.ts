import { JIMENG_MULTIFRAME_VIDEO_MODEL_ID, isUnavailableLegacyTransferModelId, normalizeFalModelId } from '../services/modelConfig';
import type { ApiProviderId, CanvasImage, CanvasMediaType, GenerationInputs } from '../types';
import { resolveGenerationTransferModelId } from './generationTransferSettings';

const TRANSFER_PROVIDER_LABELS: Readonly<Record<ApiProviderId, string>> = { google: 'Google', fal: 'FAL' };

/** Short reason the saved generation cannot be loaded into the prompt bar, or null when it can. */
export const getGenerationTransferBlockReason = (
  generation: GenerationInputs | undefined,
  providerAvailability: Readonly<Record<ApiProviderId, boolean>>,
): string | null => {
  if (!generation) {
    return 'No saved generation data';
  }
  const requestedApiProvider: ApiProviderId = generation.provider === 'google' ? 'google' : 'fal';
  if (!providerAvailability[requestedApiProvider]) {
    return `${TRANSFER_PROVIDER_LABELS[requestedApiProvider]} is not configured`;
  }
  if (generation.provider === 'google') {
    return null; // Google generations carry no Fal model to restore.
  }
  if (isUnavailableLegacyTransferModelId(generation.modelId)) {
    return 'Saved model is no longer available';
  }
  return normalizeFalModelId(resolveGenerationTransferModelId(generation))
    ? null
    : 'Saved model is no longer available'; // Retired and unknown ids cannot be represented in the prompt bar.
};

export interface RestoredGenerationInputSelection {
  selectedImageIds: string[];
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  seedanceReferenceOrderIds: string[];
  elementImageIds: string[];
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  sourceAudioId: string | null;
  missingInputCount: number;
}

export const resolveGenerationInputSelection = (
  generation: GenerationInputs,
  images: CanvasImage[],
): RestoredGenerationInputSelection => {
  const mediaById = new Map(images.map(image => [image.id, image])); // Resolve every saved role without rescanning the canvas.
  const missingInputIds = new Set<string>(); // Count an unavailable asset once even if metadata repeats it.

  const resolveMediaId = (id: string | null | undefined): string | null => {
    if (!id) {
      return null;
    }
    if (!mediaById.has(id)) {
      missingInputIds.add(id);
      return null;
    }
    return id;
  }; // Primary metadata can point to image, video, or audio canvas media.

  const resolveId = (id: string | null | undefined, mediaType: CanvasMediaType): string | null => {
    const resolvedId = resolveMediaId(id);
    if (!resolvedId) {
      return null;
    }
    if (mediaById.get(resolvedId)?.mediaType !== mediaType) {
      missingInputIds.add(resolvedId);
      return null;
    }
    return resolvedId;
  };

  const resolveIds = (ids: string[] | undefined, mediaType: CanvasMediaType): string[] => {
    const resolvedIds = ids?.map(id => resolveId(id, mediaType)).filter((id): id is string => Boolean(id)) ?? [];
    return Array.from(new Set(resolvedIds)); // Preserve saved order while removing duplicate roles.
  };

  const primaryMediaId = resolveMediaId(generation.primaryImageId); // The legacy field name also stores Grok video-edit sources.
  const referenceImageIds = resolveIds(generation.referenceImageIds, 'image');
  const referenceVideoIds = resolveIds(generation.referenceVideoIds, 'video');
  const referenceAudioIds = resolveIds(generation.referenceAudioIds, 'audio');
  const elementImageIds = resolveIds(generation.elementImageIds, 'image');
  const videoLastFrameImageId = resolveId(generation.videoLastFrameImageId, 'image');
  const sourceVideoId = resolveId(generation.sourceVideoId, 'video');
  const sourceAudioId = resolveId(generation.sourceAudioId, 'audio');
  const isJimengMultiframe = generation.provider === 'jimeng' && generation.modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
  const selectedImageIds = Array.from(new Set((isJimengMultiframe
    ? [primaryMediaId, ...referenceImageIds]
    : [primaryMediaId, sourceVideoId, sourceAudioId]
  ).filter((id): id is string => Boolean(id)))); // Multi-frame consumes ordered selections; other models retain their visible source roles.
  const restoredReferenceImageIds = isJimengMultiframe ? [] : referenceImageIds; // Multi-frame images are inputs, not tagged references.

  return {
    selectedImageIds,
    referenceImageIds: restoredReferenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds: [...restoredReferenceImageIds, ...referenceVideoIds, ...referenceAudioIds], // Metadata preserves per-type order only.
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    sourceAudioId,
    missingInputCount: missingInputIds.size,
  };
};
