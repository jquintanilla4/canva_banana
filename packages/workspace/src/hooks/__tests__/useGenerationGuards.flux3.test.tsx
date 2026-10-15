import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FLUX_3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { Tool, type CanvasImage } from '../../types';
import { useGenerationGuards } from '../useGenerationGuards';

const buildGuardArgs = (
  flux3ValidationError: string | null,
  overrides: Partial<Parameters<typeof useGenerationGuards>[0]> = {},
): Parameters<typeof useGenerationGuards>[0] => ({
  apiProvider: 'fal',
  appMode: 'CANVAS',
  tool: Tool.FREE_SELECTION,
  prompt: 'Move between the selected keyframes',
  isKlingO3EditMode: false,
  hasSourceVideo: false,
  hasSourceAudio: false,
  isVideoMode: true,
  isUpscaleModel: false,
  isSeedreamModel: false,
  isNanoBananaModel: false,
  isGrokModel: false,
  isGrokImagineVideoModel: false,
  isKlingVideoModel: false,
  isKlingO3VideoModel: false,
  isKlingV3ControlVideoModel: false,
  isVeo31VideoModel: false,
  isFlux3VideoModel: true,
  flux3InputKind: 'keyframe-images',
  flux3ValidationError,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  seedance2ReferenceAssetCount: 0,
  veo31Variant: 'i2v-fflf',
  falModelId: FLUX_3_VIDEO_MODEL_ID,
  falNumImages: 1,
  activePrimaryImage: null,
  primarySelectionMediaType: 'image',
  hasSelectedStillImage: true,
  selectedMediaCount: 2,
  selectedStillImageCount: 2,
  ...overrides,
});

describe('useGenerationGuards (Flux 3)', () => {
  it('updates the Generate gate immediately when Flux validation changes', () => {
    const validationError = 'These Flux 3 mentions do not match the selected canvas media: @Image2.';
    const { result, rerender } = renderHook(
      ({ error }: { error: string | null }) => useGenerationGuards(buildGuardArgs(error)),
      { initialProps: { error: validationError as string | null } },
    );

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.submitDisabledReason).toBe(validationError);

    rerender({ error: null });

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.submitDisabledReason).toBeNull();
  });

  it.each(['video', 'audio'] as const)('blocks Flux Smart when a %s is selected', (mediaType) => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs(null, {
      flux3InputKind: 'optional-start-image',
      primarySelectionMediaType: mediaType,
      hasSelectedStillImage: false,
      selectedMediaCount: 1,
      selectedStillImageCount: 0,
    })));

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('Clear the current video or audio selection');
  });

  it('blocks Flux Smart with multiple selected media and explains why', () => {
    const primaryImage: CanvasImage = {
      id: 'image-1',
      element: document.createElement('img'),
      mediaType: 'image',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      naturalWidth: 100,
      naturalHeight: 100,
      file: new File(['test'], 'image-1.png', { type: 'image/png' }),
    };
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs(null, {
      flux3InputKind: 'optional-start-image',
      activePrimaryImage: primaryImage,
      primarySelectionMediaType: 'image',
      selectedMediaCount: 2,
      selectedStillImageCount: 2,
    })));

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.submitDisabledReason).toBe(
      'Flux 3 Smart supports at most one selected still image. Clear extra images, videos, or audio.',
    );
  });
  it('guides Flux Extend as a source-video workflow', () => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs(null, {
      flux3InputKind: 'source-video',
      hasSourceVideo: true,
      primarySelectionMediaType: 'video',
      hasSelectedStillImage: false,
      selectedMediaCount: 1,
      selectedStillImageCount: 0,
    })));

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.isTextToImage).toBe(false);
    expect(result.current.promptPlaceholderText).toBe('Describe how you want to extend the source video...');
  });
});
