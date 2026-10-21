import { getRuntimeConfig } from './runtimeConfig';

const DEFAULT_SECURE_BACKEND_API_BASE_URL = 'http://localhost:8787'; // Local Node backend default.
export const DESKTOP_AUTH_TOKEN_HEADER = 'x-canva-banana-desktop-token'; // Server checks this on desktop-origin requests.

const normalizeOptionalRuntimeUrl = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== 'undefined' && trimmed !== 'null' ? trimmed : undefined; // Vite may expose missing env as strings.
};

const isSecureBackendUrl = (url: string): boolean => {
  const targetOrigin = new URL(url).origin;
  const backendOrigin = new URL(getSecureBackendApiBaseUrl()).origin;
  return targetOrigin === backendOrigin; // Desktop auth tokens are scoped to the managed backend only.
};

export const getSecureBackendApiBaseUrl = (): string => {
  const raw = normalizeOptionalRuntimeUrl(getRuntimeConfig().secureBackendApiBaseUrl) || DEFAULT_SECURE_BACKEND_API_BASE_URL; // Browser-safe backend URL.
  return raw.replace(/\/+$/, ''); // Avoid double slashes when building paths.
};

export const getFalProxyUrl = (): string => {
  const raw = normalizeOptionalRuntimeUrl(getRuntimeConfig().falApiUrl); // Optional override for Fal SDK proxy endpoint.
  return raw || `${getSecureBackendApiBaseUrl()}/api/fal/proxy`; // Default to local secure proxy.
};

export const getFalAssetFetchUrl = (url: string): string => (
  `${getSecureBackendApiBaseUrl()}/api/fal/fetch-asset?url=${encodeURIComponent(url)}` // Keep Fal auth server-side.
);

export const getSecureBackendAuthHeaders = (): Record<string, string> => {
  const token = getRuntimeConfig().secureBackendAuthToken?.trim();
  return token ? { [DESKTOP_AUTH_TOKEN_HEADER]: token } : {}; // Browser dev origins do not need a desktop token.
};

export const getSecureBackendAuthHeadersForUrl = (url: string): Record<string, string> => {
  try {
    return isSecureBackendUrl(url) ? getSecureBackendAuthHeaders() : {}; // Never send desktop tokens to custom proxy origins.
  } catch {
    return {}; // Invalid custom URLs should not receive auth headers.
  }
};
