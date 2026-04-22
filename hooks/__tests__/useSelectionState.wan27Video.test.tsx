import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { FAL_SEEDANCE_2_VIDEO_MODEL_ID, KLING_O1_VIDEO_MODEL_ID, WAN_27_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasImage } from '../../types';
import type { UseFalSettingsResult } from '../useFalSettings';

type TestFalSettings = Pick<
  UseFalSettingsResult,
  | 'falModelId'
  | 'falModelMode'
  | 'falVideoModelId'
  | 'klingVariant'
  | 'klingO1Variant'
  | 'isVideoMode'
  | 'isKlingProVideoSelection'
  | 'isKlingO1VideoModel'
  | 'isKlingO1EditMode'
  | 'isKlingO1RefV2VMode'
  | 'isLipsyncVideoModel'
  | 'isHeygenV3LipsyncVideoModel'
  | 'isInfinitalkVideoModel'
  | 'isKling26ControlVideoModel'
  | 'isWan27VideoModel'
  | 'wan27VideoVariant'
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
}); // Minimal canvas media keeps tests focused on selection state.

const createWan27FalStub = (): TestFalSettings => ({
  falModelId: WAN_27_VIDEO_MODEL_ID,
  falModelMode: 'video',
  falVideoModelId: WAN_27_VIDEO_MODEL_ID,
  klingVariant: 'standard',
  klingO1Variant: 'refI2V',
  isVideoMode: true,
  isKlingProVideoSelection: false,
  isKlingO1VideoModel: false,
  isKlingO1EditMode: false,
  isKlingO1RefV2VMode: false,
  isLipsyncVideoModel: false,
  isHeygenV3LipsyncVideoModel: false,
  isInfinitalkVideoModel: false,
  isKling26ControlVideoModel: false,
  isWan27VideoModel: true,
  wan27VideoVariant: 'smart',
  isSeedance15VideoModel: false,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  isVeo31VideoModel: false,
  veo31Variant: 'i2v-fflf',
});

describe('useSelectionState (Wan 2.7 video)', () => {
  it('sets a selected audio clip as audio input for text-to-video', () => {
    const audio = buildCanvasMedia('audio-1', 'audio');
    const images = [audio];
    const fal = createWan27FalStub();
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
      result.current.handleImageSelection(audio.id);
    });

    expect(result.current.primaryImageId).toBe(audio.id);
    expect(result.current.primarySelectionMediaType).toBe('audio');
    expect(result.current.activePrimaryImage).toBeNull();
    expect(result.current.sourceAudioId).toBe(audio.id);
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps the first frame selected while attaching a shift-selected audio clip', () => {
    const image = buildCanvasMedia('image-1', 'image');
    const audio = buildCanvasMedia('audio-1', 'audio');
    const images = [image, audio];
    const fal = createWan27FalStub();
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
      result.current.handleImageSelection(image.id);
    });
    act(() => {
      result.current.handleImageSelection(audio.id, { multi: true });
    });

    expect(result.current.primaryImageId).toBe(image.id);
    expect(result.current.activePrimaryImage?.id).toBe(image.id);
    expect(result.current.sourceAudioId).toBe(audio.id);
    expect(result.current.selectedImageIds).toEqual([image.id, audio.id]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('tags image and video references in Wan 2.7 reference mode', () => {
    const image = buildCanvasMedia('image-1', 'image');
    const video = buildCanvasMedia('video-1', 'video');
    const images = [image, video];
    const fal = { ...createWan27FalStub(), wan27VideoVariant: 'reference' as const };
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
      result.current.handleImageSelection(image.id, { reference: true });
    });
    act(() => {
      result.current.handleImageSelection(video.id, { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual([image.id]);
    expect(result.current.referenceVideoIds).toEqual([video.id]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects audio references in Wan 2.7 reference mode', () => {
    const audio = buildCanvasMedia('audio-1', 'audio');
    const fal = { ...createWan27FalStub(), wan27VideoVariant: 'reference' as const };
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: [audio],
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }));

    act(() => {
      result.current.handleImageSelection(audio.id, { reference: true });
    });

    expect(result.current.referenceAudioIds).toEqual([]);
    expect(onError).toHaveBeenCalledWith('Wan 2.7 Reference supports image and video references only.');
  });

  it('uses a selected video as the source in Wan 2.7 edit mode', () => {
    const video = buildCanvasMedia('video-1', 'video');
    const images = [video];
    const fal = { ...createWan27FalStub(), wan27VideoVariant: 'edit' as const };
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
      result.current.handleImageSelection(video.id);
    });

    expect(result.current.sourceVideoId).toBe(video.id);
    expect(result.current.primarySelectionMediaType).toBe('video');
    expect(onError).not.toHaveBeenCalled();
  });

  it('allows one still reference image in Wan 2.7 edit mode', () => {
    const image = buildCanvasMedia('image-1', 'image');
    const secondImage = buildCanvasMedia('image-2', 'image');
    const images = [image, secondImage];
    const fal = { ...createWan27FalStub(), wan27VideoVariant: 'edit' as const };
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
      result.current.handleImageSelection(image.id, { reference: true });
    });
    act(() => {
      result.current.handleImageSelection(secondImage.id, { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual([image.id]);
    expect(onError).toHaveBeenCalledWith('Wan 2.7 Edit supports one reference image.');
  });

  it('rejects video and audio references in Wan 2.7 edit mode', () => {
    const video = buildCanvasMedia('video-1', 'video');
    const audio = buildCanvasMedia('audio-1', 'audio');
    const images = [video, audio];
    const fal = { ...createWan27FalStub(), wan27VideoVariant: 'edit' as const };
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
      result.current.handleImageSelection(video.id, { reference: true });
    });
    act(() => {
      result.current.handleImageSelection(audio.id, { reference: true });
    });

    expect(result.current.referenceVideoIds).toEqual([]);
    expect(result.current.referenceAudioIds).toEqual([]);
    expect(onError).toHaveBeenCalledWith('Wan 2.7 Edit supports one still reference image.');
  });

  it('clamps Wan 2.7 video references when switching to Seedance 2 reference mode', async () => {
    const videos = Array.from({ length: 4 }, (_, index) => buildCanvasMedia(`video-${index + 1}`, 'video'));
    const wanFal: TestFalSettings = { ...createWan27FalStub(), wan27VideoVariant: 'reference' as const };
    const seedanceFal: TestFalSettings = {
      ...createWan27FalStub(),
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isWan27VideoModel: false,
      wan27VideoVariant: 'smart' as const,
      isSeedance2VideoModel: true,
      seedance2Variant: 'reference' as const,
    };
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(({ fal }) => useSelectionState({
      images: videos,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }), {
      initialProps: { fal: wanFal },
    });

    videos.forEach(video => {
      act(() => {
        result.current.handleImageSelection(video.id, { reference: true });
      });
    });
    expect(result.current.referenceVideoIds).toEqual(videos.map(video => video.id));

    rerender({ fal: seedanceFal });

    await waitFor(() => {
      expect(result.current.referenceVideoIds).toEqual(['video-1', 'video-2', 'video-3']);
    });
    expect(onError).toHaveBeenCalledWith('Seedance 2 reference supports up to 3 videos.');
  });

  it('clamps Wan 2.7 image references when switching to Seedance 2 reference mode', async () => {
    const images = Array.from({ length: 10 }, (_, index) => buildCanvasMedia(`image-${index + 1}`, 'image'));
    const wanFal: TestFalSettings = { ...createWan27FalStub(), wan27VideoVariant: 'reference' as const };
    const seedanceFal: TestFalSettings = {
      ...createWan27FalStub(),
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isWan27VideoModel: false,
      wan27VideoVariant: 'smart' as const,
      isSeedance2VideoModel: true,
      seedance2Variant: 'reference' as const,
    };
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(({ fal }) => useSelectionState({
      images,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }), {
      initialProps: { fal: wanFal },
    });

    images.forEach(image => {
      act(() => {
        result.current.handleImageSelection(image.id, { reference: true });
      });
    });
    expect(result.current.referenceImageIds).toEqual(images.map(image => image.id));

    rerender({ fal: seedanceFal });

    await waitFor(() => {
      expect(result.current.referenceImageIds).toEqual(images.slice(0, 9).map(image => image.id));
    });
    expect(onReferenceLimit).toHaveBeenCalledWith(9);
  });

  it('clears video and audio references when switching to Kling O1', async () => {
    const image = buildCanvasMedia('image-1', 'image');
    const video = buildCanvasMedia('video-1', 'video');
    const audio = buildCanvasMedia('audio-1', 'audio');
    const assets = [image, video, audio];
    const seedanceFal: TestFalSettings = {
      ...createWan27FalStub(),
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      falVideoModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isWan27VideoModel: false,
      wan27VideoVariant: 'smart' as const,
      isSeedance2VideoModel: true,
      seedance2Variant: 'reference' as const,
    };
    const klingFal: TestFalSettings = {
      ...createWan27FalStub(),
      falModelId: KLING_O1_VIDEO_MODEL_ID,
      falVideoModelId: KLING_O1_VIDEO_MODEL_ID,
      isKlingO1VideoModel: true,
      isWan27VideoModel: false,
      wan27VideoVariant: 'smart' as const,
      isSeedance2VideoModel: false,
      seedance2Variant: 'smart' as const,
    };
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(({ fal }) => useSelectionState({
      images: assets,
      apiProvider: 'fal',
      fal,
      onError,
      onReferenceLimit,
    }), {
      initialProps: { fal: seedanceFal },
    });

    act(() => {
      result.current.handleImageSelection(image.id, { reference: true });
      result.current.handleImageSelection(video.id, { reference: true });
      result.current.handleImageSelection(audio.id, { reference: true });
    });
    expect(result.current.referenceImageIds).toEqual([image.id]);
    expect(result.current.referenceVideoIds).toEqual([video.id]);
    expect(result.current.referenceAudioIds).toEqual([audio.id]);

    rerender({ fal: klingFal });

    await waitFor(() => {
      expect(result.current.referenceVideoIds).toEqual([]);
      expect(result.current.referenceAudioIds).toEqual([]);
    });
    expect(result.current.referenceImageIds).toEqual([image.id]);
  });
});
