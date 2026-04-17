import { describe, expect, it } from 'vitest';
import { buildEffectiveSeedanceReferenceIds } from '../seedanceReferences';
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
  it('appends selected media after explicitly tagged seedance references', () => {
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
      referenceImageIds: ['tagged-image', 'selected-image'],
      referenceVideoIds: ['tagged-video', 'selected-video'],
      referenceAudioIds: ['tagged-audio', 'selected-audio'],
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
