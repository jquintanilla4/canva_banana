import type { FalQueueLogs, FalQueueUpdate } from './types'; // Fal queue types.

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
