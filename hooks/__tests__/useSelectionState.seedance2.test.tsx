import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasImage } from '../../types';
import type { UseFalSettingsResult } from '../useFalSettings';

type TestFalSettings = Pick<
  UseFalSettingsResult,
  | 'falModelId'
  | 'falModelMode'
  | 'falVideoModelId'
  | 'klingVariant'
  | 'klingO3Variant'
  | 'isVideoMode'
  | 'isKlingProVideoSelection'
  | 'isKlingO3VideoModel'
  | 'isKlingO3EditMode'
  | 'isLipsyncVideoModel'
  | 'isHeygenV3LipsyncVideoModel'
  | 'isInfinitalkVideoModel'
  | 'isKlingV3ControlVideoModel'
  | 'isWan27VideoModel'
  | 'isSeedance15VideoModel'
  | 'isSeedance2VideoModel'
  | 'seedance2Variant'
  | 'isVeo31VideoModel'
  | 'veo31Variant'
>;

const buildCanvasMedia = (id: string, mediaType: CanvasImage['mediaType']): CanvasImage => ({
  id,
  element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  mediaType,
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['test'], `${id}.${mediaType === 'audio' ? 'mp3' : mediaType === 'video' ? 'mp4' : 'png'}`, {
    type: mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'video' ? 'video/mp4' : 'image/png',
  }),
  ...(mediaType === 'audio' ? { audioElement: document.createElement('audio') } : {}),
}); // Minimal canvas media keeps the tests focused on selection limits.

const createFalStub = (): TestFalSettings => ({
  falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
  falModelMode: 'video',
  falVideoModelId: SEEDANCE_2_VIDEO_MODEL_ID,
  klingVariant: 'standard',
  klingO3Variant: 'reference',
  isVideoMode: true,
  isKlingProVideoSelection: false,
  isKlingO3VideoModel: false,
  isKlingO3EditMode: false,
    isLipsyncVideoModel: false,
  isHeygenV3LipsyncVideoModel: false,
  isInfinitalkVideoModel: false,
  isKlingV3ControlVideoModel: false,
  isWan27VideoModel: false,
  isSeedance15VideoModel: false,
  isSeedance2VideoModel: true,
  seedance2Variant: 'reference',
  isVeo31VideoModel: false,
  veo31Variant: 'i2v-fflf',
});

describe('useSelectionState (seedance 2 reference)', () => {
  it('allows up to 9 image references', () => {
    const images = Array.from({ length: 10 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const fal = createFalStub();
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => {
      images.slice(0, 9).forEach(image => {
        result.current.handleImageSelection(image.id, { reference: true });
      });
    });

    expect(result.current.referenceImageIds).toHaveLength(9);

    act(() => {
      result.current.handleImageSelection(images[9].id, { reference: true });
    });

    expect(result.current.referenceImageIds).toHaveLength(9);
    expect(onError).toHaveBeenCalledWith('Seedance 2 reference supports up to 9 images.');
  });

  it('allows up to 3 video references', () => {
    const videos = Array.from({ length: 4 }, (_, index) => buildCanvasMedia(`video-${index + 1}`, 'video'));
    const fal = createFalStub();
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: videos,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => {
      videos.slice(0, 3).forEach(video => {
        result.current.handleImageSelection(video.id, { reference: true });
      });
    });

    expect(result.current.referenceVideoIds).toHaveLength(3);

    act(() => {
      result.current.handleImageSelection(videos[3].id, { reference: true });
    });

    expect(result.current.referenceVideoIds).toHaveLength(3);
    expect(onError).toHaveBeenCalledWith('Seedance 2 reference supports up to 3 videos.');
  });

  it('allows up to 3 audio references', () => {
    const audios = Array.from({ length: 4 }, (_, index) => buildCanvasMedia(`audio-${index + 1}`, 'audio'));
    const fal = createFalStub();
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: audios,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => {
      audios.slice(0, 3).forEach(audio => {
        result.current.handleImageSelection(audio.id, { reference: true });
      });
    });

    expect(result.current.referenceAudioIds).toHaveLength(3);

    act(() => {
      result.current.handleImageSelection(audios[3].id, { reference: true });
    });

    expect(result.current.referenceAudioIds).toHaveLength(3);
    expect(onError).toHaveBeenCalledWith('Seedance 2 reference supports up to 3 audio tracks.');
  });

  it('keeps seedance reference labels in the order assets were chosen across media types', () => {
    const assets = [
      buildCanvasMedia('image-1', 'image'),
      buildCanvasMedia('image-2', 'image'),
      buildCanvasMedia('video-1', 'video'),
      buildCanvasMedia('audio-1', 'audio'),
    ];
    const fal = createFalStub();
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: assets,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => {
      result.current.handleImageSelection('image-1');
      result.current.handleImageSelection('image-2', { reference: true });
      result.current.handleImageSelection('video-1', { reference: true });
      result.current.handleImageSelection('audio-1', { reference: true });
    });

    expect(result.current.seedanceReferenceOrderIds).toEqual(['image-1', 'image-2', 'video-1', 'audio-1']);
  });
});
