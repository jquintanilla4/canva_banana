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
  MINIMAX_H3_IMAGE_TO_VIDEO_MODEL_ID,
  MINIMAX_H3_REFERENCE_TO_VIDEO_MODEL_ID,
  MINIMAX_H3_TEXT_TO_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let the Fal upload helper rasterize the image.
};

describe('falService (MiniMax H3)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/h3-output.mp4' } },
      requestId: 'req-h3',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('exposes one MiniMax H3 family entry', () => {
    const options = FAL_VIDEO_MODEL_OPTIONS.filter(model => model.label === 'MiniMax H3');

    expect(options).toEqual([{ value: MINIMAX_H3_VIDEO_MODEL_ID, label: 'MiniMax H3' }]);
    expect(isFalModelId(MINIMAX_H3_VIDEO_MODEL_ID)).toBe(true);
  });

  it('routes Standard text generation to text-to-video with numeric duration', async () => {
    await generateImageToVideo('A wide cinematic landscape', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'standard',
      miniMaxH3AspectRatio: '21:9',
      miniMaxH3Duration: '15',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(MINIMAX_H3_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'A wide cinematic landscape',
        duration: 15,
        resolution: '2K',
        aspect_ratio: '21:9',
      },
    }));
  });

  it('routes an image call without options through H3 Standard', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/default-start.png');

    await generateImageToVideo('Animate the default image', createTestImage());

    expect(fal.subscribe).toHaveBeenCalledWith(MINIMAX_H3_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'Animate the default image',
        duration: 5,
        resolution: '2K',
        image_url: 'https://example.com/default-start.png',
      },
    }));
  });

  it('routes Standard image generation with an optional end frame and no aspect ratio', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('Move between the frames', createTestImage(), {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'standard',
      miniMaxH3AspectRatio: '9:16',
      miniMaxH3Duration: '8',
      tailImage: createTestImage(),
    });

    const input = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;
    expect(fal.subscribe).toHaveBeenCalledWith(MINIMAX_H3_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Move between the frames',
        duration: 8,
        resolution: '2K',
        image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
      }),
    }));
    expect(input).not.toHaveProperty('aspect_ratio');
  });

  it('routes Reference generation with documented field names and ordered prompt labels', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/image.png')
      .mockResolvedValueOnce('https://example.com/video.mp4')
      .mockResolvedValueOnce('https://example.com/audio.wav');

    await generateImageToVideo('@Image1 follows @Video1 while @Audio1 plays', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'reference',
      miniMaxH3AspectRatio: 'adaptive',
      miniMaxH3Duration: '5',
      referenceImages: [createTestImage()],
      referenceVideos: [new File(['video'], 'reference.mp4', { type: 'video/mp4' })],
      referenceAudios: [new File(['audio'], 'reference.wav', { type: 'audio/wav' })],
    });

    expect(fal.subscribe).toHaveBeenCalledWith(MINIMAX_H3_REFERENCE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'Image 1 follows Video 1 while Audio 1 plays',
        duration: 5,
        resolution: '2K',
        aspect_ratio: 'adaptive',
        reference_image_urls: ['https://example.com/image.png'],
        reference_video_urls: ['https://example.com/video.mp4'],
        reference_audio_urls: ['https://example.com/audio.wav'],
      },
    }));
  });

  it('rejects empty and audio-only Reference requests', async () => {
    await expect(generateImageToVideo('Reference prompt', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'reference',
    })).rejects.toThrow('requires at least one reference asset');

    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/audio.wav');
    await expect(generateImageToVideo('Reference prompt', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'reference',
      referenceAudios: [new File(['audio'], 'reference.wav', { type: 'audio/wav' })],
    })).rejects.toThrow('require at least one image or video reference');
  });

  it('rejects empty prompts and reference-file limit violations before uploading', async () => {
    await expect(generateImageToVideo('   ', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'standard',
    })).rejects.toThrow('requires a prompt');

    await expect(generateImageToVideo('Reference prompt', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'reference',
      referenceImages: Array.from({ length: 10 }, createTestImage),
    })).rejects.toThrow('up to 9 images');

    await expect(generateImageToVideo('Reference prompt', null, {
      modelId: MINIMAX_H3_VIDEO_MODEL_ID,
      miniMaxH3Variant: 'reference',
      referenceImages: Array.from({ length: 9 }, createTestImage),
      referenceVideos: Array.from(
        { length: 3 },
        (_, index) => new File(['video'], `reference-${index}.mp4`, { type: 'video/mp4' }),
      ),
      referenceAudios: [new File(['audio'], 'reference.wav', { type: 'audio/wav' })],
    })).rejects.toThrow('12 files total');

    expect(fal.storage.upload).not.toHaveBeenCalled();
  });
});
