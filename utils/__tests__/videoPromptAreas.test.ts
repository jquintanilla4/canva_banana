import { describe, expect, it } from 'vitest';
import type { CanvasImage, CanvasVideoPromptArea } from '../../types';
import { buildVideoPromptAreaMembership, getAreaPromptBarRect, getVideoPromptBarVisualScale, syncVideoPromptAreaMembership } from '../videoPromptAreas';

const buildCanvasMedia = (id: string, mediaType: CanvasImage['mediaType']): CanvasImage => ({
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
  file: new File(['test'], `${id}.${mediaType === 'audio' ? 'mp3' : mediaType === 'video' ? 'mp4' : 'png'}`, {
    type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png',
  }),
});

describe('video prompt area helpers', () => {
  it('marks overflow media as ignored while preserving accepted order labels', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 400,
      height: 240,
      orderedMediaIds: ['image-1', 'video-1', 'audio-1', 'video-2', 'video-3', 'video-4'],
      promptBarId: null,
    };
    const images = [
      buildCanvasMedia('image-1', 'image'),
      buildCanvasMedia('video-1', 'video'),
      buildCanvasMedia('audio-1', 'audio'),
      buildCanvasMedia('video-2', 'video'),
      buildCanvasMedia('video-3', 'video'),
      buildCanvasMedia('video-4', 'video'),
    ];

    const membership = buildVideoPromptAreaMembership(area, images);

    expect(membership.acceptedImageIds).toEqual(['image-1']);
    expect(membership.acceptedVideoIds).toEqual(['video-1', 'video-2', 'video-3']);
    expect(membership.acceptedAudioIds).toEqual(['audio-1']);
    expect(membership.ignoredMediaIds).toEqual(['video-4']);
    expect(membership.orderLabels).toEqual({
      'image-1': '@Image1',
      'video-1': '@Video1',
      'video-2': '@Video2',
      'video-3': '@Video3',
      'audio-1': '@Audio1',
    });
  });

  it('re-appends media when it leaves an area and enters again', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: ['image-1', 'image-2'],
      promptBarId: null,
    };
    const image1 = buildCanvasMedia('image-1', 'image');
    const image2 = buildCanvasMedia('image-2', 'image');
    image1.x = 400; // Move image-1 out of the area.

    const afterLeave = syncVideoPromptAreaMembership([area], [image1, image2]);
    expect(afterLeave[0].orderedMediaIds).toEqual(['image-2']);

    image1.x = 10; // Move image-1 back into the area.
    const afterReturn = syncVideoPromptAreaMembership(afterLeave, [image1, image2]);
    expect(afterReturn[0].orderedMediaIds).toEqual(['image-2', 'image-1']);
  });

  it('keeps video prompt bars readable when the canvas is zoomed far out', () => {
    expect(getVideoPromptBarVisualScale(0.12, 920, 1600)).toBe(0.5);
  });

  it('caps the prompt bar scale so it still fits inside a narrower area', () => {
    expect(getVideoPromptBarVisualScale(0.12, 920, 360)).toBeCloseTo((360 - 48) / 920, 5);
  });

  it('snaps embedded prompt bars to the bottom center of the area', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 100,
      y: 50,
      width: 1200,
      height: 800,
      orderedMediaIds: [],
      promptBarId: 'bar-1',
    };

    expect(getAreaPromptBarRect(area)).toEqual({
      x: 240,
      y: 676,
      width: 920,
      height: 190,
    });
  });
});
