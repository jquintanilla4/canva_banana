import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tool, type CanvasImage } from '../../types';
import { parseBinarySnapshotFile, readSnapshotBlobPartAsArrayBuffer, type SnapshotByteSource, type SnapshotMetaState } from '../../services/snapshotService';
import { createDesktopSnapshotSource } from '../../services/desktopSnapshotSource';
import { KLING_V3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useSnapshotIO } from '../useSnapshotIO';
import type { SelectionStateResult } from '../useSelectionState';
import type { UseFalSettingsResult } from '../useFalSettings';

vi.mock('../../services/backupService', () => ({
  pruneBackupSessions: vi.fn(async () => {}),
  saveBackupSession: vi.fn(async () => {}),
  saveBackupSessionBinary: vi.fn(async () => {}),
}));

import { saveBackupSessionBinary } from '../../services/backupService';

const buildMeta = (): SnapshotMetaState => ({
  appMode: 'CANVAS',
  tool: Tool.PAN,
  brushSize: 20,
  eraserSize: 20,
  brushColor: '#ff0000',
  prompt: 'First saved shot',
  apiProvider: 'fal',
  falModelId: KLING_V3_VIDEO_MODEL_ID,
  falImageSizeSelection: 'default',
  falAspectRatioSelection: 'default',
  falResolutionSelection: '720p',
  falNumImages: 1,
  falScaleFactor: 2,
  falNoiseScale: 0.1,
  falCreativity: 0,
  klingV3Duration: '12',
  klingV3GenerateAudio: false,
  klingV3CfgScale: '0.75',
  klingV3MultiPromptEnabled: true,
  klingV3MultiPrompt: 'Second saved shot',
  klingV3Shot1Duration: '4',
  klingV3Shot2Duration: '6',
  seedance2JimengModelVersion: 'seedance2.0_vip',
  jimengMultiframeDuration: '8',
  jimengMultiframeResolution: '1080p',
  jimengSessionId: 23,
  selectedImageIds: [],
  referenceImageIds: [],
});

const buildAudioImage = (overrides: Partial<CanvasImage> = {}): CanvasImage => {
  const waveform = document.createElement('img');
  const audioElement = document.createElement('audio');
  audioElement.currentTime = 0;

  return {
    id: 'audio-1',
    element: waveform,
    mediaType: 'audio',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    naturalWidth: 100,
    naturalHeight: 40,
    file: new File(['audio'], 'audio.wav', { type: 'audio/wav' }),
    isPlaying: true,
    hasAudio: true,
    audioElement,
    audioDuration: 12,
    currentPlaybackTime: 1,
    ...overrides,
  }; // Audio fixture with both stale state and a live element clock.
};

const buildImage = (overrides: Partial<CanvasImage> = {}): CanvasImage => ({
  id: 'image-1',
  element: document.createElement('img'),
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  naturalWidth: 100,
  naturalHeight: 100,
  file: new File(['image'], 'image.png', { type: 'image/png' }),
  isPlaying: false,
  hasAudio: false,
  ...overrides,
}); // Image fixture for snapshot export tests.

const fileFromChunks = (chunks: Uint8Array[], fileName = 'scene.bcsnap'): File => {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new File([bytes], fileName, { type: 'application/octet-stream' });
};

const cloneArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}; // Returns an exact ArrayBuffer slice.

const uint32Bytes = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}; // Encodes binary snapshot section lengths.

const uint64Bytes = (value: number): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false);
  return bytes;
}; // Encodes binary snapshot media lengths.

const buildBinarySnapshotFileBytes = (mediaBytes: Uint8Array): Uint8Array => {
  const imageManifest = {
    id: 'source-image-1',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    fileName: 'source-image.png',
    fileType: 'image/png',
    fileSize: mediaBytes.byteLength,
    mediaType: 'image' as const,
    isPlaying: false,
    hasAudio: false,
  };
  const manifest = {
    version: 2 as const,
    createdAt: '2026-07-09T00:00:00.000Z',
    state: { images: [imageManifest], notes: [], paths: [] },
  };
  const encoder = new TextEncoder();
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const imageManifestBytes = encoder.encode(JSON.stringify(imageManifest));
  const chunks = [
    encoder.encode('BANANA_SNAPSHOT_V2\n'),
    uint32Bytes(manifestBytes.byteLength),
    manifestBytes,
    uint32Bytes(imageManifestBytes.byteLength),
    imageManifestBytes,
    uint64Bytes(mediaBytes.byteLength),
    mediaBytes,
  ];
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}; // Creates a binary snapshot whose media can stay lazy in desktop tests.

const buildEmptyBinarySnapshotFileBytes = (): Uint8Array => {
  const encoder = new TextEncoder();
  const manifestBytes = encoder.encode(JSON.stringify({
    version: 2,
    createdAt: '2026-07-09T00:00:00.000Z',
    state: { images: [], notes: [], paths: [] },
  }));
  const chunks = [encoder.encode('BANANA_SNAPSHOT_V2\n'), uint32Bytes(manifestBytes.byteLength), manifestBytes];
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}; // Represents a binary desktop import without forcing DOM media loading.

const stubSuccessfulImageLoad = (): void => {
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    naturalWidth = 100;
    naturalHeight = 100;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  } as unknown as typeof Image);
}; // Lets lazy desktop image fixtures complete URL loading in jsdom.

const installBrowserSnapshotWorkingStorage = (options: { beforeWrite?: () => Promise<void> } = {}) => {
  let stagedBytes = new Uint8Array();
  const stagedWrites: Uint8Array[] = [];
  const workingWritable = {
    write: vi.fn(async (data: Uint8Array<ArrayBuffer>) => {
      await options.beforeWrite?.();
      stagedWrites.push(new Uint8Array(data));
    }),
    close: vi.fn(async () => {
      const size = stagedWrites.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      stagedBytes = new Uint8Array(size);
      let offset = 0;
      stagedWrites.forEach(chunk => {
        stagedBytes.set(chunk, offset);
        offset += chunk.byteLength;
      });
    }),
    abort: vi.fn(async () => {}),
  };
  const workingFileHandle = {
    createWritable: vi.fn(async () => workingWritable),
    getFile: vi.fn(async () => new File([stagedBytes], 'working.bcsnap', { type: 'application/octet-stream' })),
  };
  const workingDirectory = {
    entries: vi.fn(() => (async function* () {})()),
    getFileHandle: vi.fn(async () => workingFileHandle),
    removeEntry: vi.fn(async () => {}),
  };
  const root = { getDirectoryHandle: vi.fn(async () => workingDirectory) };
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: vi.fn(async () => root) },
  });
  const heldLocks = new Set<string>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn(async <T,>(
        name: string,
        options: { mode: 'exclusive'; ifAvailable?: boolean },
        callback: (lock: { name: string } | null) => T | Promise<T>,
      ): Promise<T> => {
        if (options.ifAvailable && heldLocks.has(name)) return callback(null);
        heldLocks.add(name);
        try {
          return await callback({ name });
        } finally {
          heldLocks.delete(name);
        }
      }),
    },
  });
  return { workingDirectory, workingWritable };
}; // Mimics an OPFS file without materializing the whole snapshot in hook code.

const renderEmptySnapshotIO = (autosaveEnabled: boolean) => {
  const setError = vi.fn();
  const setJimengSessionId = vi.fn();
  const selectionSetters = {
    setSelectedImageIds: vi.fn(),
    setSelectedNoteIds: vi.fn(),
    setReferenceImageIds: vi.fn(),
    setReferenceVideoIds: vi.fn(),
    setReferenceAudioIds: vi.fn(),
    setSeedanceReferenceOrderIds: vi.fn(),
    setElementImageIds: vi.fn(),
    setVideoLastFrameImageId: vi.fn(),
  };
  const rendered = renderHook(({ enabled }: { enabled: boolean }) => useSnapshotIO({
    ui: {
      appMode: 'CANVAS',
      tool: Tool.PAN,
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
      prompt: '',
      apiProvider: 'fal',
      setAppMode: vi.fn(),
      setTool: vi.fn(),
      setBrushSize: vi.fn(),
      setEraserSize: vi.fn(),
      setBrushColor: vi.fn(),
      setPrompt: vi.fn(),
      setApiProvider: vi.fn(),
      setError,
      setToastMessage: vi.fn(),
      setIsFileMenuOpen: vi.fn(),
    },
    fal: { setJimengSessionId } as unknown as UseFalSettingsResult,
    selection: {
      selectedImageIds: [],
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      seedanceReferenceOrderIds: [],
      elementImageIds: [],
      videoLastFrameImageId: null,
      ...selectionSetters,
    } as unknown as SelectionStateResult,
    noteLabelCounterRef: { current: 1 },
    displayedImages: [],
    displayedNotes: [],
    displayedPaths: [],
    displayedVideoPromptAreas: [],
    displayedVideoPromptBars: [],
    resetHistory: vi.fn(),
    providerAvailability: { google: true, fal: true },
    availableProviders: ['google', 'fal'],
    autosaveEnabled: enabled,
  }), { initialProps: { enabled: autosaveEnabled } });
  return { ...rendered, setError, setJimengSessionId }; // Expose import feedback and document-scoped session restoration.
};

afterEach(() => {
  delete window.canvaBananaDesktop;
  Reflect.deleteProperty(window, 'showSaveFilePicker');
  Reflect.deleteProperty(window, 'showOpenFilePicker');
  Reflect.deleteProperty(navigator, 'locks');
  Reflect.deleteProperty(navigator, 'storage');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useSnapshotIO (Kling v3)', () => {
  it('adopts the scoped desktop target after a successful native snapshot import', async () => {
    const snapshotBytes = buildEmptyBinarySnapshotFileBytes();
    const beginAutosaveSnapshot = vi.fn(async () => ({ fileName: 'imported-scene.bcsnap', writeId: 'autosave-write-1' }));
    const finishSnapshotWrite = vi.fn(async () => ({ saved: true }));
    window.canvaBananaDesktop = {
      fileMenu: {
        openSnapshotFile: vi.fn(async () => ({
          canceled: false as const,
          sourceId: 'import-source-1',
          fileName: 'imported-scene.bcsnap',
          size: snapshotBytes.byteLength,
          type: 'application/octet-stream',
          autosaveId: 'import-target-1',
        })),
        beginAutosaveSnapshot,
        writeSnapshotChunk: vi.fn(async ({ data }: { data: ArrayBuffer }) => ({ written: data.byteLength })),
        finishSnapshotWrite,
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
        readSnapshotRange: vi.fn(async ({ offset, length }: { offset: number; length: number }) => (
          cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length))
        )),
        retainSnapshotRead: vi.fn(async () => ({ retained: true })),
        closeSnapshotRead: vi.fn(async () => ({ closed: true })),
      },
    };
    const { result, setJimengSessionId } = renderEmptySnapshotIO(true);

    await act(async () => {
      await result.current.importSnapshotWithPicker(vi.fn());
    });
    expect(beginAutosaveSnapshot).not.toHaveBeenCalled();
    expect(setJimengSessionId).toHaveBeenCalledWith(0);

    act(() => {
      result.current.autosaveSnapshot();
    });
    await waitFor(() => expect(finishSnapshotWrite).toHaveBeenCalledTimes(1));

    expect(beginAutosaveSnapshot).toHaveBeenCalledWith({ autosaveId: 'import-target-1' });
    expect(result.current.activeSnapshotFileName).toBe('imported-scene.bcsnap');
  });

  it('retains a browser import handle while autosave is disabled and uses it after autosave is enabled', async () => {
    installBrowserSnapshotWorkingStorage();
    const snapshotFile = new File([buildEmptyBinarySnapshotFileBytes()], 'browser-scene.bcsnap', { type: 'application/octet-stream' });
    const writable = {
      write: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
    };
    const createWritable = vi.fn(async () => writable);
    const requestPermission = vi.fn(async () => 'granted' as PermissionState);
    const getFile = vi.fn(async () => snapshotFile);
    const fileHandle = { name: snapshotFile.name, getFile, createWritable, requestPermission };
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(async () => [fileHandle]),
    });
    const { result, rerender, setError } = renderEmptySnapshotIO(false);

    await act(async () => {
      await result.current.importSnapshotWithPicker(vi.fn());
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(createWritable).not.toHaveBeenCalled();

    rerender({ enabled: true });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await waitFor(() => expect(writable.close).toHaveBeenCalledTimes(1));

    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalled();
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(requestPermission.mock.invocationCallOrder[0]).toBeLessThan(getFile.mock.invocationCallOrder[0]); // Permission is requested before import work can consume picker activation.
    expect(setError).toHaveBeenLastCalledWith(null); // Writable imports clear any stale read-only warning.
  });

  it('keeps a writable browser import read-only when stable working storage is unavailable', async () => {
    const snapshotFile = new File([buildEmptyBinarySnapshotFileBytes()], 'browser-scene.bcsnap', { type: 'application/octet-stream' });
    const createWritable = vi.fn(async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(async () => [{
        name: snapshotFile.name,
        getFile: vi.fn(async () => snapshotFile),
        createWritable,
        requestPermission: vi.fn(async () => 'granted' as PermissionState),
      }]),
    });
    const { result, setError } = renderEmptySnapshotIO(true);

    await act(async () => {
      await result.current.importSnapshotWithPicker(vi.fn());
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(result.current.activeSnapshotFileName).toBe('browser-scene.bcsnap');
    expect(createWritable).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      'Writable snapshot import could not create a stable browser working copy.',
      expect.objectContaining({ message: 'Browser snapshot working storage is unavailable.' }),
    );
    expect(setError).toHaveBeenLastCalledWith(
      'Snapshot imported read-only. Export it to a new .bcsnap file before making changes to enable autosave.',
    );
  });

  it('imports a browser snapshot as read-only when write permission is denied', async () => {
    const snapshotFile = new File([buildEmptyBinarySnapshotFileBytes()], 'browser-read-only.bcsnap', { type: 'application/octet-stream' });
    const createWritable = vi.fn(async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }));
    const requestPermission = vi.fn(async () => 'denied' as PermissionState);
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(async () => [{
        name: snapshotFile.name,
        getFile: vi.fn(async () => snapshotFile),
        createWritable,
        requestPermission,
      }]),
    });
    const { result, setError } = renderEmptySnapshotIO(true);

    await act(async () => {
      await result.current.importSnapshotWithPicker(vi.fn());
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(result.current.activeSnapshotFileName).toBe('browser-read-only.bcsnap');
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(createWritable).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(
      'Snapshot imported read-only. Export it to a new .bcsnap file before making changes to enable autosave.',
    );
  });

  it('keeps legacy JSON and read-only binary imports detached from autosave destinations', async () => {
    const snapshotJson = JSON.stringify({
      version: 1,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [], notes: [], paths: [] },
    });
    const jsonFile = new File([snapshotJson], 'legacy.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    jsonFile.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().
    const createWritable = vi.fn(async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }));
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(async () => [{ name: jsonFile.name, getFile: vi.fn(async () => jsonFile), createWritable }]),
    });
    const { result, setError } = renderEmptySnapshotIO(true);

    await act(async () => {
      await result.current.importSnapshotWithPicker(vi.fn());
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(createWritable).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(null); // Legacy JSON remains read-only without claiming current snapshot autosave support.

    const readOnlyBinary = new File([buildEmptyBinarySnapshotFileBytes()], 'read-only.bcsnap', { type: 'application/octet-stream' });
    await act(async () => {
      await result.current.importSnapshotFromFile(readOnlyBinary); // Hidden inputs and restored backups do not provide a write handle.
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(createWritable).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(
      'Snapshot imported read-only. Export it to a new .bcsnap file before making changes to enable autosave.',
    );
  });

  it('does not adopt an autosave target for legacy JSON content renamed to .bcsnap', async () => {
    installBrowserSnapshotWorkingStorage();
    const snapshotJson = JSON.stringify({
      version: 1,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [], notes: [], paths: [] },
    });
    const renamedLegacyFile = new File([snapshotJson], 'renamed-legacy.bcsnap', { type: 'application/octet-stream' }) as File & { text: () => Promise<string> };
    renamedLegacyFile.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().
    const createWritable = vi.fn(async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }));
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(async () => [{
        name: renamedLegacyFile.name,
        getFile: vi.fn(async () => renamedLegacyFile),
        createWritable,
        requestPermission: vi.fn(async () => 'granted' as PermissionState),
      }]),
    });
    const { result, setError } = renderEmptySnapshotIO(true);

    await act(async () => {
      await result.current.importSnapshotWithPicker(vi.fn());
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createWritable).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(
      'Snapshot imported read-only. Export it to a new .bcsnap file before making changes to enable autosave.',
    );
  });

  it('keeps the newest writable destination when an older import completes late', async () => {
    const snapshotBytes = buildEmptyBinarySnapshotFileBytes();
    let releaseOlderRead: () => void = () => {};
    const olderReadGate = new Promise<void>(resolve => { releaseOlderRead = resolve; });
    const closeOlderSource = vi.fn(async () => {});
    const olderSource: SnapshotByteSource = {
      fileName: 'older.bcsnap',
      size: snapshotBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => {
        await olderReadGate;
        return cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length));
      },
      close: closeOlderSource,
    };
    const newerSource: SnapshotByteSource = {
      fileName: 'newer.bcsnap',
      size: snapshotBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length)),
    };
    const beginAutosaveSnapshot = vi.fn(async () => ({ fileName: 'newer.bcsnap', writeId: 'newer-write-1' }));
    const finishSnapshotWrite = vi.fn(async () => ({ saved: true }));
    window.canvaBananaDesktop = {
      fileMenu: {
        beginAutosaveSnapshot,
        writeSnapshotChunk: vi.fn(async ({ data }: { data: ArrayBuffer }) => ({ written: data.byteLength })),
        finishSnapshotWrite,
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
      },
    };
    const { result } = renderEmptySnapshotIO(true);
    let olderImport: Promise<void> = Promise.resolve();

    act(() => {
      olderImport = result.current.importSnapshotFromFile(olderSource, {
        autosaveTarget: { kind: 'desktop', autosaveId: 'older-target-1' },
      });
    });
    await act(async () => {
      await result.current.importSnapshotFromFile(newerSource, {
        autosaveTarget: { kind: 'desktop', autosaveId: 'newer-target-1' },
      });
    });
    releaseOlderRead();
    await act(async () => {
      await olderImport;
    });
    act(() => {
      result.current.autosaveSnapshot();
    });
    await waitFor(() => expect(finishSnapshotWrite).toHaveBeenCalledTimes(1));

    expect(result.current.activeSnapshotFileName).toBe('newer.bcsnap');
    expect(beginAutosaveSnapshot).toHaveBeenCalledWith({ autosaveId: 'newer-target-1' });
    expect(closeOlderSource).toHaveBeenCalledTimes(1); // Stale unretained sources use the same cleanup contract as staged picker files.
  });

  it('keeps a later restore active when an older picker working-copy stage completes late', async () => {
    let releaseOlderStage: () => void = () => {};
    const olderStageGate = new Promise<void>(resolve => { releaseOlderStage = resolve; });
    const { workingDirectory, workingWritable } = installBrowserSnapshotWorkingStorage({
      beforeWrite: () => olderStageGate,
    });
    const snapshotBytes = buildEmptyBinarySnapshotFileBytes();
    const olderFile = new File([snapshotBytes], 'older-picker.bcsnap', { type: 'application/octet-stream' });
    const newerFile = new File([snapshotBytes], 'newer-restore.bcsnap', { type: 'application/octet-stream' });
    const selectedCreateWritable = vi.fn(async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }));
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(async () => [{
        name: olderFile.name,
        getFile: vi.fn(async () => olderFile),
        createWritable: selectedCreateWritable,
        requestPermission: vi.fn(async () => 'granted' as PermissionState),
      }]),
    });
    const { result, setError } = renderEmptySnapshotIO(true);
    let olderImport: Promise<void> = Promise.resolve();

    act(() => {
      olderImport = result.current.importSnapshotWithPicker(vi.fn());
    });
    await waitFor(() => expect(workingWritable.write).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.importSnapshotFromFile(newerFile); // A backup restore starts after the picker source was selected.
    });
    releaseOlderStage();
    await act(async () => {
      await olderImport;
    });

    expect(result.current.activeSnapshotFileName).toBe('newer-restore.bcsnap');
    expect(selectedCreateWritable).not.toHaveBeenCalled();
    expect(workingDirectory.removeEntry).toHaveBeenCalledTimes(1); // The stale OPFS copy is released instead of being adopted.
    expect(setError).toHaveBeenLastCalledWith(
      'Snapshot imported read-only. Export it to a new .bcsnap file before making changes to enable autosave.',
    );
  });

  it('restores saved global Kling v3 settings from snapshot metadata', async () => {
    const meta = buildMeta();
    const file = {
      text: async () => JSON.stringify({
        version: 1,
        createdAt: '2026-04-22T00:00:00.000Z',
        state: { images: [], notes: [], paths: [], meta },
      }),
      slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
    } as unknown as File;
    const falSetters = {
      setFalModelMode: vi.fn(),
      setFalImageModelId: vi.fn(),
      setFalVideoModelId: vi.fn(),
      setFalImageSizeSelection: vi.fn(),
      setFalAspectRatioSelection: vi.fn(),
      setFalResolutionSelection: vi.fn(),
      setFalNumImages: vi.fn(),
      setFalScaleFactor: vi.fn(),
      setFalNoiseScale: vi.fn(),
      setFalCreativity: vi.fn(),
      setWan27VideoVariant: vi.fn(),
      setKlingV3Duration: vi.fn(),
      setKlingV3GenerateAudio: vi.fn(),
      setKlingV3CfgScale: vi.fn(),
      setKlingV3MultiPromptEnabled: vi.fn(),
      setKlingV3MultiPrompt: vi.fn(),
      setKlingV3Shot1Duration: vi.fn(),
      setKlingV3Shot2Duration: vi.fn(),
      handleSeedance2JimengModelVersionChange: vi.fn(),
      handleSeedance2VolcengineModelChange: vi.fn(),
      setJimengMultiframeDuration: vi.fn(),
      setJimengMultiframeResolution: vi.fn(),
      setJimengSessionId: vi.fn(),
    };
    const selectionSetters = {
      setSelectedImageIds: vi.fn(),
      setSelectedNoteIds: vi.fn(),
      setReferenceImageIds: vi.fn(),
      setReferenceVideoIds: vi.fn(),
      setReferenceAudioIds: vi.fn(),
      setSeedanceReferenceOrderIds: vi.fn(),
      setElementImageIds: vi.fn(),
      setVideoLastFrameImageId: vi.fn(),
    };

    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError: vi.fn(),
        setToastMessage: vi.fn(),
        setIsFileMenuOpen: vi.fn(),
      },
      fal: {
        falModelId: KLING_V3_VIDEO_MODEL_ID,
        falImageSizeSelection: 'default',
        falAspectRatioSelection: 'default',
        falResolutionSelection: '720p',
        falNumImages: 1,
        falScaleFactor: 2,
        falNoiseScale: 0.1,
        falCreativity: 0,
        klingV3Duration: '5',
        klingV3GenerateAudio: true,
        klingV3CfgScale: '0.5',
        klingV3MultiPromptEnabled: false,
        klingV3MultiPrompt: '',
        klingV3Shot1Duration: '5',
        klingV3Shot2Duration: '5',
        ...falSetters,
      } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: false,
    }));

    await act(async () => {
      await result.current.importSnapshotFromFile(file);
    });

    expect(falSetters.setKlingV3Duration).toHaveBeenCalledWith('12');
    expect(falSetters.setKlingV3GenerateAudio).toHaveBeenCalledWith(false);
    expect(falSetters.setKlingV3CfgScale).toHaveBeenCalledWith('0.75');
    expect(falSetters.setKlingV3MultiPromptEnabled).toHaveBeenCalledWith(true);
    expect(falSetters.setKlingV3MultiPrompt).toHaveBeenCalledWith('Second saved shot');
    expect(falSetters.setKlingV3Shot1Duration).toHaveBeenCalledWith('4');
    expect(falSetters.setKlingV3Shot2Duration).toHaveBeenCalledWith('6');
    expect(falSetters.handleSeedance2JimengModelVersionChange).toHaveBeenCalledWith('seedance2.0_vip');
    expect(falSetters.handleSeedance2VolcengineModelChange).toHaveBeenCalledWith('standard');
    expect(falSetters.setJimengMultiframeDuration).toHaveBeenCalledWith('8');
    expect(falSetters.setJimengMultiframeResolution).toHaveBeenCalledWith('1080p');
    expect(falSetters.setJimengSessionId).toHaveBeenCalledWith(23);

    falSetters.setJimengSessionId.mockClear();
    const legacyMeta = buildMeta();
    delete legacyMeta.jimengSessionId;
    const legacyFile = {
      text: async () => JSON.stringify({
        version: 1,
        createdAt: '2026-04-21T00:00:00.000Z',
        state: { images: [], notes: [], paths: [], meta: legacyMeta },
      }),
      slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
    } as unknown as File;

    await act(async () => {
      await result.current.importSnapshotFromFile(legacyFile);
    });

    expect(falSetters.setJimengSessionId).toHaveBeenCalledWith(0);
  });

  it('closes a retained empty desktop binary source immediately after import', async () => {
    const snapshotBytes = buildEmptyBinarySnapshotFileBytes();
    const retain = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const desktopSource: SnapshotByteSource = {
      fileName: 'desktop.bcsnap',
      size: snapshotBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length)),
      getMediaUrl: async () => 'canva-banana-snapshot-media://empty',
      retain,
      close,
    };
    const snapshotJson = JSON.stringify({
      version: 1,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [], notes: [], paths: [] },
    });
    const browserFile = new File([snapshotJson], 'browser.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    browserFile.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().
    const selectionSetters = {
      setSelectedImageIds: vi.fn(),
      setSelectedNoteIds: vi.fn(),
      setReferenceImageIds: vi.fn(),
      setReferenceVideoIds: vi.fn(),
      setReferenceAudioIds: vi.fn(),
      setSeedanceReferenceOrderIds: vi.fn(),
      setElementImageIds: vi.fn(),
      setVideoLastFrameImageId: vi.fn(),
    };
    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError: vi.fn(),
        setToastMessage: vi.fn(),
        setIsFileMenuOpen: vi.fn(),
      },
      fal: { setJimengSessionId: vi.fn() } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: false,
    }));

    await act(async () => {
      await result.current.importSnapshotFromFile(desktopSource);
    });
    expect(result.current.activeSnapshotFileName).toBe('desktop.bcsnap');
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.importSnapshotFromFile(browserFile);
    });

    expect(result.current.activeSnapshotFileName).toBe('browser.json');
    expect(retain).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('aborts a failed browser file-handle write without committing partial snapshot bytes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeError = new Error('Snapshot disk write failed.');
    const writable = {
      write: vi.fn(async () => { throw writeError; }),
      abort: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const createWritable = vi.fn(async () => writable);
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: vi.fn(async () => ({ name: 'existing-scene.bcsnap', createWritable })),
    });
    const setError = vi.fn();
    const selectionSetters = {
      setSelectedImageIds: vi.fn(),
      setSelectedNoteIds: vi.fn(),
      setReferenceImageIds: vi.fn(),
      setReferenceVideoIds: vi.fn(),
      setReferenceAudioIds: vi.fn(),
      setSeedanceReferenceOrderIds: vi.fn(),
      setElementImageIds: vi.fn(),
      setVideoLastFrameImageId: vi.fn(),
    };
    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError,
        setToastMessage: vi.fn(),
        setIsFileMenuOpen: vi.fn(),
      },
      fal: { setJimengSessionId: vi.fn() } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: false,
    }));

    await act(async () => {
      await result.current.exportSnapshot();
    });

    expect(createWritable).toHaveBeenCalledOnce();
    expect(writable.write).toHaveBeenCalled();
    expect(writable.abort).toHaveBeenCalledOnce();
    expect(writable.close).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(writeError.message);
    expect(result.current.activeSnapshotFileName).toBeNull();
  });

  it('rejects an unretained desktop import without replacing the working session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubSuccessfulImageLoad();
    const snapshotJson = JSON.stringify({
      version: 1,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [], notes: [], paths: [] },
    });
    const snapshotBytes = new TextEncoder().encode(snapshotJson);
    const currentBytes = buildBinarySnapshotFileBytes(new Uint8Array([1]));
    const closeCurrent = vi.fn(async () => {});
    const currentSource: SnapshotByteSource = {
      fileName: 'current.bcsnap',
      size: currentBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => cloneArrayBuffer(currentBytes.subarray(offset, offset + length)),
      getMediaUrl: async () => 'canva-banana-snapshot-media://current',
      retain: vi.fn(async () => {}),
      close: closeCurrent,
    }; // A lazy binary source remains active when the replacement cannot be retained.
    const readCandidate = vi.fn(async (offset: number, length: number) => cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length)));
    const closeCandidate = vi.fn(async () => {});
    const candidateSource: SnapshotByteSource = {
      fileName: 'candidate.bcsnap',
      size: snapshotBytes.byteLength,
      type: 'application/json',
      readRange: readCandidate,
      retain: vi.fn(async () => { throw new Error('Snapshot source retention failed.'); }),
      close: closeCandidate,
    };
    const resetHistory = vi.fn();
    const setError = vi.fn();
    const setToastMessage = vi.fn();
    const beginAutosaveSnapshot = vi.fn(async () => ({ fileName: 'current.bcsnap', writeId: 'current-write-1' }));
    const finishSnapshotWrite = vi.fn(async () => ({ saved: true }));
    window.canvaBananaDesktop = {
      fileMenu: {
        beginAutosaveSnapshot,
        writeSnapshotChunk: vi.fn(async ({ data }: { data: ArrayBuffer }) => ({ written: data.byteLength })),
        finishSnapshotWrite,
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
      },
    };
    const selectionSetters = {
      setSelectedImageIds: vi.fn(),
      setSelectedNoteIds: vi.fn(),
      setReferenceImageIds: vi.fn(),
      setReferenceVideoIds: vi.fn(),
      setReferenceAudioIds: vi.fn(),
      setSeedanceReferenceOrderIds: vi.fn(),
      setElementImageIds: vi.fn(),
      setVideoLastFrameImageId: vi.fn(),
    };
    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError,
        setToastMessage,
        setIsFileMenuOpen: vi.fn(),
      },
      fal: { setJimengSessionId: vi.fn() } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory,
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: true,
    }));

    await act(async () => {
      await result.current.importSnapshotFromFile(currentSource, {
        autosaveTarget: { kind: 'desktop', autosaveId: 'current-target-1' },
      });
    });
    expect(result.current.activeSnapshotFileName).toBe('current.bcsnap');
    resetHistory.mockClear();
    setError.mockClear();
    setToastMessage.mockClear();

    await act(async () => {
      await result.current.importSnapshotFromFile(candidateSource);
    });

    expect(readCandidate).not.toHaveBeenCalled();
    expect(resetHistory).not.toHaveBeenCalled();
    expect(setToastMessage).not.toHaveBeenCalledWith('Snapshot imported');
    expect(setError).toHaveBeenCalledWith('Snapshot source retention failed.');
    expect(closeCandidate).toHaveBeenCalledTimes(1);
    expect(closeCurrent).not.toHaveBeenCalled();
    expect(result.current.activeSnapshotFileName).toBe('current.bcsnap');
    act(() => {
      result.current.autosaveSnapshot();
    });
    await waitFor(() => expect(finishSnapshotWrite).toHaveBeenCalledTimes(1));
    expect(beginAutosaveSnapshot).toHaveBeenCalledWith({ autosaveId: 'current-target-1' });
  });

  it('keeps a replaced desktop source leased until every queued autosave streams its original media', async () => {
    stubSuccessfulImageLoad();
    const originalMedia = new Uint8Array([10, 20, 30, 40, 50]);
    const sourceBytes = buildBinarySnapshotFileBytes(originalMedia);
    const activationBytes = buildBinarySnapshotFileBytes(originalMedia);
    const snapshotJson = JSON.stringify({
      version: 1,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [], notes: [], paths: [] },
    });
    const snapshotBytes = new TextEncoder().encode(snapshotJson);
    let sourceClosed = false;
    let autosaveSequence = 0;
    let releaseFirstAutosave: () => void = () => {};
    const firstAutosaveGate = new Promise<void>(resolve => { releaseFirstAutosave = resolve; });
    const writtenChunks = new Map<string, Uint8Array[]>();
    const closeSnapshotRead = vi.fn(async () => {
      sourceClosed = true;
      return { closed: true };
    });
    const finishSnapshotWrite = vi.fn(async () => ({ saved: true }));
    const beginAutosaveSnapshot = vi.fn(async () => {
      autosaveSequence += 1;
      return { fileName: 'scene.bcsnap', writeId: `autosave-write-${autosaveSequence}` };
    });
    window.canvaBananaDesktop = {
      fileMenu: {
        beginAutosaveSnapshot,
        writeSnapshotChunk: vi.fn(async ({ writeId, data }: { writeId: string; data: ArrayBuffer }) => {
          if (writeId === 'autosave-write-1' && !writtenChunks.has(writeId)) {
            writtenChunks.set(writeId, []);
            await firstAutosaveGate; // Hold the first writer while the second autosave waits in the queue.
          }
          const chunks = writtenChunks.get(writeId) ?? [];
          chunks.push(new Uint8Array(data));
          writtenChunks.set(writeId, chunks);
          return { written: data.byteLength };
        }),
        finishSnapshotWrite,
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
        readSnapshotRange: vi.fn(async ({ offset, length }: { sourceId: string; offset: number; length: number }) => {
          if (sourceClosed) throw new Error('Snapshot read source is no longer available.');
          return cloneArrayBuffer(sourceBytes.subarray(offset, offset + length));
        }),
        getSnapshotMediaUrl: vi.fn(async () => 'canva-banana-snapshot-media://source-a'),
        retainSnapshotRead: vi.fn(async () => ({ retained: true })),
        closeSnapshotRead,
      },
    };
    const desktopSource = createDesktopSnapshotSource({
      sourceId: 'source-a',
      fileName: 'source-a.bcsnap',
      size: sourceBytes.byteLength,
      type: 'application/octet-stream',
    });
    const parsedSource = await parseBinarySnapshotFile(desktopSource);
    const lazyFile = Object.assign(parsedSource.images[0].blob, {
      name: parsedSource.images[0].manifest.fileName,
      lastModified: Date.now(),
      webkitRelativePath: '',
    }) as unknown as File;
    const activationSource: SnapshotByteSource = {
      fileName: 'desktop.bcsnap',
      size: activationBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => cloneArrayBuffer(activationBytes.subarray(offset, offset + length)),
      getMediaUrl: async () => 'canva-banana-snapshot-media://source-a',
      retain: async () => { await desktopSource.retain?.(); },
      close: async () => { await desktopSource.close?.(); },
    }; // Registers the same lazy binary lifecycle through the real import path.
    const selectionSetters = {
      setSelectedImageIds: vi.fn(),
      setSelectedNoteIds: vi.fn(),
      setReferenceImageIds: vi.fn(),
      setReferenceVideoIds: vi.fn(),
      setReferenceAudioIds: vi.fn(),
      setSeedanceReferenceOrderIds: vi.fn(),
      setElementImageIds: vi.fn(),
      setVideoLastFrameImageId: vi.fn(),
    };
    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError: vi.fn(),
        setToastMessage: vi.fn(),
        setIsFileMenuOpen: vi.fn(),
      },
      fal: { setJimengSessionId: vi.fn() } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [buildImage({ id: 'source-image-1', file: lazyFile })],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: true,
    }));

    await act(async () => {
      await result.current.importSnapshotFromFile(activationSource, {
        autosaveTarget: { kind: 'desktop', autosaveId: 'desktop-target-1' },
      });
    });
    expect(result.current.activeSnapshotFileName).toBe('desktop.bcsnap');
    act(() => {
      result.current.autosaveSnapshot();
    });
    await waitFor(() => expect(writtenChunks.has('autosave-write-1')).toBe(true));
    act(() => {
      result.current.autosaveSnapshot(); // This source lease must begin before its queued writer starts.
    });

    let importB: Promise<void> = Promise.resolve();
    act(() => {
      const browserFile = new File([snapshotJson], 'replacement.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
      browserFile.text = () => Promise.resolve(snapshotJson);
      importB = result.current.importSnapshotFromFile(browserFile);
    });
    await Promise.resolve();
    expect(closeSnapshotRead).not.toHaveBeenCalled();

    releaseFirstAutosave();
    await act(async () => {
      await importB;
    });
    await waitFor(() => expect(finishSnapshotWrite).toHaveBeenCalledTimes(2));

    expect(closeSnapshotRead).toHaveBeenCalledTimes(1);
    expect(result.current.activeSnapshotFileName).toBe('replacement.json');
    const secondAutosaveFile = fileFromChunks(writtenChunks.get('autosave-write-2') ?? [], 'autosave-2.bcsnap');
    const secondAutosave = await parseBinarySnapshotFile(secondAutosaveFile);
    expect(secondAutosave.manifest.state.images[0]).not.toHaveProperty('fallbackReason');
    const restoredMedia = await readSnapshotBlobPartAsArrayBuffer(secondAutosave.images[0].blob, 0, secondAutosave.images[0].blob.size);
    expect(new Uint8Array(restoredMedia)).toEqual(originalMedia);
    act(() => {
      result.current.autosaveSnapshot(); // The imported document has no destination until it is explicitly saved.
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(beginAutosaveSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps native primary autosaves successful when backup quota is unavailable', async () => {
    const beginSaveSnapshot = vi.fn(async () => ({
      canceled: false as const,
      fileName: 'scene.bcsnap',
      writeId: 'export-write-1',
      autosaveId: 'desktop-target-1',
    }));
    const beginAutosaveSnapshot = vi.fn(async () => ({
      fileName: 'scene.bcsnap',
      writeId: 'autosave-write-1',
    }));
    const writeSnapshotChunk = vi.fn(async () => ({ written: 1 }));
    const finishSnapshotWrite = vi.fn(async () => ({ saved: true }));
    const abortSnapshotWrite = vi.fn(async () => ({ aborted: true }));
    const setError = vi.fn();
    const setToastMessage = vi.fn();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    window.canvaBananaDesktop = {
      fileMenu: {
        beginSaveSnapshot,
        beginAutosaveSnapshot,
        writeSnapshotChunk,
        finishSnapshotWrite,
        abortSnapshotWrite,
      },
    };

    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError,
        setToastMessage,
        setIsFileMenuOpen: vi.fn(),
      },
      fal: {
        falModelId: KLING_V3_VIDEO_MODEL_ID,
        falImageSizeSelection: 'default',
        falAspectRatioSelection: 'default',
        falResolutionSelection: '720p',
        falNumImages: 1,
        falScaleFactor: 2,
        falNoiseScale: 0.1,
        falCreativity: 0,
        klingV3Duration: '5',
        klingV3GenerateAudio: true,
        klingV3CfgScale: '0.5',
        klingV3MultiPromptEnabled: false,
        klingV3MultiPrompt: '',
        klingV3Shot1Duration: '5',
        klingV3Shot2Duration: '5',
      } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: true,
    }));

    await act(async () => {
      await result.current.exportSnapshot();
    });
    expect(result.current.activeSnapshotFileName).toBe('scene.bcsnap');
    setError.mockClear();
    setToastMessage.mockClear();
    vi.mocked(saveBackupSessionBinary).mockRejectedValueOnce(new Error('Snapshot backup storage quota exceeded.'));
    act(() => {
      result.current.autosaveSnapshot();
    });

    await waitFor(() => expect(beginAutosaveSnapshot).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setToastMessage).toHaveBeenCalledWith('Autosaved; backup unavailable'));
    expect(result.current.activeSnapshotFileName).toBe('scene.bcsnap');
    expect(beginSaveSnapshot).toHaveBeenCalledWith({
      suggestedName: expect.stringMatching(/^banana-canvas-snapshot-.*\.bcsnap$/),
    });
    expect(beginAutosaveSnapshot).toHaveBeenCalledWith({
      autosaveId: 'desktop-target-1',
    });
    expect(writeSnapshotChunk).toHaveBeenCalledWith(expect.objectContaining({ writeId: 'export-write-1' }));
    expect(writeSnapshotChunk).toHaveBeenCalledWith(expect.objectContaining({ writeId: 'autosave-write-1' }));
    expect(finishSnapshotWrite).toHaveBeenCalledWith({ writeId: 'export-write-1' });
    expect(finishSnapshotWrite).toHaveBeenCalledWith({ writeId: 'autosave-write-1' });
    expect(setError).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      'Primary snapshot autosave succeeded, but its backup could not be stored.',
      expect.objectContaining({ message: 'Snapshot backup storage quota exceeded.' }),
    );
  });

  it('preflights unavailable media and writes all PNG fallbacks in one desktop retry', async () => {
    const chunksByWriteId = new Map<string, Uint8Array[]>();
    const beginSaveSnapshot = vi.fn(async () => ({
      canceled: false as const,
      fileName: 'scene.bcsnap',
      writeId: 'export-write-1',
      autosaveId: 'desktop-target-1',
    }));
    let retrySequence = 0;
    const beginAutosaveSnapshot = vi.fn(async () => {
      retrySequence += 1;
      return { fileName: 'scene.bcsnap', writeId: `retry-write-${retrySequence}` };
    });
    const writeSnapshotChunk = vi.fn(async (payload: { writeId: string; data: ArrayBuffer }) => {
      const chunks = chunksByWriteId.get(payload.writeId) ?? [];
      chunks.push(new Uint8Array(payload.data));
      chunksByWriteId.set(payload.writeId, chunks);
      return { written: payload.data.byteLength };
    });
    const finishSnapshotWrite = vi.fn(async () => ({ saved: true }));
    const abortSnapshotWrite = vi.fn(async () => ({ aborted: true }));
    const setError = vi.fn();
    const setToastMessage = vi.fn();
    const buildMissingSourceFile = (name: string): File => {
      const missingSourceFile = new File(['missing'], name, { type: 'image/png' });
      Object.defineProperty(missingSourceFile, 'slice', {
        configurable: true,
        value: vi.fn(() => ({
          size: 1,
          arrayBuffer: () => Promise.reject(new DOMException(
            'A requested file or directory could not be found at the time an operation was processed.',
            'NotFoundError',
          )),
        })),
      });
      return missingSourceFile;
    }; // Simulate multiple Chromium file handles disappearing together.
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback): void => {
      callback(new Blob(['fallback-preview'], { type: 'image/png' }));
    });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222');
    window.canvaBananaDesktop = {
      fileMenu: {
        beginSaveSnapshot,
        beginAutosaveSnapshot,
        writeSnapshotChunk,
        finishSnapshotWrite,
        abortSnapshotWrite,
      },
    };

    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError,
        setToastMessage,
        setIsFileMenuOpen: vi.fn(),
      },
      fal: {
        falModelId: KLING_V3_VIDEO_MODEL_ID,
        falImageSizeSelection: 'default',
        falAspectRatioSelection: 'default',
        falResolutionSelection: '720p',
        falNumImages: 1,
        falScaleFactor: 2,
        falNoiseScale: 0.1,
        falCreativity: 0,
        klingV3Duration: '5',
        klingV3GenerateAudio: true,
        klingV3CfgScale: '0.5',
        klingV3MultiPromptEnabled: false,
        klingV3MultiPrompt: '',
        klingV3Shot1Duration: '5',
        klingV3Shot2Duration: '5',
      } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [
        buildImage({ id: 'missing-image-1', file: buildMissingSourceFile('missing-1.png') }),
        buildImage({ id: 'missing-image-2', file: buildMissingSourceFile('missing-2.png') }),
      ],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: true,
    }));

    await act(async () => {
      await result.current.exportSnapshot();
    });

    const parsed = await parseBinarySnapshotFile(fileFromChunks(chunksByWriteId.get('retry-write-1') ?? []));

    expect(abortSnapshotWrite).toHaveBeenCalledWith({ writeId: 'export-write-1' });
    expect(beginAutosaveSnapshot).toHaveBeenCalledWith({ autosaveId: 'desktop-target-1' });
    expect(beginAutosaveSnapshot).toHaveBeenCalledTimes(1);
    expect(chunksByWriteId.has('export-write-1')).toBe(false); // Preflight prevents a doomed partial snapshot write.
    expect(finishSnapshotWrite).not.toHaveBeenCalledWith({ writeId: 'export-write-1' });
    expect(finishSnapshotWrite).toHaveBeenCalledWith({ writeId: 'retry-write-1' });
    expect(parsed.manifest.state.images[0]).toEqual(expect.objectContaining({
      id: 'missing-image-1',
      fileName: 'missing-1-snapshot-fallback.png',
      fileType: 'image/png',
      mediaType: 'image',
      fallbackForMediaType: 'image',
      fallbackReason: 'source-unreadable',
    }));
    expect(parsed.images[0]?.manifest).toEqual(expect.objectContaining({
      id: 'missing-image-1',
      fileName: 'missing-1-snapshot-fallback.png',
      fileType: 'image/png',
    }));
    expect(parsed.images[0]?.blob.type).toBe('image/png');
    expect(parsed.manifest.state.images[1]).toEqual(expect.objectContaining({
      id: 'missing-image-2',
      fileName: 'missing-2-snapshot-fallback.png',
      fallbackReason: 'source-unreadable',
    }));
    expect(setError).toHaveBeenCalledWith(null);
    expect(setToastMessage).toHaveBeenCalledWith('Snapshot exported with 2 unavailable media previews');
  });

  it('uses a PNG fallback for download-link exports when source media cannot be read', async () => {
    let exportedBlob: Blob | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const setError = vi.fn();
    const setToastMessage = vi.fn();
    const missingSourceFile = new File(['missing'], 'missing.png', { type: 'image/png' });
    Object.defineProperty(missingSourceFile, 'slice', {
      configurable: true,
      value: vi.fn(() => ({
        size: 1,
        arrayBuffer: () => Promise.reject(new DOMException(
          'A requested file or directory could not be found at the time an operation was processed.',
          'NotFoundError',
        )),
      })),
    }); // Simulate Chromium failing to read a deleted file-backed source.
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback): void => {
      callback(new Blob(['fallback-preview'], { type: 'image/png' }));
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:download-snapshot';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    try {
      const { result } = renderHook(() => useSnapshotIO({
        ui: {
          appMode: 'CANVAS',
          tool: Tool.PAN,
          brushSize: 20,
          eraserSize: 20,
          brushColor: '#ff0000',
          prompt: '',
          apiProvider: 'fal',
          setAppMode: vi.fn(),
          setTool: vi.fn(),
          setBrushSize: vi.fn(),
          setEraserSize: vi.fn(),
          setBrushColor: vi.fn(),
          setPrompt: vi.fn(),
          setApiProvider: vi.fn(),
          setError,
          setToastMessage,
          setIsFileMenuOpen: vi.fn(),
        },
        fal: {
          falModelId: KLING_V3_VIDEO_MODEL_ID,
          falImageSizeSelection: 'default',
          falAspectRatioSelection: 'default',
          falResolutionSelection: '720p',
          falNumImages: 1,
          falScaleFactor: 2,
          falNoiseScale: 0.1,
          falCreativity: 0,
          klingV3Duration: '5',
          klingV3GenerateAudio: true,
          klingV3CfgScale: '0.5',
          klingV3MultiPromptEnabled: false,
          klingV3MultiPrompt: '',
          klingV3Shot1Duration: '5',
          klingV3Shot2Duration: '5',
        } as unknown as UseFalSettingsResult,
        selection: {
          selectedImageIds: [],
          referenceImageIds: [],
          referenceVideoIds: [],
          referenceAudioIds: [],
          seedanceReferenceOrderIds: [],
          elementImageIds: [],
          videoLastFrameImageId: null,
        } as unknown as SelectionStateResult,
        noteLabelCounterRef: { current: 1 },
        displayedImages: [buildImage({
          id: 'missing-image-1',
          file: missingSourceFile,
        })],
        displayedNotes: [],
        displayedPaths: [],
        displayedVideoPromptAreas: [],
        displayedVideoPromptBars: [],
        resetHistory: vi.fn(),
        providerAvailability: { google: true, fal: true },
        availableProviders: ['google', 'fal'],
        autosaveEnabled: false,
      }));

      await act(async () => {
        await result.current.exportSnapshot();
      });

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(exportedBlob).toBeInstanceOf(Blob);
      const parsed = await parseBinarySnapshotFile(new File([exportedBlob as Blob], 'download.bcsnap', { type: 'application/octet-stream' }));

      expect(parsed.manifest.state.images[0]).toEqual(expect.objectContaining({
        id: 'missing-image-1',
        fileName: 'missing-snapshot-fallback.png',
        fileType: 'image/png',
        mediaType: 'image',
        fallbackForMediaType: 'image',
        fallbackReason: 'source-unreadable',
      }));
      expect(setError).toHaveBeenCalledWith(null);
      expect(setToastMessage).toHaveBeenCalledWith('Snapshot exported with 1 unavailable media preview');
    } finally {
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL');
      }
      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL');
      }
    }
  });

  it('exports playing audio with the live element playback time', async () => {
    const exportedChunks: Uint8Array[] = [];
    const beginSaveSnapshot = vi.fn(async () => ({
      canceled: false as const,
      fileName: 'scene.bcsnap',
      writeId: 'export-write-1',
      autosaveId: 'desktop-target-1',
    }));
    const writeSnapshotChunk = vi.fn(async (payload: { writeId: string; data: ArrayBuffer }) => {
      if (payload.writeId === 'export-write-1') {
        exportedChunks.push(new Uint8Array(payload.data)); // Capture streamed snapshot bytes for manifest assertions.
      }
      return { written: payload.data.byteLength };
    });
    const audioImage = buildAudioImage({ currentPlaybackTime: 1 });
    (audioImage.audioElement as HTMLAudioElement).currentTime = 7.25;
    window.canvaBananaDesktop = {
      fileMenu: {
        beginSaveSnapshot,
        writeSnapshotChunk,
        finishSnapshotWrite: vi.fn(async () => ({ saved: true })),
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
      },
    };

    const { result } = renderHook(() => useSnapshotIO({
      ui: {
        appMode: 'CANVAS',
        tool: Tool.PAN,
        brushSize: 20,
        eraserSize: 20,
        brushColor: '#ff0000',
        prompt: '',
        apiProvider: 'fal',
        setAppMode: vi.fn(),
        setTool: vi.fn(),
        setBrushSize: vi.fn(),
        setEraserSize: vi.fn(),
        setBrushColor: vi.fn(),
        setPrompt: vi.fn(),
        setApiProvider: vi.fn(),
        setError: vi.fn(),
        setToastMessage: vi.fn(),
        setIsFileMenuOpen: vi.fn(),
      },
      fal: {
        falModelId: KLING_V3_VIDEO_MODEL_ID,
        falImageSizeSelection: 'default',
        falAspectRatioSelection: 'default',
        falResolutionSelection: '720p',
        falNumImages: 1,
        falScaleFactor: 2,
        falNoiseScale: 0.1,
        falCreativity: 0,
        klingV3Duration: '5',
        klingV3GenerateAudio: true,
        klingV3CfgScale: '0.5',
        klingV3MultiPromptEnabled: false,
        klingV3MultiPrompt: '',
        klingV3Shot1Duration: '5',
        klingV3Shot2Duration: '5',
      } as unknown as UseFalSettingsResult,
      selection: {
        selectedImageIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages: [audioImage],
      displayedNotes: [],
      displayedPaths: [],
      displayedVideoPromptAreas: [],
      displayedVideoPromptBars: [],
      resetHistory: vi.fn(),
      providerAvailability: { google: true, fal: true },
      availableProviders: ['google', 'fal'],
      autosaveEnabled: true,
    }));

    await act(async () => {
      await result.current.exportSnapshot();
    });

    const exportedSize = exportedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const exportedBytes = new Uint8Array(exportedSize);
    let offset = 0;
    exportedChunks.forEach(chunk => {
      exportedBytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    const exportedFile = new File([exportedBytes], 'scene.bcsnap', { type: 'application/octet-stream' });
    const parsed = await parseBinarySnapshotFile(exportedFile);

    expect(parsed.manifest.state.images[0]).toEqual(expect.objectContaining({
      id: 'audio-1',
      currentPlaybackTime: 7.25,
    }));
  });

  it('exports the latest Seedance reference order after selection-only rerenders', async () => {
    const exportedChunks: Uint8Array[] = [];
    window.canvaBananaDesktop = {
      fileMenu: {
        beginSaveSnapshot: vi.fn(async () => ({
          canceled: false as const,
          fileName: 'scene.bcsnap',
          writeId: 'export-write-1',
          autosaveId: 'desktop-target-1',
        })),
        writeSnapshotChunk: vi.fn(async (payload: { writeId: string; data: ArrayBuffer }) => {
          exportedChunks.push(new Uint8Array(payload.data));
          return { written: payload.data.byteLength };
        }),
        finishSnapshotWrite: vi.fn(async () => ({ saved: true })),
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
      },
    };
    const emptyIds: string[] = [];
    const displayedImages: CanvasImage[] = [];
    const displayedNotes: [] = [];
    const displayedPaths: [] = [];
    const displayedVideoPromptAreas: [] = [];
    const displayedVideoPromptBars: [] = [];
    const selectionSetters = {
      setSelectedImageIds: vi.fn(),
      setSelectedNoteIds: vi.fn(),
      setReferenceImageIds: vi.fn(),
      setReferenceVideoIds: vi.fn(),
      setReferenceAudioIds: vi.fn(),
      setSeedanceReferenceOrderIds: vi.fn(),
      setElementImageIds: vi.fn(),
      setVideoLastFrameImageId: vi.fn(),
    };
    const ui = {
      appMode: 'CANVAS' as const,
      tool: Tool.PAN,
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
      prompt: '',
      apiProvider: 'fal' as const,
      setAppMode: vi.fn(),
      setTool: vi.fn(),
      setBrushSize: vi.fn(),
      setEraserSize: vi.fn(),
      setBrushColor: vi.fn(),
      setPrompt: vi.fn(),
      setApiProvider: vi.fn(),
      setError: vi.fn(),
      setToastMessage: vi.fn(),
      setIsFileMenuOpen: vi.fn(),
    };
    const fal = {
      falModelId: KLING_V3_VIDEO_MODEL_ID,
      falImageSizeSelection: 'default',
      falAspectRatioSelection: 'default',
      falResolutionSelection: '720p',
      falNumImages: 1,
      falScaleFactor: 2,
      falNoiseScale: 0.1,
      falCreativity: 0,
      klingV3Duration: '5',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '0.5',
      klingV3MultiPromptEnabled: false,
      klingV3MultiPrompt: '',
      klingV3Shot1Duration: '5',
      klingV3Shot2Duration: '5',
      jimengMultiframeDuration: '8',
      jimengMultiframeResolution: '1080p',
      jimengSessionId: 23,
    } as unknown as UseFalSettingsResult;
    const resetHistory = vi.fn();
    const providerAvailability = { google: true, fal: true };
    const availableProviders: Array<'google' | 'fal'> = ['google', 'fal'];
    const { result, rerender } = renderHook(({ orderIds }: { orderIds: string[] }) => useSnapshotIO({
      ui,
      fal,
      selection: {
        selectedImageIds: emptyIds,
        referenceImageIds: emptyIds,
        referenceVideoIds: emptyIds,
        referenceAudioIds: emptyIds,
        seedanceReferenceOrderIds: orderIds,
        elementImageIds: emptyIds,
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
      noteLabelCounterRef: { current: 1 },
      displayedImages,
      displayedNotes,
      displayedPaths,
      displayedVideoPromptAreas,
      displayedVideoPromptBars,
      resetHistory,
      providerAvailability,
      availableProviders,
      autosaveEnabled: false,
    }), { initialProps: { orderIds: ['reference-a'] } });

    rerender({ orderIds: ['reference-b', 'reference-a'] });
    await act(async () => {
      await result.current.exportSnapshot();
    });

    const exportedFile = fileFromChunks(exportedChunks);
    const parsed = await parseBinarySnapshotFile(exportedFile);
    expect(parsed.manifest.state.meta?.seedanceReferenceOrderIds).toEqual(['reference-b', 'reference-a']);
    expect(parsed.manifest.state.meta?.jimengMultiframeDuration).toBe('8');
    expect(parsed.manifest.state.meta?.jimengMultiframeResolution).toBe('1080p');
    expect(parsed.manifest.state.meta?.jimengSessionId).toBe(23);
  });
});
