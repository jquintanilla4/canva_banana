import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tool, type CanvasImage } from '../../types';
import { parseBinarySnapshotFile, type SnapshotMetaState } from '../../services/snapshotService';
import { KLING_V3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useSnapshotIO } from '../useSnapshotIO';
import type { SelectionStateResult } from '../useSelectionState';
import type { UseFalSettingsResult } from '../useFalSettings';

vi.mock('../../services/backupService', () => ({
  pruneBackupSessions: vi.fn(async () => {}),
  saveBackupSession: vi.fn(async () => {}),
}));

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
  selectedNoteIds: [],
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

afterEach(() => {
  delete window.canvaBananaDesktop;
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
        selectedNoteIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
        ...selectionSetters,
      } as unknown as SelectionStateResult,
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

  it('autosaves desktop exports through the native autosave target', async () => {
    const saveSnapshotFile = vi.fn(async () => ({
      canceled: false as const,
      fileName: 'scene.bcsnap',
      autosaveId: 'desktop-target-1',
    }));
    const writeSnapshotFile = vi.fn(async () => ({ saved: true }));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    window.canvaBananaDesktop = {
      fileMenu: {
        saveSnapshotFile,
        writeSnapshotFile,
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
        selectedNoteIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
      } as unknown as SelectionStateResult,
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
    act(() => {
      result.current.autosaveSnapshot();
    });

    await waitFor(() => expect(writeSnapshotFile).toHaveBeenCalledTimes(1));
    expect(saveSnapshotFile).toHaveBeenCalledWith({
      suggestedName: expect.stringMatching(/^banana-canvas-snapshot-.*\.bcsnap$/),
      data: expect.any(ArrayBuffer),
    });
    expect(writeSnapshotFile).toHaveBeenCalledWith({
      autosaveId: 'desktop-target-1',
      data: expect.any(ArrayBuffer),
    });
  });

  it('exports playing audio with the live element playback time', async () => {
    let exportedData: ArrayBuffer | null = null;
    const saveSnapshotFile = vi.fn(async (payload: { suggestedName: string; data: ArrayBuffer }) => {
      exportedData = payload.data; // Capture the generated snapshot bytes for manifest assertions.
      return {
        canceled: false as const,
        fileName: 'scene.bcsnap',
        autosaveId: 'desktop-target-1',
      };
    });
    const audioImage = buildAudioImage({ currentPlaybackTime: 1 });
    (audioImage.audioElement as HTMLAudioElement).currentTime = 7.25;
    window.canvaBananaDesktop = {
      fileMenu: {
        saveSnapshotFile,
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
        selectedNoteIds: [],
        referenceImageIds: [],
        referenceVideoIds: [],
        referenceAudioIds: [],
        seedanceReferenceOrderIds: [],
        elementImageIds: [],
        videoLastFrameImageId: null,
      } as unknown as SelectionStateResult,
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

    expect(exportedData).toBeInstanceOf(ArrayBuffer);
    const exportedFile = { arrayBuffer: async () => exportedData as ArrayBuffer } as File;
    const parsed = await parseBinarySnapshotFile(exportedFile);

    expect(parsed.manifest.state.images[0]).toEqual(expect.objectContaining({
      id: 'audio-1',
      currentPlaybackTime: 7.25,
    }));
  });
});
