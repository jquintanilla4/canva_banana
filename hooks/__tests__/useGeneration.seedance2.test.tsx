import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { Tool } from '../../types';
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

const createSelectionStub = (): SelectionStateResult => ({
  selectedImageIds: [],
  selectedNoteIds: [],
  referenceImageIds: [],
  referenceVideoIds: [],
  referenceAudioIds: [],
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
  setElementImageIds: vi.fn(),
  setVideoLastFrameImageId: vi.fn(),
  setSourceVideoId: vi.fn(),
  setSourceAudioId: vi.fn(),
  handleImageSelection: vi.fn(),
  handleNoteSelection: vi.fn(),
});

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
});
