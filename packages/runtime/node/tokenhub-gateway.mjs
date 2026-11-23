export const DEFAULT_TOKENHUB_BASE_URL = 'https://tokenhub.ctclouds.com/v1';

export class TokenHubImageError extends Error {
  constructor(message, { status = 502, code = null, requestID = null } = {}) {
    super(message);
    this.name = 'TokenHubImageError';
    this.status = status;
    this.code = code;
    this.requestID = requestID;
  }
}

export const normalizeTokenHubBaseURL = (value = DEFAULT_TOKENHUB_BASE_URL) => {
  const url = URL.parse(value.trim());
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TokenHubImageError('TOKENHUB_BASE_URL must be an HTTP API base URL.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/v1'}`;
};

const containsMarkup = value => typeof value === 'string' && /<\s*[!/?a-z]/i.test(value);

export const safeTokenHubProviderText = (value, apiKey) => {
  if (typeof value !== 'string' || containsMarkup(value)) return null;
  const redacted = apiKey ? value.replaceAll(apiKey, '[redacted]') : value;
  return redacted.replace(/\bBearer\s+[\w.+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ').trim().slice(0, 500) || null;
};

export const normalizeTokenHubProviderError = ({
  apiKey, status, message, code, requestID, rawBody,
}) => {
  const errorStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
  const safeMessage = safeTokenHubProviderText(message, apiKey)
    ?? (containsMarkup(message) || /<!doctype\s+html|<html[\s>]/i.test(rawBody ?? '')
      ? `TokenHub gateway returned HTTP ${errorStatus}. The provider did not return an image; try again or check TokenHub model availability.`
      : `TokenHub image request failed with HTTP ${errorStatus}.`);
  return new TokenHubImageError(safeMessage, {
    status: errorStatus,
    code: safeTokenHubProviderText(code, apiKey),
    requestID: safeTokenHubProviderText(requestID, apiKey),
  });
};
