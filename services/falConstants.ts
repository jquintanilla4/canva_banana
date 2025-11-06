const SUPPRESSED_MESSAGES = [
  '[WARNING] No request provided, using global lifecycle preference',
] as const;

export const SUPPRESSED_FAL_LOG_MESSAGE_SET = new Set<string>(SUPPRESSED_MESSAGES);

export const isSuppressedFalLogMessage = (message: string | undefined | null): boolean => {
  if (!message) {
    return false;
  }
  return SUPPRESSED_FAL_LOG_MESSAGE_SET.has(message);
};
