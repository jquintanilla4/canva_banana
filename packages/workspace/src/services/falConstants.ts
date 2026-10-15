const SUPPRESSED_MESSAGES = [
  '[WARNING] No request provided, using global lifecycle preference',
] as const;

// Normalize noisy Fal responses into actionable, user-friendly strings.
export const SUPPRESSED_FAL_LOG_MESSAGE_SET = new Set<string>(SUPPRESSED_MESSAGES);
const SERVER_BUSY_KEYWORDS = [
  'server busy',
  'server is busy',
  'service is busy',
  'overloaded',
  'overload',
  'at capacity',
  'capacity',
  'temporarily unavailable',
  'service unavailable',
  'too many requests',
  'please try again later',
  'queue is full',
];
const TIMEOUT_KEYWORDS = [
  '408',
  'request timeout',
  'timeout',
  'timed out',
  'time out',
  '504',
  'gateway timeout',
  'deadline exceeded',
  'etimedout',
  'request took too long',
];
const NETWORK_ERROR_KEYWORDS = [
  'failed to fetch',
  'network error',
  'networkerror',
  'fetch failed',
  'connection refused',
  'connection reset',
  'econnrefused',
  'enetunreach',
  'enotfound',
  'offline',
];
const FILE_SIZE_ERROR_REGEX = /file size exceeds the maximum allowed size of\s+(\d+)\s+bytes/i;
const FILE_SIZE_HINT_REGEX = /file size exceeds/i;

const IMAGE_URL_MARKER = 'image_url=';
const SCALE_FACTOR_REGEX = /scale_factor\s*=\s*([0-9]+(?:\.[0-9]+)?)/i;

export interface FalLogFormattingResult {
  displayMessage: string | null;
  debugMessage?: string;
}

export const FAL_PROVIDER_DOWN_MESSAGE =
  'The provider servers are currently unavailable. Please try again shortly.';

const hasKeywordMatch = (message: string, keywords: string[]): boolean => {
  const normalized = message.toLowerCase();
  return keywords.some(keyword => normalized.includes(keyword));
};

export type FalDisplayErrorPhase = 'uploading' | 'submitting' | 'queued' | 'processing' | 'downloading' | 'completed' | 'failed'; // Error phase labels.

interface FalDisplayErrorOptions {
  phase?: FalDisplayErrorPhase; // Phase that produced the error.
  hasRequestId?: boolean; // True once Fal has accepted a queued request.
}

const formatFileSizeLimit = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  const mbValue = bytes / (1024 * 1024);
  const rounded = Math.round(mbValue * 10) / 10;
  if (rounded >= 1) {
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
};

export const getFalFileSizeErrorMessage = (message?: string, logMessages?: string[]): string | undefined => {
  const candidates = [
    ...(typeof message === 'string' ? [message] : []),
    ...(logMessages ?? []),
  ].map(entry => entry?.trim()).filter(Boolean) as string[];

  for (const candidate of candidates) {
    const match = candidate.match(FILE_SIZE_ERROR_REGEX);
    if (match) {
      const limitBytes = Number(match[1]);
      const limitLabel = Number.isFinite(limitBytes) ? formatFileSizeLimit(limitBytes) : '';
      const limitSuffix = limitLabel ? ` (${limitLabel} max)` : '';
      return `File size exceeds the maximum allowed size${limitSuffix}. Please upload a smaller image.`;
    }
    if (FILE_SIZE_HINT_REGEX.test(candidate)) {
      return candidate;
    }
  }

  return undefined;
};

export const buildFalDisplayError = (
  message?: string,
  logMessages?: string[],
  options: FalDisplayErrorOptions = {},
): string | undefined => {
  const candidates = [
    ...(typeof message === 'string' ? [message] : []),
    ...(logMessages ?? []),
  ].map(entry => entry?.trim()).filter(Boolean) as string[];

  const fileSizeMessage = getFalFileSizeErrorMessage(message, logMessages);
  if (fileSizeMessage) {
    return fileSizeMessage;
  }

  if (candidates.some(entry => hasKeywordMatch(entry, SERVER_BUSY_KEYWORDS))) {
    return 'The generation servers are busy on the provider side. Please try again shortly.';
  }

  const hasTimeout = candidates.some(entry => hasKeywordMatch(entry, TIMEOUT_KEYWORDS));
  const hasNetworkError = candidates.some(entry => hasKeywordMatch(entry, NETWORK_ERROR_KEYWORDS));

  if (options.phase === 'uploading' && (hasTimeout || hasNetworkError)) {
    return 'Upload to Fal storage is taking too long. Check your upload connection or try smaller media.';
  }

  if (options.phase === 'submitting' && hasTimeout && !options.hasRequestId) {
    return 'Fal did not return queue status before timing out. Please try again in a moment.';
  }

  if (hasTimeout) {
    return 'The generation server is responding slowly on the provider side. Please try again in a moment.';
  }

  if (hasNetworkError) {
    return 'We could not reach the generation servers (network/provider). Please check your connection and try again.';
  }

  return message?.trim() || undefined;
};

export const formatFalLogMessage = (message: string): FalLogFormattingResult => {
  const trimmed = message.trim();

  if (SUPPRESSED_FAL_LOG_MESSAGE_SET.has(trimmed)) {
    return {
      displayMessage: null,
      debugMessage: trimmed,
    };
  }

  if (trimmed.toLowerCase().includes(IMAGE_URL_MARKER)) {
    const scaleMatch = trimmed.match(SCALE_FACTOR_REGEX);
    const scaleSuffix = scaleMatch ? ` (${scaleMatch[1]}x)` : '';
    return {
      displayMessage: `Uploading image for upscale${scaleSuffix}...`,
      debugMessage: trimmed,
    };
  }

  return {
    displayMessage: trimmed,
  };
};

export const isSuppressedFalLogMessage = (message: string | undefined | null): boolean => {
  if (!message) {
    return false;
  }
  return formatFalLogMessage(message).displayMessage === null;
};
