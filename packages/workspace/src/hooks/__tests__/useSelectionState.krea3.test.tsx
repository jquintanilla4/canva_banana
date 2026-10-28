import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import {
  GPT_IMAGE_2_EDIT_MODEL_ID,
  GPT_IMAGE_25_MODEL_ID,
  IDEOGRAM_45_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  KREA_3_MODEL_ID,
} from '../../services/modelConfig';
import { Tool, type CanvasImage } from '../../types';
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
  falModelId: KREA_3_MODEL_ID,
  falModelMode: 'image',
  falVideoModelId: MINIMAX_H3_VIDEO_MODEL_ID,
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
  isKlingV3ControlVideoModel: false,
  isSeedance15VideoModel: false,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  isVeo31VideoModel: false,
  veo31Variant: 'i2v-fflf',
  ...overrides,
});

describe('useSelectionState (image references)', () => {
  it('rejects audio references for Krea 3 while allowing still images and clearing references', () => {
    const source = buildCanvasMedia('source');
    const reference = buildCanvasMedia('reference');
    const audio: CanvasImage = {
      ...buildCanvasMedia('audio'), mediaType: 'audio', audioElement: document.createElement('audio'),
      file: new File(['audio'], 'audio.wav', { type: 'audio/wav' }),
    };
    const images = [source, reference, audio];
    const onError = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images, apiProvider: 'fal', fal: buildFal(), onError, onReferenceLimit: vi.fn(),
    }));

    act(() => result.current.handleImageSelection(source.id));
    act(() => result.current.handleImageSelection(audio.id, { reference: true }));
    expect(result.current.referenceImageIds).toEqual([]);
    expect(onError).toHaveBeenCalledWith('Reference images must be still images.');

    onError.mockClear();
    act(() => result.current.handleImageSelection(reference.id, { reference: true }));
    expect(result.current.referenceImageIds).toEqual([reference.id]);
    act(() => result.current.handleImageSelection(null, { reference: true }));
    expect(result.current.referenceImageIds).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps the Krea 3 primary separate and caps additional references at seven', () => {
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
    });
    act(() => {
      images.forEach(image => result.current.handleImageSelection(image.id, { reference: true }));
    });

    expect(result.current.selectedImageIds).toEqual(['image-1']);
    expect(result.current.referenceImageIds).toEqual(images.slice(1, 8).map(image => image.id));
    expect(onReferenceLimit).toHaveBeenCalledWith(7);
  });

  it.each([{ modelId: KREA_3_MODEL_ID, limit: 7 }, { modelId: GPT_IMAGE_2_EDIT_MODEL_ID, limit: 9 }, { modelId: GPT_IMAGE_25_MODEL_ID, limit: 15 }, { modelId: IDEOGRAM_45_MODEL_ID, limit: 4 }])('trims $modelId references when annotate reserves an input slot', ({ modelId, limit }) => {
    const images = Array.from({ length: limit }, (_, index) => buildCanvasMedia(`ref-${index + 1}`));
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(
      ({ tool }: { tool: Tool }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: buildFal({
          falModelId: modelId,
        }),
        tool,
        onError: vi.fn(),
        onReferenceLimit,
      }),
      { initialProps: { tool: Tool.SELECTION } },
    );

    act(() => {
      images.forEach(image => result.current.handleImageSelection(image.id, { reference: true }));
    });

    expect(result.current.referenceImageIds).toEqual(images.map(image => image.id));

    rerender({ tool: Tool.ANNOTATE });

    expect(result.current.referenceImageIds).toEqual(images.slice(0, limit - 1).map(image => image.id));
    expect(onReferenceLimit).toHaveBeenCalledWith(limit - 1);
    act(() => result.current.handleImageSelection(images[limit - 1].id, { reference: true }));
    expect(result.current.referenceImageIds).toHaveLength(limit - 1);
    rerender({ tool: Tool.SELECTION });
    act(() => result.current.handleImageSelection(images[limit - 1].id, { reference: true }));
    expect(result.current.referenceImageIds).toHaveLength(limit);
  });

  it('does not apply GPT Image 2 reference caps or annotate slot offsets while Google is active', () => {
    const images = Array.from({ length: 14 }, (_, index) => buildCanvasMedia(`ref-${index + 1}`));
    const onReferenceLimit = vi.fn();
    const { result } = renderHook(() => useSelectionState({
      images,
      apiProvider: 'google',
      fal: buildFal({
        falModelId: GPT_IMAGE_2_EDIT_MODEL_ID,
      }),
      tool: Tool.ANNOTATE,
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
