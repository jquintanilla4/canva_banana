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

  it('exposes file menu bridge commands and IPC helpers', async () => {
    const openSnapshotResult = { canceled: true };
    const saveSnapshotResult = { canceled: false, fileName: 'snapshot.bcsnap', autosaveId: 'autosave-1' };
    const writeSnapshotResult = { saved: true };
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(async (channel) => {
        switch (channel) {
          case 'canva-banana:file-menu-set-state':
            return true; // Main only acknowledges the native menu state sync.
          case 'canva-banana:file-menu-open-snapshot':
            return openSnapshotResult; // Open picker returns cancel/data metadata.
          case 'canva-banana:file-menu-save-snapshot':
            return saveSnapshotResult; // Save picker returns the autosave target metadata.
          case 'canva-banana:file-menu-write-snapshot':
            return writeSnapshotResult; // Autosave writes return a simple success flag.
          default:
            throw new Error(`Unexpected IPC invoke channel: ${channel}`);
        }
      }),
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
    const unsubscribe = exposedApi.fileMenu.onCommand(callback);
    const [channel, handler] = ipcRenderer.on.mock.calls[0];

    expect(channel).toBe('canva-banana:file-menu-command');

    handler(null, 'exportSnapshot');
    unsubscribe();

    expect(callback).toHaveBeenCalledWith('exportSnapshot');
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('canva-banana:file-menu-command', handler);

    await expect(exposedApi.fileMenu.setState({
      autosaveEnabled: false,
      showZoomLevelBadge: true,
      isClearingJimengCache: false,
    })).resolves.toBe(true);
    await expect(exposedApi.fileMenu.openSnapshotFile()).resolves.toBe(openSnapshotResult);
    await expect(exposedApi.fileMenu.saveSnapshotFile({
      suggestedName: 'snapshot.bcsnap',
      data: new ArrayBuffer(0),
    })).resolves.toBe(saveSnapshotResult);
    await expect(exposedApi.fileMenu.writeSnapshotFile({
      autosaveId: 'autosave-1',
      data: new ArrayBuffer(0),
    })).resolves.toBe(writeSnapshotResult);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-set-state', {
      autosaveEnabled: false,
      showZoomLevelBadge: true,
      isClearingJimengCache: false,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-open-snapshot');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-save-snapshot', {
      suggestedName: 'snapshot.bcsnap',
      data: expect.any(ArrayBuffer),
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-write-snapshot', {
      autosaveId: 'autosave-1',
      data: expect.any(ArrayBuffer),
    });
  });

  it('rejects invalid snapshot write payloads before IPC', async () => {
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
    const fakeArrayBuffer = Object.create(ArrayBuffer.prototype);
    Object.defineProperty(fakeArrayBuffer, 'byteLength', { value: 1 }); // Prototype spoof should still fail binary validation.

    loadPreloadWithElectron({ contextBridge, ipcRenderer });

    expect(() => exposedApi.fileMenu.saveSnapshotFile({
      suggestedName: 'snapshot.bcsnap',
      data: 'not binary',
    })).toThrow(/must be binary/);
    expect(() => exposedApi.fileMenu.writeSnapshotFile({
      autosaveId: 'autosave-1',
      data: fakeArrayBuffer,
    })).toThrow(/must be binary/);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
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
