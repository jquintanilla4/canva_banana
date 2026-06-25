import { afterEach, describe, expect, it, vi } from 'vitest';

const falConfig = vi.fn(); // Capture SDK configuration calls.
const getSecureBackendAuthHeadersForUrl = vi.fn<(url: string) => Record<string, string>>(() => ({})); // Mutable auth-header hook for fetch wrapper tests.
let proxyUrl = 'http://localhost:8787/api/fal/proxy'; // Mutable runtime proxy for tests.

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: falConfig, // Fal SDK config entry point.
  },
}));

vi.mock('../secureBackendService', () => ({
  getFalProxyUrl: () => proxyUrl, // Simulate runtime config changing after restart.
  getSecureBackendAuthHeadersForUrl: (url: string) => getSecureBackendAuthHeadersForUrl(url), // Simulate origin-scoped auth.
}));

const loadClient = async () => {
  vi.resetModules(); // Reset module-scoped configuredProxyUrl.
  return import('../fal/client');
};

describe('fal client configuration', () => {
  afterEach(() => {
    proxyUrl = 'http://localhost:8787/api/fal/proxy'; // Restore default proxy.
    falConfig.mockClear(); // Keep call counts isolated.
    getSecureBackendAuthHeadersForUrl.mockReset(); // Keep fetch auth behavior isolated.
    getSecureBackendAuthHeadersForUrl.mockReturnValue({});
  });

  it('configures the SDK once for a stable proxy URL', async () => {
    const { ensureFalClientConfigured } = await loadClient();

    ensureFalClientConfigured();
    ensureFalClientConfigured();

    expect(falConfig).toHaveBeenCalledTimes(1);
    expect(falConfig).toHaveBeenCalledWith(expect.objectContaining({
      proxyUrl: 'http://localhost:8787/api/fal/proxy',
    }));
  });

  it('reconfigures the SDK when the proxy URL changes', async () => {
    const { ensureFalClientConfigured } = await loadClient();

    ensureFalClientConfigured();
    proxyUrl = 'http://localhost:9876/api/fal/proxy';
    ensureFalClientConfigured();

    expect(falConfig).toHaveBeenCalledTimes(2);
    expect(falConfig).toHaveBeenLastCalledWith(expect.objectContaining({
      proxyUrl: 'http://localhost:9876/api/fal/proxy',
    }));
  });

  it('adds desktop auth headers through the SDK fetch wrapper', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    getSecureBackendAuthHeadersForUrl.mockReturnValue({ 'x-canva-banana-desktop-token': 'secret' });
    const { ensureFalClientConfigured } = await loadClient();

    ensureFalClientConfigured();
    const config = falConfig.mock.calls[0]?.[0] as { fetch: typeof fetch };
    await config.fetch('http://localhost:8787/api/fal/proxy', {
      headers: { 'x-fal-target-url': 'https://queue.fal.run/fal-ai/example' },
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-fal-target-url')).toBe('https://queue.fal.run/fal-ai/example');
    expect(headers.get('x-canva-banana-desktop-token')).toBe('secret');
    fetchMock.mockRestore();
  });
});
