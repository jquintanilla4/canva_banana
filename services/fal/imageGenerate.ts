import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalAspectRatioOption, FalImageSizeOption, FalResolutionOption } from '../../types'; // Shared option types.
import type { FalQueueUpdate, GenerateImageOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { collectReferenceUploadUrls, createTransparentPlaceholderUrl } from './media'; // Media upload helpers.
import { extractInlineData } from './responses'; // Response parsing helper.
import { createRandomSeed } from './random'; // Seed helper.
import { isSeedreamTextToImageModelId, normalizeModelId, resolveSeedreamCustomSizeForModel } from './models'; // Model helpers.
import {
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.

export const generateImage = async (
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => { // Generate an image from text.
  ensureFalClientConfigured();

  const modelId = normalizeModelId(options.modelId) || NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  const isSeedreamTextToImage = isSeedreamTextToImageModelId(modelId);
  const isNanoBananaTextToImage = modelId === NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  const isKlingTextToImage = modelId === KLING_IMAGE_MODEL_ID;
  const isFlux2MaxTextToImage = modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
  const isWan26ImageTextToImage = modelId === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  const isGrokImagineModel = modelId === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image model.
  const supportsAspectRatio = isNanoBananaTextToImage
    || modelId === REVE_TEXT_TO_IMAGE_MODEL_ID
    || isKlingTextToImage
    || isGrokImagineModel; // Enable Grok aspect ratios.
  const supportsResolution = isNanoBananaTextToImage || isKlingTextToImage;
  const numImagesOption = options.numImages;
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption = rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamTextToImage
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;
  const resolutionOption: FalResolutionOption = options.resolution ?? '1K';
  const normalizedResolutionOption: FalResolutionOption = isKlingTextToImage && resolutionOption === '4K' ? '2K' : resolutionOption;
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : [];
  const shouldSendReferenceImages = isKlingTextToImage;

  const body: {
    prompt: string;
    sync_mode: boolean;
    output_format?: 'png';
    num_images?: number;
    aspect_ratio?: string;
    image_size?: { width: number; height: number } | string;
    seed?: number;
    resolution?: FalResolutionOption;
    image_urls?: string[];
    safety_tolerance?: '5';
  } = {
    prompt,
    sync_mode: !isSeedreamTextToImage && !isNanoBananaTextToImage, // Keep Nano Banana history visible.
  };

  if (!isSeedreamTextToImage) {
    body.output_format = 'png';
  }

  if (isFlux2MaxTextToImage) { // Flux2 Max specific settings.
    body.safety_tolerance = '5'; // Most permissive
    body.output_format = 'png';
    const flux2ImageSize = options.flux2MaxImageSize ?? 'landscape_4_3';
    body.image_size = flux2ImageSize;
  }

  if (isWan26ImageTextToImage) { // Wan 2.6 Image T2I specific settings.
    const wan26Body = body as Record<string, unknown>;
    wan26Body.image_size = options.wan26ImageSize ?? 'landscape_16_9';
    const maxImages = parseInt(options.wan26ImageMaxImages ?? '1', 10);
    wan26Body.max_images = Math.min(5, Math.max(1, maxImages));
    if (options.negativePrompt) {
      wan26Body.negative_prompt = options.negativePrompt;
    }
    wan26Body.enable_safety_checker = true;
    delete wan26Body.output_format;
    delete wan26Body.sync_mode;
  }

  if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
    const normalized = Math.min(4, Math.max(1, Math.floor(numImagesOption)));
    if (normalized >= 1) {
      body.num_images = normalized;
    }
  }

  if (isSeedreamTextToImage) {
    const seedOption = Number.isFinite(options.seed) ? Math.floor(options.seed as number) : createRandomSeed();
    body.seed = seedOption;
    if (seedreamCustomSize) {
      body.image_size = seedreamCustomSize;
    } else if (imageSizeOption !== 'default') {
      body.image_size = imageSizeOption;
    }
  } else if (isNanoBananaTextToImage || isKlingTextToImage) {
    if (aspectRatioOption !== 'default') {
      body.aspect_ratio = aspectRatioOption;
    }
    if (supportsResolution) {
      body.resolution = isKlingTextToImage ? normalizedResolutionOption : resolutionOption;
    }
  } else if (supportsAspectRatio && aspectRatioOption !== 'default') {
    body.aspect_ratio = aspectRatioOption;
  }

  if (shouldSendReferenceImages) {
    let referenceUrls: string[] = [];
    if (referenceImages.length > 0) {
      referenceUrls = await collectReferenceUploadUrls(referenceImages);
    }
    if (referenceUrls.length === 0) {
      referenceUrls = [await createTransparentPlaceholderUrl()];
    }
    body.image_urls = referenceUrls;
  }

  let latestRequestId: string | undefined;

  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', { input: body });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: body,
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

  const data = result?.data as { images?: Array<{ url: string }>; description?: string } | undefined;
  const images = data?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai API did not return an image.');
  }

  const inlineDataList = await Promise.all(images.map(image => extractInlineData(image.url)));
  const base64List = inlineDataList.map(dataUrl => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      throw new Error('Failed to extract image data from Fal.ai response.');
    }
    return base64;
  });

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract image data from Fal.ai response.');
  }

  const description: string = typeof data?.description === 'string' ? data.description : '';

  const requestId = result?.requestId || latestRequestId;

  return { imageBase64: primaryBase64, imagesBase64: base64List, text: description, requestId };
};
