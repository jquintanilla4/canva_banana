import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tool } from '../../types';
import type { SnapshotMetaState } from '../../services/snapshotService';
import { KLING_V3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useSnapshotIO } from '../useSnapshotIO';
import type { SelectionStateResult } from '../useSelectionState';
import type { UseFalSettingsResult } from '../useFalSettings';

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
  selectedImageIds: [],
  selectedNoteIds: [],
  referenceImageIds: [],
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
  });
});
