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
  normalizeFalModelId,
  WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig';
import { normalizeModelId } from '../fal/models';
import { generateImage, generateImageEdit } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image;
};

describe('falService (Wan 2.7 Pro Image)', () => {
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

  it('exposes Wan 2.7 Pro Image and normalizes legacy Wan 2.6 image ids', () => {
    const option = FAL_IMAGE_MODEL_OPTIONS.find(model => model.value === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID);

    expect(option?.label).toBe('Wan 2.7 Pro Image');
    expect(isFalModelId(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID)).toBe(true);
    expect(normalizeFalModelId('wan/v2.6/text-to-image')).toBe(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID);
    expect(normalizeFalModelId('wan/v2.6/image-to-image')).toBe(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID);
    expect(normalizeModelId('wan/v2.6/text-to-image')).toBe(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID);
    expect(normalizeModelId('wan/v2.6/image-to-image')).toBe(WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID);
  });

  it('sends the Wan 2.7 Pro text-to-image payload shape', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,Zm9v' }],
        generated_text: 'generated',
      },
      requestId: 'req-wan27-t2i',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('wan t2i prompt', {
      modelId: WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
      wan27ImageSize: 'portrait_4_3',
      wan27ImageMaxImages: '9',
      negativePrompt: 'no blur',
      numImages: 4,
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'wan t2i prompt',
        image_size: 'portrait_4_3',
        max_images: 5,
        negative_prompt: 'no blur',
        enable_safety_checker: true,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('sync_mode');
    expect(subscribeInput).not.toHaveProperty('output_format');
    expect(subscribeInput).not.toHaveProperty('num_images');
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.text).toBe('generated');
  });

  it('routes Wan 2.7 Pro edits with ordered image urls and edit-only options', async () => {
    const uploadUrls = [
      'https://example.com/base.png',
      'https://example.com/ref-1.png',
      'https://example.com/ref-2.png',
      'https://example.com/ref-3.png',
    ];
    vi.mocked(fal.storage.upload).mockImplementation(async () => uploadUrls.shift() ?? '');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,YmFy' }],
      },
      requestId: 'req-wan27-edit',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImageEdit({
      prompt: 'Blend @Image1 with @Image2 and @Image4',
      image: createTestImage(),
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
      referenceImages: [createTestImage(), createTestImage(), createTestImage()],
    }, {
      modelId: WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
      wan27ImageSize: 'landscape_4_3',
      wan27ImageMaxImages: '9',
      negativePrompt: 'no noise',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Blend image 1 with image 2 and image 4',
        image_urls: [
          'https://example.com/base.png',
          'https://example.com/ref-1.png',
          'https://example.com/ref-2.png',
          'https://example.com/ref-3.png',
        ],
        image_size: 'landscape_4_3',
        num_images: 4,
        negative_prompt: 'no noise',
        enable_prompt_expansion: true,
        enable_safety_checker: true,
      }),
    }));
    expect(result.imageBase64).toBe('YmFy');
    expect(result.imagesBase64).toEqual(['YmFy']);
  });

  it('routes legacy Wan 2.6 edit ids through the Wan 2.7 Pro edit endpoint', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/base.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,YmF6' }],
      },
      requestId: 'req-wan27-legacy-edit',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    await generateImageEdit({
      prompt: 'legacy edit prompt',
      image: createTestImage(),
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
    }, {
      modelId: 'wan/v2.6/image-to-image',
      wan27ImageMaxImages: '2',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'legacy edit prompt',
        image_urls: ['https://example.com/base.png'],
        num_images: 2,
      }),
    }));
  });

  it('rejects Wan 2.7 Pro edits above the 4-image input limit', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/base.png');

    await expect(generateImageEdit({
      prompt: 'too many references',
      image: createTestImage(),
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
      referenceImages: [createTestImage(), createTestImage(), createTestImage(), createTestImage()],
    }, {
      modelId: WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
    })).rejects.toThrow('Wan 2.7 Pro Image supports up to 4 images total');

    expect(fal.subscribe).not.toHaveBeenCalled();
  });
});
