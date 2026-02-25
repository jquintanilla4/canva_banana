import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import { Tool } from '../../types';
import { SEEDREAM_V5_LITE_MODEL_ID, SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID } from '../modelConfig';
import { generateImage, generateImageEdit } from '../falService';

describe('falService (seedream 5 lite)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Required by ensureFalClientConfigured().
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

  it('routes text-to-image requests to the Seedream 5 Lite text endpoint', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,Zm9v' }],
        seed: 42,
      },
      requestId: 'req-t2i',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('seedream t2i prompt', {
      modelId: SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID,
      numImages: 6,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'seedream t2i prompt',
        num_images: 6,
      }),
    }));
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imagesBase64).toEqual(['Zm9v']);
  });

  it('routes edit requests to the Seedream 5 Lite edit endpoint and clamps num_images to 6', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/upload.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,YmFy' }],
        seed: 123,
      },
      requestId: 'req-edit',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const image = document.createElement('img');
    image.width = 512;
    image.height = 512;

    const result = await generateImageEdit({
      prompt: 'seedream edit prompt',
      image,
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
    }, {
      modelId: SEEDREAM_V5_LITE_MODEL_ID,
      numImages: 10,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(SEEDREAM_V5_LITE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'seedream edit prompt',
        num_images: 6,
      }),
    }));
    expect(result.imageBase64).toBe('YmFy');
    expect(result.imagesBase64).toEqual(['YmFy']);
  });
});
