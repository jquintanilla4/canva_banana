import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import { generateImage as generateGoogleImage } from '../../services/geminiService';
import { generateSeedanceVideo } from '../../services/volcengineService';
import { loadMediaFromBlob } from '../../services/mediaService';
import { Tool, type FalQueueJob } from '../../types';
import type { AppState } from '../useCanvasHistory';
import type { UseFalSettingsResult } from '../useFalSettings';
import type { SelectionStateResult } from '../useSelectionState';
import { useGeneration } from '../useGeneration';

vi.mock('../../services/geminiService', async () => {
  const actual = await vi.importActual<typeof import('../../services/geminiService')>('../../services/geminiService');
  return {
    ...actual,
    generateImage: vi.fn(),
    generateImageEdit: vi.fn(),
  };
});

vi.mock('../../services/volcengineService', async () => {
  const actual = await vi.importActual<typeof import('../../services/volcengineService')>('../../services/volcengineService');
  return {
    ...actual,
    generateSeedanceVideo: vi.fn(),
  };
});

vi.mock('../../services/falService', async () => {
  const actual = await vi.importActual<typeof import('../../services/falService')>('../../services/falService');
  return {
    ...actual,
    generateImage: vi.fn(),
    generateImageEdit: vi.fn(),
    generateImageToVideo: vi.fn(),
    uploadVideoToFal: vi.fn(),
  };
});

vi.mock('../../services/mediaService', async () => {
  const actual = await vi.importActual<typeof import('../../services/mediaService')>('../../services/mediaService');
  return {
    ...actual,
    loadMediaFromBlob: vi.fn(actual.loadMediaFromBlob),
  };
});

const imageConstructor = globalThis.Image;
const uuid = (tail: string) => `00000000-0000-4000-8000-${tail}` as ReturnType<Crypto['randomUUID']>;

class TestImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 64;
  naturalHeight = 48;
  width = 64;
  height = 48;
  private currentSrc = '';

  set src(value: string) {
    this.currentSrc = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this.currentSrc;
  }
}

const createFalStub = (overrides: Partial<UseFalSettingsResult> = {}): UseFalSettingsResult => ({
  falModelMode: 'image',
  falImageModelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
  falVideoModelId: SEEDANCE_2_VIDEO_MODEL_ID,
  falImageSizeSelection: 'default',
  falAspectRatioSelection: 'default',
  falResolutionSelection: '1K',
  falNumImages: 1,
  falScaleFactor: 2,
  falNoiseScale: 0.5,
  falCreativity: 0.5,
  falVideoDuration: '5',
  hailuoVariant: 'standard',
  klingVariant: 'standard',
  klingV3Duration: '5',
  klingV3GenerateAudio: false,
  klingV3CfgScale: '0.5',
  klingV3MultiPromptEnabled: false,
  klingV3MultiPrompt: '',
  klingV3Shot1Duration: '5',
  klingV3Shot2Duration: '5',
  klingO3Variant: 'reference',
  klingO3Duration: '5',
  klingO3GenerateAudio: false,
  klingO3KeepAudio: true,
  klingV3ControlKeepSound: false,
  klingV3ControlOrientation: 'video',
  wanTargetResolution: '720p',
  wanCreativity: 0,
  wanAnimateVariant: 'replace',
  wanAnimateSteps: '10',
  wanAnimateResolution: '480p',
  oneToAllAnimateResolution: '480p',
  wanAnimateShift: '5.0',
  wanAnimateQuality: 'high',
  wanAnimateUseTurbo: false,
  lipsyncSyncMode: 'cut_off',
  heygenEnableCaption: false,
  heygenEnableDynamicDuration: true,
  heygenDisableMusicTrack: false,
  heygenEnableSpeechEnhancement: false,
  infinitalkResolution: '480p',
  infinitalkSeed: '42',
  infinitalkAcceleration: 'none',
  infinitalkDuration: '5s',
  grokImagineVideoDuration: '5',
  grokImagineVideoResolution: '720p',
  grokImagineVideoAspectRatio: '16:9',
  veo31Variant: 'i2v-fflf',
  veo31Duration: '4s',
  veo31Resolution: '720p',
  veo31AspectRatio: 'auto',
  veo31GenerateAudio: false,
  wan27VideoResolution: '720p',
  wan27VideoDuration: '5',
  wan27VideoAspectRatio: '16:9',
  wan27VideoPromptExpansion: false,
  wan27VideoVariant: 'smart',
  wan27VideoAudioSetting: 'auto',
  isWan27VideoModel: false,
  seedance15AspectRatio: '16:9',
  seedance15Resolution: '720p',
  seedance15Duration: '5',
  seedance15CameraFixed: false,
  seedance15Audio: false,
  seedance2Variant: 'smart',
  seedance2JimengModelVersion: 'seedance2.0fast',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  isFalSeedance2VideoModel: false,
  isVolcengineSeedance2VideoModel: false,
  isJimengSeedance2VideoModel: false,
  isSeedance15VideoModel: false,
  flux2MaxImageSize: 'landscape_16_9',
  isFlux2MaxModel: false,
  wan27ImageAspectRatio: 'landscape_16_9',
  wan27ImageMaxImages: '1',
  isWan27ImageModel: false,
  recraftImageSize: 'square_hd',
  recraftBackgroundColor: { r: 255, g: 255, b: 255 },
  recraftColors: [],
  gptImage2Quality: 'medium',
  krea2AspectRatio: '1:1',
  krea2Creativity: 'medium',
  setFalImageSizeSelection: vi.fn(),
  setFalAspectRatioSelection: vi.fn(),
  ...overrides,
} as unknown as UseFalSettingsResult);

const createSelectionStub = (overrides: Partial<SelectionStateResult> = {}): SelectionStateResult => ({
  selectedImageIds: ['selected-before-generation'],
  selectedNoteIds: [],
  referenceImageIds: [],
  referenceVideoIds: [],
  referenceAudioIds: [],
  seedanceReferenceOrderIds: [],
  elementImageIds: [],
  videoLastFrameImageId: null,
  sourceVideoId: null,
  sourceAudioId: null,
  primaryImageId: null,
  primaryImage: null,
  primarySelectionMediaType: null,
  activePrimaryImage: null,
  hasSingleImageSelected: false,
  setSelectedImageIds: vi.fn(),
  setSelectedNoteIds: vi.fn(),
  setReferenceImageIds: vi.fn(),
  setReferenceVideoIds: vi.fn(),
  setReferenceAudioIds: vi.fn(),
  setSeedanceReferenceOrderIds: vi.fn(),
  setElementImageIds: vi.fn(),
  setVideoLastFrameImageId: vi.fn(),
  setSourceVideoId: vi.fn(),
  setSourceAudioId: vi.fn(),
  handleImageSelection: vi.fn(),
  handleNoteSelection: vi.fn(),
  ...overrides,
});

const createStateHarness = () => {
  let state: AppState = { images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] };
  const setState = vi.fn((updater: (prevState: AppState) => AppState) => {
    state = updater(state);
  });
  return { get state() { return state; }, setState };
};

const expectPlacementCleanupLeftToApp = (
  selection: SelectionStateResult,
  setTool: ReturnType<typeof vi.fn>,
) => {
  expect(selection.setSelectedImageIds).not.toHaveBeenCalled();
  expect(selection.setSelectedNoteIds).not.toHaveBeenCalled();
  expect(selection.setReferenceImageIds).not.toHaveBeenCalled();
  expect(selection.setReferenceVideoIds).not.toHaveBeenCalled();
  expect(selection.setReferenceAudioIds).not.toHaveBeenCalled();
  expect(selection.setElementImageIds).not.toHaveBeenCalled();
  expect(selection.setVideoLastFrameImageId).not.toHaveBeenCalled();
  expect(setTool).not.toHaveBeenCalledWith(Tool.FREE_SELECTION);
};

describe('useGeneration placement notifications', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'Image', {
      value: TestImage,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'Image', {
      value: imageConstructor,
      configurable: true,
    });
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('notifies the app when generated image batches are placed', async () => {
    const selection = createSelectionStub();
    const stateHarness = createStateHarness();
    const onGenerationComplete = vi.fn();
    const onGenerationPlaced = vi.fn();
    const setTool = vi.fn();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(uuid('000000000001'))
      .mockReturnValueOnce(uuid('000000000002'));
    vi.mocked(generateGoogleImage).mockResolvedValue({
      imageBase64: 'Zm9v',
      imagesBase64: ['Zm9v', 'YmFy'],
      text: 'done',
    });

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'make two images',
      promptPrefix: '',
      apiProvider: 'google',
      fal: createFalStub(),
      selection,
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: stateHarness.setState,
      setToastMessage: vi.fn(),
      setTool,
      onGenerationComplete,
      onGenerationPlaced,
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(stateHarness.state.images.map(image => image.id)).toEqual([
      uuid('000000000001'),
      uuid('000000000002'),
    ]);
    expect(onGenerationPlaced).toHaveBeenCalledWith({
      mediaIds: [uuid('000000000001'), uuid('000000000002')],
      mediaType: 'image',
      modelLabel: 'Google Gemini',
    });
    expectPlacementCleanupLeftToApp(selection, setTool);
    expect(onGenerationComplete).toHaveBeenCalledTimes(1);
  });

  it('notifies the app when Seedance videos are placed', async () => {
    const selection = createSelectionStub();
    const stateHarness = createStateHarness();
    const onGenerationComplete = vi.fn();
    const onGenerationPlaced = vi.fn();
    const setTool = vi.fn();
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      const prev: FalQueueJob[] = [];
      return typeof value === 'function' ? value(prev) : value;
    });
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { configurable: true, value: 320 });
    Object.defineProperty(videoElement, 'videoHeight', { configurable: true, value: 180 });
    videoElement.play = vi.fn().mockResolvedValue(undefined);
    videoElement.pause = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })),
    }));
    vi.mocked(generateSeedanceVideo).mockResolvedValue({
      videoUrl: 'https://example.com/video.mp4',
      requestId: 'req-video',
    });
    vi.mocked(loadMediaFromBlob).mockResolvedValue(videoElement);

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'make a video',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub({
        falModelMode: 'video',
        falVideoModelId: SEEDANCE_2_VIDEO_MODEL_ID,
        isVolcengineSeedance2VideoModel: true,
      }),
      selection,
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: stateHarness.setState,
      setToastMessage: vi.fn(),
      setTool,
      onGenerationComplete,
      onGenerationPlaced,
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    const placedVideoId = stateHarness.state.images[0]?.id;

    expect(stateHarness.state.images).toHaveLength(1);
    expect(typeof placedVideoId).toBe('string');
    expect(onGenerationPlaced).toHaveBeenCalledWith({
      mediaIds: [placedVideoId],
      mediaType: 'video',
      modelLabel: 'Seedance 2 (VE) Smart',
    });
    expectPlacementCleanupLeftToApp(selection, setTool);
    expect(onGenerationComplete).toHaveBeenCalledTimes(1);
  });
});
