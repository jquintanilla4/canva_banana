import { describe, expect, it } from 'vitest';
import { JIMENG_MULTIFRAME_VIDEO_MODEL_ID, KLING_O3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasImage, CanvasMediaType, GenerationInputs } from '../../types';
import { getGenerationTransferBlockReason, resolveGenerationInputSelection } from '../generationPromptBarTransfer';

const buildMedia = (id: string, mediaType: CanvasMediaType): CanvasImage => ({
  id,
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  naturalWidth: 100,
  naturalHeight: 100,
  file: new File(['media'], `${id}.bin`),
}); // Selection restoration only needs ids and media types.

const buildGeneration = (overrides: Partial<GenerationInputs> = {}): GenerationInputs => ({
  kind: 'video',
  prompt: 'Saved prompt',
  provider: 'fal',
  modelId: 'fal-ai/kling-video/o3/standard/image-to-video',
  modelMode: 'video',
  ...overrides,
});

describe('resolveGenerationInputSelection', () => {
  it('restores saved media roles and visible source selections in stable order', () => {
    const images = [
      buildMedia('primary', 'image'),
      buildMedia('reference', 'image'),
      buildMedia('video-reference', 'video'),
      buildMedia('audio-reference', 'audio'),
      buildMedia('element', 'image'),
      buildMedia('tail', 'image'),
      buildMedia('source-video', 'video'),
      buildMedia('source-audio', 'audio'),
    ];

    expect(resolveGenerationInputSelection(buildGeneration({
      primaryImageId: 'primary',
      referenceImageIds: ['reference'],
      referenceVideoIds: ['video-reference'],
      referenceAudioIds: ['audio-reference'],
      elementImageIds: ['element'],
      videoLastFrameImageId: 'tail',
      sourceVideoId: 'source-video',
      sourceAudioId: 'source-audio',
    }), images)).toEqual({
      selectedImageIds: ['primary', 'source-video', 'source-audio'],
      referenceImageIds: ['reference'],
      referenceVideoIds: ['video-reference'],
      referenceAudioIds: ['audio-reference'],
      seedanceReferenceOrderIds: ['reference', 'video-reference', 'audio-reference'],
      elementImageIds: ['element'],
      videoLastFrameImageId: 'tail',
      sourceVideoId: 'source-video',
      sourceAudioId: 'source-audio',
      missingInputCount: 0,
    });
  });

  it('skips missing and wrong-type inputs while counting repeated invalid ids once', () => {
    const images = [buildMedia('wrong-type', 'video'), buildMedia('valid-reference', 'image')];

    const restored = resolveGenerationInputSelection(buildGeneration({
      primaryImageId: 'wrong-type',
      referenceImageIds: ['missing', 'valid-reference', 'missing'],
      elementImageIds: ['wrong-type'],
      sourceAudioId: 'missing-audio',
    }), images);

    expect(restored.selectedImageIds).toEqual(['wrong-type']);
    expect(restored.referenceImageIds).toEqual(['valid-reference']);
    expect(restored.elementImageIds).toEqual([]);
    expect(restored.sourceAudioId).toBeNull();
    expect(restored.missingInputCount).toBe(3);
  });

  it('restores a Grok video-edit source stored only in the primary media field', () => {
    const sourceVideo = buildMedia('grok-source-video', 'video');

    const restored = resolveGenerationInputSelection(buildGeneration({
      modelId: 'xai/grok-imagine-video/image-to-video',
      primaryImageId: sourceVideo.id,
    }), [sourceVideo]);

    expect(restored.selectedImageIds).toEqual([sourceVideo.id]);
    expect(restored.sourceVideoId).toBeNull();
    expect(restored.missingInputCount).toBe(0);
  });

  it('deduplicates a video saved as both the primary media and source video', () => {
    const sourceVideo = buildMedia('shared-source-video', 'video');

    const restored = resolveGenerationInputSelection(buildGeneration({
      primaryImageId: sourceVideo.id,
      sourceVideoId: sourceVideo.id,
    }), [sourceVideo]);

    expect(restored.selectedImageIds).toEqual([sourceVideo.id]);
    expect(restored.sourceVideoId).toBe(sourceVideo.id);
    expect(restored.missingInputCount).toBe(0);
  });

  it('restores ordered Jimeng Multi-frame inputs as selected images', () => {
    const frames = [buildMedia('frame-1', 'image'), buildMedia('frame-2', 'image'), buildMedia('frame-3', 'image')];

    const restored = resolveGenerationInputSelection(buildGeneration({
      provider: 'jimeng',
      modelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
      referenceImageIds: frames.map(frame => frame.id),
    }), frames);

    expect(restored.selectedImageIds).toEqual(frames.map(frame => frame.id));
    expect(restored.referenceImageIds).toEqual([]);
    expect(restored.seedanceReferenceOrderIds).toEqual([]);
    expect(restored.missingInputCount).toBe(0);
  });
});

describe('getGenerationTransferBlockReason', () => {
  const allProviders = { google: true, fal: true };

  it('allows a saved generation whose model and provider are still available', () => {
    expect(getGenerationTransferBlockReason(
      buildGeneration({ modelId: KLING_O3_VIDEO_MODEL_ID }),
      allProviders,
    )).toBeNull();
  });

  it('blocks media that never carried generation metadata', () => {
    expect(getGenerationTransferBlockReason(undefined, allProviders)).toBe('No saved generation data');
  });

  it('blocks retired model ids that would otherwise migrate into another paid model', () => {
    expect(getGenerationTransferBlockReason(
      buildGeneration({ modelId: 'fal-ai/kling-video/o1/image-to-video' }),
      allProviders,
    )).toBe('Saved model is no longer available');
  });

  it('blocks unknown model ids', () => {
    expect(getGenerationTransferBlockReason(buildGeneration({ modelId: 'retired/model' }), allProviders))
      .toBe('Saved model is no longer available');
  });

  it('blocks generations whose provider is not configured', () => {
    expect(getGenerationTransferBlockReason(
      buildGeneration({ provider: 'google', modelId: 'gemini-3-pro-image-preview' }),
      { google: false, fal: true },
    )).toBe('Google is not configured');
  });

  it('accepts Google generations without checking Fal model ids', () => {
    expect(getGenerationTransferBlockReason(
      buildGeneration({ provider: 'google', modelId: 'gemini-3-pro-image-preview' }),
      allProviders,
    )).toBeNull();
  });
});
