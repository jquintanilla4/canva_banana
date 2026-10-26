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
import { GROK_IMAGINE_IMAGE_MODEL_ID, GROK_IMAGINE_IMAGE_EDIT_MODEL_ID } from '../modelConfig';
import { generateImage, generateImageEdit } from '../falService';
import { resolveGrokImageRunSettings } from '../grokImageRunSettings';

const editParams = (referenceCount = 0, tool = Tool.SELECTION) => ({
  prompt: 'edit prompt',
  image: Object.assign(document.createElement('img'), { width: 512, height: 512 }),
  tool, paths: [], imageDimensions: { width: 512, height: 512 },
  referenceImages: Array.from({ length: referenceCount }, () => document.createElement('img')),
});

describe('falService (Grok Imagine 2.0 image)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');
  const modelIds = [
    GROK_IMAGINE_IMAGE_MODEL_ID,
    GROK_IMAGINE_IMAGE_EDIT_MODEL_ID,
    'xai/grok-imagine-image',
    'xai/grok-imagine-image/edit',
  ];

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Legacy env value; the browser SDK now uses the Node proxy.
    vi.clearAllMocks();
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/upload.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }] }, requestId: 'req',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
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

  it.each(modelIds)('routes text generation from %s to the 2.0 text endpoint', async modelId => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }] },
      requestId: 'req-text',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImage('wide scene', { modelId, aspectRatio: '16:9', numImages: 3 });

    expect(fal.subscribe).toHaveBeenCalledWith('xai/grok-imagine-image/v2.0/text-to-image', expect.objectContaining({
      input: expect.objectContaining({ prompt: 'wide scene', aspect_ratio: '16:9', num_images: 3, output_format: 'png' }),
    }));
    expect(result.imageDataUrls).toEqual(['data:image/png;base64,Zm9v']);
  });

  it.each(modelIds)('routes image edits from %s to the 2.0 edit endpoint', async modelId => {
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
      modelId,
      numImages: 2,
    });

    expect(fal.subscribe).toHaveBeenCalledWith('xai/grok-imagine-image/v2.0/edit', expect.objectContaining({
      input: {
        prompt: 'edit prompt',
        image_urls: ['https://example.com/upload.png'],
        num_images: 2,
        output_format: 'png',
        sync_mode: false,
        aspect_ratio: 'auto',
        resolution: '1k',
        quality: 'medium',
        image_passthrough: false,
        enable_safety_checker: true,
      },
    }));
    expect(result.imageBase64).toBe('Zm9v');
    expect(result.imagesBase64).toEqual(['Zm9v']);
    expect(result.imageDataUrls).toEqual(['data:image/png;base64,Zm9v']);
    expect(result.text).toBe('rp');
  });

  it.each(['text_to_image', 'image_edit'] as const)('sends all new %s controls and honors supplied run settings over raw options', async kind => {
    const settings = resolveGrokImageRunSettings({
      kind, aspectRatio: '5:2', resolution: '1.5k', quality: 'auto', outputFormat: 'webp',
      imagePassthrough: true, enableSafetyChecker: false, numImages: 10,
    });
    const conflicting = {
      modelId: GROK_IMAGINE_IMAGE_MODEL_ID, aspectRatio: '16:9' as const, numImages: 1,
      grokImageResolution: '2k' as const, grokImageOutputFormat: 'jpeg' as const,
    };
    if (settings.kind === 'text_to_image') {
      await generateImage('edit prompt', { ...conflicting, grokImageRunSettings: settings });
    } else {
      await generateImageEdit(editParams(), { ...conflicting, grokImageRunSettings: settings });
    }
    expect(fal.subscribe).toHaveBeenLastCalledWith(settings.endpoint, expect.objectContaining({ input: expect.objectContaining({
      aspect_ratio: '5:2', resolution: '1.5k', quality: 'auto', output_format: 'webp',
      image_passthrough: true, enable_safety_checker: false, num_images: 10, sync_mode: kind === 'text_to_image',
    }) }));
  });

  it('accepts raw controls and preserves JPEG response bytes', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/jpeg;base64,YmFy' }] }, requestId: 'jpeg',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
    const result = await generateImage('A landscape', {
      modelId: GROK_IMAGINE_IMAGE_MODEL_ID, grokImageAspectRatio: '21:9', grokImageResolution: '2k',
      grokImageQuality: 'low', grokImageOutputFormat: 'jpeg', numImages: 11,
    });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toMatchObject({
      aspect_ratio: '21:9', resolution: '2k', quality: 'low', output_format: 'jpeg', num_images: 10,
      image_passthrough: false, enable_safety_checker: true,
    });
    expect(result.imageDataUrls).toEqual(['data:image/jpeg;base64,YmFy']);
  });

  it.each([{ tool: Tool.SELECTION, references: 4 }, { tool: Tool.ANNOTATE, references: 3 }])('accepts five total inputs and rejects six before upload for $tool', async ({ tool, references }) => {
    let upload = 0;
    vi.mocked(fal.storage.upload).mockImplementation(async () => `https://example.com/input-${++upload}.png`);
    await generateImageEdit(editParams(references, tool), { modelId: GROK_IMAGINE_IMAGE_MODEL_ID });
    expect(vi.mocked(fal.subscribe).mock.calls[0][1].input).toHaveProperty('image_urls', [
      'https://example.com/input-1.png', 'https://example.com/input-2.png', 'https://example.com/input-3.png',
      'https://example.com/input-4.png', 'https://example.com/input-5.png',
    ]);
    vi.mocked(fal.storage.upload).mockClear();
    vi.mocked(fal.subscribe).mockClear();
    await expect(generateImageEdit(editParams(references + 1, tool), { modelId: GROK_IMAGINE_IMAGE_MODEL_ID })).rejects.toThrow('5 total input images');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });
});
