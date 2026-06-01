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
  GPT_IMAGE_2_EDIT_MODEL_ID,
  GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID,
  isFalModelId,
} from '../modelConfig';
import { generateImage, generateImageEdit } from '../falService';

describe('falService (GPT Image 2)', () => {
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

  it('exposes GPT Image 2 in the image model selector', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === GPT_IMAGE_2_EDIT_MODEL_ID);

    expect(option?.label).toBe('GPT Image 2');
    expect(isFalModelId(GPT_IMAGE_2_EDIT_MODEL_ID)).toBe(true);
    expect(GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID).toBe('openai/gpt-image-2');
  });

  it('routes text-to-image requests to the GPT Image 2 text endpoint', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }] },
      requestId: 'req-gpt-image-2-t2i',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('gpt image 2 t2i prompt', {
      modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID,
      imageSize: 'landscape_16_9',
      gptImage2Quality: 'medium',
      numImages: 5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'gpt image 2 t2i prompt',
        image_size: 'landscape_16_9',
        quality: 'medium',
        num_images: 4,
        output_format: 'png',
        sync_mode: false,
      }),
    }));
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imagesBase64).toEqual(['Zm9v']);
  });

  it('routes edit requests to the GPT Image 2 edit endpoint with multiple references', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/base.png')
      .mockResolvedValueOnce('https://example.com/ref-1.png')
      .mockResolvedValueOnce('https://example.com/ref-2.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy' }] },
      requestId: 'req-gpt-image-2-edit',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const image = document.createElement('img');
    image.width = 512;
    image.height = 512;
    const refOne = document.createElement('img');
    const refTwo = document.createElement('img');

    const result = await generateImageEdit({
      prompt: 'gpt image 2 edit prompt',
      image,
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
      referenceImages: [refOne, refTwo],
    }, {
      modelId: GPT_IMAGE_2_EDIT_MODEL_ID,
      imageSize: 'auto',
      gptImage2Quality: 'medium',
      numImages: 5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(GPT_IMAGE_2_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'gpt image 2 edit prompt',
        image_urls: ['https://example.com/base.png', 'https://example.com/ref-1.png', 'https://example.com/ref-2.png'],
        image_size: 'auto',
        quality: 'medium',
        num_images: 4,
        output_format: 'png',
        sync_mode: false,
      }),
    }));
    expect(result.imageBase64).toBe('YmFy');
    expect(result.imagesBase64).toEqual(['YmFy']);
  });
});
