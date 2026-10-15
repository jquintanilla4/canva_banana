import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import { KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID } from '../modelConfig';
import { generateImage } from '../falService';

describe('falService (Krea 2 Large)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Browser SDK routes through the local proxy.
    vi.clearAllMocks(); // Keep call assertions isolated per test.
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('sends the default Krea text-to-image payload shape', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }], seed: 12345 },
      requestId: 'req-krea-2',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('krea prompt', {
      modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      numImages: 4,
    });
    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'krea prompt',
        aspect_ratio: '16:9',
        creativity: 'medium',
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('sync_mode');
    expect(subscribeInput).not.toHaveProperty('output_format');
    expect(subscribeInput).not.toHaveProperty('num_images');
    expect(result.imageBase64).toBe('Zm9v');
  });

  it('uploads up to 10 style references with clamped strengths', async () => {
    vi.mocked(fal.storage.upload).mockImplementation(async () => `https://example.com/ref-${vi.mocked(fal.storage.upload).mock.calls.length}.png`);
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy' }], seed: 67890 },
      requestId: 'req-krea-refs',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
    const references = Array.from({ length: 11 }, (_, index) => ({
      image: document.createElement('img'),
      strength: index === 0 ? -3 : index === 1 ? 2.8 : 0.14,
    }));

    await generateImage('style refs', {
      modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      aspectRatio: '2.35:1',
      krea2Creativity: 'high',
      imageStyleReferences: references,
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as {
      image_style_references?: Array<{ image_url: string; strength: number }>;
    };

    expect(fal.storage.upload).toHaveBeenCalledTimes(10);
    expect(subscribeInput.image_style_references).toHaveLength(10);
    expect(subscribeInput.image_style_references?.[0]).toEqual({ image_url: 'https://example.com/ref-1.png', strength: -2 });
    expect(subscribeInput.image_style_references?.[1]).toEqual({ image_url: 'https://example.com/ref-2.png', strength: 2 });
    expect(subscribeInput.image_style_references?.[2]).toEqual({ image_url: 'https://example.com/ref-3.png', strength: 0.1 });
  });
});
