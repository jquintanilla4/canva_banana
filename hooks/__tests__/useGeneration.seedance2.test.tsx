import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_O1_VIDEO_MODEL_ID,
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import { Tool, type CanvasImage, type FalQueueJob } from '../../types';
import { generateImageToVideo } from '../../services/falService';
import { generateImage as generateGoogleImage, generateImageEdit as generateGoogleImageEdit } from '../../services/geminiService';
import { generateSeedanceVideo } from '../../services/volcengineService';
import type { UseFalSettingsResult } from '../useFalSettings';
import type { SelectionStateResult } from '../useSelectionState';
import { useGeneration } from '../useGeneration';

vi.mock('../../services/falService', async () => {
  const actual = await vi.importActual<typeof import('../../services/falService')>('../../services/falService');
  return {
    ...actual,
    generateImageToVideo: vi.fn(),
  };
});

vi.mock('../../services/volcengineService', async () => {
  const actual = await vi.importActual<typeof import('../../services/volcengineService')>('../../services/volcengineService');
  return {
    ...actual,
    generateSeedanceVideo: vi.fn(),
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
  hailuoVariant: 'standard',
  klingVariant: 'standard',
  klingO1Variant: 'refI2V',
  klingO1KeepAudio: false,
  kling26AudioSelection: 'off',
  kling26ControlVariant: 'standard',
  kling26ControlKeepSound: false,
  kling26ControlDriver: 'video',
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
  wan26Resolution: '720p',
  wan26Duration: '5',
  wan26PromptExpansion: false,
  wan26MultiShots: false,
  isWan26I2VVideoModel: false,
  seedance15AspectRatio: '16:9',
  seedance15Resolution: '720p',
  seedance15Duration: '5',
  seedance15CameraFixed: false,
  seedance15Audio: false,
  seedance2Variant: 'smart',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  isFalSeedance2VideoModel: false,
  isVolcengineSeedance2VideoModel: true,
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
    naturalWidth: 320,
    naturalHeight: 180,
    file: new File(['test'], `${id}.${mediaType === 'audio' ? 'mp3' : mediaType === 'video' ? 'mp4' : 'png'}`, {
      type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png',
    }),
    ...(mediaType === 'audio' && typeof durationSeconds === 'number' ? { audioDuration: durationSeconds } : {}),
  };
}; // Minimal media keeps Seedance validation tests easy to reason about.

describe('useGeneration (seedance 2)', () => {
  afterEach(() => {
    vi.clearAllMocks();
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

  it('does not merge selected media into references for non-Seedance video runs', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = KLING_O1_VIDEO_MODEL_ID;
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
    expect(submittedOptions?.modelId).toBe(KLING_O1_VIDEO_MODEL_ID);
    expect(submittedOptions?.referenceImages).toEqual([]);
  });

  it('normalizes legacy Sora video reruns before choosing the generation backend', async () => {
    const image1 = buildCanvasMedia('image-1', 'image') as CanvasImage & { element: HTMLImageElement };
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep the Fal request pending for payload inspection.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
      promptPrefix: '',
      apiProvider: 'fal',
      fal: createFalStub(),
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
        modelId: HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID,
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

  it('surfaces the normalized backend reachability error in the queue row and banner', async () => {
    const backendMessage = 'Seedance 2 could not reach the local Volcengine backend at http://localhost:8000. Run `uv sync --project backend` once, then `npm run backend:dev`.';
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
