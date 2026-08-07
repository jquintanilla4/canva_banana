import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { FAL_SEEDANCE_2_VIDEO_MODEL_ID, FAL_SEEDANCE_25_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
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

  it('keeps multi-selected images ordered for Seedance reference labels', () => {
    const images = [
      buildCanvasMedia('image-1', 'image'),
      buildCanvasMedia('image-2', 'image'),
      buildCanvasMedia('image-3', 'image'),
    ];
    const fal = createFalStub();
    const { result } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'fal',
      fal,
      onError: vi.fn(),
      onReferenceLimit: vi.fn(),
    }));

    act(() => {
      result.current.handleImageSelection('image-2', { multi: true });
      result.current.handleImageSelection('image-1', { multi: true });
      result.current.handleImageSelection('image-3', { multi: true });
    });

    expect(result.current.selectedImageIds).toEqual(['image-2', 'image-1', 'image-3']);
    expect(result.current.seedanceReferenceOrderIds).toEqual(['image-2', 'image-1', 'image-3']);
  });

  it('uses the separate 30 image, 10 video, and 10 audio limits for Seedance 2.5', () => {
    const stills = Array.from({ length: 31 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const videos = Array.from({ length: 11 }, (_, index) => buildCanvasMedia(`video-${index + 1}`, 'video'));
    const audios = Array.from({ length: 11 }, (_, index) => buildCanvasMedia(`audio-${index + 1}`, 'audio'));
    const assets = [...stills, ...videos, ...audios];
    const fal = {
      ...createFalStub(),
      falModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      seedance25Variant: 'reference' as const,
    };
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
      stills.forEach(image => result.current.handleImageSelection(image.id, { reference: true }));
      videos.forEach(video => result.current.handleImageSelection(video.id, { reference: true }));
      audios.forEach(audio => result.current.handleImageSelection(audio.id, { reference: true }));
    });

    expect(result.current.referenceImageIds).toHaveLength(30);
    expect(result.current.referenceVideoIds).toHaveLength(10);
    expect(result.current.referenceAudioIds).toHaveLength(10);
    expect(onError).toHaveBeenCalledWith('Seedance 2.5 reference supports up to 30 images.');
    expect(onError).toHaveBeenCalledWith('Seedance 2.5 reference supports up to 10 videos.');
    expect(onError).toHaveBeenCalledWith('Seedance 2.5 reference supports up to 10 audio tracks.');
  });

  it('counts the selected image inside the Seedance 2.5 image and total reference limits', () => {
    const stills = Array.from({ length: 31 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const fal = {
      ...createFalStub(),
      falModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      seedance25Variant: 'reference' as const,
    };
    const onError = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: stills,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit: vi.fn(),
    }));

    act(() => result.current.handleImageSelection(stills[0].id));
    stills.slice(1).forEach(image => {
      act(() => result.current.handleImageSelection(image.id, { reference: true }));
    });

    expect(result.current.selectedImageIds).toEqual([stills[0].id]);
    expect(result.current.referenceImageIds).toHaveLength(29);
    expect(new Set([...result.current.selectedImageIds, ...result.current.referenceImageIds])).toHaveLength(30);
    expect(onError).toHaveBeenCalledWith('Seedance 2.5 reference supports up to 30 images.');
  });

  it('clears tagged references in Seedance 2.5 Smart mode and reports a zero limit', () => {
    const stills = Array.from({ length: 2 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const fal = {
      ...createFalStub(),
      falModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      seedance25Variant: 'smart' as const,
    };
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: stills,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => result.current.handleImageSelection(stills[0].id, { reference: true }));

    expect(result.current.referenceImageIds).toHaveLength(0); // Smart runs drop references at submit, so tags clear up front.
    expect(onReferenceLimit).toHaveBeenCalledWith(0);
  });

  it('keeps one starting image when Seedance 2.5 switches from Reference to Smart', () => {
    const stills = Array.from({ length: 3 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const referenceFal = {
      ...createFalStub(),
      falModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      seedance25Variant: 'reference' as 'reference' | 'smart',
    };
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(({ fal }) => useSelectionState({
      images: stills,
      apiProvider: 'fal',
      fal,
      onError: vi.fn(),
      onReferenceLimit,
    }), { initialProps: { fal: referenceFal } });

    act(() => {
      stills.forEach(image => result.current.handleImageSelection(image.id, { multi: true }));
    });
    expect(result.current.selectedImageIds).toEqual(stills.map(image => image.id));

    rerender({ fal: { ...referenceFal, seedance25Variant: 'smart' as const } });

    expect(result.current.selectedImageIds).toEqual([stills[0].id]);
    expect(onReferenceLimit).toHaveBeenCalledWith(0);
  });

  it('clears tagged references in Seedance 2 (FAL) Smart mode and reports a zero limit', () => {
    const stills = Array.from({ length: 2 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const fal = {
      ...createFalStub(),
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'smart' as const,
    };
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: stills,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => result.current.handleImageSelection(stills[0].id, { reference: true }));

    expect(result.current.referenceImageIds).toHaveLength(0); // FAL Smart runs drop references at submit, so tags clear up front.
    expect(onReferenceLimit).toHaveBeenCalledWith(0);
  });
});
