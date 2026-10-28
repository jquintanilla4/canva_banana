import type { GenerateVideoOptions } from './types';
import { collectReferenceUploadUrls, REFERENCE_UPLOAD_CONCURRENCY, uploadVideoToFal } from './media';
import { mapWithConcurrency } from '../../utils/mapWithConcurrency';
import { normalizeSeedanceReferencePromptMentions } from '../../utils/seedancePromptMentions';
import { ensureRealSnapshotFile } from '../snapshotService';
import { resolveKlingV4RunSettings, type KlingV4RunSettings } from '../klingV4RunSettings';
import {
  KLING_V4_EDIT_VIDEO_MODEL_ID,
  KLING_V4_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V4_REFERENCE_IMAGE_LIMIT,
  KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID,
  KLING_V4_REFERENCE_TOTAL_LIMIT,
  KLING_V4_REFERENCE_VIDEO_LIMIT,
  KLING_V4_TEXT_TO_VIDEO_MODEL_ID,
  type KlingV4Endpoint,
} from '../klingV4Config';

type SubscribeForVideoUrl = (
  modelId: string,
  input: Record<string, unknown>,
  options: Pick<GenerateVideoOptions, 'onQueueUpdate' | 'onPhaseUpdate' | 'jobId' | 'abortSignal'>,
) => Promise<{ videoUrl: string; requestId?: string }>;

export const serializeKlingV4Input = (settings: KlingV4RunSettings, endpoint: KlingV4Endpoint) => ({
  resolution: settings.resolution,
  ...(settings.duration === 'source' && endpoint === KLING_V4_EDIT_VIDEO_MODEL_ID
    ? {} : { duration: settings.duration === 'source' ? 5 : Number(settings.duration) }),
  ...(endpoint === KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID ? { aspect_ratio: settings.aspectRatio }
    : endpoint === KLING_V4_TEXT_TO_VIDEO_MODEL_ID
      ? { aspect_ratio: settings.aspectRatio === 'auto' ? '16:9' : settings.aspectRatio } : {}),
});

const prependStartingImage = (image: HTMLImageElement | null, references: HTMLImageElement[]): HTMLImageElement[] =>
  image ? [image, ...references.filter(reference => reference !== image && (!image.src || reference.src !== image.src))] : references;

export const generateKlingV4Video = async (
  prompt: string,
  image: HTMLImageElement | null,
  options: GenerateVideoOptions,
  subscribeForVideoUrl: SubscribeForVideoUrl,
): Promise<{ videoUrl: string; requestId?: string }> => {
  options.abortSignal?.throwIfAborted();
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) throw new Error('Kling 4 requires a prompt.');
  const settings = resolveKlingV4RunSettings({
    modelId: options.modelId,
    variant: options.klingV4Variant,
    resolution: options.klingV4Resolution,
    aspectRatio: options.klingV4AspectRatio,
    duration: options.klingV4Duration,
  });
  const referenceImages = options.referenceImages ?? [];
  const referenceVideos = options.referenceVideos ?? [];
  const usesReferences = referenceImages.length > 0 || referenceVideos.length > 0;
  const images = settings.variant === 'edit' || usesReferences ? prependStartingImage(image, referenceImages) : [];

  if (options.referenceAudios?.length || options.sourceAudioUrl) throw new Error('Kling 4 does not support audio references.');
  if (options.elementImages?.length) throw new Error('Kling 4 does not support element image inputs. Use reference images instead.');
  if (settings.variant === 'edit') {
    if (!options.sourceVideoUrl?.trim()) throw new Error('Kling 4 Edit requires a source video.');
    if (referenceVideos.length) throw new Error('Kling 4 Edit supports image references only, not reference videos.');
    if (options.tailImage) throw new Error('Kling 4 Edit does not support an end frame.');
  } else {
    if (options.sourceVideoUrl) throw new Error('Kling 4 Generate does not accept a source video. Use Edit or video references.');
    if (options.tailImage && usesReferences) throw new Error('Kling 4 cannot combine an end frame with references.');
    if (options.tailImage && !image) throw new Error('Kling 4 requires a starting image when using an end frame.');
  }
  if (images.length > KLING_V4_REFERENCE_IMAGE_LIMIT) throw new Error(`Kling 4 supports up to ${KLING_V4_REFERENCE_IMAGE_LIMIT} reference images.`);
  if (referenceVideos.length > KLING_V4_REFERENCE_VIDEO_LIMIT) throw new Error(`Kling 4 supports up to ${KLING_V4_REFERENCE_VIDEO_LIMIT} reference videos.`);
  if (images.length + referenceVideos.length > KLING_V4_REFERENCE_TOTAL_LIMIT) throw new Error(`Kling 4 supports up to ${KLING_V4_REFERENCE_TOTAL_LIMIT} references total.`);

  const endpoint = settings.variant === 'edit' ? KLING_V4_EDIT_VIDEO_MODEL_ID
    : usesReferences ? KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID
      : image ? KLING_V4_IMAGE_TO_VIDEO_MODEL_ID : KLING_V4_TEXT_TO_VIDEO_MODEL_ID;
  const input: Record<string, unknown> = {
    prompt: normalizeSeedanceReferencePromptMentions(trimmedPrompt),
    ...serializeKlingV4Input(settings, endpoint),
  };
  if (settings.variant === 'edit') input.video_url = options.sourceVideoUrl;
  if (images.length) input.image_urls = await collectReferenceUploadUrls(images, options);
  if (referenceVideos.length) {
    input.video_urls = await mapWithConcurrency(referenceVideos, REFERENCE_UPLOAD_CONCURRENCY, async (file, index) => {
      options.abortSignal?.throwIfAborted();
      const realFile = await ensureRealSnapshotFile(file); // Restored snapshots may expose lazy, disk-backed File objects.
      options.abortSignal?.throwIfAborted();
      return uploadVideoToFal(realFile, { ...options, label: `Kling 4 reference video ${index + 1}` });
    });
  }
  if (endpoint === KLING_V4_IMAGE_TO_VIDEO_MODEL_ID && image) {
    const frames = options.tailImage ? [image, options.tailImage] : [image];
    const [startImageUrl, endImageUrl] = await collectReferenceUploadUrls(frames, options);
    input.start_image_url = startImageUrl;
    if (endImageUrl) input.end_image_url = endImageUrl;
  }
  options.abortSignal?.throwIfAborted();
  return subscribeForVideoUrl(endpoint, input, options);
};
