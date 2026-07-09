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
import { getFalErrorPhase, getFalErrorRequestId } from '../fal/errors';
import {
  FAL_IMAGE_MODEL_OPTIONS,
  GPT_IMAGE_2_IMAGE_SIZE_OPTIONS,
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

  it('exposes explicit 2K GPT Image 2 size choices with pixel labels', () => {
    expect(GPT_IMAGE_2_IMAGE_SIZE_OPTIONS).toEqual(expect.arrayContaining([
      { value: '2048x2048', label: '2K Square (2048x2048)' },
      { value: '2048x1152', label: 'HD Landscape (2048x1152)' },
      { value: '1152x2048', label: 'HD Portrait (1152x2048)' },
      { value: '2560x1440', label: '2K Landscape (2560x1440)' },
      { value: '1440x2560', label: '2K Portrait (1440x2560)' },
    ]));
  });

  it('routes text-to-image requests to the GPT Image 2 text endpoint', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        images: [{
          url: 'data:image/png;base64,Zm9v',
          content_type: 'image/png',
          file_name: 'gpt-image-2.png',
          file_size: 123,
          width: 1024,
          height: 576,
        }],
      },
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
    expect(result.imagesMetadata).toEqual([{
      url: 'data:image/png;base64,Zm9v',
      contentType: 'image/png',
      fileName: 'gpt-image-2.png',
      fileSize: 123,
      width: 1024,
      height: 576,
    }]);
  });

  it('emits Fal phase updates for text-to-image queue progress and download start', async () => {
    const onPhaseUpdate = vi.fn();
    vi.mocked(fal.subscribe).mockImplementation(async (_modelId, options) => {
      options.onQueueUpdate?.({ status: 'IN_QUEUE', position: 2, request_id: 'req-queued', logs: ['queued'] } as never);
      options.onQueueUpdate?.({ status: 'IN_PROGRESS', requestId: 'req-processing', logs: [{ message: 'processing' }] } as never);
      return {
        data: { images: [{ url: 'data:image/png;base64,Zm9v' }] },
        requestId: 'req-complete',
      } as unknown as Awaited<ReturnType<typeof fal.subscribe>>;
    });

    await generateImage('gpt image 2 phase prompt', {
      modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID,
      onPhaseUpdate,
    });

    expect(onPhaseUpdate).toHaveBeenNthCalledWith(1, { phase: 'submitting', message: 'Submitting to Fal...' });
    expect(onPhaseUpdate).toHaveBeenNthCalledWith(2, {
      phase: 'queued',
      message: 'Waiting in Fal queue...',
      requestId: 'req-queued',
    });
    expect(onPhaseUpdate).toHaveBeenNthCalledWith(3, {
      phase: 'processing',
      message: 'Processing on provider...',
      requestId: 'req-processing',
    });
    expect(onPhaseUpdate).toHaveBeenNthCalledWith(4, {
      phase: 'downloading',
      message: 'Downloading generated image...',
      requestId: 'req-complete',
    });
  });

  it('wraps Fal submit failures with the submitting phase', async () => {
    vi.mocked(fal.subscribe).mockRejectedValue(new Error('provider unavailable'));

    let caughtError: unknown;
    try {
      await generateImage('gpt image 2 failed prompt', { modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(getFalErrorPhase(caughtError)).toBe('submitting');
    expect(getFalErrorRequestId(caughtError)).toBeUndefined();
  });

  it('wraps Fal download parsing failures with the downloading phase and request id', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64' }] },
      requestId: 'req-download-failed',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    let caughtError: unknown;
    try {
      await generateImage('gpt image 2 bad data prompt', { modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(getFalErrorPhase(caughtError)).toBe('downloading');
    expect(getFalErrorRequestId(caughtError)).toBe('req-download-failed');
  });

  it('sends explicit GPT Image 2 text-to-image sizes as Fal dimension objects', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }] },
      requestId: 'req-gpt-image-2-t2i-2k',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    await generateImage('gpt image 2 large t2i prompt', {
      modelId: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID,
      imageSize: '2560x1440',
      gptImage2Quality: 'high',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        image_size: { width: 2560, height: 1440 },
        quality: 'high',
      }),
    }));
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

  it('sends explicit GPT Image 2 edit sizes as Fal dimension objects', async () => {
    vi.mocked(fal.storage.upload).mockResolvedValueOnce('https://example.com/base.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,YmFy', width: 2048, height: 1152 }] },
      requestId: 'req-gpt-image-2-edit-2k',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const image = document.createElement('img');
    image.width = 512;
    image.height = 512;

    const result = await generateImageEdit({
      prompt: 'gpt image 2 large edit prompt',
      image,
      tool: Tool.SELECTION,
      paths: [],
      imageDimensions: { width: 512, height: 512 },
    }, {
      modelId: GPT_IMAGE_2_EDIT_MODEL_ID,
      imageSize: '2048x1152',
      gptImage2Quality: 'high',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(GPT_IMAGE_2_EDIT_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        image_size: { width: 2048, height: 1152 },
        quality: 'high',
      }),
    }));
    expect(result.imagesMetadata).toEqual([{
      url: 'data:image/png;base64,YmFy',
      width: 2048,
      height: 1152,
    }]);
  });
});
