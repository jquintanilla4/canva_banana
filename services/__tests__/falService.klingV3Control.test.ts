import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import { KLING_V3_CONTROL_VIDEO_MODEL_ID } from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let the upload helper rasterize the input.
};

describe('falService (Kling v3 Control)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test';
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/character.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/kling-v3-control.mp4' } },
      requestId: 'req-kling-v3-control',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('sends Kling v3 Control payload to the v3 motion-control endpoint', async () => {
    await generateImageToVideo('A dancer steps forward', createTestImage(), {
      modelId: KLING_V3_CONTROL_VIDEO_MODEL_ID,
      sourceVideoUrl: 'https://example.com/driver.mp4',
      keepOriginalSound: false,
      characterOrientation: 'image',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_V3_CONTROL_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        image_url: 'https://example.com/character.png',
        video_url: 'https://example.com/driver.mp4',
        character_orientation: 'image',
        prompt: 'A dancer steps forward',
        keep_original_sound: false,
      },
    }));
  });

  it('omits prompt when Kling v3 Control prompt is blank', async () => {
    await generateImageToVideo('   ', createTestImage(), {
      modelId: KLING_V3_CONTROL_VIDEO_MODEL_ID,
      sourceVideoUrl: 'https://example.com/driver.mp4',
      keepOriginalSound: true,
      characterOrientation: 'video',
    });
    const input = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(input).toEqual({
      image_url: 'https://example.com/character.png',
      video_url: 'https://example.com/driver.mp4',
      character_orientation: 'video',
      keep_original_sound: true,
    });
    expect(input).not.toHaveProperty('elements');
  });
});
