import { describe, expect, it } from 'vitest';
import type { CanvasImage, CanvasVideoPromptArea } from '../../types';
import {
  buildEmbeddedSeedanceAreaMembership,
  buildVideoPromptAreaMembership,
  FULL_VIDEO_PROMPT_BAR_SCALE_THRESHOLD,
  getAreaPromptBarRect,
  getEmbeddedVideoPromptBarRenderWidth,
  getEmbeddedVideoPromptBarSizeMode,
  getVideoPromptAreaCapabilityProfile,
  getVideoPromptBarVisualScale,
  MINI_VIDEO_PROMPT_BAR_SIZE,
  syncVideoPromptAreaMembership,
} from '../videoPromptAreas';

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

  it('limits Smart embedded memberships to the first two still images', () => {
    const filteredMembership = buildEmbeddedSeedanceAreaMembership({
      orderedMediaIds: ['image-1', 'video-1', 'image-2', 'audio-1', 'image-3'],
      acceptedImageIds: ['image-1', 'image-2', 'image-3'],
      acceptedVideoIds: ['video-1'],
      acceptedAudioIds: ['audio-1'],
      elementImageIds: [],
      ignoredMediaIds: [],
      orderLabels: {
        'image-1': '@Image1',
        'video-1': '@Video1',
        'image-2': '@Image2',
        'audio-1': '@Audio1',
        'image-3': '@Image3',
      },
    }, 'smart');

    expect(filteredMembership.acceptedImageIds).toEqual(['image-1', 'image-2']);
    expect(filteredMembership.acceptedVideoIds).toEqual([]);
    expect(filteredMembership.acceptedAudioIds).toEqual([]);
    expect(filteredMembership.ignoredMediaIds).toEqual(['video-1', 'audio-1', 'image-3']);
    expect(filteredMembership.orderLabels).toEqual({
      'image-1': '@Image1',
      'image-2': '@Image2',
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

  it('assigns Grok embedded image drops as primary inputs', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: [],
      promptBarId: null,
    };
    const image = buildCanvasMedia('image-1', 'image');

    const [syncedArea] = syncVideoPromptAreaMembership([area], [image], {
      profileByAreaId: { 'area-1': getVideoPromptAreaCapabilityProfile('xai/grok-imagine-video/image-to-video') },
    });
    const membership = buildVideoPromptAreaMembership(syncedArea, [image], getVideoPromptAreaCapabilityProfile('xai/grok-imagine-video/image-to-video'));

    expect(syncedArea.mediaRoles).toEqual({ 'image-1': 'primary' });
    expect(membership.primaryImageId).toBe('image-1');
  });

  it('normalizes stale reference image roles after switching to image-to-video models', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: ['image-1'],
      mediaRoles: { 'image-1': 'reference' },
      promptBarId: null,
    };
    const image = buildCanvasMedia('image-1', 'image');
    const profile = getVideoPromptAreaCapabilityProfile('xai/grok-imagine-video/image-to-video');

    const [syncedArea] = syncVideoPromptAreaMembership([area], [image], {
      profileByAreaId: { 'area-1': profile },
    });
    const membership = buildVideoPromptAreaMembership(syncedArea, [image], profile);

    expect(syncedArea.mediaRoles).toEqual({ 'image-1': 'primary' });
    expect(membership.primaryImageId).toBe('image-1');
    expect(membership.acceptedImageIds).toEqual([]);
  });

  it('assigns Kling O3 option drops as elements and shift drops as references', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: [],
      promptBarId: null,
    };
    const elementImage = buildCanvasMedia('element-1', 'image');
    const referenceImage = buildCanvasMedia('reference-1', 'image');
    referenceImage.x = 120;
    const profile = getVideoPromptAreaCapabilityProfile('fal-ai/kling-video/o3/pro/reference-to-video');

    const [afterElement] = syncVideoPromptAreaMembership([area], [elementImage], {
      profileByAreaId: { 'area-1': profile },
      modifiers: { altKey: true },
    });
    const [afterReference] = syncVideoPromptAreaMembership([afterElement], [elementImage, referenceImage], {
      profileByAreaId: { 'area-1': profile },
      modifiers: { shiftKey: true },
    });
    const membership = buildVideoPromptAreaMembership(afterReference, [elementImage, referenceImage], profile);

    expect(afterReference.mediaRoles).toEqual({ 'element-1': 'element', 'reference-1': 'reference' });
    expect(membership.elementImageIds).toEqual(['element-1']);
    expect(membership.acceptedImageIds).toEqual(['reference-1']);
  });

  it('limits Kling O3 references without counting the primary image', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: ['primary-1', 'reference-1', 'reference-2', 'reference-3', 'reference-4', 'reference-5'],
      mediaRoles: {
        'primary-1': 'primary',
        'reference-1': 'reference',
        'reference-2': 'reference',
        'reference-3': 'reference',
        'reference-4': 'reference',
        'reference-5': 'reference',
      },
      promptBarId: null,
    };
    const images = area.orderedMediaIds.map(id => buildCanvasMedia(id, 'image'));
    const profile = getVideoPromptAreaCapabilityProfile('fal-ai/kling-video/o3/pro/reference-to-video');

    const membership = buildVideoPromptAreaMembership(area, images, profile);

    expect(membership.primaryImageId).toBe('primary-1');
    expect(membership.acceptedImageIds).toEqual(['reference-1', 'reference-2', 'reference-3', 'reference-4']);
    expect(membership.ignoredMediaIds).toEqual(['reference-5']);
  });

  it('assigns Wan 2.7 Reference videos as reference videos', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: [],
      promptBarId: null,
    };
    const video = buildCanvasMedia('video-1', 'video');
    const profile = getVideoPromptAreaCapabilityProfile('fal-ai/wan/v2.7', undefined, { wan27VideoVariant: 'reference' });

    const [syncedArea] = syncVideoPromptAreaMembership([area], [video], {
      profileByAreaId: { 'area-1': profile },
    });
    const membership = buildVideoPromptAreaMembership(syncedArea, [video], profile);

    expect(syncedArea.mediaRoles).toEqual({ 'video-1': 'reference' });
    expect(membership.acceptedVideoIds).toEqual(['video-1']);
  });

  it('assigns Veo 3.1 Extend videos as source videos', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: [],
      promptBarId: null,
    };
    const video = buildCanvasMedia('video-1', 'video');
    const profile = getVideoPromptAreaCapabilityProfile('fal-ai/veo3.1/image-to-video', undefined, { veo31Variant: 'extend' });

    const [syncedArea] = syncVideoPromptAreaMembership([area], [video], {
      profileByAreaId: { 'area-1': profile },
    });
    const membership = buildVideoPromptAreaMembership(syncedArea, [video], profile);

    expect(syncedArea.mediaRoles).toEqual({ 'video-1': 'sourceVideo' });
    expect(membership.sourceVideoId).toBe('video-1');
    expect(membership.ignoredMediaIds).toEqual([]);
  });

  it('assigns video and audio input models to source roles', () => {
    const area: CanvasVideoPromptArea = {
      id: 'area-1',
      sequence: 1,
      label: 'Video prompt area 01',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      orderedMediaIds: [],
      promptBarId: null,
    };
    const video = buildCanvasMedia('video-1', 'video');
    const audio = buildCanvasMedia('audio-1', 'audio');
    audio.x = 120;
    const profile = getVideoPromptAreaCapabilityProfile('fal-ai/sync-lipsync/v3');

    const [syncedArea] = syncVideoPromptAreaMembership([area], [video, audio], {
      profileByAreaId: { 'area-1': profile },
    });
    const membership = buildVideoPromptAreaMembership(syncedArea, [video, audio], profile);

    expect(syncedArea.mediaRoles).toEqual({ 'video-1': 'sourceVideo', 'audio-1': 'sourceAudio' });
    expect(membership.sourceVideoId).toBe('video-1');
    expect(membership.sourceAudioId).toBe('audio-1');
  });

  it('keeps video prompt bars readable when the canvas is zoomed far out', () => {
    expect(getVideoPromptBarVisualScale(0.12, 920, 1600)).toBe(0.8);
  });

  it('keeps the readability floor even when the area fit would be smaller', () => {
    expect(getVideoPromptBarVisualScale(0.12, 920, 360)).toBe(0.8);
  });

  it('still respects the owning area fit once it clears the readability floor', () => {
    expect(getVideoPromptBarVisualScale(1, 920, 900)).toBeCloseTo((900 - 48) / 920, 5);
  });

  it('snaps assigned bars to full scale once the canvas reaches the 50 percent threshold', () => {
    expect(getVideoPromptBarVisualScale(FULL_VIDEO_PROMPT_BAR_SCALE_THRESHOLD, 920, 1600)).toBe(1);
  });

  it('eases assigned bars toward full scale just below the 50 percent threshold', () => {
    expect(getVideoPromptBarVisualScale(FULL_VIDEO_PROMPT_BAR_SCALE_THRESHOLD - 0.01, 920, 1600)).toBeCloseTo(0.99, 5);
  });

  it('smoothly scales assigned bars through the reduced full-shell range', () => {
    expect(getVideoPromptBarVisualScale(0.42, 920, 1600)).toBeCloseTo(0.92, 5);
  });

  it('keeps assigned bars full above the 30 percent zoom threshold', () => {
    expect(getEmbeddedVideoPromptBarSizeMode(0.7, 500)).toBe('full');
  });

  it('keeps assigned bars full exactly at the 30 percent zoom threshold', () => {
    expect(getEmbeddedVideoPromptBarSizeMode(0.3, 1200)).toBe('full');
  });

  it('switches assigned bars into mini mode once the canvas is below the 30 percent zoom threshold', () => {
    expect(getEmbeddedVideoPromptBarSizeMode(0.29, 1200)).toBe('mini');
  });

  it('keeps mini bar widths tied to the visible area before scaling', () => {
    expect(getEmbeddedVideoPromptBarRenderWidth('mini', 240)).toBeCloseTo((240 - 24) / 0.8, 5);
    expect(getEmbeddedVideoPromptBarRenderWidth('mini', 1400)).toBe(MINI_VIDEO_PROMPT_BAR_SIZE.width);
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
