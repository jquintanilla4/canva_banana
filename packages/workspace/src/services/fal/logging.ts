import { addDebugLog } from '../debugLog'; // Central debug log sink.

type FalLogDirection = 'outbound' | 'inbound' | 'info' | 'error'; // Allowed log directions.

export const sanitizeBase64Urls = (value: unknown): unknown => { // Mask large/base64 payloads.
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      return '[See fal dashboard for base64 url string]';
    }
    const trimmed = value.trim();
    if (trimmed.length > 500 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      return '[See fal dashboard for base64 url string]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeBase64Urls);
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeBase64Urls(v);
    }
    return result;
  }
  return value;
};

export const logFalEvent = (
  direction: FalLogDirection,
  endpointId: string,
  message: string,
  payload?: Record<string, unknown>,
) => { // Emit debug logs for Fal traffic.
  addDebugLog({
    direction,
    source: 'fal',
    title: endpointId,
    message,
    data: sanitizeBase64Urls(payload) as Record<string, unknown> | undefined,
  });
};
