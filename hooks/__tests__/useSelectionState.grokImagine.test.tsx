import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { GROK_IMAGINE_IMAGE_MODEL_ID, HAILUO_IMAGE_TO_VIDEO_MODEL_ID } from '../../services/modelConfig';
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
  | 'isWan27VideoModel'
  | 'isKlingV3ControlVideoModel'
  | 'isSeedance15VideoModel'
  | 'isSeedance2VideoModel'
  | 'seedance2Variant'
  | 'isVeo31VideoModel'
  | 'veo31Variant'
>;

const buildCanvasImage = (id: string): CanvasImage => {
  const element = document.createElement('img');
  const file = new File(['test'], `${id}.png`, { type: 'image/png' });

  return {
    id,
    element,
    mediaType: 'image',
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

describe('useSelectionState (grok imagine)', () => {
  it('blocks shift-click reference selection', () => {
    const image1 = buildCanvasImage('image-1');
    const image2 = buildCanvasImage('image-2');
    const images = [image1, image2];
    const fal = {
      falModelId: GROK_IMAGINE_IMAGE_MODEL_ID,
      falModelMode: 'image',
      falVideoModelId: HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
      klingVariant: 'standard',
      klingO1Variant: 'refI2V',
      isVideoMode: false,
      isKlingProVideoSelection: false,
      isKlingO1VideoModel: false,
      isKlingO1EditMode: false,
      isKlingO1RefV2VMode: false,
      isLipsyncVideoModel: false,
      isHeygenV3LipsyncVideoModel: false,
      isInfinitalkVideoModel: false,
      isWan27VideoModel: false,
      isKlingV3ControlVideoModel: false,
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
      result.current.handleImageSelection(image1.id);
    });

    expect(result.current.selectedImageIds).toEqual([image1.id]);

    act(() => {
      result.current.handleImageSelection(image2.id, { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual([]);
    expect(onReferenceLimit).toHaveBeenCalledWith(0);
    expect(onError).not.toHaveBeenCalled();
  });
});
