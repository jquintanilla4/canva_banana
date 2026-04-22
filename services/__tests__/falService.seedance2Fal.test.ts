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
  FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_REFERENCE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_VIDEO_MODEL_OPTIONS,
  isFalModelId,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let uploadImageElementToFal rasterize in tests.
};

describe('falService (Seedance 2 FAL)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Legacy env value; the browser SDK now uses the Node proxy.
    vi.clearAllMocks(); // Keep call assertions isolated per test.
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        video: { url: 'https://example.com/seedance-2-output.mp4' },
        seed: 42,
      },
      requestId: 'req-seedance-2-fal',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('exposes Seedance 2 (FAL) in the video model selector', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === FAL_SEEDANCE_2_VIDEO_MODEL_ID);

    expect(option?.label).toBe('Seedance 2 (FAL)');
    expect(isFalModelId(FAL_SEEDANCE_2_VIDEO_MODEL_ID)).toBe(true);
  });

  it('routes Smart text-to-video requests to the Fal text endpoint', async () => {
    const result = await generateImageToVideo('fal seedance t2v', null, {
      modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'smart',
      seedance2AspectRatio: 'adaptive',
      seedance2Resolution: '1080p',
      seedance2Duration: '15',
      seedance2GenerateAudio: true,
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'fal seedance t2v',
        aspect_ratio: 'auto',
        resolution: '1080p',
        duration: '15',
        generate_audio: true,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('image_url');
    expect(subscribeInput).not.toHaveProperty('camera_fixed');
    expect(result.videoUrl).toBe('https://example.com/seedance-2-output.mp4');
  });

  it('routes Smart image-to-video requests with optional end frame', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('fal seedance i2v', createTestImage(), {
      modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'smart',
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '720p',
      seedance2Duration: '5',
      seedance2GenerateAudio: false,
      tailImage: createTestImage(),
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'fal seedance i2v',
        image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
        aspect_ratio: '16:9',
        resolution: '720p',
        duration: '5',
        generate_audio: false,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('camera_fixed');
  });

  it('routes Reference requests with image, video, and audio reference urls', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/ref-image.png')
      .mockResolvedValueOnce('https://example.com/ref-video.mp4')
      .mockResolvedValueOnce('https://example.com/ref-audio.wav');

    await generateImageToVideo('fal seedance reference @Image1 @Video1 @Audio1', null, {
      modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'reference',
      seedance2AspectRatio: '9:16',
      seedance2Resolution: '480p',
      seedance2Duration: '4',
      seedance2GenerateAudio: true,
      referenceImages: [createTestImage()],
      referenceVideos: [new File(['video'], 'reference.mp4', { type: 'video/mp4' })],
      referenceAudios: [new File(['audio'], 'reference.wav', { type: 'audio/wav' })],
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(FAL_SEEDANCE_2_REFERENCE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'fal seedance reference @Image1 @Video1 @Audio1',
        image_urls: ['https://example.com/ref-image.png'],
        video_urls: ['https://example.com/ref-video.mp4'],
        audio_urls: ['https://example.com/ref-audio.wav'],
        aspect_ratio: '9:16',
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('camera_fixed');
  });
});
