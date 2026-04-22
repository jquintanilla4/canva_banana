import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalQueueUpdate, GenerateVideoOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { collectReferenceUploadUrls, uploadImageElementToFal, uploadVideoToFal } from './media'; // Media upload helpers.
import {
  GROK_IMAGINE_VIDEO_EDIT_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  KLING_26_CONTROL_VIDEO_MODEL_ID,
  KLING_26_CONTROL_VIDEO_PRO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT,
  SCAIL_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MOVE_MODEL_ID,
  INFINITALK_DURATION_TO_NUM_FRAMES,
} from '../modelConfig'; // Canonical model IDs.
import {
  HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  KLING_O1_REFERENCE_TO_VIDEO_MODEL_ID,
  KLING_O1_VIDEO_EDIT_MODEL_ID,
  KLING_O1_VIDEO_FFLF_MODEL_ID,
  KLING_O1_VIDEO_REF_V2V_MODEL_ID,
  FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_REFERENCE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
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
  options: Pick<GenerateVideoOptions, 'onQueueUpdate'>,
): Promise<{ videoUrl: string; requestId?: string }> => { // Subscribe and return video output.
  let latestRequestId: string | undefined; // Track latest queue request id.

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
    throw error;
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

  const modelId = options.modelId || HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID; // Default to Hailuo standard.
  const duration = options.duration; // Optional duration override.
  const isVeo31ImageToVideoModel = modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID; // Veo 3.1 i2v route.
  const isVeo31FflfModel = modelId === VEO_31_FFLF_VIDEO_MODEL_ID; // Veo 3.1 fflf route.
  const isVeo31ExtendModel = modelId === VEO_31_EXTEND_VIDEO_MODEL_ID; // Veo 3.1 extend route.
  const isKlingO1VideoModel = modelId === KLING_O1_REFERENCE_TO_VIDEO_MODEL_ID // Kling O1 family.
    || modelId === KLING_O1_VIDEO_EDIT_MODEL_ID
    || modelId === KLING_O1_VIDEO_REF_V2V_MODEL_ID
    || modelId === KLING_O1_VIDEO_FFLF_MODEL_ID;
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : []; // Optional references list.
  const elementImages = Array.isArray(options.elementImages) ? options.elementImages : []; // Optional elements list.
  const isEditVariant = options.klingO1Variant === 'edit'; // Kling O1 edit variant flag.
  const isRefV2VVariant = options.klingO1Variant === 'refV2V'; // Kling O1 ref-v2v variant flag.
  const isKlingO1FflfVariant = options.klingO1Variant === 'fflf'; // Kling O1 fflf variant flag.

  if (isKlingO1VideoModel && isEditVariant) { // Kling O1 edit requires video_url + optional images.
    if (!options.sourceVideoUrl) {
      throw new Error('Kling O1 Video Edit requires a source video.');
    }

    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      reference_image_urls: [url],
    }));

    const totalImageCount = referenceUrls.length + elementsPayload.length;
    if (totalImageCount > 4) { // Max 4 total when using video.
      throw new Error('Kling O1 Video Edit supports up to 4 images total (references + elements).');
    }

    let latestRequestId: string | undefined;

    const inputPayload: Record<string, unknown> = {
      prompt,
      video_url: options.sourceVideoUrl,
      ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      ...(typeof options.keepAudio === 'boolean' ? { keep_audio: options.keepAudio } : {}),
    };

    const editModelId = KLING_O1_VIDEO_EDIT_MODEL_ID;
    logFalEvent('outbound', editModelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(editModelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', editModelId, 'Queue update', {
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
      logFalEvent('error', editModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', editModelId, 'Result received', {
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

  if (isKlingO1VideoModel && isRefV2VVariant) { // Kling O1 ref-v2v supports duration + aspect ratio.
    if (!options.sourceVideoUrl) {
      throw new Error('Kling O1 Video Ref-v2v requires a source video.');
    }

    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      reference_image_urls: [url],
    }));

    const totalImageCount = referenceUrls.length + elementsPayload.length;
    if (totalImageCount > 4) { // Max 4 total when using video.
      throw new Error('Kling O1 Video Ref-v2v supports up to 4 images total (references + elements).');
    }

    let latestRequestId: string | undefined;

    const aspectRatioValue = options.aspectRatio && options.aspectRatio !== 'default' ? options.aspectRatio : 'auto';

    const inputPayload: Record<string, unknown> = {
      prompt,
      video_url: options.sourceVideoUrl,
      ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      ...(typeof options.keepAudio === 'boolean' ? { keep_audio: options.keepAudio } : {}),
      ...(duration ? { duration } : {}),
      aspect_ratio: aspectRatioValue,
    };

    const refV2VModelId = KLING_O1_VIDEO_REF_V2V_MODEL_ID;
    logFalEvent('outbound', refV2VModelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(refV2VModelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', refV2VModelId, 'Queue update', {
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
      logFalEvent('error', refV2VModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', refV2VModelId, 'Result received', {
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

    const imageUrl = await uploadImageElementToFal(image);

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

    const imageUrl = await uploadImageElementToFal(image);
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
      const lastFrameUrl = await uploadImageElementToFal(tailImage);

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
      const referenceImageUrl = referenceImages[0] ? await uploadImageElementToFal(referenceImages[0]) : undefined;
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
      const imageUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
      const videoUrls = options.referenceVideos?.length
        ? await Promise.all(options.referenceVideos.map(file => uploadVideoToFal(file)))
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
      const imageUrl = await uploadImageElementToFal(image);
      const tailImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage) : undefined;
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

    const imageUrl = await uploadImageElementToFal(image);
    const tailImage = options.tailImage;
    const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage) : undefined;

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
      const imageUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
      const videoUrls = options.referenceVideos?.length
        ? await Promise.all(options.referenceVideos.map(file => uploadVideoToFal(file)))
        : [];
      const audioUrls = options.referenceAudios?.length
        ? await Promise.all(options.referenceAudios.map(file => uploadVideoToFal(file)))
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
      const imageUrl = await uploadImageElementToFal(image);
      const tailImageUrl = options.tailImage ? await uploadImageElementToFal(options.tailImage) : undefined;
      const inputPayload: Record<string, unknown> = {
        ...sharedPayload,
        image_url: imageUrl,
        ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      };

      return subscribeForVideoUrl(FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID, inputPayload, options);
    }

    return subscribeForVideoUrl(FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID, sharedPayload, options);
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

  const isOneToAllAnimateModel = modelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
  if (isOneToAllAnimateModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('1-to-All Animate requires a source video.');
    }
    if (!image) {
      throw new Error('1-to-All Animate requires a still image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('1-to-All Animate requires a prompt.');
    }

    const negativePrompt = typeof options.negativePrompt === 'string'
      ? options.negativePrompt.trim()
      : ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT;

    const imageUrl = await uploadImageElementToFal(image);

    const resolution = options.resolution === '480p' || options.resolution === '580p' || options.resolution === '720p'
      ? options.resolution
      : undefined;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      negative_prompt: negativePrompt,
      image_url: imageUrl,
      video_url: options.sourceVideoUrl,
      ...(resolution ? { resolution } : {}),
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

    const imageUrl = await uploadImageElementToFal(image);

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

    const imageUrl = await uploadImageElementToFal(image);

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
      throw error;
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

  const isKling26ControlModel = modelId === KLING_26_CONTROL_VIDEO_MODEL_ID
    || modelId === KLING_26_CONTROL_VIDEO_PRO_MODEL_ID;
  if (isKling26ControlModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Kling 2.6 Control requires a source video.');
    }
    if (!image) {
      throw new Error('Kling 2.6 Control requires a character image.');
    }

    const trimmedPrompt = prompt.trim();
    const imageUrl = await uploadImageElementToFal(image);
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

  if (!image) { // Non-edit/refV2V variants require an image.
    throw new Error('Image is required for video generation.');
  }
  const imageUrl = await uploadImageElementToFal(image);

  if (isKlingO1VideoModel && isKlingO1FflfVariant) {
    if (referenceImages.length > 0 || elementImages.length > 0) {
      throw new Error('Kling O1 FFLF only supports a start and end frame. Remove reference or element images.');
    }
    const tailImage = options.tailImage;
    const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage) : undefined;
    let latestRequestId: string | undefined;

    const inputPayload: Record<string, unknown> = {
      prompt,
      start_image_url: imageUrl,
      ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      ...(duration ? { duration } : {}),
    };

    const fflfModelId = KLING_O1_VIDEO_FFLF_MODEL_ID;
    logFalEvent('outbound', fflfModelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(fflfModelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', fflfModelId, 'Queue update', {
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
      logFalEvent('error', fflfModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', fflfModelId, 'Result received', {
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

  if (isKlingO1VideoModel) {
    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      reference_image_urls: [url], // Reuse frontal view when alternates are missing.
    }));
    const totalImages = 1 + referenceUrls.length + elementsPayload.length;
    if (totalImages > 7) {
      throw new Error('Kling O1 Video supports up to 7 images (start + references + elements).');
    }

    let latestRequestId: string | undefined;

    const variant = options.klingO1Variant;
    const inputPayload: Record<string, unknown> = {
      prompt,
      image_urls: [imageUrl, ...referenceUrls],
      ...(duration ? { duration } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      ...(variant ? { variant } : {}),
    };

    logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
      ...(variant ? { variant } : {}),
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
      throw error;
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

  const isHailuoVideoModel = modelId.includes('hailuo-2.3');
  const promptOptimizer = options.promptOptimizer ?? (isHailuoVideoModel ? true : undefined);
  const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;
  const cfgScale = typeof options.cfgScale === 'number' && Number.isFinite(options.cfgScale)
    ? options.cfgScale
    : undefined;
  const tailImage = options.tailImage;
  const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage) : undefined;
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
    throw error;
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
