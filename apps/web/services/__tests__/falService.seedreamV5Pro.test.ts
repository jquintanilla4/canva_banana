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
import {
  FAL_IMAGE_MODEL_OPTIONS,
  SEEDREAM_V5_PRO_MODEL_ID,
  SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID,
  isFalModelId,
} from '../modelConfig';
import { generateImage, generateImageEdit } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image;
};

describe('falService (Seedream 5 Pro)', () => {
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

  it('exposes Seedream 5 Pro in the image model selector', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === SEEDREAM_V5_PRO_MODEL_ID);

    expect(option?.label).toBe('Seedream 5 Pro');
    expect(isFalModelId(SEEDREAM_V5_PRO_MODEL_ID)).toBe(true);
    expect(SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID).toBe('bytedance/seedream/v5/pro/text-to-image');
  });

  it('routes text-to-image requests to the Seedream 5 Pro text endpoint', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,Zm9v', content_type: 'image/png' }],
      },
      requestId: 'req-seedream-v5-pro-t2i',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('seedream pro t2i prompt', {
      modelId: SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID,
      imageSize: 'landscape_16_9',
      numImages: 9,
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'seedream pro t2i prompt',
        image_size: 'landscape_16_9',
        num_images: 6,
        output_format: 'png',
        sync_mode: false,
        enable_safety_checker: false,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('seed');
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imagesBase64).toEqual(['Zm9v']);
  });

  it('routes edit requests to the Seedream 5 Pro edit endpoint with references', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/base.png')
      .mockResolvedValueOnce('https://example.com/ref-1.png')
      .mockResolvedValueOnce('https://example.com/ref-2.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,YmFy', content_type: 'image/png' }],
      },
      requestId: 'req-seedream-v5-pro-edit',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImageEdit({
      prompt: 'seedream pro edit prompt',
      image: createTestImage(),
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
      referenceImages: [createTestImage(), createTestImage()],
    }, {
      modelId: SEEDREAM_V5_PRO_MODEL_ID,
      imageSize: 'auto_2K',
      numImages: 8,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(SEEDREAM_V5_PRO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'seedream pro edit prompt',
        image_urls: ['https://example.com/base.png', 'https://example.com/ref-1.png', 'https://example.com/ref-2.png'],
        image_size: 'auto_2K',
        num_images: 6,
        output_format: 'png',
        sync_mode: false,
        enable_safety_checker: false,
      }),
    }));
    expect(result.imageBase64).toBe('YmFy');
    expect(result.imagesBase64).toEqual(['YmFy']);
  });

  it('rejects Seedream 5 Pro edits above the 10-image input limit', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/upload.png');

    await expect(generateImageEdit({
      prompt: 'too many seedream pro references',
      image: createTestImage(),
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
      referenceImages: Array.from({ length: 10 }, createTestImage),
    }, {
      modelId: SEEDREAM_V5_PRO_MODEL_ID,
    })).rejects.toThrow('Seedream 5 Pro supports up to 10 total input images');
  });
});
