import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  GPT_IMAGE_2_EDIT_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_STANDARD_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import { Tool, type CanvasImage, type FalQueueJob } from '../../types';
import { generateImage as generateFalImage, generateImageEdit as generateFalImageEdit, generateImageToVideo, uploadVideoToFal } from '../../services/falService';
import { generateImage as generateGoogleImage, generateImageEdit as generateGoogleImageEdit } from '../../services/geminiService';
import { loadMediaFromBlob } from '../../services/mediaService';
import { generateSeedanceVideo } from '../../services/volcengineService';
import { generateJimengSeedanceVideo } from '../../services/jimengService';
import type { UseFalSettingsResult } from '../useFalSettings';
import type { SelectionStateResult } from '../useSelectionState';
import { useGeneration } from '../useGeneration';

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

vi.mock('../../services/volcengineService', async () => {
  const actual = await vi.importActual<typeof import('../../services/volcengineService')>('../../services/volcengineService');
  return {
    ...actual,
    generateSeedanceVideo: vi.fn(),
  };
});

vi.mock('../../services/jimengService', async () => {
  const actual = await vi.importActual<typeof import('../../services/jimengService')>('../../services/jimengService');
  return {
    ...actual,
    generateJimengSeedanceVideo: vi.fn(),
  };
});

vi.mock('../../services/geminiService', async () => {
  const actual = await vi.importActual<typeof import('../../services/geminiService')>('../../services/geminiService');
  return {
    ...actual,
    generateImage: vi.fn(),
    generateImageEdit: vi.fn(),
  };
});

vi.mock('../../services/mediaService', async () => {
  const actual = await vi.importActual<typeof import('../../services/mediaService')>('../../services/mediaService');
  return {
    ...actual,
    loadMediaFromBlob: vi.fn(actual.loadMediaFromBlob),
  };
});

const createFalStub = (): UseFalSettingsResult => ({
  falModelMode: 'video',
  falImageModelId: 'fal-ai/flux/dev',
  falVideoModelId: SEEDANCE_2_VIDEO_MODEL_ID,
  falImageSizeSelection: 'default',
  falAspectRatioSelection: 'default',
  falResolutionSelection: '720p',
  falNumImages: 1,
  falScaleFactor: 2,
  falNoiseScale: 0.5,
  falCreativity: 0.5,
  falVideoDuration: '5',
  klingVariant: 'standard',
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
  wan27VideoAudioSetting: 'auto', // Wan edit audio default.
  isWan27VideoModel: false,
  seedance15AspectRatio: '16:9',
  seedance15Resolution: '720p',
  seedance15Duration: '5',
  seedance15CameraFixed: false,
  seedance15Audio: false,
  seedance2Variant: 'smart',
  seedance2JimengModelVersion: 'seedance2.0fast',
  seedance2VolcengineModel: 'standard',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  isFalSeedance2VideoModel: false,
  isVolcengineSeedance2VideoModel: true,
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
  setFalImageSizeSelection: vi.fn(),
  setFalAspectRatioSelection: vi.fn(),
} as unknown as UseFalSettingsResult);

const createSelectionStub = (overrides: Partial<SelectionStateResult> = {}): SelectionStateResult => ({
  selectedImageIds: [],
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

const buildCanvasMedia = (
  id: string,
  mediaType: CanvasImage['mediaType'],
  durationSeconds?: number,
): CanvasImage => {
  const element = document.createElement(mediaType === 'video' ? 'video' : 'img');
  if (mediaType === 'video' && typeof durationSeconds === 'number') {
    Object.defineProperty(element, 'duration', { configurable: true, value: durationSeconds });
  }

  return {
    id,
    element,
    mediaType,
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    rotation: 0,
    naturalWidth: 640,
    naturalHeight: 360,
    file: new File(['test'], `${id}.${mediaType === 'audio' ? 'mp3' : mediaType === 'video' ? 'mp4' : 'png'}`, {
      type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png',
    }),
    ...(mediaType === 'audio' && typeof durationSeconds === 'number' ? { audioDuration: durationSeconds } : {}),
  };
}; // Minimal media keeps Seedance validation tests easy to reason about.

const buildLazySnapshotVideoFile = (): File & { slice: ReturnType<typeof vi.fn> } => {
  const payload = new TextEncoder().encode('lazy-video');
  const slice = vi.fn((start: number, end: number) => ({
    arrayBuffer: async () => payload.slice(start, end).buffer,
  }));
  return {
    size: payload.byteLength,
    type: 'video/mp4',
    name: 'lazy-reference.mp4',
    lastModified: 1,
    webkitRelativePath: '',
    slice,
  } as unknown as File & { slice: ReturnType<typeof vi.fn> };
}; // Mirrors a desktop-restored snapshot file without loading its bytes.

const buildLazySnapshotAudioFile = (): File & { slice: ReturnType<typeof vi.fn> } => {
  const payload = new TextEncoder().encode('lazy-audio');
  const slice = vi.fn((start: number, end: number) => ({
    arrayBuffer: async () => payload.slice(start, end).buffer,
  }));
  return {
    size: payload.byteLength,
    type: 'audio/wav',
    name: 'lazy-reference.wav',
    lastModified: 1,
    webkitRelativePath: '',
    slice,
  } as unknown as File & { slice: ReturnType<typeof vi.fn> };
}; // Mirrors snapshot-backed audio so preparation can stay inside the upload pool.

describe('useGeneration (seedance 2)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('allows repeated Seedance runs and asks before every sixth identical request', async () => {
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep requests pending so repeat behavior is isolated.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const setError = vi.fn();
    const setIsLoading = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading,
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      await act(async () => {
        void result.current.handleGenerate();
        await Promise.resolve();
      });
    }

    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledTimes(5);
    expect(setIsLoading).not.toHaveBeenCalledWith(true);
    expect(confirmSpy).not.toHaveBeenCalled();

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledTimes(5);
    expect(setError).not.toHaveBeenCalledWith(expect.stringContaining('already running'));

    confirmSpy.mockReturnValue(true);

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledTimes(6);
    confirmSpy.mockRestore();
  });

  it('resets repeat tracking when the Jimeng session changes', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.jimengSessionId = 0;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep requests pending so repeat behavior is isolated.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result, rerender } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      await act(async () => {
        void result.current.handleGenerate();
        await Promise.resolve();
      });
    }

    fal.jimengSessionId = 1;
    rerender();
    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledTimes(6);
    confirmSpy.mockRestore();
  });

  it('forwards Smart override first and last frame ids into the Volcengine request files', async () => {
    const image1 = buildCanvasMedia('image-1', 'image') as CanvasImage & { element: HTMLImageElement };
    const image2 = buildCanvasMedia('image-2', 'image');

    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep the request pending so the test can inspect the submit payload without fetch side effects.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [image1, image2],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'Turn this into a cinematic shot',
        provider: 'volcengine',
        modelId: SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        primaryImageId: image1.id,
        videoLastFrameImageId: image2.id,
        volcengineOptions: {
          seedance2Variant: 'smart',
        },
      });
      await Promise.resolve();
    });

    const [submittedPrompt, submittedOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];

    expect(submittedPrompt).toBe('Turn this into a cinematic shot');
    expect(submittedOptions).toBeTruthy();
    expect(submittedOptions?.variant).toBe('smart');
    expect(submittedOptions?.primaryImageFile).toBeInstanceOf(File);
    expect(submittedOptions?.lastFrameImageFile).toBeInstanceOf(File);
    expect(submittedOptions?.referenceImageFiles).toBeUndefined();
    expect(submittedOptions?.referenceVideoFiles).toBeUndefined();
    expect(submittedOptions?.referenceAudioFiles).toBeUndefined();
  });

  it('submits Auto duration and 4K without clamping Volcengine standard', async () => {
    const fal = createFalStub();
    fal.seedance2Resolution = '4k';
    fal.seedance2Duration = 'auto';
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the submit payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    const [, submittedOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];
    expect(submittedOptions?.modelId).toBe('doubao-seedance-2-0-260128');
    expect(submittedOptions?.resolution).toBe('4k');
    expect(submittedOptions?.duration).toBe('auto');
  });

  it('maps the Volcengine Fast and Mini selections to their Ark model ids', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'fast';
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the submit payloads can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    const [, fastOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];
    expect(fastOptions?.modelId).toBe('doubao-seedance-2-0-fast-260128');
    expect(queuedJobs[0]?.modelLabel).toBe('Seedance 2.0 Fast (VE) Smart');

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'A fox running through snow',
        provider: 'volcengine',
        modelId: SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        volcengineOptions: {
          seedance2VolcengineModel: 'mini',
        },
      });
      await Promise.resolve();
    });

    const [, miniOptions] = vi.mocked(generateSeedanceVideo).mock.calls[1] ?? [];
    expect(miniOptions?.modelId).toBe('doubao-seedance-2-0-mini-260615');
    expect(queuedJobs[1]?.modelLabel).toBe('Seedance 2.0 Mini (VE) Smart');
  });

  it('submits the Seedance 2.5 Ark model id with Auto duration and the output format', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2AspectRatio = 'adaptive';
    fal.seedance2Duration = 'auto';
    fal.seedance2OutputFormat = 'mov';
    const staleVideo = buildCanvasMedia('stale-video', 'video', 1);
    const staleAudio = buildCanvasMedia('stale-audio', 'audio', 1);
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the submit payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: [staleVideo.id],
        referenceAudioIds: [staleAudio.id],
      }),
      images: [staleVideo, staleAudio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    const [, submittedOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];
    expect(submittedOptions?.modelId).toBe('doubao-seedance-2-5-260628');
    expect(submittedOptions?.duration).toBe('auto'); // The service maps Auto to -1 on the wire.
    expect(submittedOptions?.outputFormat).toBe('mov');
    expect(submittedOptions?.referenceVideoFiles).toBeUndefined();
    expect(submittedOptions?.referenceAudioFiles).toBeUndefined();
    expect(queuedJobs[0]).toEqual(expect.objectContaining({
      modelLabel: 'Seedance 2.5 (VE) Smart',
      retryInputs: expect.objectContaining({
        volcengineOptions: expect.objectContaining({
          seedance2VolcengineModel: 'seedance25',
          seedance2Duration: 'auto',
          seedance2OutputFormat: 'mov',
        }),
      }),
    })); // Queue retries replay the exact 2.5 settings.
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceVideoIds');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceAudioIds');
  });

  it('preserves the requested MOV container when Seedance 2.5 returns no MIME type', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2OutputFormat = 'mov';
    const setState = vi.fn();
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(videoElement, 'videoHeight', { configurable: true, value: 360 });
    Object.defineProperty(videoElement, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(videoElement, 'pause', { configurable: true, value: vi.fn() });
    vi.mocked(generateSeedanceVideo).mockResolvedValue({ videoUrl: 'https://example.com/video', requestId: 'req-mov' });
    vi.mocked(loadMediaFromBlob).mockResolvedValue(videoElement);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['mov'])),
    }));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    const stateUpdater = setState.mock.calls.find(([value]) => typeof value === 'function')?.[0] as ((prev: { images: CanvasImage[] }) => { images: CanvasImage[] }) | undefined;
    const generatedFile = stateUpdater?.({ images: [] }).images[0]?.file;
    expect(generatedFile?.name).toBe('generated_seedance2_video.mov');
    expect(generatedFile?.type).toBe('video/quicktime');
  });

  it('honors saved Seedance 2.5 rerun options with an explicit 30s duration', async () => {
    const fal = createFalStub();
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the submit payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Current prompt should not be used',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'Saved 2.5 rerun',
        provider: 'volcengine',
        modelId: SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        volcengineOptions: {
          seedance2Variant: 'smart',
          seedance2VolcengineModel: 'seedance25',
          seedance2AspectRatio: 'adaptive',
          seedance2Duration: '30',
          seedance2OutputFormat: 'mov',
        },
      });
      await Promise.resolve();
    });

    const [submittedPrompt, submittedOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];
    expect(submittedPrompt).toBe('Saved 2.5 rerun');
    expect(submittedOptions?.modelId).toBe('doubao-seedance-2-5-260628');
    expect(submittedOptions?.duration).toBe('30');
    expect(submittedOptions?.outputFormat).toBe('mov');
  });

  it('preserves explicit Seedance 2.5 text-to-video aspect ratios', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25'; // Smart variant and 16:9 ratio come from the stub defaults.
    const setError = vi.fn();
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the normalized payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledWith(
      'A fox running through snow',
      expect.objectContaining({ aspectRatio: '16:9' }),
    );
  });

  it('normalizes explicit Seedance 2.5 first-frame aspect ratios', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2AspectRatio = '16:9';
    const image = buildCanvasMedia('first-frame', 'image') as CanvasImage & { element: HTMLImageElement };
    const setError = vi.fn();
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the normalized payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Animate this frame',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image.id],
        primaryImageId: image.id,
        primaryImage: image,
        activePrimaryImage: image,
        primarySelectionMediaType: 'image',
      }),
      images: [image],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledWith(
      'Animate this frame',
      expect.objectContaining({ aspectRatio: 'adaptive' }),
    );
  });

  it('normalizes stale Seedance 2.5 Edit durations before submission', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2Variant = 'edit';
    fal.seedance2AspectRatio = 'adaptive';
    fal.seedance2Duration = '10';
    const video = buildCanvasMedia('video-1', 'video', 5);
    const setError = vi.fn();
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the normalized payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Make it rain in @Video1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ referenceVideoIds: [video.id] }),
      images: [video],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledWith(
      'Make it rain in @Video1',
      expect.objectContaining({ duration: 'auto' }),
    );
  });

  it('rejects unsupported Volcengine Seedance 2.5 reference video formats before submission', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2Variant = 'reference';
    const video = buildCanvasMedia('video-1', 'video', 5);
    video.file = new File(['video'], 'video-1.webm', { type: 'video/webm' });
    const setError = vi.fn();
    const setFalJobs = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Restyle @Video1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ referenceVideoIds: [video.id] }),
      images: [video],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2.5 reference videos must use MP4 or MOV format.');
    expect(setFalJobs).not.toHaveBeenCalled();
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('rejects Seedance 2.5 Edit videos shorter than four seconds', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2Variant = 'edit';
    fal.seedance2AspectRatio = 'adaptive';
    const video = buildCanvasMedia('video-1', 'video', 3);
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Make it rain in @Video1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ referenceVideoIds: [video.id] }),
      images: [video],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2.5 reference videos must each be between 4 and 30 seconds.');
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('keeps the two-second minimum for ordinary Volcengine Seedance 2.5 references', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2Variant = 'reference';
    fal.seedance2AspectRatio = 'adaptive';
    const video = buildCanvasMedia('video-1', 'video', 3);
    const setError = vi.fn();
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so successful routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Restyle @Video1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ referenceVideoIds: [video.id] }),
      images: [video],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalled();
  });

  it('normalizes stale Seedance 2.5 resolutions above 720p before submission', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2AspectRatio = 'adaptive';
    fal.seedance2Resolution = '1080p';
    const setError = vi.fn();
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the normalized payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledWith(
      'A fox running through snow',
      expect.objectContaining({ resolution: '720p' }),
    );
  });

  it('applies the raised Seedance 2.5 reference clip window to the Volcengine sub-model', async () => {
    const fal = createFalStub();
    fal.seedance2VolcengineModel = 'seedance25';
    fal.seedance2Variant = 'reference';
    fal.seedance2AspectRatio = 'adaptive';
    const video1 = buildCanvasMedia('video-1', 'video', 20);
    const video2 = buildCanvasMedia('video-2', 'video', 12);
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Reference video test',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: [video1.id, video2.id],
      }),
      images: [video1, video2],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2.5 reference videos must total 30 seconds or less.'); // 2.5 stretches the 15s total to 30s.
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('routes Seedance 2 (FAL) Smart text-to-video through Fal instead of Volcengine', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A crystalline city forming from mist',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'A crystalline city forming from mist',
      null,
      expect.objectContaining({
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        seedance2Variant: 'smart',
        seedance2AspectRatio: '16:9',
        seedance2Resolution: '720p',
        seedance2Duration: '5',
        seedance2GenerateAudio: false,
      }),
    );
  });

  it('normalizes stale Volcengine-only retry variants at the Fal submission boundary', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    const image = buildCanvasMedia('reference-1', 'image');
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Current prompt',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [image],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        provider: 'fal',
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        prompt: 'Match @Image1',
        referenceImageIds: [image.id],
        falOptions: { seedance2Variant: 'edit' },
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'Match @Image1',
      null,
      expect.objectContaining({
        seedance2Variant: 'reference',
        referenceImages: expect.any(Array),
      }),
    );
  });

  it('routes Seedance 2.5 Smart runs with queue and retry metadata', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'smart';
    fal.seedance25AspectRatio = '21:9';
    fal.seedance25Resolution = '480p';
    fal.seedance25Duration = '30';
    fal.seedance25GenerateAudio = false;
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A continuous thirty-second tracking shot',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'A continuous thirty-second tracking shot',
      null,
      expect.objectContaining({
        modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
        seedance25Variant: 'smart',
        seedance25AspectRatio: '21:9',
        seedance25Resolution: '480p',
        seedance25Duration: '30',
        seedance25GenerateAudio: false,
      }),
    );
    expect(queuedJobs[0]).toEqual(expect.objectContaining({
      modelLabel: 'Seedance 2.5 (FAL) Smart',
      retryInputs: expect.objectContaining({
        modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
        falOptions: expect.objectContaining({
          seedance25Variant: 'smart',
          seedance25AspectRatio: '21:9',
          seedance25Resolution: '480p',
          seedance25Duration: '30',
          seedance25GenerateAudio: false,
        }),
      }),
    }));
  });

  it('routes MiniMax H3 Standard text generation with variant metadata and queue labeling', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = MINIMAX_H3_VIDEO_MODEL_ID;
    fal.isMiniMaxH3VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.miniMaxH3Variant = 'standard';
    fal.miniMaxH3AspectRatio = '21:9';
    fal.miniMaxH3Duration = '15';
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing and retry metadata can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A crystalline city forming from mist',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'A crystalline city forming from mist',
      null,
      expect.objectContaining({
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        miniMaxH3Variant: 'standard',
        miniMaxH3AspectRatio: '21:9',
        miniMaxH3Duration: '15',
      }),
    );
    expect(queuedJobs[0]).toEqual(expect.objectContaining({
      modelLabel: 'MiniMax H3 Standard',
      retryInputs: expect.objectContaining({
        falOptions: expect.objectContaining({
          miniMaxH3Variant: 'standard',
          miniMaxH3AspectRatio: '21:9',
          miniMaxH3Duration: '15',
        }),
      }),
    }));
  });

  it('marks MiniMax H3 outputs as audible when browser audio probes are unavailable', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = MINIMAX_H3_VIDEO_MODEL_ID;
    fal.isMiniMaxH3VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.miniMaxH3Variant = 'standard';
    const setState = vi.fn();
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(videoElement, 'videoHeight', { configurable: true, value: 360 });
    Object.defineProperty(videoElement, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(videoElement, 'pause', { configurable: true, value: vi.fn() });
    vi.mocked(generateImageToVideo).mockResolvedValue({ videoUrl: 'https://example.com/h3.mp4', requestId: 'req-h3' });
    vi.mocked(loadMediaFromBlob).mockResolvedValue(videoElement);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })),
    }));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A crystalline city forming from mist',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    const stateUpdater = setState.mock.calls.find(([value]) => typeof value === 'function')?.[0] as ((prev: { images: CanvasImage[] }) => { images: CanvasImage[] }) | undefined;
    const nextState = stateUpdater?.({ images: [] });
    expect(nextState?.images[0]?.hasAudio).toBe(true);
  });

  it('ignores retained Reference media when MiniMax H3 Standard runs', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = MINIMAX_H3_VIDEO_MODEL_ID;
    fal.isMiniMaxH3VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.miniMaxH3Variant = 'standard';
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video', 30);
    const audio1 = buildCanvasMedia('audio-1', 'audio', 30);
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    const setError = vi.fn();
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so inactive retry inputs can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A paper kite crossing the sky',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceImageIds: [image1.id],
        referenceVideoIds: [video1.id],
        referenceAudioIds: [audio1.id],
      }),
      images: [image1, video1, audio1],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(setError.mock.calls.every(([message]) => message === null)).toBe(true);
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalled();
    const requestOptions = vi.mocked(generateImageToVideo).mock.calls[0]?.[2];
    expect(requestOptions).not.toHaveProperty('referenceImages');
    expect(requestOptions).not.toHaveProperty('referenceVideos');
    expect(requestOptions).not.toHaveProperty('referenceAudios');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceImageIds');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceVideoIds');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceAudioIds');
  });

  it('routes embedded and retried MiniMax H3 Reference inputs with a Reference queue label', async () => {
    const image1 = buildCanvasMedia('image-1', 'image');
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so saved-run routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Current prompt should not be used',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: '@Image1 walks through a garden',
        provider: 'fal',
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        modelMode: 'video',
        referenceImageIds: [image1.id],
        falOptions: {
          miniMaxH3Variant: 'reference',
          miniMaxH3AspectRatio: 'adaptive',
          miniMaxH3Duration: '8',
        },
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      '@Image1 walks through a garden',
      null,
      expect.objectContaining({
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        miniMaxH3Variant: 'reference',
        miniMaxH3AspectRatio: 'adaptive',
        miniMaxH3Duration: '8',
        referenceImages: [image1.element],
      }),
    );
    expect(queuedJobs[0]).toEqual(expect.objectContaining({
      modelLabel: 'MiniMax H3 Reference',
      retryInputs: expect.objectContaining({
        referenceImageIds: [image1.id],
        falOptions: expect.objectContaining({
          miniMaxH3Variant: 'reference',
          miniMaxH3AspectRatio: 'adaptive',
          miniMaxH3Duration: '8',
        }),
      }),
    }));
  });

  it('keeps untouched embedded MiniMax H3 defaults independent from the global bar', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = MINIMAX_H3_VIDEO_MODEL_ID;
    fal.isMiniMaxH3VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.miniMaxH3Variant = 'standard';
    fal.miniMaxH3AspectRatio = '21:9';
    fal.miniMaxH3Duration = '15';
    const image1 = buildCanvasMedia('image-1', 'image');
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so override routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Global prompt should not be used',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: '@Image1 walks through a garden',
        provider: 'fal',
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        modelMode: 'video',
        referenceImageIds: [image1.id],
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      '@Image1 walks through a garden',
      null,
      expect.objectContaining({
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        miniMaxH3Variant: 'reference',
        miniMaxH3AspectRatio: 'adaptive',
        miniMaxH3Duration: '5',
        referenceImages: [image1.element],
      }),
    );
    expect(queuedJobs[0]).toEqual(expect.objectContaining({
      modelLabel: 'MiniMax H3 Reference',
      retryInputs: expect.objectContaining({
        falOptions: expect.objectContaining({
          miniMaxH3Variant: 'reference',
          miniMaxH3AspectRatio: 'adaptive',
          miniMaxH3Duration: '5',
        }),
      }),
    }));
  });

  it('routes Seedance 2 (JM CLI) Smart text-to-video through Jimeng', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.seedance2Variant = 'smart';
    fal.seedance2GenerateAudio = true;
    fal.seedance2CameraFixed = true;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A crane shot over a busy Shanghai street',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'A crane shot over a busy Shanghai street',
      expect.objectContaining({
        modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
        variant: 'smart',
        aspectRatio: '16:9',
        duration: '5',
        resolution: '720p',
        generateAudio: false,
        cameraFixed: false,
      }),
    );
  });

  it('honors saved Jimeng provider metadata when rerunning without a model id', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = false;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Current prompt should not be used',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        provider: 'jimeng',
        modelMode: 'video',
        prompt: 'Saved Jimeng rerun',
        jimengOptions: {
          seedance2Variant: 'smart',
          seedance2JimengModelVersion: 'seedance2.0_vip',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '1080p',
          seedance2Duration: '5',
          seedance2GenerateAudio: true,
          seedance2CameraFixed: true,
        },
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'Saved Jimeng rerun',
      expect.objectContaining({
        modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
        variant: 'smart',
        modelVersion: 'seedance2.0_vip',
        resolution: '1080p',
        generateAudio: false,
        cameraFixed: false,
      }),
    );
  });

  it('honors saved Jimeng provider metadata when a legacy Fal model id is present', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = false;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Current prompt should not be used',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        provider: 'jimeng',
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        prompt: 'Legacy Jimeng rerun',
        jimengOptions: {
          seedance2Variant: 'smart',
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '720p',
          seedance2Duration: '5',
        },
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'Legacy Jimeng rerun',
      expect.objectContaining({ modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID }),
    );
  });

  it('uses session zero when legacy Jimeng retry metadata has no session', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.jimengSessionId = 42;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Current prompt should not be used',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        provider: 'jimeng',
        modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        prompt: 'Legacy default-session rerun',
        jimengOptions: {
          seedance2Variant: 'smart',
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '720p',
          seedance2Duration: '5',
        },
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'Legacy default-session rerun',
      expect.objectContaining({ session: 0 }),
    );
  });

  it('stores Jimeng outputs without audio when the shared Seedance audio toggle was enabled', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.seedance2Variant = 'smart';
    fal.seedance2GenerateAudio = true;
    const setState = vi.fn();
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(videoElement, 'videoHeight', { configurable: true, value: 360 });
    Object.defineProperty(videoElement, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(videoElement, 'pause', { configurable: true, value: vi.fn() });
    vi.mocked(generateJimengSeedanceVideo).mockResolvedValue({ videoUrl: 'http://localhost:8000/api/jimeng/jobs/job-1/output', providerJobId: 'job-1', requestId: 'job-1' });
    vi.mocked(loadMediaFromBlob).mockResolvedValue(videoElement);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })),
    }));

    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((previous: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A quiet sunrise timelapse',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    const stateUpdater = setState.mock.calls.find(([value]) => typeof value === 'function')?.[0] as ((prev: { images: CanvasImage[] }) => { images: CanvasImage[] }) | undefined;
    const nextState = stateUpdater?.({ images: [] });
    expect(nextState?.images[0]?.hasAudio).toBe(false);
    expect(nextState?.images[0]?.metadata.generation?.jimengOptions?.seedance2GenerateAudio).toBe(false);
    expect(vi.mocked(generateJimengSeedanceVideo).mock.calls[0]?.[1].generateAudio).toBe(false);
    expect(queuedJobs[0]?.providerJobId).toBe('job-1');
  });

  it('accepts a saved Jimeng Reference primary as the sole tagged reference', async () => {
    const image = buildCanvasMedia('image-1', 'image') as CanvasImage & { element: HTMLImageElement };
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [image],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        provider: 'jimeng',
        modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        prompt: 'Use @Image1 as the saved character',
        primaryImageId: image.id,
        jimengOptions: {
          seedance2Variant: 'reference',
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '720p',
          seedance2Duration: '5',
        },
      });
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateJimengSeedanceVideo).mock.calls[0]?.[1];
    expect(submittedOptions?.variant).toBe('reference');
    expect(submittedOptions?.primaryImageFile).toBeInstanceOf(File);
    expect(submittedOptions?.referenceVideoFiles).toBeUndefined();
    expect(submittedOptions?.referenceImageFiles).toBeUndefined();
  });

  it('routes Seedance 2 (JM CLI) Reference through Jimeng multimodal inputs', async () => {
    const image = buildCanvasMedia('image-1', 'image');
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.seedance2Variant = 'reference';
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Use @Image1 as the character',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ selectedImageIds: [image.id] }),
      images: [image],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'Use @Image1 as the character',
      expect.objectContaining({
        modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
        variant: 'reference',
        modelVersion: 'seedance2.0fast',
        referenceImageFiles: expect.any(Array),
      }),
    );
    const submittedOptions = vi.mocked(generateJimengSeedanceVideo).mock.calls[0]?.[1];
    expect(submittedOptions?.primaryImageFile).toBeUndefined();
    expect(submittedOptions?.referenceImageFiles).toHaveLength(1);
  });

  it('applies the selected Multi-frame duration to every transition', async () => {
    const images = [
      buildCanvasMedia('image-1', 'image'),
      buildCanvasMedia('image-2', 'image'),
      buildCanvasMedia('image-3', 'image'),
    ];
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.jimengMultiframeDuration = '6';
    fal.jimengMultiframeResolution = '1080p';
    fal.jimengSessionId = 42;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the request can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Day turns to night || Night turns to sunrise',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ selectedImageIds: images.map(image => image.id) }),
      images,
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'Day turns to night || Night turns to sunrise',
      expect.objectContaining({
        modelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
        mode: 'multiframe',
        duration: '6',
        resolution: '1080p',
        session: 42,
        transitionPrompts: ['Day turns to night', 'Night turns to sunrise'],
        transitionDurations: [6, 6],
      }),
    );
  });

  it('keeps the Multi-frame repeat guard stable when the hidden Jimeng channel changes', async () => {
    const images = [buildCanvasMedia('image-1', 'image'), buildCanvasMedia('image-2', 'image')];
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.jimengMultiframeDuration = '3';
    fal.jimengMultiframeResolution = '720p';
    fal.jimengSessionId = 42;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep requests pending so repeat tracking stays isolated.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const hookArgs = {
      appMode: 'CANVAS' as const,
      tool: Tool.FREE_SELECTION,
      prompt: 'Move from one frame to the next',
      promptPrefix: '',
      apiProvider: 'fal' as const,
      fal,
      selection: createSelectionStub({ selectedImageIds: images.map(image => image.id) }),
      images,
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    };
    const { result, rerender } = renderHook(() => useGeneration(hookArgs));

    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      await act(async () => {
        void result.current.handleGenerate();
        await Promise.resolve();
      });
    }

    fal.seedance2JimengModelVersion = 'seedance2.0_vip'; // This setting remains hidden and unused by Multi-frame.
    rerender();
    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledTimes(5);
    confirmSpy.mockRestore();
  });

  it('ignores stale video and audio references when generating Multi-frame video', async () => {
    const stillImages = [buildCanvasMedia('image-1', 'image'), buildCanvasMedia('image-2', 'image')];
    const staleVideo = buildCanvasMedia('stale-video', 'video', 1);
    const staleAudio = buildCanvasMedia('stale-audio', 'audio', 1);
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_MULTIFRAME_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.jimengMultiframeDuration = '3';
    fal.jimengMultiframeResolution = '720p';
    fal.jimengSessionId = 42;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so the request can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Move from one frame to the next',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: stillImages.map(image => image.id),
        referenceVideoIds: [staleVideo.id],
        referenceAudioIds: [staleAudio.id],
      }),
      images: [...stillImages, staleVideo, staleAudio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'Move from one frame to the next',
      expect.objectContaining({
        modelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
        mode: 'multiframe',
        multiframeImageFiles: expect.any(Array),
      }),
    );
    const submittedOptions = vi.mocked(generateJimengSeedanceVideo).mock.calls[0]?.[1];
    expect(submittedOptions?.multiframeImageFiles).toHaveLength(2);
    expect(submittedOptions?.referenceVideoFiles).toBeUndefined();
    expect(submittedOptions?.referenceAudioFiles).toBeUndefined();
  });

  it('normalizes legacy Jimeng Seedance 2.5 defaults in the request and retry metadata', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'smart';
    fal.seedance25AspectRatio = 'adaptive';
    fal.seedance25Resolution = '720p';
    fal.seedance25Duration = 'auto';
    fal.seedance25GenerateAudio = false;
    fal.jimengSessionId = 9;
    const staleVideo = buildCanvasMedia('stale-jimeng-video', 'video', 1);
    const staleAudio = buildCanvasMedia('stale-jimeng-audio', 'audio', 1);
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A five-second Jimeng shot',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: [staleVideo.id],
        referenceAudioIds: [staleAudio.id],
      }),
      images: [staleVideo, staleAudio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledWith(
      'A five-second Jimeng shot',
      expect.objectContaining({ aspectRatio: '16:9', duration: '5', session: 9 }),
    );
    const submittedOptions = vi.mocked(generateJimengSeedanceVideo).mock.calls[0]?.[1];
    expect(submittedOptions?.referenceVideoFiles).toBeUndefined();
    expect(submittedOptions?.referenceAudioFiles).toBeUndefined();
    expect(queuedJobs[0]?.retryInputs?.jimengOptions?.seedance25AspectRatio).toBe('16:9');
    expect(queuedJobs[0]?.retryInputs?.jimengOptions?.seedance25Duration).toBe('5');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceVideoIds');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('referenceAudioIds');
  });

  it('blocks Seedance 2 (JM CLI) Reference audio-only submits with a toast hint', async () => {
    const audio = buildCanvasMedia('audio-1', 'audio', 5);
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.seedance2Variant = 'reference';
    const setToastMessage = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Use @Audio1 as the rhythm',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceAudioIds: [audio.id],
      }),
      images: [audio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage,
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setToastMessage).toHaveBeenCalledWith('Seedance 2 (JM CLI) needs an image or video reference too. Add one, then generate again.');
    expect(vi.mocked(generateJimengSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('uses Seedance 1.5 Fal options from generation overrides', async () => {
    const image = buildCanvasMedia('image-1', 'image');
    const fal = createFalStub();
    fal.falVideoModelId = SEEDANCE_15_VIDEO_MODEL_ID;
    fal.isSeedance15VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.seedance15AspectRatio = '16:9';
    fal.seedance15Resolution = '720p';
    fal.seedance15Duration = '5';
    fal.seedance15CameraFixed = false;
    fal.seedance15Audio = false;
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so options can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [image],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'A tailored Seedance 1.5 shot',
        provider: 'fal',
        modelId: SEEDANCE_15_VIDEO_MODEL_ID,
        modelMode: 'video',
        primaryImageId: image.id,
        falOptions: {
          seedance15AspectRatio: '9:16',
          seedance15Resolution: '1080p',
          seedance15Duration: '12',
          seedance15CameraFixed: true,
          seedance15Audio: true,
        },
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'A tailored Seedance 1.5 shot',
      image.element,
      expect.objectContaining({
        modelId: SEEDANCE_15_VIDEO_MODEL_ID,
        seedance15AspectRatio: '9:16',
        seedance15Resolution: '1080p',
        seedance15Duration: '12',
        seedance15CameraFixed: true,
        seedance15Audio: true,
      }),
    );
  });

  it('forwards Kling v3 smart promptbar settings to Fal video generation', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = KLING_V3_VIDEO_MODEL_ID;
    fal.falModelId = KLING_V3_VIDEO_MODEL_ID;
    fal.isKlingV3VideoModel = true;
    fal.klingV3Duration = '12';
    fal.klingV3GenerateAudio = true;
    fal.klingV3CfgScale = '0.75';
    fal.klingV3MultiPromptEnabled = true;
    fal.klingV3MultiPrompt = 'Second shot pushes through clouds';
    fal.klingV3Shot1Duration = '4';
    fal.klingV3Shot2Duration = '6';
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'First shot rises over a neon harbor',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: 'avoid blur',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'First shot rises over a neon harbor',
      null,
      expect.objectContaining({
        modelId: KLING_V3_VIDEO_MODEL_ID,
        negativePrompt: 'avoid blur',
        klingV3Duration: '12',
        klingV3GenerateAudio: true,
        klingV3CfgScale: '0.75',
        klingV3MultiPromptEnabled: true,
        klingV3MultiPrompt: 'Second shot pushes through clouds',
        klingV3Shot1Duration: '4',
        klingV3Shot2Duration: '6',
      }),
    );
  });

  it('rejects Kling v3 multi prompt runs when the second prompt is empty', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = KLING_V3_VIDEO_MODEL_ID;
    fal.falModelId = KLING_V3_VIDEO_MODEL_ID;
    fal.isKlingV3VideoModel = true;
    fal.klingV3MultiPromptEnabled = true;
    fal.klingV3MultiPrompt = '   ';
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'First shot',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Kling 3.0 Pro multi prompt requires a second prompt.');
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
  });

  it('routes Seedance 2 (FAL) Reference runs through Fal with reference media files', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.seedance2Variant = 'reference';
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    const image1 = buildCanvasMedia('image-1', 'image');
    const video1 = buildCanvasMedia('video-1', 'video', 4);
    const audio1 = buildCanvasMedia('audio-1', 'audio', 3);
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Use @Image1, @Video1, and @Audio1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceImageIds: [image1.id],
        referenceVideoIds: [video1.id],
        referenceAudioIds: [audio1.id],
        seedanceReferenceOrderIds: [image1.id, video1.id, audio1.id],
      }),
      images: [image1, video1, audio1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'Use @Image1, @Video1, and @Audio1',
      null,
      expect.objectContaining({
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        seedance2Variant: 'reference',
        referenceImages: [image1.element],
        referenceVideos: [expect.any(File)],
        referenceAudios: [expect.any(File)],
      }),
    );
  });

  it('uploads selected audio for Wan 2.7 text-to-video', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = WAN_27_VIDEO_MODEL_ID;
    fal.isWan27VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    const audio1 = buildCanvasMedia('audio-1', 'audio', 4);
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/audio.wav');
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A neon dance sequence synced to the beat',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [audio1.id],
        primaryImageId: audio1.id,
        primaryImage: audio1,
        primarySelectionMediaType: 'audio',
        sourceAudioId: audio1.id,
      }),
      images: [audio1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadVideoToFal).toHaveBeenCalledWith(audio1.file, expect.objectContaining({ label: 'source audio' }));
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'A neon dance sequence synced to the beat',
      null,
      expect.objectContaining({
        modelId: WAN_27_VIDEO_MODEL_ID,
        sourceAudioUrl: 'https://example.com/audio.wav',
        wan27VideoResolution: '720p',
        wan27VideoDuration: '5',
        wan27VideoAspectRatio: '16:9',
      }),
    );
  });

  it('does not attach current audio when rerunning a Wan 2.7 generation without saved audio', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = WAN_27_VIDEO_MODEL_ID;
    fal.isWan27VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    const audio1 = buildCanvasMedia('audio-1', 'audio', 4);
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/audio.wav');
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so rerun payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [audio1.id],
        primaryImageId: audio1.id,
        primaryImage: audio1,
        primarySelectionMediaType: 'audio',
        sourceAudioId: audio1.id,
      }),
      images: [audio1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'Repeat the saved silent Wan scene',
        provider: 'fal',
        modelId: WAN_27_VIDEO_MODEL_ID,
        modelMode: 'video',
      });
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateImageToVideo).mock.calls[0]?.[2];
    expect(uploadVideoToFal).not.toHaveBeenCalled();
    expect(submittedOptions).not.toHaveProperty('sourceAudioUrl');
  });

  it('preserves explicit Wan 2.7 edit auto audio rerun metadata', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = WAN_27_VIDEO_MODEL_ID;
    fal.isWan27VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.wan27VideoAudioSetting = 'origin';
    const video1 = buildCanvasMedia('video-1', 'video', 4);
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so rerun payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [video1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'Repeat the saved edit',
        provider: 'fal',
        modelId: WAN_27_VIDEO_MODEL_ID,
        modelMode: 'video',
        sourceVideoId: video1.id,
        falOptions: {
          wan27VideoVariant: 'edit',
          wan27VideoAudioSetting: 'auto',
        },
      });
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateImageToVideo).mock.calls[0]?.[2];
    expect(submittedOptions?.wan27VideoVariant).toBe('edit');
    expect(submittedOptions?.wan27VideoAudioSetting).toBe('auto');
  });

  it('infers Wan 2.7 edit reruns from the saved edit endpoint', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = WAN_27_VIDEO_MODEL_ID;
    fal.isWan27VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    const video1 = buildCanvasMedia('video-1', 'video', 4);
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/wan-source.mp4');
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so rerun payload can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [video1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'Repeat the saved Wan edit',
        provider: 'fal',
        modelId: WAN_27_EDIT_VIDEO_MODEL_ID,
        modelMode: 'video',
        sourceVideoId: video1.id,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateImageToVideo).mock.calls[0]?.[2];
    expect(uploadVideoToFal).toHaveBeenCalledWith(video1.file, expect.objectContaining({ label: 'source video' }));
    expect(submittedOptions?.modelId).toBe(WAN_27_VIDEO_MODEL_ID);
    expect(submittedOptions?.wan27VideoVariant).toBe('edit');
    expect(submittedOptions?.sourceVideoUrl).toBe('https://example.com/wan-source.mp4');
  });

  it('marks Wan 2.7 outputs generated with uploaded audio as audible', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = WAN_27_VIDEO_MODEL_ID;
    fal.isWan27VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    const audio1 = buildCanvasMedia('audio-1', 'audio', 4);
    const setState = vi.fn();
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(videoElement, 'videoHeight', { configurable: true, value: 360 });
    Object.defineProperty(videoElement, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(videoElement, 'pause', { configurable: true, value: vi.fn() });
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/audio.wav');
    vi.mocked(generateImageToVideo).mockResolvedValue({ videoUrl: 'https://example.com/wan.mp4', requestId: 'req-wan' });
    vi.mocked(loadMediaFromBlob).mockResolvedValue(videoElement);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })),
    }));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A neon dance sequence synced to the beat',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [audio1.id],
        primaryImageId: audio1.id,
        primaryImage: audio1,
        primarySelectionMediaType: 'audio',
        sourceAudioId: audio1.id,
      }),
      images: [audio1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState,
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    const stateUpdater = setState.mock.calls.find(([value]) => typeof value === 'function')?.[0] as ((prev: { images: CanvasImage[] }) => { images: CanvasImage[] }) | undefined;
    expect(stateUpdater).toBeTruthy();
    const nextState = stateUpdater?.({ images: [] });
    expect(nextState?.images[0]?.hasAudio).toBe(true);
  });

  it('does not merge selected media into references for non-Seedance video runs', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = KLING_O3_VIDEO_MODEL_ID;
    fal.seedance2Variant = 'reference';
    fal.isVolcengineSeedance2VideoModel = false;
    const image1 = buildCanvasMedia('image-1', 'image') as CanvasImage & { element: HTMLImageElement };
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so selected-media reference merging can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Animate this still frame',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image1.id],
        primaryImageId: image1.id,
        activePrimaryImage: image1,
        primarySelectionMediaType: 'image',
      }),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateImageToVideo).mock.calls[0]?.[2];
    expect(submittedOptions?.modelId).toBe(KLING_O3_VIDEO_MODEL_ID);
    expect(submittedOptions?.referenceImages).toEqual([]);
  });

  it('blocks legacy Kling O1 ref-v2v reruns without calling Fal', async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate({
        kind: 'video',
        prompt: 'legacy ref v2v',
        provider: 'fal',
        modelId: 'fal-ai/kling-video/o1/video-to-video/reference',
        modelMode: 'video',
        falOptions: {
          klingO1Variant: 'refV2V',
          videoDuration: '10',
        },
      });
    });

    expect(setError).toHaveBeenCalledWith('Kling O1 Ref-v2v is no longer available and cannot be regenerated. Create a new Kling O3 Reference or Edit generation instead.');
    expect(generateImageToVideo).not.toHaveBeenCalled();
  });

  it('blocks removed Hailuo reruns without falling back to the selected video model', async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate({
        kind: 'video',
        prompt: 'legacy Hailuo rerun',
        provider: 'fal',
        modelId: 'fal-ai/minimax/hailuo-2.3/pro/image-to-video',
        modelMode: 'video',
      });
    });

    expect(setError).toHaveBeenCalledWith('Hailuo 2.3 is no longer available and cannot be regenerated. Select a supported video model and create a new generation instead.');
    expect(generateImageToVideo).not.toHaveBeenCalled();
  });

  it('blocks removed 1-to-All Animate reruns without falling back to the selected video model', async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate({
        kind: 'video',
        prompt: 'legacy 1-to-All rerun',
        provider: 'fal',
        modelId: 'fal-ai/one-to-all-animation/14b',
        modelMode: 'video',
      });
    });

    expect(setError).toHaveBeenCalledWith('1-to-All Animate is no longer available and cannot be regenerated. Select a supported video model and create a new generation instead.');
    expect(generateImageToVideo).not.toHaveBeenCalled();
  });

  it('infers Kling O3 edit reruns from the saved edit endpoint', async () => {
    const video1 = buildCanvasMedia('video-1', 'video', 4);
    vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/source.mp4');
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so rerun routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [video1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'Repeat the saved O3 edit',
        provider: 'fal',
        modelId: KLING_O3_VIDEO_EDIT_MODEL_ID,
        modelMode: 'video',
        sourceVideoId: video1.id,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadVideoToFal).toHaveBeenCalledWith(video1.file, expect.objectContaining({ label: 'source video' }));
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'Repeat the saved O3 edit',
      null,
      expect.objectContaining({
        modelId: KLING_O3_VIDEO_EDIT_MODEL_ID,
        sourceVideoUrl: 'https://example.com/source.mp4',
        klingO3Variant: 'edit',
      }),
    );
  });

  it('normalizes legacy Sora video reruns to Kling Standard even when Kling Pro is selected', async () => {
    const image1 = buildCanvasMedia('image-1', 'image') as CanvasImage & { element: HTMLImageElement };
    const fal = createFalStub();
    fal.klingVariant = 'pro'; // Live picker state must not change the migrated endpoint.
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep the Fal request pending for payload inspection.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'video',
        prompt: 'A cinematic Sora rerun',
        provider: 'fal',
        modelId: 'fal-ai/sora-2/image-to-video/pro',
        modelMode: 'video',
        primaryImageId: image1.id,
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'A cinematic Sora rerun',
      image1.element,
      expect.objectContaining({
        modelId: KLING_VIDEO_STANDARD_MODEL_ID,
      }),
    );
  });

  it('routes Google edits to Gemini edit even when the stored Fal model is Recraft', async () => {
    const image1 = buildCanvasMedia('image-1', 'image') as CanvasImage & { element: HTMLImageElement };
    const fal = createFalStub();
    fal.falModelMode = 'image';
    fal.falImageModelId = RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID;
    vi.mocked(generateGoogleImageEdit).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected before image hydration.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Retouch this product poster',
      promptPrefix: '',
      apiProvider: 'google',
      fal,
      selection: createSelectionStub({
        primaryImageId: image1.id,
        activePrimaryImage: image1,
        primarySelectionMediaType: 'image',
        selectedImageIds: [image1.id],
      }),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateGoogleImageEdit)).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Retouch this product poster',
      image: image1.element,
      tool: Tool.FREE_SELECTION,
    }));
    expect(vi.mocked(generateGoogleImage)).not.toHaveBeenCalled();
  });

  it('caps saved Krea style references without rejecting valid still images', async () => {
    const images = Array.from({ length: 11 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const setError = vi.fn();
    const fal = createFalStub();
    fal.falModelMode = 'image';
    fal.falImageModelId = KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID;
    vi.mocked(generateFalImage).mockImplementation(() => new Promise(() => {})); // Keep pending so request options can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub(),
      images,
      paths: [],
      krea2StyleReferenceStrengths: {},
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'text_to_image',
        prompt: 'A styled editorial image',
        provider: 'fal',
        modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
        modelMode: 'image',
        referenceImageIds: images.map(image => image.id),
        falOptions: {
          aspectRatioSelection: '16:9',
          krea2Creativity: 'medium',
          krea2StyleReferenceStrengths: Object.fromEntries(images.map(image => [image.id, 1])),
        },
      });
      await Promise.resolve();
    });

    expect(setError).not.toHaveBeenCalledWith('Krea 2 Large style references must be still images.');
    expect(vi.mocked(generateFalImage)).toHaveBeenCalledWith('A styled editorial image', expect.objectContaining({
      modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      imageStyleReferences: expect.arrayContaining(images.slice(0, 10).map(image => expect.objectContaining({ image: image.element }))),
    }));
    expect(vi.mocked(generateFalImage).mock.calls[0]?.[1]?.imageStyleReferences).toHaveLength(10);
  });

  it('caps GPT Image 2 annotate references at 8 because the annotation canvas is an input', async () => {
    const primary = buildCanvasMedia('primary', 'image') as CanvasImage & { element: HTMLImageElement };
    const references = Array.from({ length: 9 }, (_, index) => buildCanvasMedia(`ref-${index + 1}`, 'image'));
    const fal = createFalStub();
    fal.falModelMode = 'image';
    fal.falImageModelId = GPT_IMAGE_2_EDIT_MODEL_ID;
    vi.mocked(generateFalImageEdit).mockImplementation(() => new Promise(() => {})); // Keep pending so request options can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'ANNOTATE',
      tool: Tool.ANNOTATE,
      prompt: 'Edit with annotated guidance',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        primaryImageId: primary.id,
        primaryImage: primary,
        activePrimaryImage: primary,
        selectedImageIds: [primary.id],
        primarySelectionMediaType: 'image',
      }),
      images: [primary, ...references],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind: 'image_edit',
        prompt: 'Edit with annotated guidance',
        provider: 'fal',
        modelId: GPT_IMAGE_2_EDIT_MODEL_ID,
        modelMode: 'image',
        primaryImageId: primary.id,
        referenceImageIds: references.map(image => image.id),
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateFalImageEdit).mock.calls[0]?.[0]?.referenceImages).toHaveLength(8);
  });

  it('blocks Seedance reference submissions when reference videos total more than 15 seconds', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'reference';
    const video1 = buildCanvasMedia('video-1', 'video', 10);
    const video2 = buildCanvasMedia('video-2', 'video', 8);
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Reference video test',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: [video1.id, video2.id],
      }),
      images: [video1, video2],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2 reference videos must total 15 seconds or less.');
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('blocks Seedance reference submissions when reference audio totals more than 15 seconds', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'reference';
    const audio1 = buildCanvasMedia('audio-1', 'audio', 9);
    const audio2 = buildCanvasMedia('audio-2', 'audio', 8);
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Reference audio test',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceAudioIds: [audio1.id, audio2.id],
      }),
      images: [audio1, audio2],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2 reference audio clips must total 15 seconds or less.');
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it.each([
    ['videos', 'video' as const, [20, 11], 'Seedance 2.5 reference videos must total 30.2 seconds or less.'],
    ['audio clips', 'audio' as const, [18, 13], 'Seedance 2.5 reference audio clips must total 30.2 seconds or less.'],
  ])('enforces the separate Seedance 2.5 combined %s duration limit', async (_label, mediaType, durations, expectedError) => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'reference';
    fal.seedance25AspectRatio = 'adaptive';
    fal.seedance25Resolution = '720p';
    fal.seedance25Duration = 'auto';
    fal.seedance25GenerateAudio = true;
    const visual = buildCanvasMedia('image-1', 'image');
    const first = buildCanvasMedia(`${mediaType}-1`, mediaType, durations[0]);
    const second = buildCanvasMedia(`${mediaType}-2`, mediaType, durations[1]);
    if (mediaType === 'video') {
      first.naturalHeight = 320;
      second.naturalHeight = 320;
    } // Seedance 2.5 requires both video dimensions to be at least 300 pixels.
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Reference duration test',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceImageIds: mediaType === 'audio' ? [visual.id] : [],
        referenceVideoIds: mediaType === 'video' ? [first.id, second.id] : [],
        referenceAudioIds: mediaType === 'audio' ? [first.id, second.id] : [],
      }),
      images: [visual, first, second],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith(expectedError);
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
  });

  it.each([
    ['video' as const, 'videos'],
    ['audio' as const, 'audio clips'],
  ])('enforces Dreamina CLI reference duration bounds for Jimeng Seedance 2.5 %s', async (mediaType, mediaLabel) => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'reference';
    fal.seedance25AspectRatio = '16:9';
    fal.seedance25Resolution = '720p';
    fal.seedance25Duration = '5';
    fal.seedance25GenerateAudio = false;
    const reference = buildCanvasMedia(`${mediaType}-1`, mediaType, 1.9);
    if (mediaType === 'video') reference.naturalHeight = 320;
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Jimeng reference duration test',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: mediaType === 'video' ? [reference.id] : [],
        referenceAudioIds: mediaType === 'audio' ? [reference.id] : [],
      }),
      images: [reference],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith(`Seedance 2.5 reference ${mediaLabel} must each be between 2 and 30 seconds.`);
    expect(vi.mocked(generateJimengSeedanceVideo)).not.toHaveBeenCalled();
  });

  it.each(['video', 'audio'] as const)('accepts Dreamina CLI duration rounding tolerance for Jimeng Seedance 2.5 %s references', async mediaType => {
    const fal = createFalStub();
    fal.falVideoModelId = JIMENG_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = true;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'reference';
    fal.seedance25AspectRatio = '16:9';
    fal.seedance25Resolution = '720p';
    fal.seedance25Duration = '5';
    fal.seedance25GenerateAudio = false;
    const first = buildCanvasMedia(`${mediaType}-1`, mediaType, 1.99);
    const second = buildCanvasMedia(`${mediaType}-2`, mediaType, 28.02); // The 30.01s total stays inside the backend's probe tolerance.
    vi.mocked(generateJimengSeedanceVideo).mockRejectedValue(new Error('Stop after validating the request.'));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Jimeng reference tolerance test',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: mediaType === 'video' ? [first.id, second.id] : [],
        referenceAudioIds: mediaType === 'audio' ? [first.id, second.id] : [],
      }),
      images: [first, second],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(vi.mocked(generateJimengSeedanceVideo)).toHaveBeenCalledTimes(1);
  });

  it('keeps Seedance 2.5 snapshot videos range-backed until the Fal upload pool', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'reference';
    const referenceVideo = buildCanvasMedia('video-1', 'video', 5);
    referenceVideo.naturalHeight = 320;
    const lazyFile = buildLazySnapshotVideoFile();
    referenceVideo.file = lazyFile;
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Use the reference video',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ referenceVideoIds: [referenceVideo.id] }),
      images: [referenceVideo],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(lazyFile.slice).toHaveBeenCalledTimes(1);
    expect(lazyFile.slice).toHaveBeenCalledWith(0, 8); // Frame-rate probing reads a bounded header without materializing the video.
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'Use the reference video',
      null,
      expect.objectContaining({ referenceVideos: [lazyFile] }),
    );
  });

  it('keeps Seedance 2.5 snapshot audio range-backed until the Fal upload pool', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_25_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = false;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isSeedance25VideoModel = true;
    fal.seedance25Variant = 'reference';
    const visual = buildCanvasMedia('image-1', 'image');
    const referenceAudio = buildCanvasMedia('audio-1', 'audio', 5);
    const lazyFile = buildLazySnapshotAudioFile();
    referenceAudio.file = lazyFile;
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Use the reference audio',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceImageIds: [visual.id],
        referenceAudioIds: [referenceAudio.id],
      }),
      images: [visual, referenceAudio],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(lazyFile.slice).not.toHaveBeenCalled();
    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      'Use the reference audio',
      null,
      expect.objectContaining({ referenceAudios: [lazyFile] }),
    );
  });

  it('normalizes manually typed Seedance image mentions before submit', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'reference';
    const image1 = buildCanvasMedia('image-1', 'image');

    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep the request pending so we can inspect the submit payload.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Match @image 1 exactly',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image1.id],
        referenceImageIds: [image1.id],
        seedanceReferenceOrderIds: [image1.id],
      }),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledWith(
      'Match @Image1 exactly',
      expect.any(Object),
    );
  });

  it('blocks Seedance reference submissions when the prompt mentions an unavailable label', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'reference';
    const image1 = buildCanvasMedia('image-1', 'image');
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Match @Image2 exactly',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image1.id],
        referenceImageIds: [image1.id],
        seedanceReferenceOrderIds: [image1.id],
      }),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('@Image2 does not match any selected Seedance reference. Check the canvas label and try again.');
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('routes Volcengine Seedance 2 Edit runs with the variant and reference media files', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'edit';
    const video1 = buildCanvasMedia('video-1', 'video', 10);
    const image1 = buildCanvasMedia('image-1', 'image');

    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep the request pending so we can inspect the submit payload.
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Replace the background of @Video1 with @Image1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image1.id],
        primaryImageId: image1.id,
        primaryImage: image1,
        primarySelectionMediaType: 'image',
        activePrimaryImage: image1 as CanvasImage & { element: HTMLImageElement },
        referenceVideoIds: [video1.id],
        referenceImageIds: [image1.id],
        seedanceReferenceOrderIds: [video1.id, image1.id],
      }),
      images: [video1, image1],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    const [submittedPrompt, submittedOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];
    expect(submittedPrompt).toBe('Replace the background of @Video1 with @Image1');
    expect(submittedOptions?.variant).toBe('edit');
    expect(submittedOptions?.referenceVideoFiles).toHaveLength(1);
    expect(submittedOptions?.referenceImageFiles).toHaveLength(1);
    expect(submittedOptions?.primaryImageFile).toBeUndefined(); // Edit never sends Smart first/last frames.
    expect(submittedOptions?.lastFrameImageFile).toBeUndefined();
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('primaryImageId');
    expect(queuedJobs[0]?.retryInputs).not.toHaveProperty('videoLastFrameImageId');
  });

  it('blocks Volcengine Seedance 2 Edit submits without a video clip', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'edit';
    const image1 = buildCanvasMedia('image-1', 'image');
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Use @Image1 as the new backdrop',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceImageIds: [image1.id],
        seedanceReferenceOrderIds: [image1.id],
      }),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2 Edit requires at least one video clip.');
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('routes Volcengine Seedance 2 Extend runs with the chained video clips only', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'extend';
    const video1 = buildCanvasMedia('video-1', 'video', 5);
    const video2 = buildCanvasMedia('video-2', 'video', 6);

    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep the request pending so we can inspect the submit payload.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '@Video1 followed by @Video2',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: [video1.id, video2.id],
        seedanceReferenceOrderIds: [video1.id, video2.id],
      }),
      images: [video1, video2],
      paths: [],
      videoNegativePrompt: '',
      setError: vi.fn(),
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    const [submittedPrompt, submittedOptions] = vi.mocked(generateSeedanceVideo).mock.calls[0] ?? [];
    expect(submittedPrompt).toBe('@Video1 followed by @Video2');
    expect(submittedOptions?.variant).toBe('extend');
    expect(submittedOptions?.referenceVideoFiles).toHaveLength(2);
    expect(submittedOptions?.referenceImageFiles).toBeUndefined();
    expect(submittedOptions?.referenceAudioFiles).toBeUndefined();
  });

  it('blocks Volcengine Seedance 2 Extend submits that tag image or audio references', async () => {
    const fal = createFalStub();
    fal.seedance2Variant = 'extend';
    const video1 = buildCanvasMedia('video-1', 'video', 5);
    const image1 = buildCanvasMedia('image-1', 'image');
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Extend @Video1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        referenceVideoIds: [video1.id],
        referenceImageIds: [image1.id],
        seedanceReferenceOrderIds: [video1.id, image1.id],
      }),
      images: [video1, image1],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('Seedance 2 Extend accepts video clips only.');
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
  });

  it('blocks MiniMax H3 Reference submissions when the prompt mentions an unavailable label', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = MINIMAX_H3_VIDEO_MODEL_ID;
    fal.isMiniMaxH3VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.miniMaxH3Variant = 'reference';
    fal.miniMaxH3AspectRatio = 'adaptive';
    fal.miniMaxH3Duration = '5';
    const image1 = buildCanvasMedia('image-1', 'image');
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Match @Image2 exactly',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image1.id],
        referenceImageIds: [image1.id],
        seedanceReferenceOrderIds: [image1.id],
      }),
      images: [image1],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs: vi.fn(),
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith('@Image2 does not match any selected MiniMax H3 reference. Check the canvas label and try again.');
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
  });

  it('surfaces the normalized backend reachability error in the queue row and banner', async () => {
    const backendMessage = 'Seedance 2 could not reach the local Volcengine backend at http://localhost:8000. Run `npm -w @canva-banana/python-backend run sync` once, then `npm run backend:dev`.';
    let queuedJobs: FalQueueJob[] = [];
    vi.mocked(generateSeedanceVideo).mockRejectedValueOnce(new Error(backendMessage));

    const setError = vi.fn();
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A fox running through snow',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
      selection: createSelectionStub(),
      images: [],
      paths: [],
      videoNegativePrompt: '',
      setError,
      setIsLoading: vi.fn(),
      setFalJobs,
      setState: vi.fn(),
      setToastMessage: vi.fn(),
      setTool: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(setError).toHaveBeenCalledWith(backendMessage);
    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0]).toEqual(expect.objectContaining({
      provider: 'volcengine',
      status: 'FAILED',
      error: backendMessage,
    }));
  });
});
