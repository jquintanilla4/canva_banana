import { getWorkspaceSignal, workspaceFetch } from '../workspaceSession';
import { fal } from '@fal-ai/client'; // Fal SDK client.
import { getFalProxyUrl, getSecureBackendAuthHeadersForUrl } from '../secureBackendService'; // Secure Node proxy helpers.

let configuredSignal: AbortSignal | undefined;
let configuredProxyUrl: string | null = null; // Remember the last secure proxy URL.

const secureBackendFetch: typeof fetch = (input, init) => {
  const requestUrl = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  const authHeaders = getSecureBackendAuthHeadersForUrl(requestUrl); // Attach desktop auth only to the managed backend.
  if (Object.keys(authHeaders).length === 0) {
    return workspaceFetch(input, init); // Browser dev and custom proxies keep default transport.
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  for (const [name, value] of Object.entries(authHeaders)) {
    headers.set(name, value); // Preserve existing SDK headers while adding the desktop nonce.
  }
  return workspaceFetch(input, { ...init, headers });
};

export const ensureFalClientConfigured = () => { // Configure Fal client for the active proxy URL.
  const proxyUrl = getFalProxyUrl(); // Runtime config can change after desktop service restarts.
  const signal = getWorkspaceSignal();
  if (configuredProxyUrl !== proxyUrl || configuredSignal !== signal) {
    fal.config({
      credentials: undefined, // Keep the Fal key out of browser bundles.
      fetch: (input, init) => {
        signal?.throwIfAborted();
        const requestSignal = init?.signal;
        return secureBackendFetch(input, { ...init, signal: signal && requestSignal ? AbortSignal.any([signal, requestSignal]) : signal ?? requestSignal });
      },
      proxyUrl,
      suppressLocalCredentialsWarning: true,
    });
    configuredSignal = signal;
    configuredProxyUrl = proxyUrl; // Skip repeated SDK config for the same backend.
  }
};
