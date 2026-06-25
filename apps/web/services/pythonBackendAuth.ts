import { getRuntimeConfig } from './runtimeConfig';

export const PYTHON_BACKEND_DESKTOP_AUTH_TOKEN_HEADER = 'X-Canva-Banana-Desktop-Token'; // Python backend checks this nonce for desktop file origins.

const getOrigin = (value: string | undefined): string | undefined => {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    return undefined; // Fail closed when a configured backend URL is malformed.
  }
};

export const getPythonBackendAuthHeadersForUrl = (url: string): Record<string, string> => {
  const runtimeConfig = getRuntimeConfig();
  const token = runtimeConfig.pythonBackendAuthToken?.trim();
  const authOrigin = getOrigin(runtimeConfig.pythonBackendAuthOrigin);
  const targetOrigin = getOrigin(url);
  return token && authOrigin && targetOrigin === authOrigin
    ? { [PYTHON_BACKEND_DESKTOP_AUTH_TOKEN_HEADER]: token }
    : {}; // Managed desktop nonces are sent only to the backend origin Electron launched.
};
