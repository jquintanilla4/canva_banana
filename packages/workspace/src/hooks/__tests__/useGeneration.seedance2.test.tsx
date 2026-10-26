import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  GPT_IMAGE_2_EDIT_MODEL_ID,
  GPT_IMAGE_25_MODEL_ID,
  IDEOGRAM_45_MODEL_ID,
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
  SEEDREAM_V5_LITE_MODEL_ID,
  SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import { Tool, type CanvasImage, type FalQueueJob, type GenerationFalOptions, type GenerationInputs } from '../../types';
import { generateImage as generateFalImage, generateImageEdit as generateFalImageEdit, generateImageToVideo, uploadVideoToFal } from '../../services/falService';
import { generateImage as generateGoogleImage, generateImageEdit as generateGoogleImageEdit } from '../../services/geminiService';
import { loadMediaFromBlob } from '../../services/mediaService';
import { generateSeedanceVideo } from '../../services/volcengineService';
import { generateJimengSeedanceVideo } from '../../services/jimengService';
import type { UseFalSettingsResult } from '../useFalSettings';
import type { SelectionStateResult } from '../useSelectionState';
import { useGeneration } from '../useGeneration';
import { serializeIdeogram45GenerationOptions } from '../../services/ideogram45RunSettings';
import { serializeGptImage2GenerationOptions } from '../../services/gptImage2RunSettings';
import { serializeGptImage25GenerationOptions } from '../../services/gptImage25RunSettings';
import { KLING_V4_DEFAULTS, KLING_V4_EDIT_VIDEO_MODEL_ID, KLING_V4_VIDEO_MODEL_ID } from '../../services/klingV4Config';

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

  describe('Kling 4 orchestration', () => {
    const setupKling = (input: {
      images?: CanvasImage[];
      selection?: Partial<SelectionStateResult>;
      fal?: Partial<UseFalSettingsResult>;
      prompt?: string;
    } = {}) => {
      const fal = { ...createFalStub(), falVideoModelId: KLING_V4_VIDEO_MODEL_ID, ...KLING_V4_DEFAULTS, ...input.fal };
      let jobs: FalQueueJob[] = [];
      const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
        jobs = typeof value === 'function' ? value(jobs) : value;
      });
      const setError = vi.fn();
      const setState = vi.fn();
      vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Inspect the real hook's request without calling a paid provider.
      const hook = renderHook(() => useGeneration({
        appMode: 'CANVAS', tool: Tool.FREE_SELECTION, prompt: input.prompt ?? 'A fox crossing a snowy field', apiProvider: 'fal',
        fal, selection: createSelectionStub(input.selection), images: input.images ?? [], paths: [], videoNegativePrompt: '',
        setError, setState, setFalJobs, setIsLoading: vi.fn(), setToastMessage: vi.fn(), setTool: vi.fn(),
      }));
      return { ...hook, fal, setError, setState, getJobs: () => jobs };
    };

    it('submits text-only Generate with four default settings, callbacks and replay metadata', async () => {
      const { result, getJobs, setError } = setupKling();
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith('A fox crossing a snowy field', null, expect.objectContaining({
        modelId: KLING_V4_VIDEO_MODEL_ID, ...KLING_V4_DEFAULTS,
        onPhaseUpdate: expect.any(Function), onQueueUpdate: expect.any(Function),
      }));
      const options = vi.mocked(generateImageToVideo).mock.calls[0][2];
      expect(options).toHaveProperty('abortSignal');
      expect(options).not.toHaveProperty('sourceVideoUrl');
      expect(options).not.toHaveProperty('referenceImages');
      expect(options).not.toHaveProperty('referenceAudios');
      expect(getJobs()[0]).toMatchObject({ modelLabel: 'Kling v4 Generate', retryInputs: { falOptions: KLING_V4_DEFAULTS } });
      expect(setError.mock.calls.every(([message]) => message === null)).toBe(true);
    });

    it('keeps one selected still and its end frame out of reference inputs and retry references', async () => {
      const start = buildCanvasMedia('start', 'image');
      const end = buildCanvasMedia('end', 'image');
      const { result, getJobs } = setupKling({ images: [start, end], selection: {
        selectedImageIds: [start.id], primaryImageId: start.id, videoLastFrameImageId: end.id,
        elementImageIds: [end.id], sourceVideoId: 'stale-source',
      } });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith(expect.any(String), start.element, expect.objectContaining({ tailImage: end.element }));
      const options = vi.mocked(generateImageToVideo).mock.calls[0][2];
      expect(options).not.toHaveProperty('referenceImages');
      expect(options).not.toHaveProperty('sourceVideoUrl');
      expect(options).not.toHaveProperty('elementImages');
      expect(getJobs()[0].retryInputs).toMatchObject({ primaryImageId: start.id, videoLastFrameImageId: end.id });
      expect(getJobs()[0].retryInputs).not.toHaveProperty('referenceImageIds');
      expect(getJobs()[0].retryInputs).not.toHaveProperty('sourceVideoId');
      expect(getJobs()[0].retryInputs).not.toHaveProperty('elementImageIds');
    });

    it.each(['@Image1 runs', '@ image 1 runs'])('routes a single primary to references when the prompt says %s', async prompt => {
      const image = buildCanvasMedia('image', 'image');
      const { result, getJobs } = setupKling({ prompt, images: [image], selection: { selectedImageIds: [image.id], primaryImageId: image.id } });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith('@Image1 runs', null, expect.objectContaining({ referenceImages: [image.element] }));
      expect(getJobs()[0].retryInputs).toMatchObject({ referenceImageIds: [image.id] });
      expect(getJobs()[0].retryInputs?.primaryImageId).toBeUndefined();
      expect(getJobs()[0].retryInputs).not.toHaveProperty('originalSourceImageId');
    });

    it('merges mixed selected and tagged references once, in the autocomplete order, without eagerly reading snapshot videos', async () => {
      const image1 = buildCanvasMedia('image-1', 'image');
      const image2 = buildCanvasMedia('image-2', 'image');
      const image3 = buildCanvasMedia('image-3', 'image');
      const video1 = buildCanvasMedia('video-1', 'video', 1);
      const video2 = buildCanvasMedia('video-2', 'video', 90);
      const lazyFile = buildLazySnapshotVideoFile();
      video2.file = lazyFile;
      const { result, getJobs } = setupKling({
        prompt: '@Image1 and @Image3 follow @Video2', images: [image1, image2, image3, video1, video2],
        selection: {
          selectedImageIds: [image1.id, video1.id, image2.id], primaryImageId: image1.id,
          referenceImageIds: [image1.id, image3.id], referenceVideoIds: [video2.id, video1.id],
          seedanceReferenceOrderIds: [video2.id, image3.id, image2.id, video1.id, image1.id],
        },
      });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith('@Image1 and @Image3 follow @Video2', null, expect.objectContaining({
        referenceImages: [image3.element, image2.element, image1.element], referenceVideos: [lazyFile, video1.file],
      }));
      expect(lazyFile.slice).not.toHaveBeenCalled();
      expect(getJobs()[0].retryInputs).toMatchObject({
        referenceImageIds: [image3.id, image2.id, image1.id], referenceVideoIds: [video2.id, video1.id],
      });
      expect(getJobs()[0].retryInputs?.primaryImageId).toBeUndefined();
    });

    it('accepts a single normally selected video as a reference', async () => {
      const video = buildCanvasMedia('video', 'video', 1);
      const { result } = setupKling({ images: [video], selection: { selectedImageIds: [video.id], primaryImageId: video.id } });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith(expect.any(String), null, expect.objectContaining({ referenceImages: [], referenceVideos: [video.file] }));
    });

    it.each([false, true])('submits Edit source video with optional tagged images (%s)', async withReference => {
      const source = buildCanvasMedia('source', 'video', 20);
      const reference = buildCanvasMedia('reference', 'image');
      vi.mocked(uploadVideoToFal).mockResolvedValue('https://example.com/source.mp4');
      const { result, getJobs } = setupKling({ prompt: withReference ? 'Restyle @Video1 using @Image1' : 'Restyle @Video1', images: [source, reference], fal: { klingV4Variant: 'edit', klingV4Duration: 'source', klingV4Resolution: '720p' }, selection: {
        selectedImageIds: [source.id], primaryImageId: source.id, sourceVideoId: source.id,
        referenceImageIds: withReference ? [reference.id] : [], videoLastFrameImageId: reference.id, elementImageIds: [reference.id],
      } });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(uploadVideoToFal).toHaveBeenCalledWith(source.file, expect.objectContaining({ label: 'source video', onPhaseUpdate: expect.any(Function) }));
      expect(generateImageToVideo).toHaveBeenCalledWith(expect.any(String), null, expect.objectContaining({
        klingV4Variant: 'edit', klingV4Duration: 'source', klingV4Resolution: '720p', klingV4AspectRatio: '16:9',
        sourceVideoUrl: 'https://example.com/source.mp4', referenceImages: withReference ? [reference.element] : [],
      }));
      expect(vi.mocked(generateImageToVideo).mock.calls[0][2]).not.toHaveProperty('tailImage');
      expect(getJobs()[0].retryInputs).toMatchObject({ sourceVideoId: source.id, falOptions: { klingV4Duration: 'source' } });
      expect(getJobs()[0].retryInputs).not.toHaveProperty('videoLastFrameImageId');
      expect(getJobs()[0].retryInputs?.primaryImageId).toBeUndefined();
      expect(getJobs()[0].retryInputs).not.toHaveProperty('elementImageIds');
    });

    it.each(['primary', 'references', 'videoReferences'] as const)('restores saved %s runs with model defaults, independent of current global settings and media', async inputKind => {
      const image1 = buildCanvasMedia('saved-image-1', 'image');
      const image2 = buildCanvasMedia('saved-image-2', 'image');
      const video = buildCanvasMedia('saved-video', 'video', 15);
      const audio = buildCanvasMedia('global-audio', 'audio');
      const { result, getJobs } = setupKling({ images: [image1, image2, video, audio], fal: {
        falModelMode: 'image', klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4AspectRatio: '21:9', klingV4Duration: '30',
      }, selection: { selectedImageIds: [audio.id], referenceAudioIds: [audio.id], sourceAudioId: audio.id, videoLastFrameImageId: image2.id, sourceVideoId: 'global-video' } });
      await act(async () => { void result.current.handleGenerate({
        kind: 'video', provider: 'fal', modelId: KLING_V4_VIDEO_MODEL_ID, prompt: 'Saved prompt',
        ...(inputKind === 'primary' ? { primaryImageId: image1.id } : inputKind === 'references' ? { referenceImageIds: [image2.id, image1.id] } : { referenceVideoIds: [video.id] }),
      }); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith('Saved prompt', inputKind === 'primary' ? image1.element : null, expect.objectContaining(KLING_V4_DEFAULTS));
      const options = vi.mocked(generateImageToVideo).mock.calls[0][2];
      if (inputKind === 'references') expect(options?.referenceImages).toEqual([image2.element, image1.element]);
      else if (inputKind === 'videoReferences') expect(options?.referenceVideos).toEqual([video.file]);
      else expect(options).not.toHaveProperty('referenceImages');
      expect(options).not.toHaveProperty('sourceVideoUrl');
      expect(options).not.toHaveProperty('tailImage');
      expect(getJobs()[0].retryInputs).not.toHaveProperty('sourceAudioId');
      expect(getJobs()[0].retryInputs?.falOptions).toEqual(KLING_V4_DEFAULTS);
    });

    it.each([KLING_V4_EDIT_VIDEO_MODEL_ID, KLING_V4_VIDEO_MODEL_ID])('restores partial Edit settings for %s with source duration and a generated source URL', async modelId => {
      const source = buildCanvasMedia('source', 'video', 10);
      source.metadata = { source: 'generated', generation: { kind: 'video', provider: 'fal', prompt: 'original', url: 'https://example.com/existing.mp4' } };
      const { result, getJobs } = setupKling({ images: [source], fal: { klingV4Duration: '30' } });
      await act(async () => { void result.current.handleGenerate({
        kind: 'video', provider: 'fal', modelMode: 'video', modelId, prompt: 'Change the weather', sourceVideoId: source.id,
        ...(modelId === KLING_V4_VIDEO_MODEL_ID ? { falOptions: { klingV4Variant: 'edit' } } : {}),
      }); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith('Change the weather', null, expect.objectContaining({
        modelId: KLING_V4_VIDEO_MODEL_ID, klingV4Variant: 'edit', klingV4Duration: 'source', sourceVideoUrl: 'https://example.com/existing.mp4',
      }));
      expect(uploadVideoToFal).not.toHaveBeenCalled();
      expect(getJobs()[0].modelLabel).toBe('Kling v4 Edit');
    });

    it('lets an explicit Generate variant override the raw edit alias', async () => {
      const { result } = setupKling();
      await act(async () => { void result.current.handleGenerate({
        kind: 'video', provider: 'fal', modelId: KLING_V4_EDIT_VIDEO_MODEL_ID, prompt: 'A new scene', falOptions: { klingV4Variant: 'generate' },
      }); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(generateImageToVideo).toHaveBeenCalledWith('A new scene', null, expect.objectContaining({ modelId: KLING_V4_VIDEO_MODEL_ID, klingV4Variant: 'generate' }));
      expect(vi.mocked(generateImageToVideo).mock.calls[0][2]).not.toHaveProperty('sourceVideoUrl');
    });

    it('replays captured reference settings and order after the global bar changes', async () => {
      const image1 = buildCanvasMedia('image-1', 'image');
      const image2 = buildCanvasMedia('image-2', 'image');
      const { result, fal, rerender, getJobs } = setupKling({ images: [image1, image2], fal: {
        klingV4Resolution: '720p', klingV4AspectRatio: '9:16', klingV4Duration: '12',
      }, selection: { selectedImageIds: [image1.id, image2.id], primaryImageId: image1.id, seedanceReferenceOrderIds: [image2.id, image1.id] } });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalledTimes(1));
      const retryInputs = getJobs()[0].retryInputs!;
      fal.klingV4Variant = 'edit'; fal.klingV4Resolution = '1080p'; fal.klingV4AspectRatio = '21:9'; fal.klingV4Duration = 'source';
      rerender();
      await act(async () => { void result.current.handleGenerate(retryInputs); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalledTimes(2));
      expect(vi.mocked(generateImageToVideo).mock.calls[1]).toEqual([
        expect.any(String), null, expect.objectContaining({
          klingV4Variant: 'generate', klingV4Resolution: '720p', klingV4AspectRatio: '9:16', klingV4Duration: '12',
          referenceImages: [image2.element, image1.element],
        }),
      ]);
    });

    it.each(['selected', 'tagged', 'source', 'saved'] as const)('rejects unsupported %s audio before any provider request', async mode => {
      const audio = buildCanvasMedia('audio', 'audio', 5);
      const { result, setError } = setupKling({ images: [audio], selection: {
        ...(mode === 'selected' ? { selectedImageIds: [audio.id] } : mode === 'tagged' ? { referenceAudioIds: [audio.id] } : mode === 'source' ? { sourceAudioId: audio.id } : {}),
      } });
      await act(async () => { await result.current.handleGenerate(mode === 'saved' ? {
        kind: 'video', provider: 'fal', modelMode: 'video', modelId: KLING_V4_VIDEO_MODEL_ID, prompt: 'Saved run', referenceAudioIds: [audio.id],
      } : undefined); });
      expect(setError).toHaveBeenCalledWith(expect.stringContaining('does not support audio references'));
      expect(generateImageToVideo).not.toHaveBeenCalled();
      expect(uploadVideoToFal).not.toHaveBeenCalled();
    });

    it.each(['tagged', 'multiple', 'mention'] as const)('rejects an end frame combined with %s references', async mode => {
      const image1 = buildCanvasMedia('image-1', 'image');
      const image2 = buildCanvasMedia('image-2', 'image');
      const { result, setError } = setupKling({ images: [image1, image2], prompt: mode === 'mention' ? '@Image1 walks' : 'A fox walks', selection: {
        selectedImageIds: mode === 'multiple' ? [image1.id, image2.id] : [image1.id], primaryImageId: image1.id,
        referenceImageIds: mode === 'tagged' ? [image2.id] : [], videoLastFrameImageId: image2.id,
      } });
      await act(async () => { await result.current.handleGenerate(); });
      expect(setError).toHaveBeenCalledWith(expect.stringContaining('cannot combine an end frame with references'));
      expect(generateImageToVideo).not.toHaveBeenCalled();
    });

    it('rejects Edit without a source video before upload', async () => {
      const { result, setError } = setupKling({ fal: { klingV4Variant: 'edit' } });
      await act(async () => { await result.current.handleGenerate(); });
      expect(setError).toHaveBeenCalledWith(expect.stringContaining('Edit requires a source video'));
      expect(generateImageToVideo).not.toHaveBeenCalled();
      expect(uploadVideoToFal).not.toHaveBeenCalled();
    });

    it('rejects tagged video references in Edit before source upload', async () => {
      const source = buildCanvasMedia('source', 'video', 15);
      const reference = buildCanvasMedia('reference', 'video', 15);
      const { result, setError } = setupKling({ images: [source, reference], fal: { klingV4Variant: 'edit' }, selection: { sourceVideoId: source.id, referenceVideoIds: [reference.id] } });
      await act(async () => { await result.current.handleGenerate(); });
      expect(setError).toHaveBeenCalledWith(expect.stringContaining('Edit supports image references only'));
      expect(generateImageToVideo).not.toHaveBeenCalled();
      expect(uploadVideoToFal).not.toHaveBeenCalled();
    });

    it.each(['@Image2', '@Video2'])('rejects unmatched %s prompt labels', async mention => {
      const image = buildCanvasMedia('image', 'image');
      const { result, setError } = setupKling({ images: [image], prompt: `Follow ${mention}`, selection: { selectedImageIds: [image.id], primaryImageId: image.id } });
      await act(async () => { await result.current.handleGenerate(); });
      expect(setError).toHaveBeenCalledWith(expect.stringContaining(`${mention} does not match any selected Kling 4 reference`));
      expect(generateImageToVideo).not.toHaveBeenCalled();
    });

    it.each([['image', 11], ['video', 6]] as const)('enforces the %s reference limit through handleGenerate', async (mediaType, count) => {
      const media = Array.from({ length: count }, (_, index) => buildCanvasMedia(`ref-${index}`, mediaType, 5));
      const { result, setError } = setupKling({ images: media, selection: { selectedImageIds: media.map(item => item.id) } });
      await act(async () => { await result.current.handleGenerate(); });
      expect(setError).toHaveBeenCalledWith('Kling 4 supports up to 10 image references and 5 video references.');
      expect(generateImageToVideo).not.toHaveBeenCalled();
    });

    it('accepts all ten image and five video references together', async () => {
      const stills = Array.from({ length: 10 }, (_, index) => buildCanvasMedia(`image-${index}`, 'image'));
      const videos = Array.from({ length: 5 }, (_, index) => buildCanvasMedia(`video-${index}`, 'video', 90));
      const { result } = setupKling({ images: [...stills, ...videos], selection: { selectedImageIds: [...stills, ...videos].map(item => item.id) } });
      await act(async () => { void result.current.handleGenerate(); });
      await vi.waitFor(() => expect(generateImageToVideo).toHaveBeenCalled());
      expect(vi.mocked(generateImageToVideo).mock.calls[0][2]).toMatchObject({ referenceImages: stills.map(image => image.element), referenceVideos: videos.map(video => video.file) });
    });

    it('downloads the result with matching request metadata and marks generated audio without browser probes', async () => {
      const image = buildCanvasMedia('image', 'image');
      const { result, setState, getJobs } = setupKling({ images: [image], prompt: '@Image1 walks', selection: { selectedImageIds: [image.id], primaryImageId: image.id } });
      const videoElement = document.createElement('video');
      Object.defineProperty(videoElement, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
      Object.defineProperty(videoElement, 'pause', { configurable: true, value: vi.fn() });
      vi.mocked(generateImageToVideo).mockResolvedValue({ videoUrl: 'https://example.com/kling.mp4', requestId: 'kling-request' });
      vi.mocked(loadMediaFromBlob).mockResolvedValue(videoElement);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })) }));
      await act(async () => { await result.current.handleGenerate(); });
      const updater = setState.mock.calls.find(([value]) => typeof value === 'function')?.[0];
      const video = updater?.({ images: [] }).images[0] as CanvasImage | undefined;
      expect(video?.hasAudio).toBe(true);
      expect(video?.metadata?.generation).toMatchObject({
        ...getJobs()[0].retryInputs, url: 'https://example.com/kling.mp4', referenceImageIds: [image.id], falOptions: KLING_V4_DEFAULTS,
      });
      expect(video?.metadata?.generation?.primaryImageId).toBeUndefined();
      expect(getJobs()[0].status).toBe('COMPLETED');
    });
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

  it('routes validated Flux 3 keyframes through the main generation workflow', async () => {
    const first = buildCanvasMedia('flux-keyframe-1', 'image');
    const second = buildCanvasMedia('flux-keyframe-2', 'image');
    const fal = createFalStub();
    fal.falVideoModelId = FLUX_3_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.flux3Variant = 'keyframes';
    fal.flux3AspectRatio = '16:9';
    fal.flux3Resolution = '1080p';
    fal.flux3Duration = '10';
    fal.flux3GenerateAudio = false;
    fal.flux3KeyframeTimings = [
      { imageId: first.id, timestampSeconds: 0 },
      { imageId: second.id, timestampSeconds: 10 },
    ];
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '@Image1 becomes @Image2',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ referenceImageIds: [first.id, second.id] }),
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
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      '@Image1 becomes @Image2',
      null,
      expect.objectContaining({
        modelId: FLUX_3_VIDEO_MODEL_ID,
        flux3Variant: 'keyframes',
        flux3AspectRatio: '16:9',
        flux3Resolution: '1080p',
        flux3Duration: '10',
        flux3GenerateAudio: false,
        referenceImages: [first.element, second.element],
        flux3KeyframeTimestampsSeconds: [0, 10],
      }),
    );
  });

  it('rejects extra selected media in Flux 3 Smart mode', async () => {
    const first = buildCanvasMedia('flux-smart-image', 'image') as CanvasImage & { element: HTMLImageElement };
    const second = buildCanvasMedia('flux-smart-video', 'video');
    const fal = createFalStub();
    fal.falVideoModelId = FLUX_3_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.flux3Variant = 'smart';
    fal.flux3Duration = 'auto';
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A paper bird takes flight',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [first.id, second.id],
        primaryImageId: first.id,
        primaryImage: first,
        primarySelectionMediaType: 'image',
        activePrimaryImage: first,
      }),
      images: [first, second],
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

    expect(setError).toHaveBeenCalledWith('Flux 3 Smart supports at most one selected still image. Clear extra images, videos, or audio.');
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
  });

  it('rejects a Flux Smart retry when its saved starting image was deleted', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FLUX_3_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.flux3Variant = 'smart';
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
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
      await result.current.handleGenerate({
        kind: 'video',
        prompt: 'A paper bird takes flight',
        provider: 'fal',
        modelId: FLUX_3_VIDEO_MODEL_ID,
        modelMode: 'video',
        primaryImageId: 'deleted-image',
        falOptions: { flux3Variant: 'smart' },
      });
    });

    expect(setError).toHaveBeenCalledWith('Flux 3 Smart could not find its starting image on the canvas.');
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
  });

  it('submits the latest Flux 3 settings after the prompt bar changes mode', async () => {
    const first = buildCanvasMedia('flux-latest-keyframe-1', 'image');
    const second = buildCanvasMedia('flux-latest-keyframe-2', 'image');
    const selection = createSelectionStub({ referenceImageIds: [first.id, second.id] });
    const images = [first, second];
    type FluxSettings = Pick<UseFalSettingsResult, 'flux3Variant' | 'flux3AspectRatio' | 'flux3Resolution' | 'flux3Duration' | 'flux3GenerateAudio' | 'flux3KeyframeTimings'>;
    const initialFluxSettings: FluxSettings = {
      flux3Variant: 'smart',
      flux3AspectRatio: 'auto',
      flux3Resolution: '720p',
      flux3Duration: 'auto',
      flux3GenerateAudio: true,
      flux3KeyframeTimings: [],
    };
    const updatedFluxSettings: FluxSettings = {
      flux3Variant: 'keyframes',
      flux3AspectRatio: '16:9',
      flux3Resolution: '1080p',
      flux3Duration: '10',
      flux3GenerateAudio: false,
      flux3KeyframeTimings: [
        { imageId: first.id, timestampSeconds: 1 },
        { imageId: second.id, timestampSeconds: 9 },
      ],
    };
    const fal = createFalStub();
    fal.falVideoModelId = FLUX_3_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    const paths: [] = [];
    const setError = vi.fn();
    const setIsLoading = vi.fn();
    const setFalJobs = vi.fn();
    const setState = vi.fn();
    const setToastMessage = vi.fn();
    const setTool = vi.fn();
    vi.mocked(generateImageToVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so submitted settings can be inspected.

    const { result, rerender } = renderHook(
      ({ fluxSettings }: { fluxSettings: FluxSettings }) => {
        Object.assign(fal, fluxSettings);
        return useGeneration({
          appMode: 'CANVAS',
          tool: Tool.FREE_SELECTION,
          prompt: '@Image1 becomes @Image2',
          promptPrefix: '',
          apiProvider: 'fal',
          fal,
          selection,
          images,
          paths,
          videoNegativePrompt: '',
          setError,
          setIsLoading,
          setFalJobs,
          setState,
          setToastMessage,
          setTool,
        });
      },
      { initialProps: { fluxSettings: initialFluxSettings } },
    );

    rerender({ fluxSettings: updatedFluxSettings });

    await act(async () => {
      void result.current.handleGenerate();
      await Promise.resolve();
    });

    expect(vi.mocked(generateImageToVideo)).toHaveBeenCalledWith(
      '@Image1 becomes @Image2',
      null,
      expect.objectContaining({
        modelId: FLUX_3_VIDEO_MODEL_ID,
        flux3Variant: 'keyframes',
        flux3AspectRatio: '16:9',
        flux3Resolution: '1080p',
        flux3Duration: '10',
        flux3GenerateAudio: false,
        referenceImages: [first.element, second.element],
        flux3KeyframeTimestampsSeconds: [1, 9],
      }),
    );
  });

  it('rejects unsupported canvas media at the Flux Smart submission boundary', async () => {
    const video = buildCanvasMedia('flux-smart-video', 'video');
    const fal = createFalStub();
    fal.falVideoModelId = FLUX_3_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.flux3Variant = 'smart';
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'A city waking at sunrise',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [video.id],
        primaryImageId: video.id,
        primaryImage: video,
        primarySelectionMediaType: 'video',
      }),
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

    expect(setError).toHaveBeenCalledWith('Flux 3 Smart supports at most one selected still image. Clear extra images, videos, or audio.');
    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
  });

  it.each([
    ['a MOV file', 'video/quicktime', 5, 'MP4 source videos only'],
    ['a 15-second MP4 file', 'video/mp4', 15, 'under 15 seconds'],
  ])('rejects %s before a Flux Extend upload', async (_case, fileType, durationSeconds, expectedError) => {
    const video = buildCanvasMedia('flux-extend-source', 'video', durationSeconds);
    video.file = new File(['video'], 'source-video', { type: fileType });
    const fal = createFalStub();
    fal.falVideoModelId = FLUX_3_VIDEO_MODEL_ID;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.flux3Variant = 'extend';
    const setError = vi.fn();

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Continue @Video1',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({ sourceVideoId: video.id, selectedImageIds: [video.id] }),
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

    expect(setError).toHaveBeenCalledWith(expect.stringContaining(expectedError));
    expect(uploadVideoToFal).not.toHaveBeenCalled();
    expect(generateImageToVideo).not.toHaveBeenCalled();
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

  it.each([
    { provider: 'jimeng' as const, currentModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID },
    { provider: 'jimeng' as const, currentModelId: KLING_V3_VIDEO_MODEL_ID },
    { provider: 'volcengine' as const, currentModelId: WAN_27_VIDEO_MODEL_ID },
  ])('honors saved $provider metadata without a model id while $currentModelId is selected', async ({ provider, currentModelId }) => {
    const fal = createFalStub();
    fal.falVideoModelId = currentModelId;
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.isJimengSeedance2VideoModel = false;
    vi.mocked(generateJimengSeedanceVideo).mockImplementation(() => new Promise(() => {})); // Keep pending so routing can be inspected.
    vi.mocked(generateSeedanceVideo).mockImplementation(() => new Promise(() => {}));

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
        provider,
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

    expect(vi.mocked(generateImageToVideo)).not.toHaveBeenCalled();
    if (provider === 'volcengine') {
      expect(generateJimengSeedanceVideo).not.toHaveBeenCalled();
      expect(generateSeedanceVideo).toHaveBeenCalledWith('Saved Jimeng rerun', expect.objectContaining({
        modelId: 'doubao-seedance-2-0-260128', variant: 'smart', aspectRatio: '16:9', duration: '5', resolution: '1080p',
      }));
      return;
    }
    expect(vi.mocked(generateSeedanceVideo)).not.toHaveBeenCalled();
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

  it('honors saved Jimeng provider metadata when a supported Fal Seedance model id is present', async () => {
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
        prompt: 'Supported Fal Seedance Jimeng rerun',
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
      'Supported Fal Seedance Jimeng rerun',
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

  it.each([
    ...[
      'fal-ai/kling-video/v2.5-turbo/image-to-video',
      KLING_V3_VIDEO_MODEL_ID,
      'fal-ai/kling-video/v3/pro/motion-control',
      KLING_O3_VIDEO_MODEL_ID,
      'fal-ai/scail',
      WAN_27_VIDEO_MODEL_ID,
      'fal-ai/wan/v2.2-14b/animate/replace',
      SEEDANCE_15_VIDEO_MODEL_ID,
      'fal-ai/veo3.1/image-to-video',
    ].map(modelId => ({ modelId, source: 'current selection', provider: undefined })),
    { modelId: KLING_VIDEO_STANDARD_MODEL_ID, source: 'kind-only Fal rerun', provider: 'fal' as const },
    { modelId: KLING_O3_VIDEO_EDIT_MODEL_ID, source: 'kind-only Fal rerun', provider: 'fal' as const },
    { modelId: WAN_27_EDIT_VIDEO_MODEL_ID, source: 'mode-only Jimeng rerun', provider: 'jimeng' as const },
    { modelId: 'fal-ai/sora-2/image-to-video/pro', source: 'Volcengine rerun', provider: 'volcengine' as const },
  ])('rejects retired $modelId from $source before uploads, provider calls or queueing', async ({ modelId, source, provider }) => {
    const image = buildCanvasMedia('image-1', 'image');
    const video = buildCanvasMedia('video-1', 'video', 4);
    const audio = buildCanvasMedia('audio-1', 'audio', 4);
    const fal = createFalStub();
    const usesCurrentModel = source === 'current selection';
    fal.falVideoModelId = usesCurrentModel ? modelId as typeof fal.falVideoModelId : FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.falModelMode = source.startsWith('kind-only') || source.startsWith('mode-only') ? 'image' : 'video';
    fal.klingV3MultiPromptEnabled = true;
    fal.klingV3MultiPrompt = ''; // Retirement takes precedence over obsolete model-specific validation.
    const setError = vi.fn();
    const setFalJobs = vi.fn();
    const generationOverride: GenerationInputs | undefined = provider ? {
      kind: source.startsWith('mode-only') ? 'upscale' : 'video',
      prompt: 'Repeat the saved video',
      provider,
      ...(!usesCurrentModel ? { modelId } : {}),
      ...(!source.startsWith('kind-only') ? { modelMode: 'video' as const } : {}),
      primaryImageId: image.id,
      sourceVideoId: video.id,
      sourceAudioId: audio.id,
      referenceImageIds: [image.id],
      referenceVideoIds: [video.id],
      referenceAudioIds: [audio.id],
      ...(provider === 'jimeng' ? { jimengOptions: { seedance2Variant: 'reference' as const } } : {}),
      ...(provider === 'volcengine' ? { volcengineOptions: { seedance2Variant: 'reference' as const } } : {}),
    } : undefined;

    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Animate the selected media',
      promptPrefix: '',
      apiProvider: 'fal',
      fal,
      selection: createSelectionStub({
        selectedImageIds: [image.id],
        primaryImageId: image.id,
        primaryImage: image,
        primarySelectionMediaType: 'image',
        sourceVideoId: video.id,
        sourceAudioId: audio.id,
        referenceImageIds: [image.id],
        referenceVideoIds: [video.id],
        referenceAudioIds: [audio.id],
      }),
      images: [image, video, audio],
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
      void result.current.handleGenerate(generationOverride);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setError.mock.calls).toEqual([['This video model is no longer supported. Select a supported video model and create a new generation.']]);
    expect(uploadVideoToFal).not.toHaveBeenCalled();
    expect(generateImageToVideo).not.toHaveBeenCalled();
    expect(generateSeedanceVideo).not.toHaveBeenCalled();
    expect(generateJimengSeedanceVideo).not.toHaveBeenCalled();
    expect(generateFalImage).not.toHaveBeenCalled();
    expect(generateFalImageEdit).not.toHaveBeenCalled();
    expect(generateGoogleImage).not.toHaveBeenCalled();
    expect(generateGoogleImageEdit).not.toHaveBeenCalled();
    expect(setFalJobs).not.toHaveBeenCalled();
  });

  it.each([
    'fal-ai/bytedance/seedream/v4/edit',
    'fal-ai/bytedance/seedream/v4/text-to-image',
    'fal-ai/bytedance/seedream/v4.5/edit',
    'fal-ai/bytedance/seedream/v4.5/text-to-image',
    'fal-ai/wan/v2.7/pro/text-to-image',
    'fal-ai/wan/v2.7/pro/edit',
    'wan/v2.6/text-to-image',
    'wan/v2.6/image-to-image',
  ])('rejects removed image model %s without falling back to another model', async modelId => {
    const image = buildCanvasMedia('image-1', 'image');
    const setError = vi.fn();
    const setFalJobs = vi.fn();
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS', tool: Tool.FREE_SELECTION, prompt: 'Current prompt', promptPrefix: '', apiProvider: 'fal',
      fal: createFalStub(), selection: createSelectionStub(), images: [image], paths: [], videoNegativePrompt: '',
      setError, setIsLoading: vi.fn(), setFalJobs, setState: vi.fn(), setToastMessage: vi.fn(), setTool: vi.fn(),
    }));

    for (const kind of ['text_to_image', 'image_edit'] as const) {
      await act(async () => {
        await result.current.handleGenerate({
          kind, prompt: 'Repeat the saved image', provider: 'fal', modelId, modelMode: 'image', primaryImageId: image.id,
        });
      });
    }

    expect(setError.mock.calls).toEqual(Array.from({ length: 2 }, () => [
      'This image model is no longer supported. Select a supported image model and create a new generation.',
    ]));
    expect(generateFalImage).not.toHaveBeenCalled();
    expect(generateFalImageEdit).not.toHaveBeenCalled();
    expect(generateGoogleImage).not.toHaveBeenCalled();
    expect(generateGoogleImageEdit).not.toHaveBeenCalled();
    expect(generateImageToVideo).not.toHaveBeenCalled();
    expect(generateSeedanceVideo).not.toHaveBeenCalled();
    expect(generateJimengSeedanceVideo).not.toHaveBeenCalled();
    expect(setFalJobs).not.toHaveBeenCalled();
  });

  it.each(['text_to_image', 'image_edit'] as const)('keeps Seedream 5 $kind reruns working with a stale retired video selection', async kind => {
    const image = buildCanvasMedia('image-1', 'image');
    const fal = createFalStub();
    fal.falVideoModelId = WAN_27_VIDEO_MODEL_ID;
    const setError = vi.fn();
    vi.mocked(generateFalImage).mockImplementation(() => new Promise(() => {}));
    vi.mocked(generateFalImageEdit).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS', tool: Tool.FREE_SELECTION, prompt: 'Current video prompt', promptPrefix: '', apiProvider: 'fal', fal,
      selection: createSelectionStub(), images: [image], paths: [], videoNegativePrompt: '',
      setError, setIsLoading: vi.fn(), setFalJobs: vi.fn(), setState: vi.fn(), setToastMessage: vi.fn(), setTool: vi.fn(),
    }));

    await act(async () => {
      void result.current.handleGenerate({
        kind, prompt: 'A watercolor landscape', provider: 'fal', modelId: SEEDREAM_V5_LITE_MODEL_ID, modelMode: 'image',
        ...(kind === 'image_edit' ? { primaryImageId: image.id } : {}),
      });
      await Promise.resolve();
    });

    const generationService = kind === 'text_to_image' ? generateFalImage : generateFalImageEdit;
    expect(generationService).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generationService).mock.calls[0]?.[1]).toMatchObject({
      modelId: kind === 'text_to_image' ? SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID : SEEDREAM_V5_LITE_MODEL_ID,
    });
    expect(setError.mock.calls.every(([message]) => message === null)).toBe(true);
    expect(generateImageToVideo).not.toHaveBeenCalled();
    expect(generateSeedanceVideo).not.toHaveBeenCalled();
    expect(generateJimengSeedanceVideo).not.toHaveBeenCalled();
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

  it('does not attach current audio when rerunning a Seedance reference generation without saved audio', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = FAL_SEEDANCE_2_VIDEO_MODEL_ID;
    fal.isFalSeedance2VideoModel = true;
    fal.isVolcengineSeedance2VideoModel = false;
    fal.seedance2Variant = 'reference';
    const image1 = buildCanvasMedia('image-1', 'image');
    const audio1 = buildCanvasMedia('audio-1', 'audio', 4);
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
        referenceAudioIds: [audio1.id],
      }),
      images: [image1, audio1],
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
        prompt: 'Repeat the saved scene using @Image1',
        provider: 'fal',
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        referenceImageIds: [image1.id],
        falOptions: { seedance2Variant: 'reference' },
      });
      await Promise.resolve();
    });

    const submittedOptions = vi.mocked(generateImageToVideo).mock.calls[0]?.[2];
    expect(generateImageToVideo).toHaveBeenCalledTimes(1);
    expect(submittedOptions).toMatchObject({
      modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      referenceImages: [image1.element],
      referenceAudios: [],
    });
    expect(uploadVideoToFal).not.toHaveBeenCalled();
    expect(submittedOptions).not.toHaveProperty('sourceAudioUrl');
  });

  it('does not merge selected media into references for Grok video runs', async () => {
    const fal = createFalStub();
    fal.falVideoModelId = GROK_IMAGINE_VIDEO_MODEL_ID;
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
    expect(generateImageToVideo).toHaveBeenCalledWith('Animate this still frame', image1.element, expect.objectContaining({ modelId: GROK_IMAGINE_VIDEO_MODEL_ID }));
    expect(submittedOptions).not.toHaveProperty('referenceImages');
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

  it.each([
    {
      modelId: 'fal-ai/one-to-all-animation/14b',
      provider: 'fal' as const,
      error: '1-to-All Animate is no longer available and cannot be regenerated. Select a supported video model and create a new generation instead.',
    },
    {
      modelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
      provider: 'jimeng' as const,
      error: 'Jimeng Multi-frame is unavailable in the UI. Select a supported video model and create a new generation instead.',
    },
  ])('blocks unavailable $modelId reruns without falling back to another model', async ({ modelId, provider, error }) => {
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
        prompt: 'legacy video rerun',
        provider,
        modelId,
        modelMode: 'video',
      });
    });

    expect(setError).toHaveBeenCalledWith(error);
    expect(generateImageToVideo).not.toHaveBeenCalled();
    expect(generateSeedanceVideo).not.toHaveBeenCalled();
    expect(generateJimengSeedanceVideo).not.toHaveBeenCalled();
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

  it.each([{ modelId: GPT_IMAGE_2_EDIT_MODEL_ID, limit: 8 }, { modelId: GPT_IMAGE_25_MODEL_ID, limit: 14 }, { modelId: IDEOGRAM_45_MODEL_ID, limit: 3 }])('caps $modelId annotate references at $limit', async ({ modelId, limit }) => {
    const primary = buildCanvasMedia('primary', 'image') as CanvasImage & { element: HTMLImageElement };
    const references = Array.from({ length: limit + 1 }, (_, index) => buildCanvasMedia(`ref-${index + 1}`, 'image'));
    const fal = createFalStub();
    fal.falModelMode = 'image';
    fal.falImageModelId = modelId;
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
        modelId,
        modelMode: 'image',
        primaryImageId: primary.id,
        referenceImageIds: references.map(image => image.id),
      });
      await Promise.resolve();
    });

    expect(vi.mocked(generateFalImageEdit).mock.calls[0]?.[0]?.referenceImages).toHaveLength(limit);
  });


  it.each((['2', '2.5'] as const).flatMap(model =>
    (['text_to_image', 'image_edit'] as const).flatMap(kind =>
      (['live', 'saved', 'missing', 'malformed', 'undefined'] as const).map(settings => ({ model, kind, settings })),
    ),
  ))('replays GPT Image $model $kind with $settings settings instead of unrelated live values', async ({ model, kind, settings }) => {
    const primary = buildCanvasMedia('gpt25-primary', 'image') as CanvasImage & { element: HTMLImageElement };
    const fal = createFalStub();
    fal.falModelMode = 'image';
    const modelId = model === '2' ? GPT_IMAGE_2_EDIT_MODEL_ID : GPT_IMAGE_25_MODEL_ID;
    fal.falImageModelId = modelId;
    fal.gptImage2Quality = 'low';
    fal.gptImage25Variant = settings === 'saved' ? 'sunburst' : 'flare';
    fal.gptImage25Background = settings === 'saved' ? 'auto' : 'opaque';
    fal.gptImage25Quality = settings === 'saved' ? 'high' : 'max';
    fal.falImageSizeSelection = '2688x1152';
    fal.falNumImages = 3;
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateFalImage).mockImplementation(() => new Promise(() => {}));
    vi.mocked(generateFalImageEdit).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS', tool: Tool.SELECTION, prompt: 'Replay image', promptPrefix: '', apiProvider: 'fal', fal,
      selection: createSelectionStub(kind === 'image_edit' && settings === 'live' ? {
        primaryImageId: primary.id, primaryImage: primary, activePrimaryImage: primary,
        selectedImageIds: [primary.id], primarySelectionMediaType: 'image',
      } : {}), images: [primary], paths: [], videoNegativePrompt: '',
      setError: vi.fn(), setIsLoading: vi.fn(), setFalJobs, setState: vi.fn(), setToastMessage: vi.fn(), setTool: vi.fn(),
    }));
    const commonOptions = settings === 'live'
      ? { imageSizeSelection: '2688x1152' as const, numImages: 3 }
      : settings === 'saved' ? { imageSizeSelection: '2048x2048' as const, numImages: 4 }
        : { imageSizeSelection: 'auto' as const, numImages: 1 };
    const expectedOptions: GenerationFalOptions = {
      ...commonOptions,
      ...(model === '2'
        ? { gptImage2Quality: settings === 'live' ? 'low' : settings === 'saved' ? 'high' : 'medium' }
        : settings === 'live' ? { gptImage25Variant: 'flare', gptImage25Background: 'opaque', gptImage25Quality: 'max' }
          : settings === 'saved' ? { gptImage25Variant: 'flare', gptImage25Background: 'transparent', gptImage25Quality: 'max' }
            : { gptImage25Variant: 'sunburst', gptImage25Background: 'auto', gptImage25Quality: 'high' }),
    };
    const falOptions = settings === 'saved' ? expectedOptions : settings === 'malformed'
      ? { gptImage2Quality: 'bad', gptImage25Variant: 'bad', gptImage25Background: 'bad', gptImage25Quality: 'bad', imageSizeSelection: 'bad', numImages: NaN } as unknown as GenerationFalOptions
      : settings === 'undefined'
        ? { gptImage2Quality: undefined, gptImage25Variant: undefined, gptImage25Background: undefined, gptImage25Quality: undefined, imageSizeSelection: undefined, numImages: undefined }
        : undefined;
    await act(async () => {
      void result.current.handleGenerate(settings === 'live' ? undefined : { kind, prompt: 'Replay image', provider: 'fal', modelId, modelMode: 'image', primaryImageId: kind === 'image_edit' ? primary.id : undefined, falOptions });
      await Promise.resolve();
    });
    const request = kind === 'text_to_image' ? vi.mocked(generateFalImage).mock.calls[0]?.[1] : vi.mocked(generateFalImageEdit).mock.calls[0]?.[1];
    const resolved = model === '2' ? request?.gptImage2RunSettings : request?.gptImage25RunSettings;
    expect(resolved).toMatchObject({ kind, imageSizeSelection: expectedOptions.imageSizeSelection, numImages: expectedOptions.numImages });
    const serialized = model === '2'
      ? serializeGptImage2GenerationOptions(request!.gptImage2RunSettings!)
      : serializeGptImage25GenerationOptions(request!.gptImage25RunSettings!);
    expect(serialized).toEqual(expectedOptions);
    expect(request).toMatchObject({ modelId: kind === 'text_to_image' ? resolved!.endpoint : modelId });
    expect(request).not.toHaveProperty('gptImage2Quality');
    expect(request).not.toHaveProperty('gptImage25Quality');
    expect(request).not.toHaveProperty('numImages');
    expect(queuedJobs[0]?.retryInputs?.falOptions).toMatchObject(expectedOptions);
  });
  it.each((['text_to_image', 'image_edit'] as const).flatMap(kind =>
    (['live', 'saved', 'missing', 'malformed', 'undefined'] as const).map(settings => ({ kind, settings })),
  ))('replays Ideogram 4.5 $kind with $settings settings instead of live picker values', async ({ kind, settings }) => {
    const primary = buildCanvasMedia('ideogram-primary', 'image') as CanvasImage & { element: HTMLImageElement };
    const reference = buildCanvasMedia('ideogram-reference', 'image') as CanvasImage & { element: HTMLImageElement };
    const fal = createFalStub();
    fal.falModelMode = 'image';
    fal.falImageModelId = IDEOGRAM_45_MODEL_ID;
    fal.ideogram45Quality = 'low';
    fal.ideogram45EditPrecision = 'regular';
    fal.falImageSizeSelection = '2560x1440';
    fal.falNumImages = 3;
    let queuedJobs: FalQueueJob[] = [];
    const setFalJobs = vi.fn((value: FalQueueJob[] | ((prev: FalQueueJob[]) => FalQueueJob[])) => {
      queuedJobs = typeof value === 'function' ? value(queuedJobs) : value;
    });
    vi.mocked(generateFalImage).mockImplementation(() => new Promise(() => {}));
    vi.mocked(generateFalImageEdit).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useGeneration({
      appMode: 'CANVAS', tool: Tool.SELECTION, prompt: 'Replay image', promptPrefix: '', apiProvider: 'fal', fal,
      selection: createSelectionStub(settings === 'live' && kind === 'image_edit' ? {
        primaryImageId: primary.id, primaryImage: primary, referenceImageIds: [reference.id],
      } : {}), images: [primary, reference], paths: [], videoNegativePrompt: '',
      setError: vi.fn(), setIsLoading: vi.fn(), setFalJobs, setState: vi.fn(), setToastMessage: vi.fn(), setTool: vi.fn(),
    }));
    const expectedOptions = settings === 'live'
      ? { ideogram45Quality: 'low' as const, ideogram45EditPrecision: 'regular' as const, imageSizeSelection: '2560x1440' as const, numImages: 3 }
      : settings === 'saved'
      ? { ideogram45Quality: 'high' as const, ideogram45EditPrecision: 'high' as const, imageSizeSelection: 'auto' as const, numImages: 8 }
      : { ideogram45Quality: 'medium' as const, ideogram45EditPrecision: 'regular' as const, imageSizeSelection: 'auto' as const, numImages: 1 };
    const falOptions = settings === 'saved' ? expectedOptions : settings === 'malformed'
      ? { ideogram45Quality: 'bad', ideogram45EditPrecision: 'bad', imageSizeSelection: 'auto_2K', numImages: NaN } as unknown as typeof expectedOptions
      : settings === 'undefined'
        ? { ideogram45Quality: undefined, ideogram45EditPrecision: undefined, imageSizeSelection: undefined, numImages: undefined }
        : undefined;
    await act(async () => {
      void result.current.handleGenerate(settings === 'live' ? undefined : {
        kind, prompt: 'Replay image', provider: 'fal', modelId: IDEOGRAM_45_MODEL_ID, modelMode: 'image',
        primaryImageId: kind === 'image_edit' ? primary.id : undefined,
        referenceImageIds: kind === 'image_edit' ? [reference.id] : [], falOptions,
      });
      await Promise.resolve();
    });
    const request = kind === 'text_to_image' ? vi.mocked(generateFalImage).mock.calls[0]?.[1] : vi.mocked(generateFalImageEdit).mock.calls[0]?.[1];
    expect(request).toMatchObject({
      modelId: IDEOGRAM_45_MODEL_ID,
      ideogram45RunSettings: {
        kind, imageSizeSelection: expectedOptions.imageSizeSelection,
        numImages: expectedOptions.numImages, quality: expectedOptions.ideogram45Quality,
        editPrecision: expectedOptions.ideogram45EditPrecision,
      },
    });
    const resolved = request?.ideogram45RunSettings;
    expect(resolved).toBeDefined();
    expect(queuedJobs[0]?.retryInputs?.falOptions).toMatchObject(serializeIdeogram45GenerationOptions(resolved!));
    expect(request).not.toHaveProperty('ideogram45Quality');
    expect(request).not.toHaveProperty('ideogram45EditPrecision');
    expect(request).not.toHaveProperty('imageSize');
    if (kind === 'image_edit') expect(vi.mocked(generateFalImageEdit).mock.calls[0]?.[0].referenceImages).toHaveLength(1);
    expect(queuedJobs[0]?.retryInputs?.falOptions).toMatchObject(expectedOptions);
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
