import { getWorkspaceSignal } from '../workspaceSession';
import { isKrea3Model } from '../krea3Config';
import { resolveKrea3SettingsForRequest, serializeKrea3Input } from './krea3';
import { getNanoBananaSelectorModelId } from '../nanoBananaConfig';
import { resolveNanoBananaSettingsForRequest, serializeNanoBananaInput } from './nanoBanana';
import { resolveFlux3ImageSettings } from '../flux3ImageConfig';
import { fal } from '@fal-ai/client'; // Fal SDK client.
import { IDEOGRAM_45_MODEL_ID, isIdeogram45Model } from '../ideogram45Config';
import { resolveIdeogram45TextInput, type Ideogram45TextRequest } from './ideogram45';
import { resolveGptImage2SettingsForRequest, resolveGptImage25SettingsForRequest, serializeGptImage2Input, serializeGptImage25Input } from './gptImage';
import { resolveRecraftSettingsForRequest, serializeRecraftInput } from './recraft';
import { resolveGrokImageSettingsForRequest, serializeGrokImageInput } from './grokImage';
import type { GrokImageOutputFormat, GrokImageQuality, GrokImageResolution } from '../grokImageConfig';
import type { FalAspectRatioOption, FalImageSizeOption, FalResolutionOption, Flux3ImageResolution, GptImage25Quality, GptImage25Background } from '../../types'; // Shared option types.
import type { FalImageGenerationResult, FalQueueUpdate, GenerateImageOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import { extractInlineData, normalizeFalImageMetadata, runFalDownloadStep } from './responses'; // Response parsing helpers.
import { createRandomSeed } from './random'; // Seed helper.
import { assertSupportedImageModelId, isSeedreamTextToImageModelId, normalizeModelId, resolveSeedreamCustomSizeForModel } from './models'; // Model helpers.
import {
  FLUX_3_TEXT_TO_IMAGE_MODEL_ID,
  isGptImage25Model,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  getFalNumImageMaxForModel,
  isGptImage2TextToImageModelId,
  isGptImage2EditModelId,
  isNanoBananaTextToImageModelId,
  isRecraftV4ProModel,
  isSeedreamV5ProModelId,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.

export const generateImage = async (
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<FalImageGenerationResult> => { // Generate an image from text.
  const selectedModelId = normalizeModelId(options.modelId) || NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  assertSupportedImageModelId(selectedModelId); // Reject retired saved ids before configuring Fal or uploading media.
  options = { ...options, abortSignal: options.abortSignal ?? getWorkspaceSignal() };
  options.abortSignal?.throwIfAborted();
  ensureFalClientConfigured();

  const gptImage2Settings = isGptImage2TextToImageModelId(selectedModelId) || isGptImage2EditModelId(selectedModelId)
    ? resolveGptImage2SettingsForRequest('text_to_image', options) : undefined;
  const gptImage25Settings = isGptImage25Model(selectedModelId)
    ? resolveGptImage25SettingsForRequest('text_to_image', options) : undefined;
  const nanoBananaSettings = getNanoBananaSelectorModelId(selectedModelId)
    ? resolveNanoBananaSettingsForRequest('text_to_image', { ...options, modelId: selectedModelId }) : undefined;
  const krea3Settings = isKrea3Model(selectedModelId) ? resolveKrea3SettingsForRequest('text_to_image', options) : undefined;
  const modelId = krea3Settings?.endpoint ?? nanoBananaSettings?.endpoint ?? gptImage2Settings?.endpoint ?? gptImage25Settings?.endpoint
    ?? (isIdeogram45Model(selectedModelId) ? IDEOGRAM_45_MODEL_ID : selectedModelId);
  const gptImageInput = gptImage2Settings ? serializeGptImage2Input(gptImage2Settings)
    : gptImage25Settings ? serializeGptImage25Input(gptImage25Settings) : undefined;
  const ideogram45Input = isIdeogram45Model(modelId) ? resolveIdeogram45TextInput(options) : undefined;
  const isGptImage25 = isGptImage25Model(modelId);
  const isSeedreamTextToImage = isSeedreamTextToImageModelId(modelId);
  const isSeedreamV5ProTextToImage = isSeedreamV5ProModelId(modelId);
  const isNanoBananaTextToImage = isNanoBananaTextToImageModelId(modelId);
  const isGptImage2TextToImage = isGptImage2TextToImageModelId(modelId);
  const isFlux3TextToImage = modelId === FLUX_3_TEXT_TO_IMAGE_MODEL_ID;
  const isRecraftV4ProTextToImage = isRecraftV4ProModel(modelId);
  const recraftSettings = isRecraftV4ProTextToImage ? resolveRecraftSettingsForRequest(options) : undefined;
  const isGrokImagineModel = modelId === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image model.
  const grokSettings = isGrokImagineModel ? resolveGrokImageSettingsForRequest('text_to_image', options) : undefined;
  const supportsAspectRatio = isNanoBananaTextToImage
    || isGrokImagineModel; // Enable Grok aspect ratios.
  const numImagesOption = options.numImages;
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption = rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamTextToImage
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;

  const body: {
    prompt: string;
    sync_mode?: boolean;
    output_format?: GrokImageOutputFormat;
    num_images?: number;
    aspect_ratio?: string;
    image_size?: { width: number; height: number } | string;
    quality?: GptImage25Quality | GrokImageQuality;
    background?: GptImage25Background;
    seed?: number;
    resolution?: FalResolutionOption | Flux3ImageResolution | GrokImageResolution;
    image_passthrough?: boolean;
    safety_tolerance?: 4;
    colors?: Array<{ r: number; g: number; b: number }>;
    background_color?: { r: number; g: number; b: number };
    enable_safety_checker?: boolean;
  } = {
    prompt,
    sync_mode: !isSeedreamTextToImage && !isNanoBananaTextToImage && !isGptImage2TextToImage && !isGptImage25 && !isRecraftV4ProTextToImage, // Keep queue history visible for async models.
  };

  if (recraftSettings) {
    Object.assign(body, serializeRecraftInput(recraftSettings));
    delete body.sync_mode;
  } else if (!isSeedreamTextToImage) {
    body.output_format = 'png';
  }

  if (isSeedreamV5ProTextToImage) {
    body.output_format = 'png';
    body.enable_safety_checker = false;
  }

  if (isFlux3TextToImage) {
    const settings = resolveFlux3ImageSettings(options);
    body.safety_tolerance = 4; // Flux 3's most permissive supported value.
    body.output_format = 'png';
    body.aspect_ratio = settings.flux3ImageAspectRatio;
    body.resolution = settings.flux3ImageResolution;
    body.sync_mode = false;
  }

  if (nanoBananaSettings) Object.assign(body, serializeNanoBananaInput(nanoBananaSettings));
  if (gptImageInput) Object.assign(body, gptImageInput);
  if (krea3Settings) Object.assign(body, serializeKrea3Input(krea3Settings));
  if (grokSettings) Object.assign(body, serializeGrokImageInput(grokSettings));

  if (!krea3Settings && !grokSettings && !nanoBananaSettings && !ideogram45Input && !gptImageInput && !isFlux3TextToImage && !isRecraftV4ProTextToImage && typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
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
  } else if (!grokSettings && !nanoBananaSettings && supportsAspectRatio && aspectRatioOption !== 'default') {
    body.aspect_ratio = aspectRatioOption;
  }

  let latestRequestId: string | undefined;

  const requestBody = ideogram45Input ? {
    prompt,
    ...ideogram45Input,
  } satisfies Ideogram45TextRequest : body;
  emitFalPhase(options, modelId, { phase: 'submitting', message: 'Submitting to Fal...' });
  options.abortSignal?.throwIfAborted();
  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', { input: requestBody });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    options.abortSignal?.throwIfAborted();
    result = await fal.subscribe(modelId, {
      ...options.abortSignal ? { abortSignal: options.abortSignal } : {},
      input: requestBody,
      logs: true,
      onQueueUpdate: update => {
        if (options.abortSignal?.aborted) return;
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
    options.abortSignal?.throwIfAborted();
    logFalEvent('error', modelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
  }

  options.abortSignal?.throwIfAborted();
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
    Promise.all(images.map(image => extractInlineData(image.url, options.abortSignal)))
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
