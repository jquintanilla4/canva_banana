import type { FalQueueUpdate } from './falService';
import type { FalJobStatus, FalQueueJob } from '../types';
import { buildFalDisplayError, FAL_PROVIDER_DOWN_MESSAGE, formatFalLogMessage } from './falConstants';
import { addDebugLog } from './debugLog';

export const mapFalStatusToJobStatus = (status: FalQueueUpdate['status'] | undefined): FalJobStatus => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'FAILED';
    default:
      return 'IN_QUEUE';
  }
};

export const mergeFalLogMessages = (existing: string[], incoming?: string[] | string): string[] => {
  if (!incoming) {
    return existing;
  }
  const incomingMessages: string[] = Array.isArray(incoming) ? incoming : [incoming];
  const next = [...existing];
  incomingMessages.forEach(raw => {
    const rawMessage = raw.trim();
    if (!rawMessage) {
      return;
    }
    const { displayMessage, debugMessage } = formatFalLogMessage(rawMessage);
    if (debugMessage) {
      const title = displayMessage ? 'Queue log (sanitized)' : 'Queue log (suppressed)';
      addDebugLog({
        direction: 'info',
        source: 'fal',
        title,
        message: debugMessage,
      });
    }
    if (!displayMessage) {
      return;
    }
    if (!next.includes(displayMessage)) {
      next.push(displayMessage);
    }
  });
  return next;
};

export const applyFalQueueUpdateToJob = (job: FalQueueJob, update: FalQueueUpdate): FalQueueJob => {
  const status = mapFalStatusToJobStatus(update.status);
  const normalizedLogs = (() => {
    const raw = update.logs;
    if (!raw) return undefined;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      const messages = raw
        .map(entry => typeof entry === 'string' ? entry : entry?.message ?? '')
        .filter(Boolean);
      return messages.length ? messages : undefined;
    }
    if (typeof raw === 'object') {
      const messages = Object.values(raw)
        .map(value => {
          if (typeof value === 'string') return value;
          if (value && typeof value === 'object' && 'message' in value && typeof (value as { message?: unknown }).message === 'string') {
            return (value as { message?: string }).message as string;
          }
          return '';
        })
        .filter(Boolean);
      return messages.length ? messages : undefined;
    }
    return undefined;
  })();
  const mergedLogs = mergeFalLogMessages(job.logs, normalizedLogs);
  const updateMessage = typeof (update as { message?: unknown }).message === 'string'
    ? (update as { message?: string }).message
    : undefined;
  const error = status === 'FAILED'
    ? buildFalDisplayError(updateMessage ?? job.error, mergedLogs)
    ?? job.error
    ?? FAL_PROVIDER_DOWN_MESSAGE
    : job.error;

  return {
    ...job,
    status,
    requestId: update.requestId || job.requestId,
    logs: mergedLogs,
    error,
    updatedAt: Date.now(),
  };
};
