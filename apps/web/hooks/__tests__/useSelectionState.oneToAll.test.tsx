import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { ONE_TO_ALL_ANIMATE_MODEL_ID } from '../../services/modelConfig';
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

const buildCanvasMedia = (id: string, mediaType: 'image' | 'video'): CanvasImage => {
  const element = mediaType === 'image'
    ? document.createElement('img')
    : document.createElement('video');
  const file = new File(['test'], `${id}.${mediaType === 'image' ? 'png' : 'mp4'}`, {
    type: mediaType === 'image' ? 'image/png' : 'video/mp4',
  });

  return {
    id,
    element,
    mediaType,
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    rotation: 0,
    naturalWidth: 320,
    naturalHeight: 180,
    file,
  };
};

describe('useSelectionState (one-to-all)', () => {
  it('keeps the source video selected after choosing the still image', () => {
    const video = buildCanvasMedia('video-1', 'video');
    const image = buildCanvasMedia('image-1', 'image');
    const images = [video, image];
    const fal = {
      falModelId: ONE_TO_ALL_ANIMATE_MODEL_ID,
      falModelMode: 'video',
      falVideoModelId: ONE_TO_ALL_ANIMATE_MODEL_ID,
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
      isSeedance2VideoModel: false,
      seedance2Variant: 'smart',
      isVeo31VideoModel: false,
      veo31Variant: 'i2v-fflf',
    } satisfies TestFalSettings;

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
    expect(result.current.primaryImageId).toBe(video.id);

    act(() => {
      result.current.handleImageSelection(image.id);
    });

    expect(result.current.sourceVideoId).toBe(video.id);
    expect(result.current.primaryImageId).toBe(image.id);
    expect(onError).not.toHaveBeenCalled();
    expect(onReferenceLimit).not.toHaveBeenCalled();
  });

  it('replaces canvas objects without clearing the source video role', () => {
    const video = buildCanvasMedia('video-1', 'video');
    const image = buildCanvasMedia('image-1', 'image');
    const images = [video, image]; // Keep the hook input stable across state updates.
    const fal = {
      falModelId: ONE_TO_ALL_ANIMATE_MODEL_ID,
      falModelMode: 'video',
      falVideoModelId: ONE_TO_ALL_ANIMATE_MODEL_ID,
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
      isSeedance2VideoModel: false,
      seedance2Variant: 'smart',
      isVeo31VideoModel: false,
      veo31Variant: 'i2v-fflf',
    } satisfies TestFalSettings;
    const { result } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'fal',
      fal,
      onError: vi.fn(),
      onReferenceLimit: vi.fn(),
    }));

    act(() => {
      result.current.handleImageSelection(video.id);
      result.current.setReferenceImageIds([image.id]);
      result.current.setReferenceVideoIds([video.id]);
      result.current.setElementImageIds([image.id]);
      result.current.setVideoLastFrameImageId(image.id);
    });

    act(() => {
      result.current.replaceCanvasSelection({ imageIds: [image.id], noteIds: ['note-1'] });
    });

    expect(result.current.selectedImageIds).toEqual([image.id]);
    expect(result.current.selectedNoteIds).toEqual(['note-1']);
    expect(result.current.referenceImageIds).toEqual([]);
    expect(result.current.referenceVideoIds).toEqual([]);
    expect(result.current.elementImageIds).toEqual([]);
    expect(result.current.videoLastFrameImageId).toBeNull();
    expect(result.current.sourceVideoId).toBe(video.id);
  });
});
