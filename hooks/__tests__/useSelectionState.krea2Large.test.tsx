import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import {
  GPT_IMAGE_2_EDIT_MODEL_ID,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../../services/modelConfig';
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
  | 'isWan27VideoModel'
  | 'isKrea2LargeModel'
  | 'isKlingV3ControlVideoModel'
  | 'isSeedance15VideoModel'
  | 'isSeedance2VideoModel'
  | 'seedance2Variant'
  | 'isVeo31VideoModel'
  | 'veo31Variant'
>;

const buildCanvasMedia = (id: string, mediaType: CanvasImage['mediaType'] = 'image'): CanvasImage => ({
  id,
  element: mediaType === 'image' ? document.createElement('img') : document.createElement('video'),
  mediaType,
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['test'], `${id}.${mediaType === 'image' ? 'png' : 'mp4'}`, { type: mediaType === 'image' ? 'image/png' : 'video/mp4' }),
});

const buildFal = (overrides: Partial<TestFalSettings> = {}): TestFalSettings => ({
  falModelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  falModelMode: 'image',
  falVideoModelId: HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  klingVariant: 'standard',
  klingO3Variant: 'reference',
  isVideoMode: false,
  isKlingProVideoSelection: false,
  isKlingO3VideoModel: false,
  isKlingO3EditMode: false,
  isLipsyncVideoModel: false,
  isHeygenV3LipsyncVideoModel: false,
  isInfinitalkVideoModel: false,
  isWan27VideoModel: false,
  isKrea2LargeModel: true,
  isKlingV3ControlVideoModel: false,
  isSeedance15VideoModel: false,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  isVeo31VideoModel: false,
  veo31Variant: 'i2v-fflf',
  ...overrides,
});

describe('useSelectionState (Krea 2 Large)', () => {
  it('allows the primary image to also be a style reference and caps refs at 10', () => {
    const images = Array.from({ length: 11 }, (_, index) => buildCanvasMedia(`image-${index + 1}`));
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'fal',
      fal: buildFal(),
      onError: vi.fn(),
      onReferenceLimit,
    }));

    act(() => {
      result.current.handleImageSelection(images[0].id);
      images.forEach(image => result.current.handleImageSelection(image.id, { reference: true }));
    });

    expect(result.current.selectedImageIds).toEqual(['image-1']);
    expect(result.current.referenceImageIds).toEqual(images.slice(0, 10).map(image => image.id));
    expect(onReferenceLimit).toHaveBeenCalledWith(10);
  });

  it('rejects non-image style references', () => {
    const video = buildCanvasMedia('video-1', 'video');
    const onError = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images: [video],
      apiProvider: 'fal',
      fal: buildFal(),
      onError,
      onReferenceLimit: vi.fn(),
    }));

    act(() => {
      result.current.handleImageSelection(video.id, { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual([]);
    expect(onError).toHaveBeenCalledWith('Krea 2 Large style references must be still images.');
  });

  it('does not apply Krea primary-reference behavior when Google is active', () => {
    const image = buildCanvasMedia('image-1');
    const images = [image];
    const { result, rerender } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'google',
      fal: buildFal(),
      onError: vi.fn(),
      onReferenceLimit: vi.fn(),
    }));

    act(() => {
      result.current.handleImageSelection(image.id);
    });
    rerender();

    act(() => {
      result.current.handleImageSelection(image.id, { reference: true });
    });

    expect(result.current.selectedImageIds).toEqual(['image-1']);
    expect(result.current.referenceImageIds).toEqual([]);
  });

  it('removes the primary image from references when leaving Krea mode', () => {
    const images = [buildCanvasMedia('image-1'), buildCanvasMedia('image-2')];
    const { result, rerender } = renderHook(
      ({ fal }: { fal: TestFalSettings }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal,
        onError: vi.fn(),
        onReferenceLimit: vi.fn(),
      }),
      { initialProps: { fal: buildFal() } },
    );

    act(() => {
      result.current.handleImageSelection('image-1');
      result.current.handleImageSelection('image-1', { reference: true });
      result.current.handleImageSelection('image-2', { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual(['image-1', 'image-2']);

    rerender({
      fal: buildFal({
        falModelId: GPT_IMAGE_2_EDIT_MODEL_ID,
        isKrea2LargeModel: false,
      }),
    });

    expect(result.current.selectedImageIds).toEqual(['image-1']);
    expect(result.current.referenceImageIds).toEqual(['image-2']);
  });

  it('trims existing GPT Image 2 references when annotate reserves an input slot', () => {
    const images = Array.from({ length: 9 }, (_, index) => buildCanvasMedia(`ref-${index + 1}`));
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(
      ({ referenceImageSlotOffset }: { referenceImageSlotOffset: number }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: buildFal({
          falModelId: GPT_IMAGE_2_EDIT_MODEL_ID,
          isKrea2LargeModel: false,
        }),
        referenceImageSlotOffset,
        onError: vi.fn(),
        onReferenceLimit,
      }),
      { initialProps: { referenceImageSlotOffset: 0 } },
    );

    act(() => {
      images.forEach(image => result.current.handleImageSelection(image.id, { reference: true }));
    });

    expect(result.current.referenceImageIds).toEqual(images.map(image => image.id));

    rerender({ referenceImageSlotOffset: 1 });

    expect(result.current.referenceImageIds).toEqual(images.slice(0, 8).map(image => image.id));
    expect(onReferenceLimit).toHaveBeenCalledWith(8);
  });

  it('does not apply GPT Image 2 reference caps or annotate slot offsets while Google is active', () => {
    const images = Array.from({ length: 14 }, (_, index) => buildCanvasMedia(`ref-${index + 1}`));
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'google',
      fal: buildFal({
        falModelId: GPT_IMAGE_2_EDIT_MODEL_ID,
        isKrea2LargeModel: false,
      }),
      referenceImageSlotOffset: 1,
      onError: vi.fn(),
      onReferenceLimit,
    }));

    act(() => {
      images.forEach(image => result.current.handleImageSelection(image.id, { reference: true }));
    });

    expect(result.current.referenceImageIds).toEqual(images.slice(0, 13).map(image => image.id));
    expect(onReferenceLimit).toHaveBeenCalledWith(13);
    expect(onReferenceLimit).not.toHaveBeenCalledWith(8);
  });
});
