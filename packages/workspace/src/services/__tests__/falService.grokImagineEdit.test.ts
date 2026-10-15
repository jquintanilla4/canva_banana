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
import { GROK_IMAGINE_IMAGE_MODEL_ID } from '../modelConfig';
import { generateImageEdit } from '../falService';

describe('falService (grok imagine edit)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Legacy env value; the browser SDK now uses the Node proxy.
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

  it('routes image edits to the grok imagine edit endpoint', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/upload.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{ url: 'data:image/png;base64,Zm9v' }],
        revised_prompt: 'rp',
      },
      requestId: 'req',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const image = document.createElement('img');
    image.width = 512;
    image.height = 512;

    const result = await generateImageEdit({
      prompt: 'edit prompt',
      image,
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
    }, {
      modelId: GROK_IMAGINE_IMAGE_MODEL_ID,
      numImages: 2,
    });

    expect(fal.subscribe).toHaveBeenCalledWith('xai/grok-imagine-image/edit', expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'edit prompt',
        image_url: 'https://example.com/upload.png',
        num_images: 2,
        output_format: 'png',
        sync_mode: false,
      }),
    }));
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imagesBase64).toEqual(['Zm9v']);
    expect(result.imageDataUrls).toEqual(['data:image/png;base64,Zm9v']);
    expect(result.text).toBe('rp');
  });
});
