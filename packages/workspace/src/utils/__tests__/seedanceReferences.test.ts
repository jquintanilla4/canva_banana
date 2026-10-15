import { describe, expect, it } from 'vitest';
import { buildEffectiveSeedanceReferenceIds, getSeedance2VolcengineReferenceLimits, limitEffectiveSeedanceReferenceIds } from '../seedanceReferences';
import type { CanvasImage } from '../../types';

const makeCanvasItem = (id: string, mediaType: CanvasImage['mediaType']): CanvasImage => ({
  id,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  naturalWidth: 100,
  naturalHeight: 100,
  file: new File(['test'], `${id}.png`, { type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png' }),
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
}); // Minimal canvas item shape for reference resolution tests.

describe('buildEffectiveSeedanceReferenceIds', () => {
  it('falls back to the active selection grouping when no explicit pick order is provided', () => {
    const images = [
      makeCanvasItem('selected-image', 'image'),
      makeCanvasItem('selected-video', 'video'),
      makeCanvasItem('selected-audio', 'audio'),
      makeCanvasItem('tagged-image', 'image'),
      makeCanvasItem('tagged-video', 'video'),
      makeCanvasItem('tagged-audio', 'audio'),
    ];

    const result = buildEffectiveSeedanceReferenceIds({
      enabled: true,
      images,
      selectedImageIds: ['selected-image', 'selected-video', 'selected-audio'],
      referenceImageIds: ['tagged-image'],
      referenceVideoIds: ['tagged-video'],
      referenceAudioIds: ['tagged-audio'],
    });

    expect(result).toEqual({
      referenceImageIds: ['selected-image', 'tagged-image'],
      referenceVideoIds: ['selected-video', 'tagged-video'],
      referenceAudioIds: ['selected-audio', 'tagged-audio'],
    });
  });

  it('keeps the first chosen asset as Image1 when later picks are tagged as references', () => {
    const images = [
      makeCanvasItem('first-selected-image', 'image'),
      makeCanvasItem('later-tagged-image', 'image'),
      makeCanvasItem('later-tagged-video', 'video'),
      makeCanvasItem('later-tagged-audio', 'audio'),
    ];

    const result = buildEffectiveSeedanceReferenceIds({
      enabled: true,
      images,
      selectedImageIds: ['first-selected-image'],
      referenceImageIds: ['later-tagged-image'],
      referenceVideoIds: ['later-tagged-video'],
      referenceAudioIds: ['later-tagged-audio'],
      orderedReferenceIds: ['first-selected-image', 'later-tagged-image', 'later-tagged-video', 'later-tagged-audio'],
    });

    expect(result).toEqual({
      referenceImageIds: ['first-selected-image', 'later-tagged-image'],
      referenceVideoIds: ['later-tagged-video'],
      referenceAudioIds: ['later-tagged-audio'],
    });
  });

  it('keeps explicit references unchanged when seedance reference mode is off', () => {
    const result = buildEffectiveSeedanceReferenceIds({
      enabled: false,
      images: [makeCanvasItem('selected-image', 'image')],
      selectedImageIds: ['selected-image'],
      referenceImageIds: ['tagged-image'],
      referenceVideoIds: ['tagged-video'],
      referenceAudioIds: ['tagged-audio'],
    });

    expect(result).toEqual({
      referenceImageIds: ['tagged-image'],
      referenceVideoIds: ['tagged-video'],
      referenceAudioIds: ['tagged-audio'],
    });
  });

  it('dedupes media that are both selected and already tagged', () => {
    const images = [makeCanvasItem('selected-image', 'image')];

    const result = buildEffectiveSeedanceReferenceIds({
      enabled: true,
      images,
      selectedImageIds: ['selected-image'],
      referenceImageIds: ['selected-image'],
      referenceVideoIds: [],
      referenceAudioIds: [],
    });

    expect(result.referenceImageIds).toEqual(['selected-image']);
  });
});

describe('limitEffectiveSeedanceReferenceIds', () => {
  it('keeps 50 mixed Seedance 2.5 references and rejects the 51st', () => {
    const imageIds = Array.from({ length: 31 }, (_, index) => `image-${index + 1}`);
    const videoIds = Array.from({ length: 10 }, (_, index) => `video-${index + 1}`);
    const audioIds = Array.from({ length: 10 }, (_, index) => `audio-${index + 1}`);
    const images = [
      ...imageIds.map(id => makeCanvasItem(id, 'image')),
      ...videoIds.map(id => makeCanvasItem(id, 'video')),
      ...audioIds.map(id => makeCanvasItem(id, 'audio')),
    ];
    const firstFiftyIds = [...imageIds.slice(0, 30), ...videoIds, ...audioIds];

    const result = limitEffectiveSeedanceReferenceIds({
      images,
      selectedImageIds: [],
      referenceImageIds: imageIds,
      referenceVideoIds: videoIds,
      referenceAudioIds: audioIds,
      orderedReferenceIds: [...firstFiftyIds, imageIds[30]],
      limits: { images: 31, videos: 10, audios: 10, total: 50 },
    });

    expect(result.acceptedReferenceIds).toEqual(firstFiftyIds);
    expect(result.violation).toBe('total');
  });
});

describe('getSeedance2VolcengineReferenceLimits', () => {
  it('keeps the 9/3/3 caps and 2-15s clips for the 2.0 sub-models', () => {
    for (const model of ['standard', 'fast', 'mini', undefined] as const) {
      expect(getSeedance2VolcengineReferenceLimits(model)).toMatchObject({
        images: 9,
        videos: 3,
        audios: 3,
        total: 12,
        clipMinDurationSeconds: 2,
        clipMaxDurationSeconds: 15,
      });
    }
  });

  it('raises caps to 30/10/10 with 2-30s clips for Seedance 2.5', () => {
    expect(getSeedance2VolcengineReferenceLimits('seedance25')).toMatchObject({
      images: 30,
      videos: 10,
      audios: 10,
      total: 50,
      clipMinDurationSeconds: 2,
      clipMaxDurationSeconds: 30,
      videoTotalDurationSeconds: 30,
      audioTotalDurationSeconds: 30,
    });
  });
});
