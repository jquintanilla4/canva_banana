import { createRequire } from 'node:module';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const originalLoad = Module._load;
const originalArgv = [...process.argv];
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

let exposedApi = null;

const setUserActivation = (isActive) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userActivation: { isActive } },
  });
};

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
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
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
    const saveSnapshotResult = { canceled: false, fileName: 'snapshot.bcsnap', writeId: 'write-1', autosaveId: 'autosave-1' };
    const autosaveSnapshotResult = { fileName: 'snapshot.bcsnap', writeId: 'write-2' };
    const backupSnapshotResult = { fileName: 'backup.bcsnap', writeId: 'write-3' };
    const writeChunkResult = { written: 0 };
    const finishWriteResult = { saved: true };
    const abortWriteResult = { aborted: true };
    const readRangeResult = new ArrayBuffer(0);
    const backupSummaries = [];
    const backupOpenResult = { sourceId: 'source-1', fileName: 'snapshot.bcsnap', size: 0, type: 'application/octet-stream' };
    const backupDeleteResult = { deleted: true };
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(async (channel) => {
        switch (channel) {
          case 'canva-banana:file-menu-set-state':
            return true; // Main only acknowledges the native menu state sync.
          case 'canva-banana:file-menu-open-snapshot':
            return openSnapshotResult; // Open picker returns cancel/data metadata.
          case 'canva-banana:file-menu-begin-save-snapshot':
            return saveSnapshotResult; // Save picker returns the autosave target metadata.
          case 'canva-banana:file-menu-begin-autosave-snapshot':
            return autosaveSnapshotResult; // Autosave starts a temp-file write session.
          case 'canva-banana:file-menu-begin-backup-snapshot':
            return backupSnapshotResult; // Backup writes start a temp-file write session.
          case 'canva-banana:file-menu-write-snapshot-chunk':
            return writeChunkResult; // Snapshot chunks are written by main.
          case 'canva-banana:file-menu-finish-snapshot-write':
            return finishWriteResult; // Finished writes atomically replace the target.
          case 'canva-banana:file-menu-abort-snapshot-write':
            return abortWriteResult; // Failed writes clean up temp files.
          case 'canva-banana:file-menu-read-snapshot-range':
            return readRangeResult; // Import reads bounded byte ranges.
          case 'canva-banana:file-menu-get-snapshot-media-url':
            return 'canva-banana-snapshot://media/source-1/0/1/image.png'; // Media elements stream through main.
          case 'canva-banana:file-menu-retain-snapshot-read':
            return { retained: true }; // Successful imports keep their read source alive.
          case 'canva-banana:file-menu-close-snapshot-read':
            return { closed: true }; // Read source metadata can be released.
          case 'canva-banana:file-menu-list-snapshot-backups':
            return backupSummaries; // Desktop backups are listed from disk metadata.
          case 'canva-banana:file-menu-open-backup-snapshot':
            return backupOpenResult; // Backup restore returns a read source.
          case 'canva-banana:file-menu-delete-backup-snapshot':
            return backupDeleteResult; // Backup delete removes desktop files.
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
    await expect(exposedApi.fileMenu.beginSaveSnapshot({
      suggestedName: 'snapshot.bcsnap',
    })).resolves.toBe(saveSnapshotResult);
    await expect(exposedApi.fileMenu.beginAutosaveSnapshot({
      autosaveId: 'autosave-1',
    })).resolves.toBe(autosaveSnapshotResult);
    await expect(exposedApi.fileMenu.beginBackupSnapshot({
      id: 'backup-1',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'backup.bcsnap',
      size: 3,
    })).resolves.toBe(backupSnapshotResult);
    await expect(exposedApi.fileMenu.writeSnapshotChunk({
      writeId: 'write-1',
      data: new ArrayBuffer(0),
    })).resolves.toBe(writeChunkResult);
    await expect(exposedApi.fileMenu.finishSnapshotWrite({ writeId: 'write-1' })).resolves.toBe(finishWriteResult);
    await expect(exposedApi.fileMenu.abortSnapshotWrite({ writeId: 'write-1' })).resolves.toBe(abortWriteResult);
    await expect(exposedApi.fileMenu.readSnapshotRange({
      sourceId: 'source-1',
      offset: 0,
      length: 0,
    })).resolves.toBe(readRangeResult);
    await expect(exposedApi.fileMenu.getSnapshotMediaUrl({
      sourceId: 'source-1',
      offset: 0,
      length: 1,
      type: 'image/png',
      fileName: 'image.png',
    })).resolves.toBe('canva-banana-snapshot://media/source-1/0/1/image.png');
    await expect(exposedApi.fileMenu.retainSnapshotRead({ sourceId: 'source-1' })).resolves.toEqual({ retained: true });
    await expect(exposedApi.fileMenu.closeSnapshotRead({ sourceId: 'source-1' })).resolves.toEqual({ closed: true });
    await expect(exposedApi.fileMenu.listSnapshotBackups()).resolves.toBe(backupSummaries);
    await expect(exposedApi.fileMenu.openBackupSnapshot({ id: 'backup-1' })).resolves.toBe(backupOpenResult);
    await expect(exposedApi.fileMenu.deleteBackupSnapshot({ id: 'backup-1' })).resolves.toBe(backupDeleteResult);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-set-state', {
      autosaveEnabled: false,
      showZoomLevelBadge: true,
      isClearingJimengCache: false,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-open-snapshot');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-begin-save-snapshot', {
      suggestedName: 'snapshot.bcsnap',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-begin-autosave-snapshot', {
      autosaveId: 'autosave-1',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-begin-backup-snapshot', {
      id: 'backup-1',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'backup.bcsnap',
      size: 3,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-write-snapshot-chunk', {
      writeId: 'write-1',
      data: expect.any(ArrayBuffer),
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-get-snapshot-media-url', {
      sourceId: 'source-1',
      offset: 0,
      length: 1,
      type: 'image/png',
      fileName: 'image.png',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-retain-snapshot-read', {
      sourceId: 'source-1',
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:file-menu-delete-backup-snapshot', {
      id: 'backup-1',
    });
  });

  it('exposes app icon bridge helpers', async () => {
    const appIconState = {
      selectedIconId: 'institute',
      supportsDockIcon: true,
      options: [{ id: 'institute', label: 'The Institute', description: 'Original icon', previewDataUrl: 'data:image/png;base64,' }],
    };
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(async (channel, payload) => {
        switch (channel) {
          case 'canva-banana:app-icon-get-state':
            return appIconState; // Main returns the persisted icon state and previews.
          case 'canva-banana:app-icon-set-selected':
            return { ...appIconState, selectedIconId: payload }; // Main echoes the updated state after saving.
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

    await expect(exposedApi.appIcon.getState()).resolves.toBe(appIconState);
    await expect(exposedApi.appIcon.setSelected('institute')).resolves.toMatchObject({ selectedIconId: 'institute' });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:app-icon-get-state');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:app-icon-set-selected', 'institute');
  });

  it('exposes a native clipboard write helper', async () => {
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(async () => true),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: vi.fn((_name, api) => {
        exposedApi = api; // Capture the safe bridge API exposed to React.
      }),
    };

    loadPreloadWithElectron({ contextBridge, ipcRenderer });
    setUserActivation(true);

    await expect(exposedApi.clipboard.writeText('Copied prompt')).resolves.toBe(true);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('canva-banana:clipboard-write-text', 'Copied prompt');
  });

  it('blocks native clipboard writes without user activation', async () => {
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(async () => true),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: vi.fn((_name, api) => {
        exposedApi = api; // Capture the safe bridge API exposed to React.
      }),
    };

    loadPreloadWithElectron({ contextBridge, ipcRenderer });
    setUserActivation(false);

    expect(() => exposedApi.clipboard.writeText('Copied prompt')).toThrow(/active user action/);

    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('rejects non-string native clipboard writes before IPC', async () => {
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn(async () => true),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: vi.fn((_name, api) => {
        exposedApi = api; // Capture the safe bridge API exposed to React.
      }),
    };

    loadPreloadWithElectron({ contextBridge, ipcRenderer });
    setUserActivation(true);

    expect(() => exposedApi.clipboard.writeText(undefined)).toThrow(/must be a string/);

    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('rejects invalid snapshot streaming payloads before IPC', async () => {
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

    expect(() => exposedApi.fileMenu.writeSnapshotChunk({
      writeId: 'write-1',
      data: 'not binary',
    })).toThrow(/must be binary/);
    expect(() => exposedApi.fileMenu.writeSnapshotChunk({
      writeId: 'write-1',
      data: fakeArrayBuffer,
    })).toThrow(/must be binary/);
    expect(() => exposedApi.fileMenu.finishSnapshotWrite({ writeId: '' })).toThrow(/write session/);
    expect(() => exposedApi.fileMenu.readSnapshotRange({
      sourceId: 'source-1',
      offset: 0,
      length: 16 * 1024 * 1024 + 1,
    })).toThrow(/too large/);
    expect(() => exposedApi.fileMenu.getSnapshotMediaUrl({
      sourceId: 'source-1',
      offset: 0,
      length: 0,
      type: 'video/mp4',
      fileName: 'video.mp4',
    })).toThrow(/media range/);
    expect(() => exposedApi.fileMenu.retainSnapshotRead({ sourceId: '' })).toThrow(/read source/);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('bounds concurrent snapshot chunk IPC and allows later sequential chunks', async () => {
    const pendingWrites = [];
    const ipcRenderer = {
      sendSync: vi.fn(),
      invoke: vi.fn((_channel, _payload) => new Promise(resolve => pendingWrites.push(resolve))),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: vi.fn((_name, api) => {
        exposedApi = api; // Capture the safe bridge API exposed to React.
      }),
    };

    loadPreloadWithElectron({ contextBridge, ipcRenderer });

    const activeWrites = Array.from({ length: 4 }, () => exposedApi.fileMenu.writeSnapshotChunk({
      writeId: 'write-1',
      data: new Uint8Array([1]).buffer,
    }));

    await expect(exposedApi.fileMenu.writeSnapshotChunk({
      writeId: 'write-1',
      data: new Uint8Array([2]).buffer,
    })).rejects.toThrow(/already in progress/);
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(4);

    pendingWrites.shift()({ written: 1 });
    await activeWrites.shift();
    const laterWrite = exposedApi.fileMenu.writeSnapshotChunk({
      writeId: 'write-1',
      data: new Uint8Array([3]).buffer,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(5);

    pendingWrites.splice(0).forEach(resolve => resolve({ written: 1 }));
    await Promise.all([...activeWrites, laterWrite]);
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
