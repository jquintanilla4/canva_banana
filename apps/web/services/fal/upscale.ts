import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalQueueUpdate, UpscaleImageOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import { uploadImageElementToFal } from './media'; // Media upload helper.
import { extractInlineData, runFalDownloadStep } from './responses'; // Response parsing helper.
import { createRandomSeed } from './random'; // Seed helper.
import { CRYSTAL_UPSCALER_MODEL_ID, SEEDVR_UPSCALER_MODEL_ID } from '../modelConfig'; // Upscale model IDs.

export const upscaleCrystalImage = async (
  image: HTMLImageElement,
  scaleFactor: number,
  creativity: number,
  options: UpscaleImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => { // Upscale with Crystal.
  ensureFalClientConfigured(); // Ensure SDK is configured before requests.

  const imageUrl = await uploadImageElementToFal(image, options); // Upload source image first.
  const sanitizedScale = Number.isFinite(scaleFactor) ? Math.round(scaleFactor) : 2; // Snap scale to integer.
  const normalizedScale = Math.min(200, Math.max(1, sanitizedScale)); // Clamp scale to API range.
  const sanitizedCreativity = Number.isFinite(creativity) ? creativity : 0; // Default creativity when invalid.
  const roundedCreativity = Math.round(sanitizedCreativity * 2) / 2; // Round to 0.5 steps.
  const normalizedCreativity = Math.min(10, Math.max(0, roundedCreativity)); // Clamp creativity to API range.

  let latestRequestId: string | undefined; // Track latest queue request id.

  emitFalPhase(options, CRYSTAL_UPSCALER_MODEL_ID, { phase: 'submitting', message: 'Submitting to Fal...' });
  logFalEvent('outbound', CRYSTAL_UPSCALER_MODEL_ID, 'Outbound request (fal.subscribe)', {
    input: {
      image_url: imageUrl,
      scale_factor: normalizedScale,
      creativity: normalizedCreativity,
    },
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(CRYSTAL_UPSCALER_MODEL_ID, {
      input: {
        image_url: imageUrl,
        scale_factor: normalizedScale,
        creativity: normalizedCreativity,
      },
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        emitFalPhase(options, CRYSTAL_UPSCALER_MODEL_ID, {
          phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
          message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
          requestId: resolvedRequestId,
        });
        logFalEvent('inbound', CRYSTAL_UPSCALER_MODEL_ID, 'Queue update', {
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
    logFalEvent('error', CRYSTAL_UPSCALER_MODEL_ID, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
  }

  logFalEvent('inbound', CRYSTAL_UPSCALER_MODEL_ID, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { images?: Array<string | { url: string }> } | undefined; // Normalize response payload.
  const images = data?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai Crystal Upscaler did not return an image.');
  }

  const imageUrls = images.map(imageEntry => {
    if (typeof imageEntry === 'string') {
      return imageEntry;
    }
    if (imageEntry && typeof imageEntry.url === 'string') {
      return imageEntry.url;
    }
    throw new Error('Unexpected image reference returned by Fal.ai Crystal Upscaler.');
  });

  emitFalPhase(options, CRYSTAL_UPSCALER_MODEL_ID, {
    phase: 'downloading',
    message: 'Downloading generated image...',
    requestId: result?.requestId || latestRequestId,
  });
  const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
  const base64List = await runFalDownloadStep(downloadRequestId, async () => {
    const inlineDataList = await Promise.all(imageUrls.map(url => extractInlineData(url))); // Convert URLs to data URIs.
    return inlineDataList.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Failed to extract image data from Fal.ai Crystal Upscaler response.');
      }
      return base64;
    });
  });

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract primary image data from Fal.ai Crystal Upscaler response.');
  }

  const requestId = result?.requestId || latestRequestId; // Prefer server request id.

  return {
    imageBase64: primaryBase64,
    imagesBase64: base64List,
    text: '',
    requestId,
  };
};

export const upscaleSeedvrImage = async (
  image: HTMLImageElement,
  scaleFactor: number,
  noiseScale: number,
  options: UpscaleImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => { // Upscale with SeedVR2.
  ensureFalClientConfigured(); // Ensure SDK is configured before requests.

  const imageUrl = await uploadImageElementToFal(image, options); // Upload source image first.
  const sanitizedScale = Number.isFinite(scaleFactor) ? Math.round(scaleFactor) : 2; // Snap scale to integer.
  const normalizedScale = Math.min(10, Math.max(1, sanitizedScale)); // Clamp scale to API range.
  const sanitizedNoise = Number.isFinite(noiseScale) ? noiseScale : 0.1; // Default noise when invalid.
  const roundedNoise = Math.round(sanitizedNoise * 10) / 10; // Round to 0.1 steps.
  const normalizedNoise = Math.min(1, Math.max(0.1, roundedNoise)); // Clamp noise to API range.
  const seedValue = createRandomSeed(); // Create deterministic seed value.

  let latestRequestId: string | undefined; // Track latest queue request id.

  const inputPayload = { // Payload for SeedVR2 upscale.
    image_url: imageUrl,
    upscale_mode: 'factor',
    upscale_factor: normalizedScale,
    noise_scale: normalizedNoise,
    output_format: 'png' as const,
    seed: seedValue,
  };

  emitFalPhase(options, SEEDVR_UPSCALER_MODEL_ID, { phase: 'submitting', message: 'Submitting to Fal...' });
  logFalEvent('outbound', SEEDVR_UPSCALER_MODEL_ID, 'Outbound request (fal.subscribe)', {
    input: inputPayload,
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(SEEDVR_UPSCALER_MODEL_ID, {
      input: inputPayload,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        emitFalPhase(options, SEEDVR_UPSCALER_MODEL_ID, {
          phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
          message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
          requestId: resolvedRequestId,
        });
        logFalEvent('inbound', SEEDVR_UPSCALER_MODEL_ID, 'Queue update', {
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
    logFalEvent('error', SEEDVR_UPSCALER_MODEL_ID, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
  }

  logFalEvent('inbound', SEEDVR_UPSCALER_MODEL_ID, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { image?: string | { url?: string } } | undefined; // Normalize response payload.
  const imageEntry = data?.image;
  if (!imageEntry) {
    throw new Error('SeedVR2 Upscaler did not return an image.');
  }

  const upscaledUrl = typeof imageEntry === 'string' // Accept string or { url } payloads.
    ? imageEntry
    : typeof imageEntry.url === 'string'
      ? imageEntry.url
      : null;

  if (!upscaledUrl) {
    throw new Error('Unexpected image reference returned by SeedVR2 Upscaler.');
  }

  emitFalPhase(options, SEEDVR_UPSCALER_MODEL_ID, {
    phase: 'downloading',
    message: 'Downloading generated image...',
    requestId: result?.requestId || latestRequestId,
  });
  const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
  const base64 = await runFalDownloadStep(downloadRequestId, async () => {
    const inlineData = await extractInlineData(upscaledUrl);
    const extractedBase64 = inlineData.split(',')[1];
    if (!extractedBase64) {
      throw new Error('Failed to extract image data from SeedVR2 Upscaler response.');
    }
    return extractedBase64;
  });

  const requestId = result?.requestId || latestRequestId; // Prefer server request id.

  return {
    imageBase64: base64,
    imagesBase64: [base64],
    text: '',
    requestId,
  };
};
