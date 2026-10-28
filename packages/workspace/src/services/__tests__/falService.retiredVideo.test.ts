import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import {
  FAL_VIDEO_MODEL_OPTIONS,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V3_TEXT_TO_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KLING_VIDEO_PRO_MODEL_ID,
  KLING_VIDEO_STANDARD_MODEL_ID,
  MINIMAX_H3_TEXT_TO_VIDEO_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  VEO_31_EXTEND_VIDEO_MODEL_ID,
  VEO_31_FFLF_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_TEXT_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MOVE_MODEL_ID,
  WAN_ANIMATE_REPLACE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  isFalModelId,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const retiredModelIds = [
  KLING_VIDEO_MODEL_ID,
  KLING_VIDEO_STANDARD_MODEL_ID,
  KLING_VIDEO_PRO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_V3_TEXT_TO_VIDEO_MODEL_ID,
  KLING_V3_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_27_TEXT_TO_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_ANIMATE_REPLACE_MODEL_ID,
  WAN_ANIMATE_MOVE_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  VEO_31_FFLF_VIDEO_MODEL_ID,
  VEO_31_EXTEND_VIDEO_MODEL_ID,
  'fal-ai/kling-video/v2.6/standard/motion-control',
  'fal-ai/kling-video/v2.6/pro/motion-control',
  'fal-ai/kling-video/o1/reference-to-video',
  'fal-ai/kling-video/o1/video-to-video/edit',
  'fal-ai/kling-video/o1/video-to-video/reference',
  'fal-ai/kling-video/o1/image-to-video',
  'fal-ai/sora-2/image-to-video/pro',
  'wan/v2.6/image-to-video',
] as const; // Include selectors, actual endpoints, and saved-generation aliases.
const retiredMessage = 'This video model is no longer supported. Select a supported video model and create a new generation.';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image;
};

describe('falService retired video models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['test'], { type: 'image/png' }));
    });
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/image.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/output.mp4' } },
      requestId: 'req-supported',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps saved Kling model ids recognizable without offering retired models in the picker', () => {
    const selectableIds = FAL_VIDEO_MODEL_OPTIONS.map(model => model.value);
    for (const modelId of retiredModelIds) {
      expect(selectableIds).not.toContain(modelId);
    }
    expect(isFalModelId(KLING_V3_VIDEO_MODEL_ID)).toBe(true);
    expect(isFalModelId(KLING_O3_VIDEO_MODEL_ID)).toBe(true);
  });

  it.each(retiredModelIds)('rejects %s before configuration, uploads, or requests', async modelId => {
    const image = createTestImage();
    const onPhaseUpdate = vi.fn();
    const onQueueUpdate = vi.fn();

    await expect(generateImageToVideo('Animate this scene', image, {
      modelId,
      tailImage: image,
      referenceImages: [image],
      elementImages: [image],
      referenceVideos: [new File(['video'], 'reference.mp4', { type: 'video/mp4' })],
      sourceVideoUrl: 'https://example.com/source.mp4',
      sourceAudioUrl: 'https://example.com/source.wav',
      onPhaseUpdate,
      onQueueUpdate,
    })).rejects.toThrow(retiredMessage);
    await expect(generateImageToVideo('', null, { modelId })).rejects.toThrow(retiredMessage);

    expect(fal.config).not.toHaveBeenCalled();
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
    expect(onPhaseUpdate).not.toHaveBeenCalled();
    expect(onQueueUpdate).not.toHaveBeenCalled();
  });

  it.each([true, false])('rejects unknown model ids instead of the old image-first fallback (image: %s)', async withImage => {
    await expect(generateImageToVideo('Animate this scene', withImage ? createTestImage() : null, {
      modelId: 'fal-ai/unknown-video-model',
    })).rejects.toThrow('Unsupported video model: fal-ai/unknown-video-model');

    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('still rejects the previously removed 1-to-All Animate before provider side effects', async () => {
    const modelId = 'fal-ai/one-to-all-animation/14b';
    expect(isFalModelId(modelId)).toBe(false);
    expect(FAL_VIDEO_MODEL_OPTIONS.map(model => model.value)).not.toContain(modelId);

    await expect(generateImageToVideo('Animate this scene', createTestImage(), {
      modelId,
      sourceVideoUrl: 'https://example.com/source.mp4',
    })).rejects.toThrow('1-to-All Animate is no longer supported.');

    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('keeps the implicit MiniMax H3 default usable', async () => {
    await expect(generateImageToVideo('A cinematic scene', null)).resolves.toEqual({
      videoUrl: 'https://example.com/output.mp4',
      requestId: 'req-supported',
    });
    expect(fal.subscribe).toHaveBeenCalledWith(MINIMAX_H3_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({ prompt: 'A cinematic scene', duration: 5 }),
    }));
  });

  it.each([
    INFINITALK_VIDEO_MODEL_ID,
    SYNC_LIPSYNC_MODEL_ID,
    HEYGEN_V3_LIPSYNC_MODEL_ID,
    WAN_VISION_ENHANCER_MODEL_ID,
  ])('continues submitting supported video processing model %s', async modelId => {
    await expect(generateImageToVideo('A cinematic scene', null, {
      modelId,
      sourceVideoUrl: 'https://example.com/source.mp4',
      sourceAudioUrl: 'https://example.com/source.wav',
    })).resolves.toEqual({ videoUrl: 'https://example.com/output.mp4', requestId: 'req-supported' });

    expect(fal.subscribe).toHaveBeenCalledWith(modelId, expect.objectContaining({
      input: expect.objectContaining({ video_url: 'https://example.com/source.mp4' }),
    }));
  });
});
