import { describe, expect, it } from 'vitest';
import type { CanvasImage } from '../../types';
import { buildSeedance2RequestKey } from '../seedanceRequestKey';

const createImage = (overrides: Partial<CanvasImage> = {}): CanvasImage => ({
  id: 'image-1',
  element: document.createElement('img'),
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 512,
  height: 512,
  rotation: 0,
  naturalWidth: 512,
  naturalHeight: 512,
  file: new File(['frame'], 'frame.png', { type: 'image/png', lastModified: 123 }),
  ...overrides,
});

describe('buildSeedance2RequestKey', () => {
  it('changes when the prompt changes', () => {
    const images = [createImage()];

    const baseKey = buildSeedance2RequestKey({
      prompt: 'A fox running through snow',
      variant: 'smart',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: '5',
      generateAudio: false,
      cameraFixed: false,
      primaryImageId: 'image-1',
      videoLastFrameImageId: null,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      images,
    });

    const changedPromptKey = buildSeedance2RequestKey({
      prompt: 'A wolf running through snow',
      variant: 'smart',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: '5',
      generateAudio: false,
      cameraFixed: false,
      primaryImageId: 'image-1',
      videoLastFrameImageId: null,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      images,
    });

    expect(changedPromptKey).not.toBe(baseKey);
  });

  it('changes when the selected asset changes', () => {
    const images = [
      createImage({ id: 'image-1', file: new File(['first'], 'first.png', { type: 'image/png', lastModified: 123 }) }),
      createImage({ id: 'image-2', file: new File(['second'], 'second.png', { type: 'image/png', lastModified: 456 }) }),
    ];

    const firstKey = buildSeedance2RequestKey({
      prompt: 'A fox running through snow',
      variant: 'smart',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: '5',
      generateAudio: false,
      cameraFixed: false,
      primaryImageId: 'image-1',
      videoLastFrameImageId: null,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      images,
    });

    const secondKey = buildSeedance2RequestKey({
      prompt: 'A fox running through snow',
      variant: 'smart',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: '5',
      generateAudio: false,
      cameraFixed: false,
      primaryImageId: 'image-2',
      videoLastFrameImageId: null,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      images,
    });

    expect(secondKey).not.toBe(firstKey);
  });

  it('changes when the backend changes', () => {
    const images = [createImage()];
    const basePayload = {
      prompt: 'A fox running through snow',
      variant: 'smart' as const,
      aspectRatio: '16:9',
      resolution: '720p',
      duration: '5',
      generateAudio: false,
      cameraFixed: false,
      primaryImageId: 'image-1',
      videoLastFrameImageId: null,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      images,
    };

    const volcengineKey = buildSeedance2RequestKey({
      ...basePayload,
      provider: 'volcengine',
      modelId: 'volcengine/seedance-2',
    });
    const falKey = buildSeedance2RequestKey({
      ...basePayload,
      provider: 'fal',
      modelId: 'bytedance/seedance-2.0',
    });

    expect(falKey).not.toBe(volcengineKey);
  });
});
