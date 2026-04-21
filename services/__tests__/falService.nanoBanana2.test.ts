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
  isFalModelId,
  NANO_BANANA_2_EDIT_MODEL_ID,
  NANO_BANANA_2_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig';
import { generateImage, generateImageEdit } from '../falService';

describe('falService (nano banana 2)', () => {
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

  it('exposes NanoBanana 2 in the image model selector', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === NANO_BANANA_2_EDIT_MODEL_ID);

    expect(option?.label).toBe('NanoBanana 2');
    expect(isFalModelId(NANO_BANANA_2_EDIT_MODEL_ID)).toBe(true);
  });

  it('routes text-to-image requests to the Nano Banana 2 text endpoint', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,Zm9v' }],
        description: 'generated',
      },
      requestId: 'req-nb2-t2i',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('nano banana 2 t2i prompt', {
      modelId: NANO_BANANA_2_TEXT_TO_IMAGE_MODEL_ID,
      aspectRatio: '16:9',
      resolution: '2K',
      numImages: 5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(NANO_BANANA_2_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'nano banana 2 t2i prompt',
        aspect_ratio: '16:9',
        resolution: '2K',
        num_images: 4,
        output_format: 'png',
        sync_mode: false,
      }),
    }));
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imagesBase64).toEqual(['Zm9v']);
  });

  it('routes edit requests to the Nano Banana 2 edit endpoint', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/upload.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,YmFy' }],
        description: 'edited',
      },
      requestId: 'req-nb2-edit',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const image = document.createElement('img');
    image.width = 512;
    image.height = 512;

    const result = await generateImageEdit({
      prompt: 'nano banana 2 edit prompt',
      image,
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
    }, {
      modelId: NANO_BANANA_2_EDIT_MODEL_ID,
      aspectRatio: '16:9',
      resolution: '2K',
      numImages: 5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(NANO_BANANA_2_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'nano banana 2 edit prompt',
        image_urls: ['https://example.com/upload.png'],
        aspect_ratio: '16:9',
        resolution: '2K',
        num_images: 4,
        output_format: 'png',
        sync_mode: false,
      }),
    }));
    expect(result.imageBase64).toBe('YmFy');
    expect(result.imagesBase64).toEqual(['YmFy']);
  });
});
