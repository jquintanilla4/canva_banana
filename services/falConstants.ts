const SUPPRESSED_MESSAGES = [
  '[WARNING] No request provided, using global lifecycle preference',
] as const;

export const SUPPRESSED_FAL_LOG_MESSAGE_SET = new Set<string>(SUPPRESSED_MESSAGES);

const IMAGE_URL_MARKER = 'image_url=';
const SCALE_FACTOR_REGEX = /scale_factor\s*=\s*([0-9]+(?:\.[0-9]+)?)/i;

export interface FalLogFormattingResult {
  displayMessage: string | null;
  debugMessage?: string;
}

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
