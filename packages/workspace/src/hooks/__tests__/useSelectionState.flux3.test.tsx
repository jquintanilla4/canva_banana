import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FLUX_3_VIDEO_MODEL_ID, GROK_IMAGINE_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasImage, Flux3Variant } from '../../types';
import { useSelectionState } from '../useSelectionState';

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
}); // Minimal canvas media keeps the test focused on Flux selection roles.

const createFalStub = (
  flux3Variant: Flux3Variant,
  modelId: typeof FLUX_3_VIDEO_MODEL_ID | typeof GROK_IMAGINE_VIDEO_MODEL_ID = FLUX_3_VIDEO_MODEL_ID,
) => ({
  falModelId: modelId,
  falModelMode: 'video' as const,
  falVideoModelId: modelId,
  klingVariant: 'standard' as const,
  klingO3Variant: 'reference' as const,
  isKlingProVideoSelection: false,
  isKlingO3VideoModel: false,
  isKlingV3ControlVideoModel: false,
  isKlingO3EditMode: false,
  isLipsyncVideoModel: false,
  isHeygenV3LipsyncVideoModel: false,
  isInfinitalkVideoModel: false,
  isWan27VideoModel: false,
  isSeedance15VideoModel: false,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart' as const,
  isVeo31VideoModel: false,
  veo31Variant: 'i2v-fflf' as const,
  isFlux3VideoModel: modelId === FLUX_3_VIDEO_MODEL_ID,
  flux3Variant,
});

describe('useSelectionState (Flux 3)', () => {
  it.each([
    'smart',
    'first-last-frame',
    'extend',
  ] as const)('does not retain generic reference images in %s mode', (variant) => {
    const image = buildImage(`flux-${variant}-reference`);
    const { result } = renderHook(() => useSelectionState({
      images: [image],
      apiProvider: 'fal',
      fal: createFalStub(variant),
      onError: vi.fn(),
      onReferenceLimit: vi.fn(),
    }));

    act(() => {
      result.current.handleImageSelection(image.id, { reference: true });
    });

    expect(result.current.referenceImageIds).toEqual([]);
  });

  it('accepts a tail frame immediately after switching to First & Last Frame', () => {
    const images = [buildImage('flux-first-frame'), buildImage('flux-last-frame')];
    const onError = vi.fn();
    const onReferenceLimit = vi.fn();
    const { result, rerender } = renderHook(
      ({ variant }: { variant: Flux3Variant }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: createFalStub(variant),
        onError,
        onReferenceLimit,
      }),
      { initialProps: { variant: 'smart' as Flux3Variant } },
    );

    act(() => {
      result.current.handleImageSelection(images[0].id);
    });
    rerender({ variant: 'first-last-frame' });
    act(() => {
      result.current.handleImageSelection(images[1].id, { lastFrame: true });
    });

    expect(result.current.primaryImageId).toBe(images[0].id);
    expect(result.current.videoLastFrameImageId).toBe(images[1].id);
  });

  it.each([
    'smart',
    'first-last-frame',
    'extend',
  ] as const)('clears Keyframes picks instead of promoting them when switching to %s', (variant) => {
    const images = [
      buildImage('flux-keyframe-1'),
      buildImage('flux-keyframe-2'),
      buildImage('flux-keyframe-3'),
    ];
    const { result, rerender } = renderHook(
      ({ activeVariant }: { activeVariant: Flux3Variant }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: createFalStub(activeVariant),
        onError: vi.fn(),
        onReferenceLimit: vi.fn(),
      }),
      { initialProps: { activeVariant: 'keyframes' as Flux3Variant } },
    );

    act(() => {
      result.current.handleImageSelection(images[0].id, { multi: true });
      result.current.handleImageSelection(images[1].id, { multi: true });
      result.current.handleImageSelection(images[2].id, { reference: true });
    });
    expect(result.current.selectedImageIds).toEqual(['flux-keyframe-1', 'flux-keyframe-2']);
    expect(result.current.referenceImageIds).toEqual(['flux-keyframe-3']);

    rerender({ activeVariant: variant });

    expect(result.current.selectedImageIds).toEqual([]);
    expect(result.current.referenceImageIds).toEqual([]);
    expect(result.current.referenceVideoIds).toEqual([]);
    expect(result.current.referenceAudioIds).toEqual([]);
    expect(result.current.seedanceReferenceOrderIds).toEqual([]);
    expect(result.current.videoLastFrameImageId).toBeNull();
  });

  it('clears Keyframes picks when switching to another model', () => {
    const images = [buildImage('flux-keyframe-1'), buildImage('flux-keyframe-2')];
    const { result, rerender } = renderHook(
      ({ modelId }: { modelId: typeof FLUX_3_VIDEO_MODEL_ID | typeof GROK_IMAGINE_VIDEO_MODEL_ID }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: createFalStub('keyframes', modelId),
        onError: vi.fn(),
        onReferenceLimit: vi.fn(),
      }),
      { initialProps: { modelId: FLUX_3_VIDEO_MODEL_ID } },
    );

    act(() => {
      result.current.handleImageSelection(images[0].id, { multi: true });
      result.current.handleImageSelection(images[1].id, { reference: true });
    });

    rerender({ modelId: GROK_IMAGINE_VIDEO_MODEL_ID });

    expect(result.current.selectedImageIds).toEqual([]);
    expect(result.current.referenceImageIds).toEqual([]);
    expect(result.current.seedanceReferenceOrderIds).toEqual([]);
    expect(result.current.primaryImageId).toBeNull();
  });

  it('preserves inputs restored while leaving Keyframes', () => {
    const images = [buildImage('flux-keyframe'), buildImage('restored-first-frame')];
    const { result, rerender } = renderHook(
      ({ variant }: { variant: Flux3Variant }) => useSelectionState({
        images,
        apiProvider: 'fal',
        fal: createFalStub(variant),
        onError: vi.fn(),
        onReferenceLimit: vi.fn(),
      }),
      { initialProps: { variant: 'keyframes' as Flux3Variant } },
    );

    act(() => {
      result.current.handleImageSelection(images[0].id, { multi: true });
    });
    act(() => {
      result.current.setSelectedImageIds([images[1].id]);
      rerender({ variant: 'first-last-frame' });
    });

    expect(result.current.selectedImageIds).toEqual(['restored-first-frame']);
    expect(result.current.primaryImageId).toBe('restored-first-frame');
  });
});
