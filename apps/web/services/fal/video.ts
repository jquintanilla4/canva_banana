import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalQueueUpdate, GenerateVideoOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import { collectReferenceUploadUrls, REFERENCE_UPLOAD_CONCURRENCY, uploadImageElementToFal, uploadVideoToFal } from './media'; // Media upload helpers.
import { convertReferencePromptMentionsToOrderedLabels, normalizeSeedanceReferencePromptMentions } from '../../utils/seedancePromptMentions';
import { mapWithConcurrency } from '../../utils/mapWithConcurrency';
import { ensureRealSnapshotFile } from '../snapshotService';
import { convertAudioBlobToWav } from '../audioService';
import { readIsoBmffVideoFrameRate } from '../../utils/isoBmffVideoFrameRate';
import { FLUX3_FPS, FLUX3_MAX_KEYFRAMES, getFlux3ModePolicy, normalizeFlux3PromptMentions } from '../../utils/flux3';
import {
  SEEDANCE25_REFERENCE_AUDIO_LIMIT,
  SEEDANCE25_REFERENCE_AUDIO_MAX_BYTES,
  SEEDANCE25_REFERENCE_IMAGE_LIMIT,
  SEEDANCE25_REFERENCE_IMAGE_MAX_BYTES,
  SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT,
  SEEDANCE25_REFERENCE_VIDEO_LIMIT,
  SEEDANCE25_REFERENCE_VIDEO_MAX_BYTES,
  getSeedance25AudioReferenceFileError,
  getSeedance25VideoReferenceFileError,
  isSeedance25AudioReferenceFormatSupported,
} from '../../utils/seedance25References';
import {
  GROK_IMAGINE_VIDEO_EDIT_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MOVE_MODEL_ID,
  INFINITALK_DURATION_TO_NUM_FRAMES,
  isKlingO3DurationSelectionValue,
  isRemovedOneToAllAnimateModelId,
} from '../modelConfig'; // Canonical model IDs.
import {
  INFINITALK_VIDEO_MODEL_ID,
  KLING_V3_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V3_TEXT_TO_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_O3_REFERENCE_TO_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_REFERENCE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_IMAGE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_REFERENCE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_TEXT_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  MINIMAX_H3_IMAGE_TO_VIDEO_MODEL_ID,
  MINIMAX_H3_REFERENCE_TO_VIDEO_MODEL_ID,
  MINIMAX_H3_TEXT_TO_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  FLUX_3_TEXT_TO_VIDEO_MODEL_ID,
  FLUX_3_IMAGE_TO_VIDEO_MODEL_ID,
  FLUX_3_FIRST_LAST_FRAME_VIDEO_MODEL_ID,
  FLUX_3_KEYFRAMES_VIDEO_MODEL_ID,
  FLUX_3_EXTEND_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  VEO_31_EXTEND_VIDEO_MODEL_ID,
  VEO_31_FFLF_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_TEXT_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_REPLACE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
} from './modelIds'; // Fal service model IDs.

const subscribeForVideoUrl = async (
  modelId: string,
  inputPayload: Record<string, unknown>,
  options: Pick<GenerateVideoOptions, 'onQueueUpdate' | 'onPhaseUpdate' | 'jobId'>,
): Promise<{ videoUrl: string; requestId?: string }> => { // Subscribe and return video output.
  let latestRequestId: string | undefined; // Track latest queue request id.

  emitFalPhase(options, modelId, { phase: 'submitting', message: 'Submitting to Fal...' });
  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', {
    input: inputPayload,
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: inputPayload,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        emitFalPhase(options, modelId, {
          phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
          message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
          requestId: resolvedRequestId,
        });
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', modelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
  }

  logFalEvent('inbound', modelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { video?: string | { url?: string } } | undefined;
  const videoEntry = data?.video;
  const videoUrl = typeof videoEntry === 'string'
    ? videoEntry
    : videoEntry && typeof videoEntry.url === 'string'
      ? videoEntry.url
      : null;

  if (!videoUrl) {
    throw new Error('Fal.ai API did not return a video.');
  }

  const requestId = result?.requestId || latestRequestId;
  return { videoUrl, requestId };
};

export const generateImageToVideo = async (
  prompt: string,
  image: HTMLImageElement | null,
  options: GenerateVideoOptions = {},
): Promise<{ videoUrl: string; requestId?: string }> => { // Generate video from image + prompt.
  ensureFalClientConfigured(); // Ensure SDK is configured before requests.

  const isImplicitDefaultModel = !options.modelId; // Missing ids use H3 Standard so default calls remain usable.
  const modelId = options.modelId || MINIMAX_H3_VIDEO_MODEL_ID; // Default to the supported MiniMax family.
  if (isRemovedOneToAllAnimateModelId(modelId)) {
    throw new Error('1-to-All Animate is no longer supported.'); // Reject direct calls before any upload or provider request.
  }

  if (modelId === FLUX_3_VIDEO_MODEL_ID) {
    const fluxReferenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : [];
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) throw new Error('Flux 3 requires a prompt.');
    const variant = options.flux3Variant ?? 'smart';
    const policy = getFlux3ModePolicy(variant);
    const aspectRatio = options.flux3AspectRatio ?? 'auto';
    const resolution = options.flux3Resolution ?? '720p';
    const selectedDuration = options.flux3Duration ?? 'auto';
    const duration = policy.requiresExplicitDuration
      ? selectedDuration === 'auto' ? 5 : Number(selectedDuration)
      : selectedDuration === 'auto' ? 'auto' : Number(selectedDuration);
    const sharedPayload = {
      prompt: normalizeFlux3PromptMentions(trimmedPrompt, variant),
      aspect_ratio: aspectRatio,
      resolution,
      duration,
      generate_audio: options.flux3GenerateAudio ?? true,
      safety_tolerance: 4,
    };

    if (policy.inputKind === 'source-video') {
      if (!options.sourceVideoUrl) throw new Error('Flux 3 Extend requires one source video.');
      return subscribeForVideoUrl(FLUX_3_EXTEND_VIDEO_MODEL_ID, { ...sharedPayload, video_url: options.sourceVideoUrl }, options);
    }

    if (policy.inputKind === 'first-last-images') {
      if (!image || !options.tailImage) throw new Error('Flux 3 First & Last Frame requires exactly two still images.');
      const [startImageUrl, endImageUrl] = await Promise.all([
        uploadImageElementToFal(image, { ...options, label: 'Flux 3 first frame' }),
        uploadImageElementToFal(options.tailImage, { ...options, label: 'Flux 3 last frame' }),
      ]);
      return subscribeForVideoUrl(FLUX_3_FIRST_LAST_FRAME_VIDEO_MODEL_ID, {
        ...sharedPayload,
        start_image_url: startImageUrl,
        end_image_url: endImageUrl,
      }, options);
    }

    if (policy.inputKind === 'keyframe-images') {
      if (fluxReferenceImages.length === 0 || fluxReferenceImages.length > FLUX3_MAX_KEYFRAMES) {
        throw new Error(`Flux 3 Keyframes requires 1-${FLUX3_MAX_KEYFRAMES} still images.`);
      }
      const timestamps = options.flux3KeyframeTimestampsSeconds ?? [];
      if (timestamps.length !== fluxReferenceImages.length) throw new Error('Flux 3 keyframe timing does not match the selected images.');
      const durationSeconds = typeof duration === 'number' ? duration : 5;
      if (timestamps.some(seconds => !Number.isFinite(seconds) || seconds < 0 || seconds > durationSeconds)) {
        throw new Error(`Flux 3 keyframe timestamps must be between 0 and ${durationSeconds} seconds.`);
      }
      const frameIndexes = timestamps.map(seconds => Math.round(seconds * FLUX3_FPS));
      if (new Set(frameIndexes).size !== frameIndexes.length) throw new Error('Flux 3 keyframe timestamps must resolve to unique frames.');
      const imageUrls = await collectReferenceUploadUrls(fluxReferenceImages, options);
      return subscribeForVideoUrl(FLUX_3_KEYFRAMES_VIDEO_MODEL_ID, {
        ...sharedPayload,
        keyframes: imageUrls.map((image_url, index) => ({ image_url, frame_index: frameIndexes[index] })),
      }, options);
    }

    if (image) {
      const imageUrl = await uploadImageElementToFal(image, { ...options, label: 'Flux 3 starting image' });
      return subscribeForVideoUrl(FLUX_3_IMAGE_TO_VIDEO_MODEL_ID, { ...sharedPayload, image_url: imageUrl }, options);
    }
    return subscribeForVideoUrl(FLUX_3_TEXT_TO_VIDEO_MODEL_ID, sharedPayload, options);
  }
  const duration = options.duration; // Optional duration override.
  const isVeo31ImageToVideoModel = modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID; // Veo 3.1 i2v route.
  const isVeo31FflfModel = modelId === VEO_31_FFLF_VIDEO_MODEL_ID; // Veo 3.1 fflf route.
  const isVeo31ExtendModel = modelId === VEO_31_EXTEND_VIDEO_MODEL_ID; // Veo 3.1 extend route.
  const isKlingO3VideoModel = modelId === KLING_O3_REFERENCE_TO_VIDEO_MODEL_ID || modelId === KLING_O3_VIDEO_EDIT_MODEL_ID; // Kling O3 family.
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : []; // Optional references list.
  const elementImages = Array.isArray(options.elementImages) ? options.elementImages : []; // Optional elements list.
  const isKlingO3EditVariant = modelId === KLING_O3_VIDEO_EDIT_MODEL_ID || options.klingO3Variant === 'edit'; // Kling O3 edit endpoint or variant.

  if (isKlingO3VideoModel && isKlingO3EditVariant) { // Kling O3 edit requires video_url + optional images.
    if (!options.sourceVideoUrl) {
      throw new Error('Kling O3 Video Edit requires a source video.');
    }

    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages, options) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img, options)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      reference_image_urls: [url],
    }));

    const totalImageCount = referenceUrls.length + elementsPayload.length;
    if (totalImageCount > 4) { // Max 4 total when using video.
      throw new Error('Kling O3 Video Edit supports up to 4 images total (references + elements).');
    }

    const inputPayload: Record<string, unknown> = {
      prompt,
      video_url: options.sourceVideoUrl,
      ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      keep_audio: typeof options.klingO3KeepAudio === 'boolean'
        ? options.klingO3KeepAudio
        : typeof options.keepAudio === 'boolean'
          ? options.keepAudio
          : true,
    };

    return subscribeForVideoUrl(KLING_O3_VIDEO_EDIT_MODEL_ID, inputPayload, options);
  }

  if (isKlingO3VideoModel) { // Kling O3 reference mode uses a still image plus optional end frame.
    if (!image) {
      throw new Error('Kling O3 Reference requires an image.');
    }

    const imageUrl = await uploadImageElementToFal(image, options);
    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages, options) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img, options)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      reference_image_urls: [url],
    }));

    const totalImageCount = referenceUrls.length + elementsPayload.length;
    if (totalImageCount > 4) { // Max 4 total beyond the primary start image.
      throw new Error('Kling O3 Video Reference supports up to 4 images total (references + elements).');
    }

    const tailImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage, options) : undefined;
    const aspectRatioValue = options.aspectRatio === '9:16' || options.aspectRatio === '1:1' ? options.aspectRatio : '16:9';
    const referenceDuration = options.klingO3Duration ?? (isKlingO3DurationSelectionValue(duration) ? duration : '5');
    const generateAudio = typeof options.klingO3GenerateAudio === 'boolean'
      ? options.klingO3GenerateAudio
      : typeof options.generateAudio === 'boolean'
        ? options.generateAudio
        : false;

    const inputPayload: Record<string, unknown> = {
      prompt,
      start_image_url: imageUrl,
      ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      duration: referenceDuration,
      generate_audio: generateAudio,
      aspect_ratio: aspectRatioValue,
    };

    return subscribeForVideoUrl(KLING_O3_REFERENCE_TO_VIDEO_MODEL_ID, inputPayload, options);
  }

  if (modelId === GROK_IMAGINE_VIDEO_EDIT_MODEL_ID) {
    if (!options.sourceVideoUrl) {
      throw new Error('Grok Imagine Video Edit requires a source video.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Grok Imagine Video Edit requires a prompt.');
    }

    const resolution = options.grokImagineVideoResolution === '480p' || options.grokImagineVideoResolution === '720p'
      ? options.grokImagineVideoResolution
      : undefined;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      video_url: options.sourceVideoUrl,
      ...(resolution ? { resolution } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  if (modelId === GROK_IMAGINE_VIDEO_MODEL_ID) {
    if (!image) {
      throw new Error('Grok Imagine Video requires an image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Grok Imagine Video requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image, options);

    const duration = options.grokImagineVideoDuration
      ? Number(options.grokImagineVideoDuration)
      : 6;
    const clampedDuration = Number.isFinite(duration) ? Math.min(15, Math.max(1, Math.round(duration))) : 6;

    const aspectRatio = options.grokImagineVideoAspectRatio === '16:9'
      || options.grokImagineVideoAspectRatio === '4:3'
      || options.grokImagineVideoAspectRatio === '3:2'
      || options.grokImagineVideoAspectRatio === '1:1'
      || options.grokImagineVideoAspectRatio === '2:3'
      || options.grokImagineVideoAspectRatio === '3:4'
      || options.grokImagineVideoAspectRatio === '9:16'
      ? options.grokImagineVideoAspectRatio
      : 'auto';
    const resolution = options.grokImagineVideoResolution === '480p' || options.grokImagineVideoResolution === '720p'
      ? options.grokImagineVideoResolution
      : '720p';

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      duration: clampedDuration,
      aspect_ratio: aspectRatio,
      resolution,
      image_url: imageUrl,
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  if (isVeo31ExtendModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Veo 3.1 Extend requires a source video.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Veo 3.1 Extend requires a prompt.');
    }

    const aspectRatio = options.veo31AspectRatio === 'auto' || options.veo31AspectRatio === '16:9' || options.veo31AspectRatio === '9:16'
      ? options.veo31AspectRatio
      : undefined;
    const durationValue = options.veo31Duration === '7s' ? options.veo31Duration : undefined;
    const resolutionValue = options.veo31Resolution === '720p' ? options.veo31Resolution : undefined;
    const generateAudio = typeof options.veo31GenerateAudio === 'boolean' ? options.veo31GenerateAudio : undefined;
    const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      video_url: options.sourceVideoUrl,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(durationValue ? { duration: durationValue } : {}),
      ...(resolutionValue ? { resolution: resolutionValue } : {}),
      ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  if (isVeo31ImageToVideoModel || isVeo31FflfModel) {
    if (!image) {
      throw new Error('Veo 3.1 requires an image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Veo 3.1 requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image, options);
    const aspectRatio = options.veo31AspectRatio === 'auto' || options.veo31AspectRatio === '16:9' || options.veo31AspectRatio === '9:16'
      ? options.veo31AspectRatio
      : undefined;
    const durationValue = options.veo31Duration === '4s' || options.veo31Duration === '6s' || options.veo31Duration === '8s'
      ? options.veo31Duration
      : undefined;
    const resolutionValue = options.veo31Resolution === '720p' || options.veo31Resolution === '1080p' || options.veo31Resolution === '4k'
      ? options.veo31Resolution
      : undefined;
    const generateAudio = typeof options.veo31GenerateAudio === 'boolean' ? options.veo31GenerateAudio : undefined;
    const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;

    if (isVeo31FflfModel) {
      const tailImage = options.tailImage;
      if (!tailImage) {
        throw new Error('Veo 3.1 FFLF requires a first and last frame.');
      }
      const lastFrameUrl = await uploadImageElementToFal(tailImage, options);

      const inputPayload: Record<string, unknown> = {
        prompt: trimmedPrompt,
        first_frame_url: imageUrl,
        last_frame_url: lastFrameUrl,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(durationValue ? { duration: durationValue } : {}),
        ...(resolutionValue ? { resolution: resolutionValue } : {}),
        ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      };

      return subscribeForVideoUrl(modelId, inputPayload, options);
    }

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      image_url: imageUrl,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(durationValue ? { duration: durationValue } : {}),
      ...(resolutionValue ? { resolution: resolutionValue } : {}),
      ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  if (modelId === KLING_V3_VIDEO_MODEL_ID) {
    const trimmedPrompt = prompt.trim();
    const useMultiPrompt = options.klingV3MultiPromptEnabled === true;
    const multiPrompt = typeof options.klingV3MultiPrompt === 'string' ? options.klingV3MultiPrompt.trim() : '';
    const duration = options.klingV3Duration === '3' || options.klingV3Duration === '4' || options.klingV3Duration === '5'
      || options.klingV3Duration === '6' || options.klingV3Duration === '7' || options.klingV3Duration === '8'
      || options.klingV3Duration === '9' || options.klingV3Duration === '10' || options.klingV3Duration === '11'
      || options.klingV3Duration === '12' || options.klingV3Duration === '13' || options.klingV3Duration === '14'
      || options.klingV3Duration === '15'
      ? options.klingV3Duration
      : '5';
    const shot1Duration = options.klingV3Shot1Duration === '1' || options.klingV3Shot1Duration === '2'
      || options.klingV3Shot1Duration === '3' || options.klingV3Shot1Duration === '4' || options.klingV3Shot1Duration === '5'
      || options.klingV3Shot1Duration === '6' || options.klingV3Shot1Duration === '7' || options.klingV3Shot1Duration === '8'
      || options.klingV3Shot1Duration === '9' || options.klingV3Shot1Duration === '10' || options.klingV3Shot1Duration === '11'
      || options.klingV3Shot1Duration === '12' || options.klingV3Shot1Duration === '13' || options.klingV3Shot1Duration === '14'
      || options.klingV3Shot1Duration === '15'
      ? options.klingV3Shot1Duration
      : '5';
    const shot2Duration = options.klingV3Shot2Duration === '1' || options.klingV3Shot2Duration === '2'
      || options.klingV3Shot2Duration === '3' || options.klingV3Shot2Duration === '4' || options.klingV3Shot2Duration === '5'
      || options.klingV3Shot2Duration === '6' || options.klingV3Shot2Duration === '7' || options.klingV3Shot2Duration === '8'
      || options.klingV3Shot2Duration === '9' || options.klingV3Shot2Duration === '10' || options.klingV3Shot2Duration === '11'
      || options.klingV3Shot2Duration === '12' || options.klingV3Shot2Duration === '13' || options.klingV3Shot2Duration === '14'
      || options.klingV3Shot2Duration === '15'
      ? options.klingV3Shot2Duration
      : '5';
    const cfgScale = options.klingV3CfgScale === '0' || options.klingV3CfgScale === '0.25'
      || options.klingV3CfgScale === '0.5' || options.klingV3CfgScale === '0.75' || options.klingV3CfgScale === '1'
      ? Number(options.klingV3CfgScale)
      : 0.5;
    const negativePrompt = typeof options.negativePrompt === 'string' && options.negativePrompt.trim()
      ? options.negativePrompt.trim()
      : 'blur, distort, and low quality';
    const sharedPayload: Record<string, unknown> = {
      generate_audio: options.klingV3GenerateAudio ?? true,
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale,
    };

    if (useMultiPrompt) {
      if (!trimmedPrompt || !multiPrompt) {
        throw new Error('Kling 3.0 Pro multi prompt requires both prompts.');
      }
      sharedPayload.multi_prompt = [
        { prompt: trimmedPrompt, duration: shot1Duration },
        { prompt: multiPrompt, duration: shot2Duration },
      ];
      sharedPayload.shot_type = 'customize';
    } else {
      if (!trimmedPrompt) {
        throw new Error('Kling 3.0 Pro requires a prompt.');
      }
      sharedPayload.prompt = trimmedPrompt;
      sharedPayload.duration = duration;
    }

    if (image) {
      const imageUrl = await uploadImageElementToFal(image, options);
      const tailImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage, options) : undefined;
      const inputPayload: Record<string, unknown> = {
        ...sharedPayload,
        start_image_url: imageUrl,
        ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      };

      return subscribeForVideoUrl(KLING_V3_IMAGE_TO_VIDEO_MODEL_ID, inputPayload, options);
    }

    return subscribeForVideoUrl(KLING_V3_TEXT_TO_VIDEO_MODEL_ID, sharedPayload, options);
  }

  const isWan27VideoModel = modelId === WAN_27_VIDEO_MODEL_ID;
  if (isWan27VideoModel) {
    const trimmedPrompt = prompt.trim();
    const wan27Variant = options.wan27VideoVariant === 'reference'
      ? 'reference'
      : options.wan27VideoVariant === 'edit'
        ? 'edit'
        : 'smart';
    const resolution = options.wan27VideoResolution === '720p' || options.wan27VideoResolution === '1080p'
      ? options.wan27VideoResolution
      : '1080p';
    const smartDurationValue = options.wan27VideoDuration === '2' || options.wan27VideoDuration === '3' || options.wan27VideoDuration === '4'
      || options.wan27VideoDuration === '5' || options.wan27VideoDuration === '6' || options.wan27VideoDuration === '7'
      || options.wan27VideoDuration === '8' || options.wan27VideoDuration === '9' || options.wan27VideoDuration === '10'
      || options.wan27VideoDuration === '11' || options.wan27VideoDuration === '12' || options.wan27VideoDuration === '13'
      || options.wan27VideoDuration === '14' || options.wan27VideoDuration === '15'
      ? Number(options.wan27VideoDuration)
      : 5;
    const editDurationValue = options.wan27VideoDuration === '0' || options.wan27VideoDuration === '2' || options.wan27VideoDuration === '3'
      || options.wan27VideoDuration === '4' || options.wan27VideoDuration === '5' || options.wan27VideoDuration === '6'
      || options.wan27VideoDuration === '7' || options.wan27VideoDuration === '8' || options.wan27VideoDuration === '9'
      || options.wan27VideoDuration === '10'
      ? Number(options.wan27VideoDuration)
      : 0;
    const aspectRatio = options.wan27VideoAspectRatio === '16:9' || options.wan27VideoAspectRatio === '9:16'
      || options.wan27VideoAspectRatio === '1:1' || options.wan27VideoAspectRatio === '4:3' || options.wan27VideoAspectRatio === '3:4'
      ? options.wan27VideoAspectRatio
      : '16:9';
    const editAspectRatio = options.wan27VideoAspectRatio === 'source'
      ? undefined
      : aspectRatio;
    const audioSetting = options.wan27VideoAudioSetting === 'origin' ? 'origin' : 'auto';
    const enablePromptExpansion = typeof options.wan27VideoPromptExpansion === 'boolean'
      ? options.wan27VideoPromptExpansion
      : true;
    const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;
    const seed = typeof options.seed === 'number' && Number.isFinite(options.seed)
      ? Math.max(0, Math.min(2147483647, Math.floor(options.seed)))
      : undefined;
    const sharedPayload: Record<string, unknown> = {
      resolution,
      duration: smartDurationValue,
      enable_prompt_expansion: enablePromptExpansion,
      enable_safety_checker: false,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(seed !== undefined ? { seed } : {}),
    };

    if (wan27Variant === 'edit') {
      if (!trimmedPrompt) {
        throw new Error('Wan 2.7 Edit requires a prompt.');
      }
      if (!options.sourceVideoUrl) {
        throw new Error('Wan 2.7 Edit requires a source video.');
      }
      if (referenceImages.length > 1) {
        throw new Error('Wan 2.7 Edit supports one reference image.');
      }
      const referenceImageUrl = referenceImages[0] ? await uploadImageElementToFal(referenceImages[0], options) : undefined;
      const inputPayload: Record<string, unknown> = {
        prompt: trimmedPrompt,
        video_url: options.sourceVideoUrl,
        resolution,
        duration: editDurationValue,
        audio_setting: audioSetting,
        enable_safety_checker: false,
        ...(editAspectRatio ? { aspect_ratio: editAspectRatio } : {}),
        ...(referenceImageUrl ? { reference_image_url: referenceImageUrl } : {}),
        ...(seed !== undefined ? { seed } : {}),
      };

      return subscribeForVideoUrl(WAN_27_EDIT_VIDEO_MODEL_ID, inputPayload, options);
    }

    if (wan27Variant === 'reference') {
      if (!trimmedPrompt) {
        throw new Error('Wan 2.7 Reference requires a prompt.');
      }
      const imageUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages, options) : [];
      const videoUrls = options.referenceVideos?.length
        ? await Promise.all(options.referenceVideos.map(file => uploadVideoToFal(file, options)))
        : [];
      if (imageUrls.length + videoUrls.length === 0) {
        throw new Error('Wan 2.7 Reference requires at least one reference image or video.');
      }
      const referenceDuration = smartDurationValue > 10 ? 10 : smartDurationValue;
      const inputPayload: Record<string, unknown> = {
        prompt: trimmedPrompt,
        resolution,
        duration: referenceDuration,
        aspect_ratio: aspectRatio,
        enable_safety_checker: false,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { reference_video_urls: videoUrls } : {}),
      };

      return subscribeForVideoUrl(WAN_27_REFERENCE_TO_VIDEO_MODEL_ID, inputPayload, options);
    }

    if (image) {
      const imageUrl = await uploadImageElementToFal(image, options);
      const tailImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage, options) : undefined;
      const inputPayload: Record<string, unknown> = {
        ...sharedPayload,
        image_url: imageUrl,
        ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
        ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
        ...(options.sourceAudioUrl ? { audio_url: options.sourceAudioUrl } : {}),
      };

      return subscribeForVideoUrl(WAN_27_IMAGE_TO_VIDEO_MODEL_ID, inputPayload, options);
    }

    if (!trimmedPrompt) {
      throw new Error('Wan 2.7 text-to-video requires a prompt.');
    }

    const inputPayload: Record<string, unknown> = {
      ...sharedPayload,
      prompt: trimmedPrompt,
      aspect_ratio: aspectRatio,
      ...(options.sourceAudioUrl ? { audio_url: options.sourceAudioUrl } : {}),
    };

    return subscribeForVideoUrl(WAN_27_TEXT_TO_VIDEO_MODEL_ID, inputPayload, options);
  }

  const isSeedance15Model = modelId === SEEDANCE_15_VIDEO_MODEL_ID;
  if (isSeedance15Model) {
    if (!image) {
      throw new Error('Seedance 1.5 requires an image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Seedance 1.5 requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image, options);
    const tailImage = options.tailImage;
    const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage, options) : undefined;

    const aspectRatio = options.seedance15AspectRatio ?? '16:9';
    const resolution = options.seedance15Resolution ?? '720p';
    const videoDuration = options.seedance15Duration ?? '5';
    const cameraFixed = options.seedance15CameraFixed ?? false;
    const generateAudio = options.seedance15Audio ?? false;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      resolution,
      duration: videoDuration,
      camera_fixed: cameraFixed,
      generate_audio: generateAudio,
      ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isFalSeedance2Model = modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID;
  if (isFalSeedance2Model) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Seedance 2 (FAL) requires a prompt.');
    }

    const variant = options.seedance2Variant === 'reference' ? 'reference' : 'smart';
    const aspectRatio = options.seedance2AspectRatio === 'adaptive'
      ? 'auto'
      : options.seedance2AspectRatio ?? '16:9'; // Fal uses `auto` where the UI says adaptive.
    const resolution = options.seedance2Resolution ?? '720p';
    const videoDuration = options.seedance2Duration ?? '5';
    const generateAudio = options.seedance2GenerateAudio ?? false;
    const seed = typeof options.seed === 'number' && Number.isFinite(options.seed)
      ? Math.floor(options.seed)
      : undefined;
    const sharedPayload = {
      prompt: trimmedPrompt,
      aspect_ratio: aspectRatio,
      resolution,
      duration: videoDuration,
      generate_audio: generateAudio,
      ...(seed !== undefined ? { seed } : {}),
    };

    if (variant === 'reference') {
      const imageUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages, options) : [];
      const videoUrls = options.referenceVideos?.length
        ? await Promise.all(options.referenceVideos.map(file => uploadVideoToFal(file, options)))
        : [];
      const audioUrls = options.referenceAudios?.length
        ? await Promise.all(options.referenceAudios.map(file => uploadVideoToFal(file, options)))
        : [];
      const totalReferenceFiles = imageUrls.length + videoUrls.length + audioUrls.length;

      if (totalReferenceFiles === 0) {
        throw new Error('Seedance 2 (FAL) Reference requires at least one reference asset.');
      }
      if (totalReferenceFiles > 12) {
        throw new Error('Seedance 2 (FAL) Reference supports up to 12 total reference files.');
      }
      if (audioUrls.length > 0 && imageUrls.length + videoUrls.length === 0) {
        throw new Error('Seedance 2 (FAL) audio references require at least one image or video reference.');
      }

      const inputPayload: Record<string, unknown> = {
        ...sharedPayload,
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { video_urls: videoUrls } : {}),
        ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
      };

      return subscribeForVideoUrl(FAL_SEEDANCE_2_REFERENCE_TO_VIDEO_MODEL_ID, inputPayload, options);
    }

    if (image) {
      const imageUrl = await uploadImageElementToFal(image, options);
      const tailImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage, options) : undefined;
      const inputPayload: Record<string, unknown> = {
        ...sharedPayload,
        image_url: imageUrl,
        ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      };

      return subscribeForVideoUrl(FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID, inputPayload, options);
    }

    return subscribeForVideoUrl(FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID, sharedPayload, options);
  }

  if (modelId === FAL_SEEDANCE_25_VIDEO_MODEL_ID) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Seedance 2.5 (FAL) requires a prompt.');
    }

    const variant = options.seedance25Variant === 'smart' ? 'smart' : 'reference';
    const aspectRatio = options.seedance25AspectRatio === 'adaptive' ? 'auto' : options.seedance25AspectRatio ?? 'auto';
    const sharedPayload = {
      prompt: trimmedPrompt,
      resolution: options.seedance25Resolution ?? '720p',
      duration: options.seedance25Duration ?? 'auto',
      generate_audio: options.seedance25GenerateAudio ?? true,
    };

    if (variant === 'smart' && ((options.referenceVideos?.length ?? 0) > 0 || (options.referenceAudios?.length ?? 0) > 0)) {
      throw new Error('Seedance 2.5 (FAL) Smart accepts text and still-image inputs only.');
    }

    if (variant === 'reference') {
      const referenceVideos = options.referenceVideos ?? [];
      const referenceAudios = options.referenceAudios ?? [];
      const totalReferenceFiles = referenceImages.length + referenceVideos.length + referenceAudios.length;
      if (totalReferenceFiles === 0) {
        throw new Error('Seedance 2.5 (FAL) Reference requires at least one reference asset.');
      }
      if (referenceImages.length > SEEDANCE25_REFERENCE_IMAGE_LIMIT || referenceVideos.length > SEEDANCE25_REFERENCE_VIDEO_LIMIT || referenceAudios.length > SEEDANCE25_REFERENCE_AUDIO_LIMIT) {
        throw new Error(`Seedance 2.5 (FAL) Reference supports up to ${SEEDANCE25_REFERENCE_IMAGE_LIMIT} images, ${SEEDANCE25_REFERENCE_VIDEO_LIMIT} videos, and ${SEEDANCE25_REFERENCE_AUDIO_LIMIT} audio clips.`);
      }
      if (totalReferenceFiles > SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT) {
        throw new Error(`Seedance 2.5 (FAL) Reference supports up to ${SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT} total reference files.`);
      } // Backstop only: the modality caps above sum to the total, so this fires last, matching useGeneration's order.
      if (referenceAudios.length > 0 && referenceImages.length + referenceVideos.length === 0) {
        throw new Error('Seedance 2.5 (FAL) audio references require at least one image or video reference.');
      }
      const videoFileErrors = await Promise.all(referenceVideos.map(async file => (
        getSeedance25VideoReferenceFileError(file, undefined, undefined, await readIsoBmffVideoFrameRate(file))
      )));
      const videoFileError = videoFileErrors.find(Boolean);
      if (videoFileError) {
        throw new Error(videoFileError);
      }
      const audioFileError = referenceAudios
        .filter(isSeedance25AudioReferenceFormatSupported) // Provider-ready files can be validated before the upload pool.
        .map(getSeedance25AudioReferenceFileError)
        .find(Boolean);
      if (audioFileError) {
        throw new Error(audioFileError);
      }

      const uploads = [
        ...referenceImages.map((referenceImage, index) => ({
          kind: 'image' as const,
          upload: () => uploadImageElementToFal(referenceImage, {
            ...options,
            label: `Seedance 2.5 reference image ${index + 1}`,
            maxBytes: SEEDANCE25_REFERENCE_IMAGE_MAX_BYTES,
            maxBytesError: 'Seedance 2.5 reference images must be 30 MB or smaller.',
          }),
        })),
        ...referenceVideos.map((referenceVideo, index) => ({
          kind: 'video' as const,
          upload: async () => uploadVideoToFal(
            await ensureRealSnapshotFile(referenceVideo),
            {
              ...options,
              label: `Seedance 2.5 reference video ${index + 1}`,
              maxBytes: SEEDANCE25_REFERENCE_VIDEO_MAX_BYTES,
              maxBytesError: 'Seedance 2.5 reference videos must be 200 MB or smaller.',
            },
          ),
        })),
        ...referenceAudios.map((referenceAudio, index) => ({
          kind: 'audio' as const,
          upload: async () => {
            const realFile = await ensureRealSnapshotFile(referenceAudio);
            const uploadFile = isSeedance25AudioReferenceFormatSupported(realFile)
              ? realFile
              : new File([await convertAudioBlobToWav(realFile)], `seedance25-fal-reference-audio-${index + 1}.wav`, { type: 'audio/wav' });
            const uploadFileError = getSeedance25AudioReferenceFileError(uploadFile);
            if (uploadFileError) {
              throw new Error(uploadFileError);
            }
            return uploadVideoToFal(uploadFile, {
              ...options,
              label: `Seedance 2.5 reference audio ${index + 1}`,
              maxBytes: SEEDANCE25_REFERENCE_AUDIO_MAX_BYTES,
              maxBytesError: 'Seedance 2.5 reference audio files must be 15 MB or smaller.',
            });
          },
        })),
      ];
      const uploadedReferences = await mapWithConcurrency(uploads, REFERENCE_UPLOAD_CONCURRENCY, async upload => ({
        kind: upload.kind,
        url: await upload.upload(),
      })); // One pool preserves support for 50 refs without saturating the browser.
      const imageUrls = uploadedReferences.filter(upload => upload.kind === 'image').map(upload => upload.url);
      const videoUrls = uploadedReferences.filter(upload => upload.kind === 'video').map(upload => upload.url);
      const audioUrls = uploadedReferences.filter(upload => upload.kind === 'audio').map(upload => upload.url);

      return subscribeForVideoUrl(FAL_SEEDANCE_25_REFERENCE_TO_VIDEO_MODEL_ID, {
        ...sharedPayload,
        prompt: normalizeSeedanceReferencePromptMentions(trimmedPrompt),
        aspect_ratio: aspectRatio,
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { video_urls: videoUrls } : {}),
        ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
      }, options);
    }

    if (image) {
      const smartImageUploadOptions = {
        ...options,
        maxBytes: SEEDANCE25_REFERENCE_IMAGE_MAX_BYTES,
        maxBytesError: 'Seedance 2.5 input images must be 30 MB or smaller.',
      };
      const imageUrl = await uploadImageElementToFal(image, { ...smartImageUploadOptions, label: 'Seedance 2.5 starting image' });
      const tailImageUrl = options.tailImage
        ? await uploadImageElementToFal(options.tailImage, { ...smartImageUploadOptions, label: 'Seedance 2.5 ending image' })
        : undefined;
      return subscribeForVideoUrl(FAL_SEEDANCE_25_IMAGE_TO_VIDEO_MODEL_ID, {
        ...sharedPayload,
        aspect_ratio: 'auto', // Fal requires image-to-video requests to derive the ratio from the starting image.
        image_url: imageUrl,
        ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      }, options);
    }

    return subscribeForVideoUrl(FAL_SEEDANCE_25_TEXT_TO_VIDEO_MODEL_ID, {
      ...sharedPayload,
      aspect_ratio: aspectRatio,
    }, options);
  }

  if (modelId === MINIMAX_H3_VIDEO_MODEL_ID) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('MiniMax H3 requires a prompt.');
    }

    const variant = options.miniMaxH3Variant === 'standard' || isImplicitDefaultModel ? 'standard' : 'reference';
    const duration = Number(options.miniMaxH3Duration ?? '5');
    const normalizedDuration = Number.isInteger(duration) && duration >= 5 && duration <= 15 ? duration : 5;
    const selectedAspectRatio = options.miniMaxH3AspectRatio ?? (variant === 'reference' ? 'adaptive' : '16:9');
    const aspectRatio = variant === 'standard' && selectedAspectRatio === 'adaptive' ? '16:9' : selectedAspectRatio;
    const sharedPayload = {
      prompt: variant === 'reference' ? convertReferencePromptMentionsToOrderedLabels(trimmedPrompt) : trimmedPrompt,
      duration: normalizedDuration,
      resolution: '2K',
    };

    if (variant === 'reference') {
      const imageCount = referenceImages.length;
      const videoCount = options.referenceVideos?.length ?? 0;
      const audioCount = options.referenceAudios?.length ?? 0;
      const totalReferenceFiles = imageCount + videoCount + audioCount;

      if (totalReferenceFiles === 0) {
        throw new Error('MiniMax H3 Reference requires at least one reference asset.');
      }
      if (imageCount > 9 || videoCount > 3 || audioCount > 3 || totalReferenceFiles > 12) {
        throw new Error('MiniMax H3 Reference supports up to 9 images, 3 videos, 3 audio clips, and 12 files total.');
      }
      if (audioCount > 0 && imageCount + videoCount === 0) {
        throw new Error('MiniMax H3 audio references require at least one image or video reference.');
      }

      const imageUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages, options) : [];
      const videoUrls = options.referenceVideos?.length
        ? await Promise.all(options.referenceVideos.map(file => uploadVideoToFal(file, options)))
        : [];
      const audioUrls = options.referenceAudios?.length
        ? await Promise.all(options.referenceAudios.map(file => uploadVideoToFal(file, options)))
        : [];

      return subscribeForVideoUrl(MINIMAX_H3_REFERENCE_TO_VIDEO_MODEL_ID, {
        ...sharedPayload,
        aspect_ratio: aspectRatio,
        ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { reference_video_urls: videoUrls } : {}),
        ...(audioUrls.length ? { reference_audio_urls: audioUrls } : {}),
      }, options);
    }

    if (image) {
      const imageUrl = await uploadImageElementToFal(image, options);
      const endImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage, options) : undefined;
      return subscribeForVideoUrl(MINIMAX_H3_IMAGE_TO_VIDEO_MODEL_ID, {
        ...sharedPayload,
        image_url: imageUrl,
        ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
      }, options);
    }

    return subscribeForVideoUrl(MINIMAX_H3_TEXT_TO_VIDEO_MODEL_ID, {
      ...sharedPayload,
      aspect_ratio: aspectRatio,
    }, options);
  }

  const isInfinitalkModel = modelId === INFINITALK_VIDEO_MODEL_ID;
  if (isInfinitalkModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Infinitalk requires a source video.');
    }
    if (!options.sourceAudioUrl) {
      throw new Error('Infinitalk requires a source audio.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Infinitalk requires a prompt.');
    }

    const resolution = options.resolution === '480p' || options.resolution === '720p'
      ? options.resolution
      : undefined;
    const acceleration = options.acceleration === 'none' || options.acceleration === 'regular' || options.acceleration === 'high'
      ? options.acceleration
      : undefined;
    const seed = typeof options.seed === 'number' && Number.isFinite(options.seed)
      ? Math.floor(options.seed)
      : undefined;
    const numFrames = options.infinitalkDuration
      ? INFINITALK_DURATION_TO_NUM_FRAMES[options.infinitalkDuration]
      : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      audio_url: options.sourceAudioUrl,
      prompt: trimmedPrompt,
      ...(resolution ? { resolution } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(acceleration ? { acceleration } : {}),
      ...(numFrames !== undefined ? { num_frames: numFrames } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isScailModel = modelId === SCAIL_VIDEO_MODEL_ID;
  if (isScailModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Scail requires a source video.');
    }
    if (!image) {
      throw new Error('Scail requires a reference image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Scail requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image, options);

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      image_url: imageUrl,
      video_url: options.sourceVideoUrl,
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isLipsyncModel = modelId === SYNC_LIPSYNC_MODEL_ID; // Lip Sync requires video_url + audio_url.
  if (isLipsyncModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Lip Sync requires a source video.');
    }
    if (!options.sourceAudioUrl) {
      throw new Error('Lip Sync requires a source audio.');
    }

    const syncMode = options.lipsyncSyncMode || 'cut_off'; // Match Sync v3 default.

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      audio_url: options.sourceAudioUrl,
      sync_mode: syncMode, // Fal v3 field name.
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isHeygenV3LipsyncModel = modelId === HEYGEN_V3_LIPSYNC_MODEL_ID; // HeyGen requires video_url + audio_url.
  if (isHeygenV3LipsyncModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('HeyGen V3 Lipsync requires a source video.');
    }
    if (!options.sourceAudioUrl) {
      throw new Error('HeyGen V3 Lipsync requires a source audio.');
    }

    const startTime = typeof options.heygenStartTime === 'number' && Number.isFinite(options.heygenStartTime)
      ? Math.max(0, Math.round(options.heygenStartTime * 1000) / 1000)
      : undefined;
    const endTime = typeof options.heygenEndTime === 'number' && Number.isFinite(options.heygenEndTime)
      ? Math.max(0, Math.round(options.heygenEndTime * 1000) / 1000)
      : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      audio_url: options.sourceAudioUrl,
      enable_caption: options.heygenEnableCaption ?? false,
      enable_dynamic_duration: options.heygenEnableDynamicDuration ?? true,
      disable_music_track: options.heygenDisableMusicTrack ?? false,
      enable_speech_enhancement: options.heygenEnableSpeechEnhancement ?? false,
      ...(startTime !== undefined ? { start_time: startTime } : {}),
      ...(endTime !== undefined && (startTime === undefined || endTime > startTime) ? { end_time: endTime } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isWanAnimateEndpoint = modelId === WAN_ANIMATE_REPLACE_MODEL_ID || modelId === WAN_ANIMATE_MOVE_MODEL_ID;
  if (isWanAnimateEndpoint) {
    if (!options.sourceVideoUrl) {
      throw new Error('Wan Animate requires a source video.');
    }
    if (!image) {
      throw new Error('Wan Animate requires a still image.');
    }

    const imageUrl = await uploadImageElementToFal(image, options);

    const numInferenceStepsRaw = typeof options.numInferenceSteps === 'number'
      ? options.numInferenceSteps
      : Number(options.numInferenceSteps);
    const numInferenceSteps = Number.isFinite(numInferenceStepsRaw)
      ? Math.min(40, Math.max(2, Math.round(numInferenceStepsRaw)))
      : undefined;

    const resolution = options.resolution === '480p' || options.resolution === '580p' || options.resolution === '720p'
      ? options.resolution
      : undefined;

    const shiftRaw = typeof options.shift === 'number' ? options.shift : Number(options.shift);
    const shift = Number.isFinite(shiftRaw)
      ? Math.min(10, Math.max(1, Math.round(shiftRaw * 10) / 10))
      : undefined;

    const videoQuality = options.videoQuality === 'maximum' ? 'maximum' : options.videoQuality === 'high' ? 'high' : undefined;
    const useTurbo = typeof options.useTurbo === 'boolean' ? options.useTurbo : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      image_url: imageUrl,
      enable_safety_checker: false,
      ...(numInferenceSteps !== undefined ? { num_inference_steps: numInferenceSteps } : {}),
      ...(resolution ? { resolution } : {}),
      ...(shift !== undefined ? { shift } : {}),
      ...(videoQuality ? { video_quality: videoQuality } : {}),
      ...(useTurbo !== undefined ? { use_turbo: useTurbo } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isWanVisionEnhancerModel = modelId === WAN_VISION_ENHANCER_MODEL_ID;
  if (isWanVisionEnhancerModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Wan Vision Enhancer requires a source video.');
    }

    let latestRequestId: string | undefined;
    const trimmedPrompt = prompt.trim();
    const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;
    const targetResolution = options.targetResolution === '720p' || options.targetResolution === '1080p'
      ? options.targetResolution
      : undefined;
    const creativity = typeof options.creativity === 'number' && Number.isFinite(options.creativity)
      ? Math.min(4, Math.max(0, Math.round(options.creativity)))
      : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(targetResolution ? { target_resolution: targetResolution } : {}),
      ...(creativity !== undefined ? { creativity } : {}),
    };

    emitFalPhase(options, modelId, { phase: 'submitting', message: 'Submitting to Fal...' });
    logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(modelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          emitFalPhase(options, modelId, {
            phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
            message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
            requestId: resolvedRequestId,
          });
          logFalEvent('inbound', modelId, 'Queue update', {
            status: queueUpdate.status,
            position: queueUpdate.position,
            eta: queueUpdate.eta,
            requestId: resolvedRequestId,
            logs: normalizedLogs.map(log => log?.message ?? ''),
          });
          options.onQueueUpdate?.({
            ...queueUpdate,
            requestId: resolvedRequestId || '',
            logs: normalizedLogs,
          });
        },
      });
    } catch (error) {
      logFalEvent('error', modelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
    }

    logFalEvent('inbound', modelId, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { video?: string | { url?: string } } | undefined;
    const videoEntry = data?.video;
    const videoUrl = typeof videoEntry === 'string'
      ? videoEntry
      : videoEntry && typeof videoEntry.url === 'string'
        ? videoEntry.url
        : null;

    if (!videoUrl) {
      throw new Error('Fal.ai API did not return a video.');
    }

    const requestId = result?.requestId || latestRequestId;
    return { videoUrl, requestId };
  }

  const isKlingV3ControlModel = modelId === KLING_V3_CONTROL_VIDEO_MODEL_ID;
  if (isKlingV3ControlModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Kling 3.0 Control requires a source video.');
    }
    if (!image) {
      throw new Error('Kling 3.0 Control requires a character image.');
    }

    const trimmedPrompt = prompt.trim();
    const imageUrl = await uploadImageElementToFal(image, options);
    const characterOrientation = options.characterOrientation === 'image' ? 'image' : 'video';
    const keepOriginalSound = typeof options.keepOriginalSound === 'boolean' ? options.keepOriginalSound : undefined;

    const inputPayload: Record<string, unknown> = {
      image_url: imageUrl,
      video_url: options.sourceVideoUrl,
      character_orientation: characterOrientation,
      ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
      ...(keepOriginalSound !== undefined ? { keep_original_sound: keepOriginalSound } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  if (!image) { // Remaining image-first video models require an image.
    throw new Error('Image is required for video generation.');
  }
  const imageUrl = await uploadImageElementToFal(image, options);

  const promptOptimizer = options.promptOptimizer;
  const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;
  const cfgScale = typeof options.cfgScale === 'number' && Number.isFinite(options.cfgScale)
    ? options.cfgScale
    : undefined;
  const tailImage = options.tailImage;
  const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage, options) : undefined;
  const generateAudio = typeof options.generateAudio === 'boolean' ? options.generateAudio : undefined;
  let latestRequestId: string | undefined;

  const inputPayload: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    ...(promptOptimizer !== undefined ? { prompt_optimizer: promptOptimizer } : {}),
    ...(duration ? { duration } : {}),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    ...(cfgScale !== undefined ? { cfg_scale: cfgScale } : {}),
    ...(tailImageUrl ? { tail_image_url: tailImageUrl } : {}),
    ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
  };

  emitFalPhase(options, modelId, { phase: 'submitting', message: 'Submitting to Fal...' });
  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', {
    input: inputPayload,
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: inputPayload,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        emitFalPhase(options, modelId, {
          phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
          message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
          requestId: resolvedRequestId,
        });
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', modelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
  }

  logFalEvent('inbound', modelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { video?: string | { url?: string } } | undefined;
  const videoEntry = data?.video;
  const videoUrl = typeof videoEntry === 'string'
    ? videoEntry
    : videoEntry && typeof videoEntry.url === 'string'
      ? videoEntry.url
      : null;

  if (!videoUrl) {
    throw new Error('Fal.ai API did not return a video.');
  }

  const requestId = result?.requestId || latestRequestId;

  return { videoUrl, requestId };
};
