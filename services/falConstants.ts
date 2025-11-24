const SUPPRESSED_MESSAGES = [
  '[WARNING] No request provided, using global lifecycle preference',
] as const;

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

export const buildFalDisplayError = (message?: string, logMessages?: string[]): string | undefined => {
  const candidates = [
    ...(typeof message === 'string' ? [message] : []),
    ...(logMessages ?? []),
  ].map(entry => entry?.trim()).filter(Boolean) as string[];

  if (candidates.some(entry => hasKeywordMatch(entry, SERVER_BUSY_KEYWORDS))) {
    return 'The generation servers are busy on the provider side. Please try again shortly.';
  }

  if (candidates.some(entry => hasKeywordMatch(entry, TIMEOUT_KEYWORDS))) {
    return 'The generation server is responding slowly on the provider side. Please try again in a moment.';
  }

  if (candidates.some(entry => hasKeywordMatch(entry, NETWORK_ERROR_KEYWORDS))) {
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
