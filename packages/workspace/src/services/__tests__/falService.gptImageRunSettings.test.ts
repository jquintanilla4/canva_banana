import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { Tool, type FalImageSizeOption } from '../../types';
import { generateImage, generateImageEdit } from '../falService';
import * as gptImage2Policy from '../gptImage2RunSettings';
import * as gptImage25Policy from '../gptImage25RunSettings';
import { GPT_IMAGE_2_EDIT_MODEL_ID, GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID } from '../gptImage2Config';
import { GPT_IMAGE_25_MODEL_ID, getGptImage25Endpoint } from '../gptImage25Config';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));

const editParams = {
  prompt: 'Keep the subject', image: document.createElement('img'), tool: Tool.SELECTION, paths: [],
  imageDimensions: { width: 1024, height: 1024 },
};

describe('resolved GPT image requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/input.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy', width: 1024, height: 1024 }] }, requestId: 'gpt-request',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each((['2', '2.5'] as const).flatMap(model => (['text_to_image', 'image_edit'] as const).map(kind => ({ model, kind }))))(
    'uses supplied GPT Image $model $kind settings without resolving conflicting raw options',
    async ({ model, kind }) => {
      const settings2 = gptImage2Policy.resolveGptImage2RunSettings({ kind, quality: 'high', imageSizeSelection: '2560x1440', numImages: 2 });
      const settings25 = gptImage25Policy.resolveGptImage25RunSettings({ kind, variant: 'flare', quality: 'max', background: 'transparent', imageSizeSelection: '2560x1440', numImages: 2 });
      const resolver2 = vi.spyOn(gptImage2Policy, 'resolveGptImage2RunSettings');
      const resolver25 = vi.spyOn(gptImage25Policy, 'resolveGptImage25RunSettings');
      const options = {
        modelId: model === '2' ? GPT_IMAGE_2_EDIT_MODEL_ID : GPT_IMAGE_25_MODEL_ID, imageSize: 'square' as const, numImages: 4,
        gptImage2Quality: 'low' as const, gptImage25Quality: 'low' as const, gptImage25Variant: 'sunburst' as const, gptImage25Background: 'opaque' as const,
      };
      if (kind === 'text_to_image') {
        await generateImage('A subject', {
          ...options,
          ...(model === '2' && settings2.kind === 'text_to_image' ? { gptImage2RunSettings: settings2 } : {}),
          ...(model === '2.5' && settings25.kind === 'text_to_image' ? { gptImage25RunSettings: settings25 } : {}),
        });
      } else {
        await generateImageEdit(editParams, {
          ...options,
          ...(model === '2' && settings2.kind === 'image_edit' ? { gptImage2RunSettings: settings2 } : {}),
          ...(model === '2.5' && settings25.kind === 'image_edit' ? { gptImage25RunSettings: settings25 } : {}),
        });
      }
      expect(resolver2).not.toHaveBeenCalled();
      expect(resolver25).not.toHaveBeenCalled();
      expect(fal.subscribe).toHaveBeenCalledWith(model === '2' ? settings2.endpoint : settings25.endpoint, expect.objectContaining({
        input: expect.objectContaining({
          quality: model === '2' ? 'high' : 'max', image_size: { width: 2560, height: 1440 }, num_images: 2,
          ...(model === '2.5' ? { background: 'transparent' } : {}),
        }),
      }));
    },
  );

  it.each(['2688x1152', '2016x864', '1344x576', 'auto_1K', 'auto_2K', 'auto_3K', 'auto_4K'] as const)(
    'preserves legacy GPT Image 2 direct-call size %s for both modes',
    async imageSize => {
      await generateImage('A subject', { modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID, imageSize });
      await generateImageEdit(editParams, { modelId: GPT_IMAGE_2_EDIT_MODEL_ID, imageSize });
      const dimensions = imageSize.match(/^(\d+)x(\d+)$/);
      for (const [, request] of vi.mocked(fal.subscribe).mock.calls) {
        expect(request.input).toHaveProperty('image_size', dimensions ? { width: Number(dimensions[1]), height: Number(dimensions[2]) } : imageSize);
        expect(request.input).not.toHaveProperty('num_images');
      }
    },
  );

  it.each((['flare', 'sunburst'] as const).flatMap(variant =>
    (['edit', 'text-to-image'] as const).map(mode => ({ variant, mode })),
  ))('preserves $variant direct endpoint aliases while routing to the requested operation', async ({ variant, mode }) => {
    const options = {
      modelId: getGptImage25Endpoint(variant, mode), gptImage25Variant: variant === 'flare' ? 'sunburst' as const : 'flare' as const,
    };
    await generateImage('A subject', options);
    expect(fal.subscribe).toHaveBeenLastCalledWith(getGptImage25Endpoint(variant, 'text-to-image'), expect.any(Object));
    await generateImageEdit(editParams, options);
    expect(fal.subscribe).toHaveBeenLastCalledWith(getGptImage25Endpoint(variant, 'edit'), expect.any(Object));
  });

  it('rejects invalid GPT Image 2 sizes before uploads or provider calls', async () => {
    const options = { modelId: GPT_IMAGE_2_EDIT_MODEL_ID, imageSize: 'bad' as FalImageSizeOption };
    await expect(generateImage('A subject', options)).rejects.toThrow('supported GPT Image 2 image size');
    await expect(generateImageEdit(editParams, options)).rejects.toThrow('supported GPT Image 2 image size');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });
});
