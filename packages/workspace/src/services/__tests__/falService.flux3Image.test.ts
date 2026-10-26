import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() },
}));

import { fal } from '@fal-ai/client';
import { Tool } from '../../types';
import { generateImage, generateImageEdit } from '../falService';

const createEditParams = (referenceCount: number) => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 384;
  return {
    prompt: 'Put @Image2 behind @Image1',
    image,
    tool: Tool.SELECTION,
    paths: [],
    imageDimensions: { width: 512, height: 384 },
    referenceImages: Array.from({ length: referenceCount }, () => image),
  };
};

describe('falService (Flux 3 images)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['image'], { type: 'image/png' }));
    });
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }] },
      requestId: 'flux-image-request',
    } as Awaited<ReturnType<typeof fal.subscribe>>);
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/source.png');
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses the text endpoint and Flux 3 dimensions without unsupported Flux 2 fields', async () => {
    const result = await generateImage('Asymmetric landscape', {
      modelId: 'blackforestlabs/flux-3/text-to-image',
      flux3ImageAspectRatio: '7:5',
      flux3ImageResolution: '1.5k',
      numImages: 4,
      imageSize: 'square_hd',
      resolution: '4K',
    });
    expect(fal.subscribe).toHaveBeenCalledWith('blackforestlabs/flux-3/text-to-image', expect.objectContaining({
      input: {
        prompt: 'Asymmetric landscape',
        aspect_ratio: '7:5',
        resolution: '1.5k',
        safety_tolerance: 4,
        output_format: 'png',
        sync_mode: false,
      },
    }));
    expect(result.imageDataUrls).toEqual(['data:image/png;base64,Zm9v']);
    expect(result.requestId).toBe('flux-image-request');
  });

  it('migrates a legacy model and portrait size to Flux 3', async () => {
    await generateImage('Saved portrait', { modelId: 'fal-ai/flux-2-max', flux2MaxImageSize: 'portrait_16_9' });
    expect(fal.subscribe).toHaveBeenCalledWith('blackforestlabs/flux-3/text-to-image', expect.objectContaining({
      input: expect.objectContaining({ aspect_ratio: '9:16', resolution: '1k', safety_tolerance: 4 }),
    }));
  });

  it('sends all ten edit images in source and reference order with the selected dimensions', async () => {
    const urls = Array.from({ length: 10 }, (_, index) => `https://example.com/image-${index + 1}.png`);
    urls.forEach(url => vi.mocked(fal.storage.upload).mockResolvedValueOnce(url));
    const result = await generateImageEdit(createEditParams(9), {
      modelId: 'blackforestlabs/flux-3/text-to-image',
      flux3ImageAspectRatio: '4:5',
      flux3ImageResolution: '4k',
      numImages: 4,
    });
    expect(fal.subscribe).toHaveBeenCalledWith('blackforestlabs/flux-3/edit-image', expect.objectContaining({
      input: {
        prompt: 'Put @Image2 behind @Image1',
        image_urls: urls,
        aspect_ratio: '4:5',
        resolution: '4k',
        safety_tolerance: 4,
        output_format: 'png',
        sync_mode: false,
      },
    }));
    expect(result.imageBase64).toBe('Zm9v');
  });

  it.each(['blackforestlabs/flux-3/edit-image', 'fal-ai/flux-2-max/edit'])('routes %s edits with Auto and 1K defaults', async modelId => {
    await generateImageEdit(createEditParams(0), { modelId });
    expect(fal.subscribe).toHaveBeenCalledWith('blackforestlabs/flux-3/edit-image', expect.objectContaining({
      input: expect.objectContaining({ image_urls: ['https://example.com/source.png'], aspect_ratio: 'auto', resolution: '1k' }),
    }));
  });

  it('rejects eleven edit images before uploading or submitting', async () => {
    await expect(generateImageEdit(createEditParams(10), {
      modelId: 'blackforestlabs/flux-3/text-to-image',
    })).rejects.toThrow('up to 10 images');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });
});
