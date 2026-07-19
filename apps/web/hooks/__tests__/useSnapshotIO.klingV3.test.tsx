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

afterEach(() => {
  delete window.canvaBananaDesktop;
  Reflect.deleteProperty(window, 'showSaveFilePicker');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useSnapshotIO (Kling v3)', () => {
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
      fal: {} as unknown as UseFalSettingsResult,
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
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.importSnapshotFromFile(browserFile);
    });

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
      fal: {} as unknown as UseFalSettingsResult,
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
      fal: {} as unknown as UseFalSettingsResult,
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
      autosaveEnabled: false,
    }));

    await act(async () => {
      await result.current.importSnapshotFromFile(currentSource);
    });
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
    window.canvaBananaDesktop = {
      fileMenu: {
        beginSaveSnapshot: vi.fn(async () => ({
          canceled: false as const,
          fileName: 'scene.bcsnap',
          writeId: 'export-write-1',
          autosaveId: 'desktop-target-1',
        })),
        beginAutosaveSnapshot: vi.fn(async () => {
          autosaveSequence += 1;
          return { fileName: 'scene.bcsnap', writeId: `autosave-write-${autosaveSequence}` };
        }),
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
      fal: {} as unknown as UseFalSettingsResult,
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
      await result.current.importSnapshotFromFile(activationSource);
    });
    await act(async () => {
      await result.current.exportSnapshot(); // Establishes the autosave session.
    });
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
    await waitFor(() => expect(finishSnapshotWrite).toHaveBeenCalledTimes(3));

    expect(closeSnapshotRead).toHaveBeenCalledTimes(1);
    const secondAutosaveFile = fileFromChunks(writtenChunks.get('autosave-write-2') ?? [], 'autosave-2.bcsnap');
    const secondAutosave = await parseBinarySnapshotFile(secondAutosaveFile);
    expect(secondAutosave.manifest.state.images[0]).not.toHaveProperty('fallbackReason');
    const restoredMedia = await readSnapshotBlobPartAsArrayBuffer(secondAutosave.images[0].blob, 0, secondAutosave.images[0].blob.size);
    expect(new Uint8Array(restoredMedia)).toEqual(originalMedia);
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
    setError.mockClear();
    setToastMessage.mockClear();
    vi.mocked(saveBackupSessionBinary).mockRejectedValueOnce(new Error('Snapshot backup storage quota exceeded.'));
    act(() => {
      result.current.autosaveSnapshot();
    });

    await waitFor(() => expect(beginAutosaveSnapshot).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setToastMessage).toHaveBeenCalledWith('Autosaved; backup unavailable'));
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

  it('retries desktop exports with a PNG fallback when source media cannot be read', async () => {
    const chunksByWriteId = new Map<string, Uint8Array[]>();
    const beginSaveSnapshot = vi.fn(async () => ({
      canceled: false as const,
      fileName: 'scene.bcsnap',
      writeId: 'export-write-1',
      autosaveId: 'desktop-target-1',
    }));
    const beginAutosaveSnapshot = vi.fn(async () => ({
      fileName: 'scene.bcsnap',
      writeId: 'retry-write-1',
    }));
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
    }); // Simulate Chromium's lazy file-read failure for deleted source media.
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
      autosaveEnabled: true,
    }));

    await act(async () => {
      await result.current.exportSnapshot();
    });

    const parsed = await parseBinarySnapshotFile(fileFromChunks(chunksByWriteId.get('retry-write-1') ?? []));

    expect(abortSnapshotWrite).toHaveBeenCalledWith({ writeId: 'export-write-1' });
    expect(beginAutosaveSnapshot).toHaveBeenCalledWith({ autosaveId: 'desktop-target-1' });
    expect(finishSnapshotWrite).not.toHaveBeenCalledWith({ writeId: 'export-write-1' });
    expect(finishSnapshotWrite).toHaveBeenCalledWith({ writeId: 'retry-write-1' });
    expect(parsed.manifest.state.images[0]).toEqual(expect.objectContaining({
      id: 'missing-image-1',
      fileName: 'missing-snapshot-fallback.png',
      fileType: 'image/png',
      mediaType: 'image',
      fallbackForMediaType: 'image',
      fallbackReason: 'source-unreadable',
    }));
    expect(parsed.images[0]?.manifest).toEqual(expect.objectContaining({
      id: 'missing-image-1',
      fileName: 'missing-snapshot-fallback.png',
      fileType: 'image/png',
    }));
    expect(parsed.images[0]?.blob.type).toBe('image/png');
    expect(setError).toHaveBeenCalledWith(null);
    expect(setToastMessage).toHaveBeenCalledWith('Snapshot exported with 1 unavailable media preview');
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
  });
});
