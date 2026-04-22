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
  isFalModelId,
  normalizeFalModelId,
  WAN_27_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_TEXT_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let Fal upload rasterize in tests.
};

describe('falService (Wan 2.7 Video)', () => {
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
        video: { url: 'https://example.com/wan-27-output.mp4' },
        seed: 42,
      },
      requestId: 'req-wan-27-video',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('exposes Wan 2.7 Video and normalizes legacy Wan 2.6 video ids', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === WAN_27_VIDEO_MODEL_ID);

    expect(option?.label).toBe('Wan 2.7');
    expect(isFalModelId(WAN_27_VIDEO_MODEL_ID)).toBe(true);
    expect(normalizeFalModelId('wan/v2.6/image-to-video')).toBe(WAN_27_VIDEO_MODEL_ID);
    expect(normalizeFalModelId(WAN_27_TEXT_TO_VIDEO_MODEL_ID)).toBe(WAN_27_VIDEO_MODEL_ID);
    expect(normalizeFalModelId(WAN_27_IMAGE_TO_VIDEO_MODEL_ID)).toBe(WAN_27_VIDEO_MODEL_ID);
  });

  it('routes no-image smart requests to the Wan 2.7 text-to-video endpoint', async () => {
    const result = await generateImageToVideo('wan t2v prompt', null, {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoAspectRatio: '9:16',
      wan27VideoResolution: '720p',
      wan27VideoDuration: '15',
      wan27VideoPromptExpansion: false,
      negativePrompt: 'no blur',
      seed: 123,
    });
    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan t2v prompt',
        aspect_ratio: '9:16',
        resolution: '720p',
        duration: 15,
        enable_prompt_expansion: false,
        enable_safety_checker: false,
        negative_prompt: 'no blur',
        seed: 123,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('image_url');
    expect(subscribeInput).not.toHaveProperty('multi_shots');
    expect(result.videoUrl).toBe('https://example.com/wan-27-output.mp4');
  });

  it('sends audio for text-to-video requests', async () => {
    await generateImageToVideo('wan t2v audio prompt', null, {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoAspectRatio: '16:9',
      wan27VideoResolution: '1080p',
      wan27VideoDuration: '5',
      wan27VideoPromptExpansion: true,
      sourceAudioUrl: 'https://example.com/audio.wav',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan t2v audio prompt',
        aspect_ratio: '16:9',
        audio_url: 'https://example.com/audio.wav',
      }),
    }));
  });

  it('routes selected-image smart requests to the Wan 2.7 image-to-video endpoint with an end frame', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('wan i2v prompt', createTestImage(), {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoAspectRatio: '4:3',
      wan27VideoResolution: '1080p',
      wan27VideoDuration: '2',
      wan27VideoPromptExpansion: true,
      negativePrompt: 'no artifacts',
      tailImage: createTestImage(),
    });
    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan i2v prompt',
        image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
        resolution: '1080p',
        duration: 2,
        enable_prompt_expansion: true,
        enable_safety_checker: false,
        negative_prompt: 'no artifacts',
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('aspect_ratio');
    expect(subscribeInput).not.toHaveProperty('multi_shots');
  });

  it('allows image-to-video with an empty prompt', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/start.png');

    await generateImageToVideo('', createTestImage(), {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoResolution: '720p',
      wan27VideoDuration: '5',
      wan27VideoAspectRatio: '16:9',
      wan27VideoPromptExpansion: true,
    });
    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        image_url: 'https://example.com/start.png',
        resolution: '720p',
        duration: 5,
        enable_prompt_expansion: true,
        enable_safety_checker: false,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('prompt');
    expect(subscribeInput).not.toHaveProperty('aspect_ratio');
    expect(subscribeInput).not.toHaveProperty('multi_shots');
  });

  it('sends audio for first-frame-only image-to-video requests', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/start.png');

    await generateImageToVideo('wan audio prompt', createTestImage(), {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoResolution: '1080p',
      wan27VideoDuration: '5',
      wan27VideoAspectRatio: '16:9',
      wan27VideoPromptExpansion: true,
      sourceAudioUrl: 'https://example.com/audio.wav',
    });
    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan audio prompt',
        image_url: 'https://example.com/start.png',
        audio_url: 'https://example.com/audio.wav',
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('end_image_url');
    expect(subscribeInput).not.toHaveProperty('aspect_ratio');
  });

  it('sends audio with an end frame for Wan 2.7 image-to-video', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('wan audio end frame prompt', createTestImage(), {
      modelId: WAN_27_VIDEO_MODEL_ID,
      sourceAudioUrl: 'https://example.com/audio.wav',
      tailImage: createTestImage(),
    });

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan audio end frame prompt',
        image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
        audio_url: 'https://example.com/audio.wav',
      }),
    }));
  });

  it('routes reference requests to the Wan 2.7 reference endpoint', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/reference.png')
      .mockResolvedValueOnce('https://example.com/reference.mp4');

    await generateImageToVideo('wan reference prompt', null, {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoVariant: 'reference',
      wan27VideoAspectRatio: '3:4',
      wan27VideoResolution: '720p',
      wan27VideoDuration: '10',
      negativePrompt: 'no blur',
      referenceImages: [createTestImage()],
      referenceVideos: [new File(['video'], 'reference.mp4', { type: 'video/mp4' })],
    });

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_REFERENCE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan reference prompt',
        aspect_ratio: '3:4',
        resolution: '720p',
        duration: 10,
        negative_prompt: 'no blur',
        enable_safety_checker: false,
        reference_image_urls: ['https://example.com/reference.png'],
        reference_video_urls: ['https://example.com/reference.mp4'],
      }),
    }));
  });

  it('requires reference assets for Wan 2.7 reference requests', async () => {
    await expect(generateImageToVideo('wan reference prompt', null, {
      modelId: WAN_27_VIDEO_MODEL_ID,
      wan27VideoVariant: 'reference',
    })).rejects.toThrow('Wan 2.7 Reference requires at least one reference image or video.');

    expect(fal.subscribe).not.toHaveBeenCalled();
  });
});
