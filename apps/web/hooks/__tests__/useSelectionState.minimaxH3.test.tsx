import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionState } from '../useSelectionState';
import { MINIMAX_H3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasImage } from '../../types';
import type { UseFalSettingsResult } from '../useFalSettings';

const buildImage = (id: string): CanvasImage => ({
  id,
  element: document.createElement('img'),
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['test'], `${id}.png`, { type: 'image/png' }),
}); // Minimal canvas media keeps the test focused on reference limits.

const createFalStub = (miniMaxH3Variant: UseFalSettingsResult['miniMaxH3Variant']) => ({
  falModelId: MINIMAX_H3_VIDEO_MODEL_ID,
  falModelMode: 'video' as const,
  falVideoModelId: MINIMAX_H3_VIDEO_MODEL_ID,
  klingVariant: 'standard' as const,
  klingO3Variant: 'reference' as const,
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
  seedance2Variant: 'reference' as const,
  isVeo31VideoModel: false,
  veo31Variant: 'i2v-fflf' as const,
  isMiniMaxH3VideoModel: true,
  miniMaxH3Variant,
});

describe('useSelectionState (MiniMax H3)', () => {
  it('clears retained references when the variant switches to Standard', () => {
    const images = [buildImage('image-1'), buildImage('image-2'), buildImage('image-3')];
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(
      ({ variant }: { variant: UseFalSettingsResult['miniMaxH3Variant'] }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: createFalStub(variant),
        onError: vi.fn(),
        onReferenceLimit,
      }),
      { initialProps: { variant: 'reference' as UseFalSettingsResult['miniMaxH3Variant'] } },
    );

    act(() => {
      result.current.handleImageSelection('image-1');
      result.current.handleImageSelection('image-2', { reference: true });
      result.current.handleImageSelection('image-3', { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual(['image-2', 'image-3']);

    rerender({ variant: 'standard' as UseFalSettingsResult['miniMaxH3Variant'] });

    expect(result.current.referenceImageIds).toEqual([]); // Standard drops references at submit, so they must not linger as tagged.
    expect(onReferenceLimit).toHaveBeenCalledWith(0);
  });
});
