import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalAspectRatioOption, FalImageSizeOption, FalResolutionOption } from '../../types'; // Shared option types.
import type { FalImageGenerationResult, FalQueueUpdate, GenerateImageOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import { extractInlineData, normalizeFalImageMetadata, runFalDownloadStep } from './responses'; // Response parsing helpers.
import { createRandomSeed } from './random'; // Seed helper.
import { uploadImageElementToFal } from './media'; // Media upload helper.
import { isSeedreamTextToImageModelId, normalizeModelId, resolveGptImage2SizeForFal, resolveSeedreamCustomSizeForModel } from './models'; // Model helpers.
import {
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  getFalNumImageMaxForModel,
  isGptImage2TextToImageModelId,
  isKrea2AspectRatioSelectionValue,
  isKrea2CreativitySelectionValue,
  isNanoBananaTextToImageModelId,
  isRecraftV4ProModel,
  isSeedreamV5ProModelId,
  KREA_2_DEFAULT_ASPECT_RATIO,
  KREA_2_DEFAULT_CREATIVITY,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  KREA_2_MAX_STYLE_REFERENCES,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR,
  RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE,
  RECRAFT_V4_PRO_MAX_COLORS,
  normalizeRecraftRgbColor,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.

const normalizeKreaStyleReferenceStrength = (value: number): number => {
  const rounded = Number.isFinite(value) ? Math.round(value * 10) / 10 : 1; // Fal accepts tenths in the UI.
  return Math.min(2, Math.max(-2, rounded));
};

export const generateImage = async (
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<FalImageGenerationResult> => { // Generate an image from text.
  ensureFalClientConfigured();

  const modelId = normalizeModelId(options.modelId) || NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  const isSeedreamTextToImage = isSeedreamTextToImageModelId(modelId);
  const isSeedreamV5ProTextToImage = isSeedreamV5ProModelId(modelId);
  const isNanoBananaTextToImage = isNanoBananaTextToImageModelId(modelId);
  const isGptImage2TextToImage = isGptImage2TextToImageModelId(modelId);
  const isKrea2TextToImage = modelId === KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID;
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
    quality?: 'low' | 'medium' | 'high';
    creativity?: 'raw' | 'low' | 'medium' | 'high';
    image_style_references?: Array<{ image_url: string; strength: number }>;
    seed?: number;
    resolution?: FalResolutionOption;
    safety_tolerance?: '5';
    colors?: Array<{ r: number; g: number; b: number }>;
    background_color?: { r: number; g: number; b: number };
    enable_safety_checker?: boolean;
  } = {
    prompt,
    sync_mode: !isSeedreamTextToImage && !isNanoBananaTextToImage && !isGptImage2TextToImage && !isKrea2TextToImage && !isRecraftV4ProTextToImage, // Keep queue history visible for async models.
  };

  if (isKrea2TextToImage) {
    body.aspect_ratio = isKrea2AspectRatioSelectionValue(aspectRatioOption) ? aspectRatioOption : KREA_2_DEFAULT_ASPECT_RATIO;
    body.creativity = isKrea2CreativitySelectionValue(options.krea2Creativity) ? options.krea2Creativity : KREA_2_DEFAULT_CREATIVITY;
    const styleReferences = Array.isArray(options.imageStyleReferences)
      ? options.imageStyleReferences.slice(0, KREA_2_MAX_STYLE_REFERENCES)
      : [];
    if (styleReferences.length > 0) {
      body.image_style_references = await Promise.all(styleReferences.map(async reference => ({
        image_url: await uploadImageElementToFal(reference.image, {
          jobId: options.jobId,
          onPhaseUpdate: options.onPhaseUpdate,
          label: 'style reference image',
        }),
        strength: normalizeKreaStyleReferenceStrength(reference.strength),
      })));
    }
    delete body.sync_mode;
  } else if (isRecraftV4ProTextToImage) {
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

  if (isSeedreamV5ProTextToImage) {
    body.output_format = 'png';
    body.enable_safety_checker = false;
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

  if (isGptImage2TextToImage) {
    body.quality = options.gptImage2Quality ?? 'medium'; // App default overrides Fal high default.
    body.image_size = resolveGptImage2SizeForFal(imageSizeOption); // Use one size control for t2i/edit.
  }

  if (!isKrea2TextToImage && !isRecraftV4ProTextToImage && !isWan27ImageTextToImage && typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
    const maxNumImages = getFalNumImageMaxForModel(modelId); // Read max outputs from model capability.
    const normalized = Math.min(maxNumImages, Math.max(1, Math.floor(numImagesOption))); // Clamp request into supported range.
    if (normalized >= 1) {
      body.num_images = normalized;
    }
  }

  if (isSeedreamTextToImage) {
    if (!isSeedreamV5ProTextToImage) {
      const seedOption = Number.isFinite(options.seed) ? Math.floor(options.seed as number) : createRandomSeed();
      body.seed = seedOption;
    }
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
  } else if (isGptImage2TextToImage) {
    // GPT Image 2 uses image_size instead of aspect_ratio/resolution.
  } else if (supportsAspectRatio && aspectRatioOption !== 'default') {
    body.aspect_ratio = aspectRatioOption;
  }

  let latestRequestId: string | undefined;

  emitFalPhase(options, modelId, { phase: 'submitting', message: 'Submitting to Fal...' });
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

  const data = result?.data as { images?: Array<{ url: string; content_type?: string; file_name?: string; file_size?: number; width?: number; height?: number }>; description?: string; generated_text?: string | null } | undefined;
  const images = data?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai API did not return an image.');
  }

  emitFalPhase(options, modelId, {
    phase: 'downloading',
    message: 'Downloading generated image...',
    requestId: result?.requestId || latestRequestId,
  });
  const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
  const inlineDataList = await runFalDownloadStep(downloadRequestId, async () => (
    Promise.all(images.map(image => extractInlineData(image.url)))
  ));
  const base64List = await runFalDownloadStep(downloadRequestId, async () => (
    inlineDataList.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Failed to extract image data from Fal.ai response.');
      }
      return base64;
    })
  ));

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract image data from Fal.ai response.');
  }

  const description: string = typeof data?.description === 'string'
    ? data.description
    : typeof data?.generated_text === 'string' ? data.generated_text : '';

  const requestId = result?.requestId || latestRequestId;
  const imagesMetadata = images.map(normalizeFalImageMetadata); // Preserve provider dimensions.

  return { imageBase64: primaryBase64, imagesBase64: base64List, imageDataUrls: inlineDataList, imagesMetadata, text: description, requestId };
};
