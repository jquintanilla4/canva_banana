import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import { RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID } from '../modelConfig';
import { generateImage } from '../falService';

describe('falService (Recraft v4 Pro)', () => {
  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Required by ensureFalClientConfigured().
    vi.clearAllMocks(); // Keep call assertions isolated per test.
  });

  it('sends only the Recraft text-to-image payload shape', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/webp;base64,Zm9v' }],
      },
      requestId: 'req-recraft',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('recraft prompt', {
      modelId: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
      recraftImageSize: 'landscape_16_9',
      recraftBackgroundColor: { r: 12, g: 34, b: 56 },
      recraftColors: [
        { r: 1, g: 2, b: 3 },
        { r: 4, g: 5, b: 6 },
        { r: 7, g: 8, b: 9 },
        { r: 10, g: 11, b: 12 },
        { r: 13, g: 14, b: 15 },
        { r: 16, g: 17, b: 18 },
      ],
      aspectRatio: '16:9',
      numImages: 4,
      resolution: '2K',
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'recraft prompt',
        image_size: 'landscape_16_9',
        background_color: { r: 12, g: 34, b: 56 },
        colors: [
          { r: 1, g: 2, b: 3 },
          { r: 4, g: 5, b: 6 },
          { r: 7, g: 8, b: 9 },
          { r: 10, g: 11, b: 12 },
          { r: 13, g: 14, b: 15 },
        ],
        enable_safety_checker: true,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('sync_mode');
    expect(subscribeInput).not.toHaveProperty('output_format');
    expect(subscribeInput).not.toHaveProperty('num_images');
    expect(subscribeInput).not.toHaveProperty('aspect_ratio');
    expect(subscribeInput).not.toHaveProperty('resolution');
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imageDataUrls).toEqual(['data:image/webp;base64,Zm9v']);
  });
});
