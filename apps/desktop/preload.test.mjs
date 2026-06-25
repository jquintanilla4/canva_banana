import { createRequire } from 'node:module';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const originalLoad = Module._load;
const originalArgv = [...process.argv];

let exposedApi = null;

const loadPreloadWithElectron = (electronMock) => {
  Module._load = (request, parent, isMain) => (
    request === 'electron' ? electronMock : originalLoad.call(Module, request, parent, isMain)
  );
  delete require.cache[preloadPath];
  require(preloadPath);
};

afterEach(() => {
  Module._load = originalLoad;
  process.argv = [...originalArgv];
  delete require.cache[preloadPath];
  exposedApi = null;
  vi.restoreAllMocks();
});

describe('preload desktop bridge', () => {
  it('exposes onOpenManageKeys and removes the IPC listener on cleanup', () => {
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: vi.fn((_name, api) => {
        exposedApi = api; // Capture the safe bridge API exposed to React.
      }),
    };

    loadPreloadWithElectron({ contextBridge, ipcRenderer });

    const callback = vi.fn();
    const unsubscribe = exposedApi.onOpenManageKeys(callback);
    const [channel, handler] = ipcRenderer.on.mock.calls[0];

    expect(channel).toBe('canva-banana:open-manage-keys');

    handler();
    unsubscribe();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('canva-banana:open-manage-keys', handler);
  });

  it('keeps secret runtime values out of the launch-argument fallback', () => {
    const runtimeConfigArgument = Buffer.from(JSON.stringify({
      isDesktop: true,
      apiKey: 'leaked-gemini-key',
      geminiApiKey: 'leaked-gemini-key',
      secureBackendApiBaseUrl: 'http://localhost:9876',
      secureBackendMode: 'external',
      secureBackendAuthToken: 'leaked-desktop-token',
      pythonBackendAuthToken: 'leaked-python-token',
      pythonBackendAuthOrigin: 'http://localhost:8000',
    }), 'utf8').toString('base64');
    process.argv = [...originalArgv, `--canva-banana-runtime-config=${runtimeConfigArgument}`]; // Simulate Electron additionalArguments.

    const ipcRenderer = {
      sendSync: vi.fn(() => undefined),
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: vi.fn((_name, api) => {
        exposedApi = api; // Capture the safe bridge API exposed to React.
      }),
    };

    loadPreloadWithElectron({ contextBridge, ipcRenderer });

    expect(exposedApi.getRuntimeConfig()).toMatchObject({
      isDesktop: true,
      secureBackendApiBaseUrl: 'http://localhost:9876',
      secureBackendMode: 'external',
    });
    expect(exposedApi.getRuntimeConfig().apiKey).toBeUndefined();
    expect(exposedApi.getRuntimeConfig().geminiApiKey).toBeUndefined();
    expect(exposedApi.getRuntimeConfig().secureBackendAuthToken).toBeUndefined();
    expect(exposedApi.getRuntimeConfig().pythonBackendAuthToken).toBeUndefined();
    expect(exposedApi.getRuntimeConfig().pythonBackendAuthOrigin).toBeUndefined();
  });
});
