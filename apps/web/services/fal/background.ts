import { fal } from '@fal-ai/client'; // Fal SDK client.
import type { FalQueueUpdate, RemoveBackgroundOptions } from './types'; // Fal request types.
import { ensureFalClientConfigured } from './client'; // Client configuration helper.
import { FalPhaseError } from './errors'; // Phase-aware error wrapper.
import { normalizeQueueLogs, resolveQueueRequestId } from './queue'; // Queue normalizers.
import { logFalEvent } from './logging'; // Fal debug logging.
import { emitFalPhase } from './phase'; // Phase update helper.
import { uploadImageElementToFal } from './media'; // Media upload helper.
import { extractInlineData, runFalDownloadStep } from './responses'; // Response parsing helper.

export const removeBackground = async (
  image: HTMLImageElement,
  options: RemoveBackgroundOptions = {},
): Promise<{ imageBase64: string; requestId?: string }> => { // Remove background from an image.
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image, options);

  let latestRequestId: string | undefined;

  const backgroundModelId = 'fal-ai/bria/background/remove';
  emitFalPhase(options, backgroundModelId, { phase: 'submitting', message: 'Submitting to Fal...' });
  logFalEvent('outbound', backgroundModelId, 'Outbound request (fal.subscribe)', {
    input: {
      image_url: imageUrl,
      sync_mode: true,
    },
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(backgroundModelId, {
      input: {
        image_url: imageUrl,
        sync_mode: true,
      },
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        emitFalPhase(options, backgroundModelId, {
          phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
          message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
          requestId: resolvedRequestId,
        });
        logFalEvent('inbound', backgroundModelId, 'Queue update', {
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
    logFalEvent('error', backgroundModelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new FalPhaseError(latestRequestId ? 'processing' : 'submitting', error, latestRequestId);
  }

  logFalEvent('inbound', backgroundModelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { image?: { url?: string } } | undefined;
  const outputUrl = data?.image?.url;
  if (!outputUrl) {
    throw new Error('Fal.ai background removal API did not return an image.');
  }

  emitFalPhase(options, backgroundModelId, {
    phase: 'downloading',
    message: 'Downloading generated image...',
    requestId: result?.requestId || latestRequestId,
  });
  const downloadRequestId = result?.requestId || latestRequestId; // Keep request id on download failures.
  const base64 = await runFalDownloadStep(downloadRequestId, async () => {
    const inlineData = await extractInlineData(outputUrl);
    const extractedBase64 = inlineData.split(',')[1];
    if (!extractedBase64) {
      throw new Error('Failed to extract image data from background removal response.');
    }
    return extractedBase64;
  });

  const requestId = result?.requestId || latestRequestId;

  return { imageBase64: base64, requestId };
};
