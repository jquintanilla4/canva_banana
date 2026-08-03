import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
} from '../../services/modelConfig';
import { generateImage as generateGoogleImage } from '../../services/geminiService';
import { generateImage as generateFalImage, generateImageEdit as generateFalImageEdit, generateImageToVideo as generateFalImageToVideo, uploadVideoToFal } from '../../services/falService';
import { generateSeedanceVideo } from '../../services/volcengineService';
import { loadMediaFromBlob } from '../../services/mediaService';
import { extractHeygenClipIntent } from '../../services/moonshotIntentService';
import { Tool, type CanvasImage, type FalQueueJob, type Path } from '../../types';
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

vi.mock('../../services/moonshotIntentService', async () => {
  const actual = await vi.importActual<typeof import('../../services/moonshotIntentService')>('../../services/moonshotIntentService');
  return {
    ...actual,
    extractHeygenClipIntent: vi.fn(),
  };
});

const imageConstructor = globalThis.Image;
const uuid = (tail: string) => `00000000-0000-4000-8000-${tail}` as ReturnType<Crypto['randomUUID']>;

const buildCanvasImage = (id: string): CanvasImage & { element: HTMLImageElement } => ({
  id,
  element: new Image() as HTMLImageElement,
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 64,
  height: 48,
  rotation: 0,
  naturalWidth: 64,
  naturalHeight: 48,
  file: new File(['image'], `${id}.png`, { type: 'image/png' }),
  isPlaying: false,
  hasAudio: false,
}); // Minimal still image for generation hook tests.

const buildCanvasMedia = (id: string, mediaType: 'video' | 'audio'): CanvasImage => ({
  id,
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File([mediaType], `${id}.${mediaType === 'video' ? 'mp4' : 'mp3'}`, {
    type: mediaType === 'video' ? 'video/mp4' : 'audio/mpeg',
  }),
  ...(mediaType === 'audio' ? { audioElement: document.createElement('audio') } : {}),
}); // Minimal source media exercises upload-backed video retries.

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
  setReferenceImageIds: vi.fn(),
  setReferenceVideoIds: vi.fn(),
  setReferenceAudioIds: vi.fn(),
  setSeedanceReferenceOrderIds: vi.fn(),
  setElementImageIds: vi.fn(),
  setVideoLastFrameImageId: vi.fn(),
  setSourceVideoId: vi.fn(),
  setSourceAudioId: vi.fn(),
  handleImageSelection: vi.fn(),
  replaceCanvasSelection: vi.fn(),
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
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
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
    expect(queuedJobs[0]?.retryInputs).toMatchObject({
      kind: 'video',
      provider: 'volcengine',
      modelId: SEEDANCE_2_VIDEO_MODEL_ID,
      volcengineOptions: {
        seedance2Variant: 'smart',
        seedance2AspectRatio: '16:9',
        seedance2Resolution: '720p',
        seedance2Duration: '5',
      },
    });
  });

  it('replaces a failed queue row when retrying a Fal image generation', async () => {
    const selection = createSelectionStub();
    const stateHarness = createStateHarness();
    const setTool = vi.fn();
    let queuedJobs: FalQueueJob[] = [{
      id: 'failed-job',
      prompt: 'old prompt',
      modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
      modelLabel: 'Old Model',
      provider: 'fal',
      status: 'FAILED',
      logs: ['old log'],
      requestId: 'old-request',
      description: 'old description',
      error: 'old error',
      outputUrl: 'https://example.com/old.png',
      createdAt: 1,
      updatedAt: 1,
    }];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.mocked(generateFalImage).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'current prompt',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
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
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate({
        kind: 'text_to_image',
        prompt: 'retry prompt',
        provider: 'fal',
        modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
        modelLabel: 'Nano Banana Pro',
        modelMode: 'image',
      }, { retryJobId: 'failed-job' });
    });

    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0]).toMatchObject({
      id: 'failed-job',
      prompt: 'retry prompt',
      provider: 'fal',
      status: 'FAILED',
      logs: [],
      retryInputs: {
        kind: 'text_to_image',
        prompt: 'retry prompt',
        provider: 'fal',
        modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
        modelMode: 'image',
      },
    });
    expect(queuedJobs[0].requestId).toBeUndefined();
    expect(queuedJobs[0].description).toBeUndefined();
    expect(queuedJobs[0].outputUrl).toBeUndefined();
  });

  it('retries Flux 2 Max with the saved size instead of the current picker value', async () => {
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.mocked(generateFalImage).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'current prompt',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub({ flux2MaxImageSize: 'landscape_16_9' }),
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: createStateHarness().setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate({
        kind: 'text_to_image',
        prompt: 'retry Flux image',
        provider: 'fal',
        modelId: FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
        modelMode: 'image',
        falOptions: { flux2MaxImageSize: 'portrait_4_3' },
      }, { retryJobId: 'failed-flux-job' });
    });

    expect(generateFalImage).toHaveBeenCalledWith('retry Flux image', expect.objectContaining({
      flux2MaxImageSize: 'portrait_4_3',
    }));
    expect(queuedJobs[0]?.retryInputs?.falOptions).toMatchObject({
      flux2MaxImageSize: 'portrait_4_3',
    });
  });

  it('retries a saved Fal video without inheriting the current tail-frame selection', async () => {
    const tailFrame = buildCanvasImage('tail-frame');
    const stateHarness = createStateHarness();
    const setError = vi.fn();
    const setTool = vi.fn();
    let queuedJobs: FalQueueJob[] = [{
      id: 'failed-video',
      prompt: 'old video prompt',
      modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      modelLabel: 'Old Fal Seedance',
      provider: 'fal',
      retryInputs: {
        kind: 'video',
        prompt: 'retry text-only video',
        provider: 'fal',
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
      },
      status: 'FAILED',
      logs: ['old log'],
      createdAt: 1,
      updatedAt: 1,
    }];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.mocked(generateFalImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so retry payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'current prompt',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub({
        falModelMode: 'video',
        falVideoModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        isFalSeedance2VideoModel: true,
        isVolcengineSeedance2VideoModel: false,
        seedance2Variant: 'smart',
      }),
      selection: createSelectionStub({
        videoLastFrameImageId: tailFrame.id,
      }),
      images: [tailFrame],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: stateHarness.setState,
      setToastMessage: vi.fn(),
      setTool,
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate(queuedJobs[0].retryInputs, { retryJobId: 'failed-video' });
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateFalImageToVideo).mock.calls[0]?.[2];
    expect(generateFalImageToVideo).toHaveBeenCalledWith(
      'retry text-only video',
      null,
      expect.objectContaining({
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      }),
    );
    expect(submittedOptions).not.toHaveProperty('tailImage');
    expect(setError).not.toHaveBeenCalledWith('Seedance 2 first/last-frame mode requires a starting still image.');
    expect(queuedJobs[0].retryInputs).toMatchObject({
      kind: 'video',
      prompt: 'retry text-only video',
      videoLastFrameImageId: null,
    });
  });

  it('continues Wan enhancement when optional duration metadata is unavailable', async () => {
    const sourceVideo = buildCanvasMedia('wan-enhancer-video', 'video');
    const videoElement = sourceVideo.element as HTMLVideoElement;
    vi.spyOn(videoElement, 'load').mockImplementation(() => videoElement.dispatchEvent(new Event('error'))); // Legacy metadata failure must not block upload.
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/source-video');
    vi.mocked(generateFalImageToVideo).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub({
        falModelMode: 'video',
        falVideoModelId: WAN_VISION_ENHANCER_MODEL_ID,
      }),
      selection: createSelectionStub({ sourceVideoId: sourceVideo.id }),
      images: [sourceVideo],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: createStateHarness().setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(uploadVideoToFal).toHaveBeenCalledTimes(1);
    expect(generateFalImageToVideo).toHaveBeenCalledTimes(1);
  });

  it('continues HeyGen intent extraction without unavailable duration metadata', async () => {
    const sourceVideo = buildCanvasMedia('heygen-legacy-video', 'video');
    const sourceAudio = buildCanvasMedia('heygen-legacy-audio', 'audio');
    const videoElement = sourceVideo.element as HTMLVideoElement;
    vi.spyOn(videoElement, 'load').mockImplementation(() => videoElement.dispatchEvent(new Event('error'))); // Optional timing context may remain unknown.
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/source-media');
    vi.mocked(extractHeygenClipIntent).mockResolvedValue({ startTime: 1, endTime: 4 });
    vi.mocked(generateFalImageToVideo).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'use the middle section',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub({
        falModelMode: 'video',
        falVideoModelId: HEYGEN_V3_LIPSYNC_MODEL_ID,
      }),
      selection: createSelectionStub({
        sourceVideoId: sourceVideo.id,
        sourceAudioId: sourceAudio.id,
      }),
      images: [sourceVideo, sourceAudio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: createStateHarness().setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(extractHeygenClipIntent).toHaveBeenCalledWith('use the middle section', {
      videoDurationSeconds: undefined,
    });
    expect(generateFalImageToVideo).toHaveBeenCalledTimes(1);
  });

  it('replays finalized HeyGen timing after uploads queue the job early', async () => {
    const sourceVideo = buildCanvasMedia('heygen-video', 'video');
    const sourceAudio = buildCanvasMedia('heygen-audio', 'audio');
    Object.defineProperty(sourceVideo.element, 'duration', { configurable: true, value: 12 });
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.mocked(uploadVideoToFal).mockImplementation(async (_file, options) => {
      options?.onPhaseUpdate?.({ phase: 'uploading', message: `Uploading ${options.label}` });
      return `https://example.com/${options?.label?.replace(' ', '-') ?? 'source'}`;
    });
    vi.mocked(extractHeygenClipIntent).mockResolvedValue({ startTime: 1.25, endTime: 4.5 });
    vi.mocked(generateFalImageToVideo).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'use the clip from 1.25 to 4.5 seconds',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub({
        falModelMode: 'video',
        falVideoModelId: HEYGEN_V3_LIPSYNC_MODEL_ID,
      }),
      selection: createSelectionStub({
        sourceVideoId: sourceVideo.id,
        sourceAudioId: sourceAudio.id,
      }),
      images: [sourceVideo, sourceAudio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: createStateHarness().setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(queuedJobs[0]).toMatchObject({
      status: 'FAILED',
      retryInputs: {
        sourceVideoId: sourceVideo.id,
        sourceAudioId: sourceAudio.id,
        falOptions: {
          heygenTimingResolved: true,
          heygenStartTime: 1.25,
          heygenEndTime: 4.5,
        },
      },
    });
    expect(generateFalImageToVideo).toHaveBeenLastCalledWith(
      'use the clip from 1.25 to 4.5 seconds',
      null,
      expect.objectContaining({ heygenStartTime: 1.25, heygenEndTime: 4.5 }),
    );

    await act(async () => {
      await result.current.handleGenerate(queuedJobs[0].retryInputs, { retryJobId: queuedJobs[0].id });
    });

    expect(extractHeygenClipIntent).toHaveBeenCalledTimes(1);
    expect(generateFalImageToVideo).toHaveBeenLastCalledWith(
      'use the clip from 1.25 to 4.5 seconds',
      null,
      expect.objectContaining({ heygenStartTime: 1.25, heygenEndTime: 4.5 }),
    );
  });

  it('retries a failed Fal image edit with saved tool and paths', async () => {
    const primary = buildCanvasImage('primary-image');
    const savedPaths: Path[] = [{
      points: [{ x: 4, y: 6 }, { x: 20, y: 24 }],
      color: '#ff0000',
      size: 12,
      tool: Tool.BRUSH,
    }];
    const stateHarness = createStateHarness();
    let queuedJobs: FalQueueJob[] = [{
      id: 'failed-edit',
      prompt: 'old edit',
      modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
      modelLabel: 'Old Model',
      provider: 'fal',
      retryInputs: {
        kind: 'image_edit',
        prompt: 'saved edit prompt',
        provider: 'fal',
        modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
        modelMode: 'image',
        primaryImageId: primary.id,
        editAppMode: 'CANVAS',
        editTool: Tool.FREE_SELECTION,
        editPaths: savedPaths,
      },
      status: 'FAILED',
      logs: ['old log'],
      createdAt: 1,
      updatedAt: 1,
    }];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.mocked(generateFalImageEdit).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.SELECTION,
      prompt: 'current prompt',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [primary],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: stateHarness.setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate(queuedJobs[0].retryInputs, { retryJobId: 'failed-edit' });
    });

    expect(generateFalImageEdit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'saved edit prompt',
      image: primary.element,
      tool: Tool.FREE_SELECTION,
      paths: savedPaths,
    }), expect.objectContaining({
      modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
    }));
    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0]).toMatchObject({
      id: 'failed-edit',
      status: 'FAILED',
      retryInputs: {
        kind: 'image_edit',
        prompt: 'saved edit prompt',
        primaryImageId: primary.id,
        editAppMode: 'CANVAS',
        editTool: Tool.FREE_SELECTION,
        editPaths: savedPaths,
      },
    });
    expect(queuedJobs[0].logs).toEqual([]);
  });

  it('defaults missing annotate retry tools back to annotation masks', async () => {
    const primary = buildCanvasImage('primary-image');
    const savedPaths: Path[] = [{
      points: [{ x: 9, y: 10 }, { x: 22, y: 30 }],
      color: '#0000ff',
      size: 10,
      tool: Tool.ANNOTATE,
    }];
    const stateHarness = createStateHarness();
    let queuedJobs: FalQueueJob[] = [{
      id: 'failed-annotate-edit',
      prompt: 'old annotate edit',
      modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
      modelLabel: 'Old Model',
      provider: 'fal',
      retryInputs: {
        kind: 'image_edit',
        prompt: 'saved annotate prompt',
        provider: 'fal',
        modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
        modelMode: 'image',
        primaryImageId: primary.id,
        editAppMode: 'ANNOTATE',
        editPaths: savedPaths,
      },
      status: 'FAILED',
      logs: ['old log'],
      createdAt: 1,
      updatedAt: 1,
    }];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.mocked(generateFalImageEdit).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.SELECTION,
      prompt: 'current prompt',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [primary],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: stateHarness.setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate(queuedJobs[0].retryInputs, { retryJobId: 'failed-annotate-edit' });
    });

    expect(generateFalImageEdit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'saved annotate prompt',
      image: primary.element,
      tool: Tool.ANNOTATE,
      paths: savedPaths,
    }), expect.objectContaining({
      modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
    }));
    expect(queuedJobs[0].retryInputs).toMatchObject({
      editAppMode: 'ANNOTATE',
      editTool: Tool.ANNOTATE,
      editPaths: savedPaths,
    });
  });

  it('stores annotate brush masks as replayable Fal edit retry inputs', async () => {
    const primary = buildCanvasImage('primary-image');
    const annotatePaths: Path[] = [{
      points: [{ x: 12, y: 18 }, { x: 36, y: 42 }],
      color: '#00ff00',
      size: 8,
      tool: Tool.ANNOTATE,
    }];
    const stateHarness = createStateHarness();
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
      return queuedJobs;
    });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid('000000000123'));
    vi.mocked(generateFalImageEdit).mockRejectedValue(new Error('provider policy failure'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'ANNOTATE',
      tool: Tool.BRUSH,
      prompt: 'paint this change',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub({
        primaryImageId: primary.id,
        primaryImage: primary,
        activePrimaryImage: primary,
        selectedImageIds: [primary.id],
        primarySelectionMediaType: 'image',
      }),
      images: [primary],
      paths: annotatePaths,
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: stateHarness.setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
      onGenerationComplete: vi.fn(),
      onGenerationPlaced: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(generateFalImageEdit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'paint this change',
      image: primary.element,
      tool: Tool.ANNOTATE,
      paths: annotatePaths,
    }), expect.objectContaining({
      modelId: NANO_BANANA_PRO_EDIT_MODEL_ID,
    }));
    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0].retryInputs).toMatchObject({
      kind: 'image_edit',
      prompt: 'paint this change',
      primaryImageId: primary.id,
      editAppMode: 'ANNOTATE',
      editTool: Tool.ANNOTATE,
      editPaths: annotatePaths,
    });
    expect(queuedJobs[0].retryInputs?.editPaths).not.toBe(annotatePaths);
    expect(queuedJobs[0].retryInputs?.editPaths?.[0].points).not.toBe(annotatePaths[0].points);
  });
});
