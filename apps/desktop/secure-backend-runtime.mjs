export const EXTERNAL_SECURE_BACKEND_FLAG = 'CANVA_BANANA_ALLOW_EXTERNAL_SECURE_BACKEND';
export const EXTERNAL_SECURE_BACKEND_AUTH_TOKEN = 'CANVA_BANANA_EXTERNAL_SECURE_BACKEND_AUTH_TOKEN';

export const normalizeOptionalBaseUrl = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined; // Runtime URL builders expect no trailing slash.
};

export const isEnabledFlag = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ['1', 'true', 'yes', 'on'].includes(normalized); // Accept common env flag spellings.
};

export const shouldUseExternalSecureBackend = ({ isPackaged, hasDevRenderer, env }) => (
  isPackaged
  && !hasDevRenderer
  && Boolean(normalizeOptionalBaseUrl(env.SECURE_BACKEND_API_BASE_URL))
  && isEnabledFlag(env[EXTERNAL_SECURE_BACKEND_FLAG])
); // Packaged QA overrides must be explicit so normal launches stay managed.

export const resolveSecureBackendRuntime = ({
  isPackaged,
  hasDevRenderer,
  env,
  managedUrl,
  desktopAuthToken,
}) => {
  const configuredUrl = normalizeOptionalBaseUrl(env.SECURE_BACKEND_API_BASE_URL);
  if (hasDevRenderer) {
    return {
      mode: 'devExternal',
      url: configuredUrl || 'http://localhost:8787',
      urlSource: configuredUrl ? 'env' : 'default',
      authToken: undefined,
      authTokenActive: false,
    }; // Dev Electron talks to services started by the dev script.
  }
  if (shouldUseExternalSecureBackend({ isPackaged, hasDevRenderer, env })) {
    const externalAuthToken = typeof env[EXTERNAL_SECURE_BACKEND_AUTH_TOKEN] === 'string'
      ? env[EXTERNAL_SECURE_BACKEND_AUTH_TOKEN].trim()
      : '';
    return {
      mode: 'external',
      url: configuredUrl,
      urlSource: 'env',
      authToken: externalAuthToken || undefined,
      authTokenActive: Boolean(externalAuthToken),
    }; // QA external backends use an explicit shared token, never the managed random token.
  }
  return {
    mode: 'managed',
    url: normalizeOptionalBaseUrl(managedUrl) || 'http://localhost:8787',
    urlSource: configuredUrl && isPackaged ? 'ignoredEnv' : 'managed',
    authToken: desktopAuthToken,
    authTokenActive: Boolean(desktopAuthToken),
  }; // Packaged desktop defaults to the backend it launched itself.
};
