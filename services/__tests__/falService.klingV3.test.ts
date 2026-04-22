import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import {
  FAL_VIDEO_MODEL_OPTIONS,
  KLING_V3_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V3_TEXT_TO_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  isFalModelId,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let uploadImageElementToFal rasterize in tests.
};

describe('falService (Kling v3 smart)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test';
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/kling-v3.mp4' } },
      requestId: 'req-kling-v3',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('exposes Kling 3.0 Pro in the video model selector', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === KLING_V3_VIDEO_MODEL_ID);

    expect(option?.label).toBe('Kling 3.0 Pro');
    expect(isFalModelId(KLING_V3_VIDEO_MODEL_ID)).toBe(true);
  });

  it('routes no-image smart requests to the Kling v3 text endpoint', async () => {
    await generateImageToVideo('kling v3 t2v', null, {
      modelId: KLING_V3_VIDEO_MODEL_ID,
      klingV3Duration: '15',
      klingV3GenerateAudio: false,
      klingV3CfgScale: '0.75',
      negativePrompt: 'no blur',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_V3_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'kling v3 t2v',
        duration: '15',
        generate_audio: false,
        cfg_scale: 0.75,
        negative_prompt: 'no blur',
      }),
    }));
  });

  it('routes image smart requests to the Kling v3 image endpoint with an end frame', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('kling v3 i2v', createTestImage(), {
      modelId: KLING_V3_VIDEO_MODEL_ID,
      klingV3Duration: '5',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '0.5',
      negativePrompt: 'avoid glitches',
      tailImage: createTestImage(),
    });

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_V3_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'kling v3 i2v',
        start_image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
        duration: '5',
        generate_audio: true,
        cfg_scale: 0.5,
        negative_prompt: 'avoid glitches',
      }),
    }));
  });

  it('sends two-shot multi prompt payloads without a top-level prompt', async () => {
    await generateImageToVideo('shot one', null, {
      modelId: KLING_V3_VIDEO_MODEL_ID,
      klingV3MultiPromptEnabled: true,
      klingV3MultiPrompt: 'shot two',
      klingV3Shot1Duration: '3',
      klingV3Shot2Duration: '4',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '1',
    });

    const subscribeInput = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;

    expect(fal.subscribe).toHaveBeenCalledWith(KLING_V3_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        multi_prompt: [
          { prompt: 'shot one', duration: '3' },
          { prompt: 'shot two', duration: '4' },
        ],
        shot_type: 'customize',
        generate_audio: true,
        cfg_scale: 1,
      }),
    }));
    expect(subscribeInput).not.toHaveProperty('prompt');
    expect(subscribeInput).not.toHaveProperty('duration');
  });
});
