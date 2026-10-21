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
  NANO_BANANA_21_EDIT_MODEL_ID,
  NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig';
import { resolveNanoBananaRunSettings } from '../nanoBananaRunSettings';
import { serializeNanoBananaInput } from '../fal/nanoBanana';
import { NANO_BANANA_PRO_EDIT_MODEL_ID } from '../nanoBananaConfig';
import { generateImage, generateImageEdit } from '../falService';

describe('falService (nano banana 2.1)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Legacy env value; the browser SDK now uses the Node proxy.
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

  it('exposes NanoBanana 2.1 in the image model selector', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === NANO_BANANA_21_EDIT_MODEL_ID);

    expect(option?.label).toBe('NanoBanana 2.1');
    expect(isFalModelId(NANO_BANANA_21_EDIT_MODEL_ID)).toBe(true);
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
      modelId: NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID,
      aspectRatio: '16:9',
      resolution: '2K',
      numImages: 5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'nano banana 2 t2i prompt',
        aspect_ratio: '16:9',
        resolution: '2K',
        enable_web_search: false,
        thinking_level: 'medium',
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
      modelId: NANO_BANANA_21_EDIT_MODEL_ID,
      aspectRatio: '16:9',
      resolution: '2K',
      numImages: 5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(NANO_BANANA_21_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'nano banana 2 edit prompt',
        image_urls: ['https://example.com/upload.png'],
        aspect_ratio: '16:9',
        resolution: '2K',
        enable_web_search: false,
        thinking_level: 'medium',
        num_images: 4,
        output_format: 'png',
        sync_mode: false,
      }),
    }));
    expect(result.imageBase64).toBe('YmFy');
    expect(result.imagesBase64).toEqual(['YmFy']);
    expect(result.imageDataUrls).toEqual(['data:image/png;base64,YmFy']);
  });

  it.each([NANO_BANANA_21_EDIT_MODEL_ID, NANO_BANANA_PRO_EDIT_MODEL_ID].flatMap(modelId =>
    (['text_to_image', 'image_edit'] as const).map(kind => ({ modelId, kind })),
  ))('serializes resolved $modelId $kind settings ahead of raw options', async ({ modelId, kind }) => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/upload.png');
    vi.mocked(fal.subscribe).mockResolvedValue({ data: { images: [{ url: 'data:image/png;base64,Zm9v' }], description: '' }, requestId: 'resolved' } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
    const input = { modelId, aspectRatioSelection: '16:9', resolution: '4K', webSearch: true, thinkingLevel: 'minimal', numImages: 3 };
    const raw = { modelId, aspectRatio: '1:1' as const, resolution: '1K' as const, nanoBananaWebSearch: false, nanoBananaThinkingLevel: 'high' as const, numImages: 1 };
    if (kind === 'text_to_image') {
      const settings = resolveNanoBananaRunSettings({ ...input, kind });
      await generateImage('A subject', { ...raw, nanoBananaRunSettings: settings });
      expect(fal.subscribe).toHaveBeenCalledWith(settings.endpoint, expect.objectContaining({ input: expect.objectContaining(serializeNanoBananaInput(settings)) }));
    } else {
      const settings = resolveNanoBananaRunSettings({ ...input, kind });
      await generateImageEdit({ prompt: 'A subject', image: document.createElement('img'), tool: Tool.SELECTION, paths: [], imageDimensions: { width: 512, height: 512 } }, { ...raw, nanoBananaRunSettings: settings });
      expect(fal.subscribe).toHaveBeenCalledWith(settings.endpoint, expect.objectContaining({ input: expect.objectContaining(serializeNanoBananaInput(settings)) }));
    }
    const requestInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input;
    if (modelId === NANO_BANANA_PRO_EDIT_MODEL_ID) {
      expect(requestInput).not.toHaveProperty('thinking_level');
      expect(requestInput).not.toHaveProperty('enable_web_search');
    }
  });

  it('reverses Nano Banana 2 edit uploads so prompt image slots match selection order', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/first.png')
      .mockResolvedValueOnce('https://example.com/second.png')
      .mockResolvedValueOnce('https://example.com/third.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,YmFy' }],
        description: 'edited',
      },
      requestId: 'req-nb2-edit-order',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const firstImage = document.createElement('img');
    firstImage.width = 512;
    firstImage.height = 512;
    const secondImage = document.createElement('img');
    secondImage.width = 512;
    secondImage.height = 512;
    const thirdImage = document.createElement('img');
    thirdImage.width = 512;
    thirdImage.height = 512;

    await generateImageEdit({
      prompt: 'Use the first, second, and third selected images',
      image: firstImage,
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
      referenceImages: [secondImage, thirdImage],
    }, {
      modelId: NANO_BANANA_21_EDIT_MODEL_ID,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(NANO_BANANA_21_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        image_urls: [
          'https://example.com/third.png',
          'https://example.com/second.png',
          'https://example.com/first.png',
        ],
      }),
    }));
  });
});
