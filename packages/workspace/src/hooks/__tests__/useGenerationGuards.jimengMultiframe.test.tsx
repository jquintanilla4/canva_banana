import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JIMENG_MULTIFRAME_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { Tool } from '../../types';
import { useGenerationGuards } from '../useGenerationGuards';

const buildGuardArgs = (
  selectedStillImageCount: number,
  selectedMediaCount = selectedStillImageCount,
  prompt = selectedStillImageCount > 2
    ? Array.from({ length: selectedStillImageCount - 1 }, (_, index) => `Transition ${index + 1}`).join(' || ')
    : 'Move smoothly between each scene',
): Parameters<typeof useGenerationGuards>[0] => ({
  apiProvider: 'fal',
  appMode: 'CANVAS',
  tool: Tool.FREE_SELECTION,
  prompt,
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
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  seedance2ReferenceAssetCount: 0,
  veo31Variant: 'i2v-fflf',
  falModelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  falNumImages: 1,
  activePrimaryImage: selectedStillImageCount > 0 ? {} : null,
  primarySelectionMediaType: selectedMediaCount > 0 ? 'image' : null,
  hasSelectedStillImage: selectedStillImageCount > 0,
  selectedMediaCount,
  selectedStillImageCount,
});

describe('useGenerationGuards (Jimeng Multi-frame)', () => {
  it.each([
    [0, true, 'Jimeng Multi-frame requires between 2 and 20 selected still images.'],
    [1, true, 'Jimeng Multi-frame requires between 2 and 20 selected still images.'],
    [2, false, null],
    [20, false, null],
    [21, true, 'Jimeng Multi-frame requires between 2 and 20 selected still images.'],
  ])('gates %i selected still images', (selectedStillImageCount, submitDisabled, submitDisabledReason) => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs(selectedStillImageCount)));

    expect(result.current.submitDisabled).toBe(submitDisabled);
    expect(result.current.submitDisabledReason).toBe(submitDisabledReason);
  });

  it('rejects a selection containing non-image media', () => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs(2, 3)));

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.submitDisabledReason).toBe('Jimeng Multi-frame only accepts still images.');
  });

  it.each([
    ['', true, 'Jimeng Multi-frame requires 2 transition prompts separated by ||.'],
    ['First transition', true, 'Jimeng Multi-frame requires 2 transition prompts separated by ||.'],
    ['First transition || Second transition', false, null],
    ['First transition || || Second transition', false, null],
  ])('gates three-frame transition prompt %j', (prompt, submitDisabled, submitDisabledReason) => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs(3, 3, prompt)));

    expect(result.current.submitDisabled).toBe(submitDisabled);
    expect(result.current.submitDisabledReason).toBe(submitDisabledReason);
  });
});
