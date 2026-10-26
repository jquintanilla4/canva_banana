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
import * as client from '../fal/client';
import { isSeedreamEditModelId, isSeedreamTextToImageModelId, normalizeModelId } from '../fal/models';
import { NANO_BANANA_PRO_EDIT_MODEL_ID, NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID } from '../modelConfig';
import * as runtimeConfig from '../runtimeConfig';
import { generateImage, generateImageEdit } from '../falService';

const retiredModelIds = [
  'fal-ai/bytedance/seedream/v4/edit',
  'fal-ai/bytedance/seedream/v4/text-to-image',
  'fal-ai/bytedance/seedream/v4.5/edit',
  'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'fal-ai/wan/v2.7/pro/text-to-image',
  'fal-ai/wan/v2.7/pro/edit',
  'wan/v2.6/text-to-image',
  'wan/v2.6/image-to-image',
] as const; // Include saved endpoint ids and the old Wan image aliases.
const retiredMessage = 'This image model is no longer supported. Select a supported image model and create a new generation.';

const createEditParams = () => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return {
    prompt: 'Blend @Image1 with @Image2',
    image,
    tool: Tool.ANNOTATE,
    paths: [],
    imageDimensions: { width: 512, height: 512 },
    referenceImages: [image],
  };
};

describe('falService retired image models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(client, 'ensureFalClientConfigured');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const expectNoSideEffects = (onPhaseUpdate: ReturnType<typeof vi.fn>, onQueueUpdate: ReturnType<typeof vi.fn>) => {
    expect(client.ensureFalClientConfigured).not.toHaveBeenCalled();
    expect(fal.config).not.toHaveBeenCalled();
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
    expect(onPhaseUpdate).not.toHaveBeenCalled();
    expect(onQueueUpdate).not.toHaveBeenCalled();
  };

  it.each(retiredModelIds)('rejects text generation with %s before configuration, uploads, or requests', async modelId => {
    const onPhaseUpdate = vi.fn();
    const onQueueUpdate = vi.fn();
    const { image } = createEditParams();

    await expect(generateImage('A scene', {
      modelId,
      referenceImages: [image],
      imageStyleReferences: [{ image, strength: 1 }],
      onPhaseUpdate,
      onQueueUpdate,
    })).rejects.toThrow(retiredMessage);

    expectNoSideEffects(onPhaseUpdate, onQueueUpdate);
  });

  it.each(retiredModelIds)('rejects edits with %s before source, annotation, or reference uploads', async modelId => {
    const onPhaseUpdate = vi.fn();
    const onQueueUpdate = vi.fn();

    await expect(generateImageEdit(createEditParams(), {
      modelId,
      onPhaseUpdate,
      onQueueUpdate,
    })).rejects.toThrow(retiredMessage);

    expectNoSideEffects(onPhaseUpdate, onQueueUpdate);
  });

  it.each(retiredModelIds)('rejects a retired runtime edit default (%s) rather than falling through', async modelId => {
    vi.spyOn(runtimeConfig, 'getRuntimeConfig').mockReturnValue({ isDesktop: false, falModelId: modelId });
    const onPhaseUpdate = vi.fn();
    const onQueueUpdate = vi.fn();

    await expect(generateImageEdit(createEditParams(), { onPhaseUpdate, onQueueUpdate })).rejects.toThrow(retiredMessage);

    expectNoSideEffects(onPhaseUpdate, onQueueUpdate);
  });

  it.each(retiredModelIds)('does not normalize %s into a supported endpoint or a default', modelId => {
    expect(normalizeModelId(modelId)).toBe(modelId);
    expect(isSeedreamEditModelId(modelId)).toBe(false);
    expect(isSeedreamTextToImageModelId(modelId)).toBe(false);
  });

  it.each(['generation', 'edit'] as const)('keeps the implicit image %s default usable', async operation => {
    vi.spyOn(runtimeConfig, 'getRuntimeConfig').mockReturnValue({ isDesktop: false });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['test'], { type: 'image/png' }));
    });
    vi.mocked(fal.storage.upload).mockResolvedValue('https://example.com/source.png');
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { images: [{ url: 'data:image/png;base64,Zm9v' }] },
      requestId: 'req-supported',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = operation === 'generation'
      ? await generateImage('A scene')
      : await generateImageEdit({ ...createEditParams(), tool: Tool.SELECTION });

    expect(result.imageBase64).toBe('Zm9v');
    expect(result.requestId).toBe('req-supported');
    expect(fal.subscribe).toHaveBeenCalledWith(
      operation === 'generation' ? NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID : NANO_BANANA_PRO_EDIT_MODEL_ID,
      expect.objectContaining({ input: expect.objectContaining({ prompt: expect.any(String) }) }),
    );
  });
});
