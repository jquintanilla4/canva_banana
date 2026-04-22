import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { WAN_27_VIDEO_MODEL_ID } from '../../services/modelConfig';
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
  | 'isKling26VideoModel'
  | 'isKling26ControlVideoModel'
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
  isKling26VideoModel: false,
  isKling26ControlVideoModel: false,
  isWan27VideoModel: true,
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
});
