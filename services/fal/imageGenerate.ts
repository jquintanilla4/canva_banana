import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalAspectRatioOption, FalImageSizeOption, FalResolutionOption } from '../../types'; // Shared option types.
import type { FalQueueUpdate, GenerateImageOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { extractInlineData } from './responses'; // Response parsing helper.
import { createRandomSeed } from './random'; // Seed helper.
import { isSeedreamTextToImageModelId, normalizeModelId, resolveSeedreamCustomSizeForModel } from './models'; // Model helpers.
import {
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  getFalNumImageMaxForModel,
  isNanoBananaTextToImageModelId,
  isRecraftV4ProModel,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR,
  RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE,
  RECRAFT_V4_PRO_MAX_COLORS,
  normalizeRecraftRgbColor,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.

export const generateImage = async (
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; imageDataUrls?: string[]; text: string; requestId?: string }> => { // Generate an image from text.
  ensureFalClientConfigured();

  const modelId = normalizeModelId(options.modelId) || NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  const isSeedreamTextToImage = isSeedreamTextToImageModelId(modelId);
  const isNanoBananaTextToImage = isNanoBananaTextToImageModelId(modelId);
  const isFlux2MaxTextToImage = modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
  const isWan27ImageTextToImage = modelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  const isRecraftV4ProTextToImage = isRecraftV4ProModel(modelId);
  const isGrokImagineModel = modelId === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image model.
  const supportsAspectRatio = isNanoBananaTextToImage
    || isGrokImagineModel; // Enable Grok aspect ratios.
  const supportsResolution = isNanoBananaTextToImage;
  const numImagesOption = options.numImages;
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption = rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamTextToImage
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;
  const resolutionOption: FalResolutionOption = options.resolution ?? '1K';

  const body: {
    prompt: string;
    sync_mode?: boolean;
    output_format?: 'png';
    num_images?: number;
    aspect_ratio?: string;
    image_size?: { width: number; height: number } | string;
    seed?: number;
    resolution?: FalResolutionOption;
    safety_tolerance?: '5';
    colors?: Array<{ r: number; g: number; b: number }>;
    background_color?: { r: number; g: number; b: number };
    enable_safety_checker?: boolean;
  } = {
    prompt,
    sync_mode: !isSeedreamTextToImage && !isNanoBananaTextToImage && !isRecraftV4ProTextToImage, // Keep Nano Banana history visible.
  };

  if (isRecraftV4ProTextToImage) {
    body.image_size = options.recraftImageSize ?? RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE;
    body.background_color = normalizeRecraftRgbColor(options.recraftBackgroundColor) ?? RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR;
    body.colors = Array.isArray(options.recraftColors)
      ? options.recraftColors.map(normalizeRecraftRgbColor).filter((color): color is NonNullable<typeof color> => Boolean(color)).slice(0, RECRAFT_V4_PRO_MAX_COLORS)
      : [];
    body.enable_safety_checker = true;
    delete body.sync_mode;
  } else if (!isSeedreamTextToImage) {
    body.output_format = 'png';
  }

  if (isFlux2MaxTextToImage) { // Flux2 Max specific settings.
    body.safety_tolerance = '5'; // Most permissive
    body.output_format = 'png';
    const flux2ImageSize = options.flux2MaxImageSize ?? 'landscape_4_3';
    body.image_size = flux2ImageSize;
  }

  if (isWan27ImageTextToImage) { // Wan 2.7 Pro Image T2I specific settings.
    const wan27Body = body as Record<string, unknown>;
    wan27Body.image_size = options.wan27ImageSize ?? 'landscape_16_9';
    const maxImages = parseInt(options.wan27ImageMaxImages ?? '1', 10);
    wan27Body.max_images = Math.min(5, Math.max(1, maxImages));
    if (options.negativePrompt) {
      wan27Body.negative_prompt = options.negativePrompt;
    }
    wan27Body.enable_safety_checker = true;
    delete wan27Body.output_format;
    delete wan27Body.sync_mode;
  }

  if (!isRecraftV4ProTextToImage && !isWan27ImageTextToImage && typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
    const maxNumImages = getFalNumImageMaxForModel(modelId); // Read max outputs from model capability.
    const normalized = Math.min(maxNumImages, Math.max(1, Math.floor(numImagesOption))); // Clamp request into supported range.
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
  } else if (isNanoBananaTextToImage) {
    if (aspectRatioOption !== 'default') {
      body.aspect_ratio = aspectRatioOption;
    }
    if (supportsResolution) {
      body.resolution = resolutionOption;
    }
  } else if (supportsAspectRatio && aspectRatioOption !== 'default') {
    body.aspect_ratio = aspectRatioOption;
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

  const data = result?.data as { images?: Array<{ url: string }>; description?: string; generated_text?: string | null } | undefined;
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

  const description: string = typeof data?.description === 'string'
    ? data.description
    : typeof data?.generated_text === 'string' ? data.generated_text : '';

  const requestId = result?.requestId || latestRequestId;

  return { imageBase64: primaryBase64, imagesBase64: base64List, imageDataUrls: inlineDataList, text: description, requestId };
};
