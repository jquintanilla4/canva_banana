import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { Tool, type CanvasImage, type FalQueueJob } from '../../types';
import { generateSeedanceVideo } from '../../services/volcengineService';
import type { UseFalSettingsResult } from '../useFalSettings';
import type { SelectionStateResult } from '../useSelectionState';
import { useGeneration } from '../useGeneration';

vi.mock('../../services/volcengineService', async () => {
  const actual = await vi.importActual<typeof import('../../services/volcengineService')>('../../services/volcengineService');
  return {
    ...actual,
    generateSeedanceVideo: vi.fn(),
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
  lipsyncEmotion: 'auto',
  lipsyncModelMode: 'fast',
  lipsyncAudioMode: 'generated',
  infinitalkResolution: '480p',
  infinitalkSeed: '42',
  infinitalkAcceleration: 'none',
  infinitalkDuration: '5s',
  grokImagineVideoDuration: '5',
  grokImagineVideoResolution: '720p',
  grokImagineVideoAspectRatio: '16:9',
  sora2ProResolution: 'auto',
  sora2ProAspectRatio: 'auto',
  sora2ProDuration: '4',
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
  isSeedance15VideoModel: false,
  flux2MaxImageSize: 'landscape_16_9',
  isFlux2MaxModel: false,
  wan26ImageAspectRatio: '16:9',
  wan26ImageMaxImages: 1,
  isWan26ImageModel: false,
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

  it('keeps Seedance duplicate locking scoped away from the global loading flag', async () => {
    vi.useFakeTimers();

    let rejectSeedanceRequest: ((error: Error) => void) | null = null;
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise((_, reject) => {
      rejectSeedanceRequest = reject;
    }));

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

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledTimes(1);
    expect(setIsLoading).not.toHaveBeenCalledWith(true);
    expect(result.current.isSeedanceSubmitLocked).toBe(true);

    act(() => {
      void result.current.handleGenerate();
    });

    expect(vi.mocked(generateSeedanceVideo)).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('This Seedance request is already running. Change the prompt or selected media to submit again.');

    await act(async () => {
      rejectSeedanceRequest?.(new Error('queue failed'));
      await Promise.resolve();
    });

    expect(result.current.isSeedanceSubmitLocked).toBe(false);
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
