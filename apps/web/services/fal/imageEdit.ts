import { fal } from '@fal-ai/client'; // Fal SDK client.
import { Tool, type FalAspectRatioOption, type FalImageSizeOption, type FalResolutionOption } from '../../types'; // Shared types.
import type { FalImageGenerationResult, FalQueueUpdate, GenerateImageEditOptions, GenerateImageEditParams } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import {
  buildAnnotationCanvas,
  collectReferenceUploadUrls,
  uploadCanvasToFal,
  uploadImageElementToFal,
} from './media'; // Media upload helpers.
import { convertWan27ImageMentions } from './prompts'; // Prompt conversion helpers.
import { extractInlineData, normalizeFalImageMetadata, runFalDownloadStep } from './responses'; // Response parsing helpers.
import {
  FAL_MODEL_ID,
  isSeedreamEditModelId,
  normalizeModelId,
  resolveGptImage2SizeForFal,
  resolveSeedreamCustomSizeForModel,
} from './models'; // Model helpers.
import {
  FLUX2_MAX_EDIT_MODEL_ID,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_EDIT_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  getFalNumImageMaxForModel,
  isGptImage2EditModelId,
  isNanoBananaEditModelId,
  isSeedreamV5ProModelId,
  WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.

const emitImageEditQueuePhase = (
  options: GenerateImageEditOptions,
  modelId: string,
  queueUpdate: FalQueueUpdate,
  requestId?: string,
) => { // Mirror Fal queue status into phase updates.
  emitFalPhase(options, modelId, {
    phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
    message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
    requestId,
  });
};

export const generateImageEdit = async (
  {
    prompt,
    image,
    tool,
    paths,
    imageDimensions,
    referenceImages,
  }: GenerateImageEditParams,
  options: GenerateImageEditOptions = {},
): Promise<FalImageGenerationResult> => { // Edit an image with Fal.
  ensureFalClientConfigured();

  const modelId = normalizeModelId(options.modelId) || FAL_MODEL_ID;
  const isSeedreamAnnotateSingle = tool === Tool.ANNOTATE && isSeedreamEditModelId(modelId);
  const imageUrls: string[] = [];
  let annotationImageUrl: string | undefined;

  const baseImageUrl = await uploadImageElementToFal(image, {
    jobId: options.jobId,
    onPhaseUpdate: options.onPhaseUpdate,
    label: 'source image',
  });
  const isWan27ImageModel = modelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID || modelId === WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID; // Wan 2.7 Pro image edit routing.

  if (modelId === GROK_IMAGINE_IMAGE_MODEL_ID) {
    const numImagesOption = options.numImages; // Grok supports 1-4 outputs per request.
    const grokBody: {
      prompt: string;
      image_url: string;
      num_images?: number;
      output_format?: 'png' | 'jpeg' | 'webp';
      sync_mode?: boolean;
    } = {
      prompt,
      image_url: baseImageUrl,
      output_format: 'png',
      sync_mode: false,
    };

    if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
      const normalized = Math.min(4, Math.max(1, Math.floor(numImagesOption)));
      if (normalized >= 1) {
        grokBody.num_images = normalized;
      }
    }

    let latestRequestId: string | undefined;

    emitFalPhase(options, GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, { phase: 'submitting', message: 'Submitting to Fal...' });
    logFalEvent('outbound', GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, 'Outbound request (fal.subscribe)', { input: grokBody });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, {
        input: grokBody,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          emitImageEditQueuePhase(options, GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, queueUpdate, resolvedRequestId);
          logFalEvent('inbound', GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, 'Queue update', {
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
      logFalEvent('error', GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
    }

    logFalEvent('inbound', GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { images?: Array<{ url: string }>; revised_prompt?: string } | undefined;
    const images = data?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai Grok Imagine edit API did not return an image.');
    }

    emitFalPhase(options, GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, {
      phase: 'downloading',
      message: 'Downloading generated image...',
      requestId: result?.requestId || latestRequestId,
    });
    const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
    const inlineDataList = await runFalDownloadStep(downloadRequestId, async () => (
      Promise.all(images.map(img => extractInlineData(img.url)))
    ));
    const base64List = await runFalDownloadStep(downloadRequestId, async () => (
      inlineDataList.map(dataUrl => {
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          throw new Error('Failed to extract image data from Fal.ai Grok Imagine edit response.');
        }
        return base64;
      })
    ));

    const [primaryBase64] = base64List;
    if (!primaryBase64) {
      throw new Error('Failed to extract image data from Fal.ai Grok Imagine edit response.');
    }

    const revisedPrompt = typeof data?.revised_prompt === 'string' ? data.revised_prompt : ''; // Optional prompt rewrite.
    const requestId = result?.requestId || latestRequestId;
    return { imageBase64: primaryBase64, imagesBase64: base64List, imageDataUrls: inlineDataList, text: revisedPrompt, requestId };
  }

  if (!isSeedreamAnnotateSingle) {
    imageUrls.push(baseImageUrl);
  }

  if (tool === Tool.ANNOTATE) {
    const annotationCanvas = buildAnnotationCanvas(image, paths, imageDimensions);
    annotationImageUrl = await uploadCanvasToFal(annotationCanvas, {
      jobId: options.jobId,
      onPhaseUpdate: options.onPhaseUpdate,
      label: 'annotation image',
    });
    imageUrls.push(annotationImageUrl);
  }

  const isFlux2MaxModel = modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID; // Flux2 Max edit routing.
  if (!isWan27ImageModel && !isFlux2MaxModel && referenceImages && referenceImages.length > 0) {
    const referenceUrls = await collectReferenceUploadUrls(referenceImages, {
      jobId: options.jobId,
      onPhaseUpdate: options.onPhaseUpdate,
    });
    imageUrls.push(...referenceUrls);
  }

  if (isFlux2MaxModel) {
    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    let latestRequestId: string | undefined;

    const primaryImageUrl = tool === Tool.ANNOTATE && annotationImageUrl // Base or annotation image first.
      ? annotationImageUrl
      : baseImageUrl;
    const allImageUrls = [primaryImageUrl];
    if (hasReferenceImages) {
      const referenceUrls = await collectReferenceUploadUrls(referenceImages, {
        jobId: options.jobId,
        onPhaseUpdate: options.onPhaseUpdate,
      });
      allImageUrls.push(...referenceUrls);
    }

    if (allImageUrls.length > 8) { // Limit to 8 images per API.
      throw new Error('Flux2 Max edit supports up to 8 images. Please reduce the number of selected images.');
    }

    const flux2Body: {
      prompt: string;
      image_urls: string[];
      image_size?: string;
      output_format?: 'png' | 'jpeg';
      safety_tolerance?: '5';
      sync_mode?: boolean;
    } = {
      prompt, // Keep @Image1, @Image2, etc. as-is
      image_urls: allImageUrls,
      image_size: 'auto',
      output_format: 'png',
      safety_tolerance: '5', // Most permissive
      sync_mode: false,
    };

    emitFalPhase(options, FLUX2_MAX_EDIT_MODEL_ID, { phase: 'submitting', message: 'Submitting to Fal...' });
    logFalEvent('outbound', FLUX2_MAX_EDIT_MODEL_ID, 'Outbound request (fal.subscribe)', { input: flux2Body });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(FLUX2_MAX_EDIT_MODEL_ID, {
        input: flux2Body,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          emitImageEditQueuePhase(options, FLUX2_MAX_EDIT_MODEL_ID, queueUpdate, resolvedRequestId);
          logFalEvent('inbound', FLUX2_MAX_EDIT_MODEL_ID, 'Queue update', {
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
      logFalEvent('error', FLUX2_MAX_EDIT_MODEL_ID, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
    }

    logFalEvent('inbound', FLUX2_MAX_EDIT_MODEL_ID, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { images?: Array<{ url: string }> } | undefined;
    const images = data?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai Flux2 Max edit API did not return an image.');
    }

    emitFalPhase(options, FLUX2_MAX_EDIT_MODEL_ID, {
      phase: 'downloading',
      message: 'Downloading generated image...',
      requestId: result?.requestId || latestRequestId,
    });
    const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
    let inlineDataList: string[] = []; // Preserve provider MIME types for canvas hydration.
    const base64List = await runFalDownloadStep(downloadRequestId, async () => {
      inlineDataList = await Promise.all(images.map(img => extractInlineData(img.url)));
      return inlineDataList.map(dataUrl => {
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          throw new Error('Failed to extract image data from Fal.ai Flux2 Max edit response.');
        }
        return base64;
      });
    });

    const [primaryBase64] = base64List;
    if (!primaryBase64) {
      throw new Error('Failed to extract image data from Fal.ai Flux2 Max edit response.');
    }

    const requestId = result?.requestId || latestRequestId;
    return { imageBase64: primaryBase64, imagesBase64: base64List, imageDataUrls: inlineDataList, text: '', requestId };
  }

  if (isWan27ImageModel) {
    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    let latestRequestId: string | undefined;

    if ((referenceImages?.length ?? 0) > 3) { // Fal edit endpoint accepts 1 base image plus 3 references.
      throw new Error('Wan 2.7 Pro Image supports up to 4 images total. Please reduce the number of selected images.');
    }

    const allImageUrls = [baseImageUrl]; // Base image first, then references.
    if (hasReferenceImages) {
      const referenceUrls = await collectReferenceUploadUrls(referenceImages, {
        jobId: options.jobId,
        onPhaseUpdate: options.onPhaseUpdate,
      });
      allImageUrls.push(...referenceUrls);
    }

    if (allImageUrls.length > 4) { // Fal edit endpoint accepts 1 base image plus 3 references.
      throw new Error('Wan 2.7 Pro Image supports up to 4 images total. Please reduce the number of selected images.');
    }

    const convertedPrompt = convertWan27ImageMentions(prompt); // Convert @ImageN mentions.

    const wan27Body: {
      prompt: string;
      image_urls: string[];
      image_size?: string;
      num_images?: number;
      negative_prompt?: string;
      enable_prompt_expansion?: boolean;
      enable_safety_checker?: boolean;
    } = {
      prompt: convertedPrompt,
      image_urls: allImageUrls,
      image_size: options.wan27ImageSize ?? 'landscape_16_9',
      enable_prompt_expansion: true,
      enable_safety_checker: true,
    };

    const numImages = parseInt(options.wan27ImageMaxImages ?? '1', 10);
    wan27Body.num_images = Math.min(4, Math.max(1, numImages)); // Edit endpoint num_images cap.

    if (options.negativePrompt) {
      wan27Body.negative_prompt = options.negativePrompt;
    }

    const i2iModelId = WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID;
    emitFalPhase(options, i2iModelId, { phase: 'submitting', message: 'Submitting to Fal...' });
    logFalEvent('outbound', i2iModelId, 'Outbound request (fal.subscribe)', { input: wan27Body });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(i2iModelId, {
        input: wan27Body,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          emitImageEditQueuePhase(options, i2iModelId, queueUpdate, resolvedRequestId);
          logFalEvent('inbound', i2iModelId, 'Queue update', {
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
      logFalEvent('error', i2iModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
    }

    logFalEvent('inbound', i2iModelId, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { images?: Array<{ url: string }> } | undefined;
    const images = data?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai Wan 2.7 Pro Image Edit API did not return an image.');
    }

    emitFalPhase(options, i2iModelId, {
      phase: 'downloading',
      message: 'Downloading generated image...',
      requestId: result?.requestId || latestRequestId,
    });
    const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
    const inlineDataList = await runFalDownloadStep(downloadRequestId, async () => (
      Promise.all(images.map(img => extractInlineData(img.url)))
    ));
    const base64List = await runFalDownloadStep(downloadRequestId, async () => (
      inlineDataList.map(dataUrl => {
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          throw new Error('Failed to extract image data from Fal.ai Wan 2.7 Pro Image Edit response.');
        }
        return base64;
      })
    ));

    const [primaryBase64] = base64List;
    if (!primaryBase64) {
      throw new Error('Failed to extract image data from Fal.ai Wan 2.7 Pro Image Edit response.');
    }

    const requestId = result?.requestId || latestRequestId;
    return { imageBase64: primaryBase64, imagesBase64: base64List, imageDataUrls: inlineDataList, text: '', requestId };
  }

  const isSeedreamModel = isSeedreamEditModelId(modelId);
  const isSeedreamV5ProModel = isSeedreamV5ProModelId(modelId);
  const referenceImageCount = referenceImages?.length ?? 0;
  if (isSeedreamModel && referenceImageCount > 0) {
    const auxiliaryImageCount = tool === Tool.ANNOTATE ? 1 : 0;
    const baseImageCount = isSeedreamAnnotateSingle ? 0 : 1;
    const expectedImageCount = baseImageCount + auxiliaryImageCount + referenceImageCount;
    if (imageUrls.length < expectedImageCount) {
      logFalEvent('error', modelId, 'Seedream edit missing reference images', {
        expectedImageCount,
        actualImageCount: imageUrls.length,
      });
      throw new Error('Seedream edit expected reference images to be included in image_urls.');
    }
  }
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption = rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamModel
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;
  const numImagesOption = options.numImages;
  const resolutionOption: FalResolutionOption = options.resolution ?? '1K';
  const isNanoBananaModel = isNanoBananaEditModelId(modelId);
  const isGptImage2Model = isGptImage2EditModelId(modelId);

  if (isSeedreamV5ProModel && imageUrls.length > 10) {
    throw new Error('Seedream 5 Pro supports up to 10 total input images. Please reduce the number of selected images.');
  }

  if (isGptImage2Model && imageUrls.length > 10) {
    throw new Error('GPT Image 2 supports up to 10 total input images. Please reduce the number of selected images.');
  }
  const orderedImageUrls = isNanoBananaModel ? [...imageUrls].reverse() : imageUrls; // Nano labels inputs from the end of the array.

  const body: {
    prompt: string;
    image_urls: string[];
    output_format?: 'png';
    sync_mode: boolean;
    image_size?: { width: number; height: number } | string;
    quality?: 'low' | 'medium' | 'high';
    num_images?: number;
    aspect_ratio?: string;
    resolution?: FalResolutionOption;
    enable_safety_checker?: boolean;
  } = {
    prompt,
    image_urls: orderedImageUrls,
    sync_mode: !isSeedreamModel && !isNanoBananaModel && !isGptImage2Model, // Keep queue history visible for async models.
  };

  if (!isSeedreamModel) {
    body.output_format = 'png';
  }
  if (isSeedreamV5ProModel) {
    body.output_format = 'png';
    body.enable_safety_checker = false;
  }

  let latestRequestId: string | undefined;

  if (isSeedreamModel) {
    if (seedreamCustomSize) {
      body.image_size = seedreamCustomSize;
    } else if (isSeedreamV5ProModel && imageSizeOption === 'default') {
      body.image_size = 'auto_2K';
    } else if (imageSizeOption === 'default') {
      body.image_size = {
        width: imageDimensions.width,
        height: imageDimensions.height,
      };
    } else {
      body.image_size = imageSizeOption;
    }
  } else if (isNanoBananaModel) {
    if (aspectRatioOption !== 'default') {
      body.aspect_ratio = aspectRatioOption;
    }
    body.resolution = resolutionOption;
  } else if (isGptImage2Model) {
    body.image_size = resolveGptImage2SizeForFal(imageSizeOption); // GPT Image 2 supports auto in edit mode.
    body.quality = options.gptImage2Quality ?? 'medium'; // App default overrides Fal high default.
  }

  if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
    const maxNumImages = getFalNumImageMaxForModel(modelId); // Read max outputs from model capability.
    const normalized = Math.min(maxNumImages, Math.max(1, Math.floor(numImagesOption))); // Clamp request into supported range.
    if (normalized >= 1) {
      body.num_images = normalized;
    }
  }

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
        emitImageEditQueuePhase(options, modelId, queueUpdate, resolvedRequestId);
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

  const data = result?.data as { images?: Array<{ url: string; content_type?: string; file_name?: string; file_size?: number; width?: number; height?: number }>; description?: string } | undefined;
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
  let inlineDataList: string[] = []; // Preserve provider MIME types for canvas hydration.
  const base64List = await runFalDownloadStep(downloadRequestId, async () => {
    inlineDataList = await Promise.all(images.map(image => extractInlineData(image.url)));
    return inlineDataList.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Failed to extract image data from Fal.ai response.');
      }
      return base64;
    });
  });

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract image data from Fal.ai response.');
  }

  const description: string = typeof data?.description === 'string' ? data.description : '';

  const requestId = result?.requestId || latestRequestId;
  const imagesMetadata = images.map(normalizeFalImageMetadata); // Preserve provider dimensions.

  return { imageBase64: primaryBase64, imagesBase64: base64List, imageDataUrls: inlineDataList, imagesMetadata, text: description, requestId };
};
