import { fal } from '@fal-ai/client';
import { FalPhaseError } from './errors';
import { logFalEvent } from './logging';
import { emitFalPhase } from './phase';
import type { FalQueueLogs, FalQueueUpdate, GenerateImageOptions } from './types';

export const normalizeQueueLogs = (logs: FalQueueLogs): Array<{ message?: string }> => { // Normalize log payloads.
  if (!logs) {
    return [];
  }
  if (Array.isArray(logs)) {
    return logs
      .map(entry => {
        if (typeof entry === 'string') {
          return { message: entry };
        }
        if (entry && typeof entry === 'object') {
          const message = (entry as { message?: unknown }).message;
          return typeof message === 'string' ? { message } : entry as { message?: string };
        }
        return null;
      })
      .filter(Boolean) as Array<{ message?: string }>;
  }
  if (typeof logs === 'object') {
    return Object.values(logs)
      .flatMap(value => normalizeQueueLogs(value as FalQueueLogs));
  }
  if (typeof logs === 'string') {
    return [{ message: logs }];
  }
  return [];
};

export const resolveQueueRequestId = (update: FalQueueUpdate, fallback?: string): string | undefined => { // Prefer explicit request IDs.
  const requestId = typeof update.requestId === 'string'
    ? update.requestId
    : typeof (update as { request_id?: unknown }).request_id === 'string'
      ? (update as { request_id?: string }).request_id
      : undefined;
  return requestId || fallback;
};

export const subscribeFalImage = async (
  modelId: string,
  input: Record<string, unknown>,
  options: Pick<GenerateImageOptions, 'abortSignal' | 'jobId' | 'onPhaseUpdate' | 'onQueueUpdate'>,
) => {
  let latestRequestId: string | undefined;
  emitFalPhase(options, modelId, { phase: 'submitting', message: 'Submitting to Fal...' });
  options.abortSignal?.throwIfAborted();
  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', { input });
  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    options.abortSignal?.throwIfAborted();
    result = await fal.subscribe(modelId, {
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      input,
      logs: true,
      onQueueUpdate: update => {
        if (options.abortSignal?.aborted) return;
        const queueUpdate: FalQueueUpdate = { ...update };
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const requestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (requestId) latestRequestId = requestId;
        emitFalPhase(options, modelId, {
          phase: queueUpdate.status === 'IN_PROGRESS' ? 'processing' : 'queued',
          message: queueUpdate.status === 'IN_PROGRESS' ? 'Processing on provider...' : 'Waiting in Fal queue...',
          requestId,
        });
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({ ...queueUpdate, requestId: requestId || '', logs: normalizedLogs });
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
  const requestId = result?.requestId || latestRequestId;
  logFalEvent('inbound', modelId, 'Result received', { requestId, data: result?.data ?? undefined });
  return { ...result, requestId };
};
