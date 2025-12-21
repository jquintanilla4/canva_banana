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
  | 'klingO1Variant'
  | 'isVideoMode'
  | 'isKlingProVideoSelection'
  | 'isKlingO1VideoModel'
  | 'isKlingO1EditMode'
  | 'isKlingO1RefV2VMode'
  | 'isLipsyncVideoModel'
  | 'isInfinitalkVideoModel'
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
      klingO1Variant: 'refI2V',
      isVideoMode: true,
      isKlingProVideoSelection: false,
      isKlingO1VideoModel: false,
      isKlingO1EditMode: false,
      isKlingO1RefV2VMode: false,
      isLipsyncVideoModel: false,
      isInfinitalkVideoModel: false,
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
});
