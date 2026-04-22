const DEFAULT_SECURE_BACKEND_API_BASE_URL = 'http://localhost:8787'; // Local Node backend default.

export const getSecureBackendApiBaseUrl = (): string => {
  const raw = process.env.SECURE_BACKEND_API_BASE_URL?.trim() || DEFAULT_SECURE_BACKEND_API_BASE_URL; // Browser-safe backend URL.
  return raw.replace(/\/+$/, ''); // Avoid double slashes when building paths.
};

export const getFalProxyUrl = (): string => {
  const raw = process.env.FAL_API_URL?.trim(); // Optional override for Fal SDK proxy endpoint.
  return raw || `${getSecureBackendApiBaseUrl()}/api/fal/proxy`; // Default to local secure proxy.
};

export const getFalAssetFetchUrl = (url: string): string => (
  `${getSecureBackendApiBaseUrl()}/api/fal/fetch-asset?url=${encodeURIComponent(url)}` // Keep Fal auth server-side.
);
