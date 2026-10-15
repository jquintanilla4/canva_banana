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
  FLUX_3_EXTEND_VIDEO_MODEL_ID,
  FLUX_3_FIRST_LAST_FRAME_VIDEO_MODEL_ID,
  FLUX_3_IMAGE_TO_VIDEO_MODEL_ID,
  FLUX_3_KEYFRAMES_VIDEO_MODEL_ID,
  FLUX_3_TEXT_TO_VIDEO_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  isFalModelId,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image;
};

describe('falService (Flux 3)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/flux3.mp4' } },
      requestId: 'req-flux3',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('exposes one Flux 3 selector entry', () => {
    expect(FAL_VIDEO_MODEL_OPTIONS.filter(model => model.value === FLUX_3_VIDEO_MODEL_ID)).toEqual([
      { value: FLUX_3_VIDEO_MODEL_ID, label: 'Flux 3' },
    ]);
    expect(isFalModelId(FLUX_3_VIDEO_MODEL_ID)).toBe(true);
  });

  it('routes Smart text-to-video with the documented defaults and fixed safety tolerance', async () => {
    await generateImageToVideo('A cinematic landscape', null, { modelId: FLUX_3_VIDEO_MODEL_ID });

    expect(fal.subscribe).toHaveBeenCalledWith(FLUX_3_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'A cinematic landscape',
        aspect_ratio: 'auto',
        resolution: '720p',
        duration: 'auto',
        generate_audio: true,
        safety_tolerance: 4,
      },
    }));
  });

  it('routes Smart image-to-video and translates its canvas mention', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/start.png');

    await generateImageToVideo('Animate @Image1', createTestImage(), {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'smart',
      flux3AspectRatio: '9:16',
      flux3Resolution: '1080p',
      flux3Duration: '12',
      flux3GenerateAudio: false,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(FLUX_3_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'Animate the starting image',
        aspect_ratio: '9:16',
        resolution: '1080p',
        duration: 12,
        generate_audio: false,
        safety_tolerance: 4,
        image_url: 'https://example.com/start.png',
      },
    }));
  });

  it('routes ordered first and last frames with an explicit numeric duration', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/first.png')
      .mockResolvedValueOnce('https://example.com/last.png');

    await generateImageToVideo('@Image1 transitions into @Image2', createTestImage(), {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'first-last-frame',
      flux3Duration: 'auto',
      tailImage: createTestImage(),
    });

    expect(fal.subscribe).toHaveBeenCalledWith(FLUX_3_FIRST_LAST_FRAME_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'the first frame transitions into the last frame',
        duration: 5,
        start_image_url: 'https://example.com/first.png',
        end_image_url: 'https://example.com/last.png',
        safety_tolerance: 4,
      }),
    }));
  });

  it('routes ordered keyframes with 24 fps frame indexes', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/key-1.png')
      .mockResolvedValueOnce('https://example.com/key-2.png')
      .mockResolvedValueOnce('https://example.com/key-3.png');

    await generateImageToVideo('@Image1 then @Image2 then @Image3', null, {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'keyframes',
      flux3Duration: '10',
      referenceImages: [createTestImage(), createTestImage(), createTestImage()],
      flux3KeyframeTimestampsSeconds: [0, 2.5, 10],
    });

    expect(fal.subscribe).toHaveBeenCalledWith(FLUX_3_KEYFRAMES_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'keyframe 1 then keyframe 2 then keyframe 3',
        duration: 10,
        keyframes: [
          { image_url: 'https://example.com/key-1.png', frame_index: 0 },
          { image_url: 'https://example.com/key-2.png', frame_index: 60 },
          { image_url: 'https://example.com/key-3.png', frame_index: 240 },
        ],
        safety_tolerance: 4,
      }),
    }));
  });

  it('routes Extend to the source-video endpoint', async () => {
    await generateImageToVideo('Continue @Video1', null, {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'extend',
      sourceVideoUrl: 'https://example.com/source.mp4',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(FLUX_3_EXTEND_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Continue the source video',
        video_url: 'https://example.com/source.mp4',
        safety_tolerance: 4,
      }),
    }));
  });

  it('rejects invalid keyframe counts, duplicate frames, and out-of-range timing locally', async () => {
    await expect(generateImageToVideo('No frames', null, {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'keyframes',
      flux3Duration: '5',
    })).rejects.toThrow('requires 1-10 still images');

    await expect(generateImageToVideo('Duplicate frames', null, {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'keyframes',
      flux3Duration: '5',
      referenceImages: [createTestImage(), createTestImage()],
      flux3KeyframeTimestampsSeconds: [1, 1.01],
    })).rejects.toThrow('unique frames');

    await expect(generateImageToVideo('Out of range', null, {
      modelId: FLUX_3_VIDEO_MODEL_ID,
      flux3Variant: 'keyframes',
      flux3Duration: '5',
      referenceImages: [createTestImage()],
      flux3KeyframeTimestampsSeconds: [6],
    })).rejects.toThrow('between 0 and 5 seconds');

    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });
});
