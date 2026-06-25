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
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  isFalModelId,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let uploadImageElementToFal rasterize in tests.
};

describe('falService (Kling O3)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test';
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/kling-o3.mp4' } },
      requestId: 'req-kling-o3',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('exposes Kling O3 Video in the video model selector', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === KLING_O3_VIDEO_MODEL_ID);

    expect(option?.label).toBe('Kling O3 Video');
    expect(isFalModelId(KLING_O3_VIDEO_MODEL_ID)).toBe(true);
  });

  it('sends reference mode payload to the O3 reference endpoint with end frame controls', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/ref.png')
      .mockResolvedValueOnce('https://example.com/element.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('O3 reference', createTestImage(), {
      modelId: KLING_O3_VIDEO_MODEL_ID,
      referenceImages: [createTestImage()],
      elementImages: [createTestImage()],
      tailImage: createTestImage(),
      klingO3Variant: 'reference',
      klingO3Duration: '12',
      klingO3GenerateAudio: true,
      aspectRatio: '9:16',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_O3_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'O3 reference',
        start_image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
        image_urls: ['https://example.com/ref.png'],
        elements: [{
          frontal_image_url: 'https://example.com/element.png',
          reference_image_urls: ['https://example.com/element.png'],
        }],
        duration: '12',
        generate_audio: true,
        aspect_ratio: '9:16',
      },
    }));
  });

  it('preserves direct O3 duration options in reference mode', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/start.png');

    await generateImageToVideo('O3 direct duration', createTestImage(), {
      modelId: KLING_O3_VIDEO_MODEL_ID,
      klingO3Variant: 'reference',
      duration: '12',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_O3_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        duration: '12',
      }),
    }));
  });

  it('sends edit mode payload to the O3 edit endpoint without duration or aspect ratio', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/ref.png')
      .mockResolvedValueOnce('https://example.com/element.png');

    await generateImageToVideo('Edit this video', null, {
      modelId: KLING_O3_VIDEO_EDIT_MODEL_ID,
      sourceVideoUrl: 'https://example.com/source.mp4',
      referenceImages: [createTestImage()],
      elementImages: [createTestImage()],
      klingO3Variant: 'edit',
      klingO3KeepAudio: false,
      klingO3Duration: '15',
      aspectRatio: '1:1',
    });

    const input = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_O3_VIDEO_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Edit this video',
        video_url: 'https://example.com/source.mp4',
        image_urls: ['https://example.com/ref.png'],
        keep_audio: false,
      }),
    }));
    expect(input).not.toHaveProperty('duration');
    expect(input).not.toHaveProperty('aspect_ratio');
  });

  it('infers edit mode from the O3 edit endpoint', async () => {
    await generateImageToVideo('Edit this video', null, {
      modelId: KLING_O3_VIDEO_EDIT_MODEL_ID,
      sourceVideoUrl: 'https://example.com/source.mp4',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_O3_VIDEO_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Edit this video',
        video_url: 'https://example.com/source.mp4',
      }),
    }));
  });

});
