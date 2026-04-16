import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tool } from '../../types';
import { SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useGenerationGuards } from '../useGenerationGuards';

describe('useGenerationGuards (seedance 2)', () => {
  it('disables submit when smart mode has a non-image selection', () => {
    const { result } = renderHook(() => useGenerationGuards({
      apiProvider: 'fal',
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Animate this shot',
      isKlingO1EditMode: false,
      isKlingO1RefV2VMode: false,
      hasSourceVideo: false,
      hasSourceAudio: false,
      isVideoMode: true,
      isUpscaleModel: false,
      isSeedreamModel: false,
      isNanoBananaModel: false,
      isReveModel: false,
      isKlingModel: false,
      isGrokModel: false,
      isGrokImagineVideoModel: false,
      isKlingVideoModel: false,
      isKling26VideoModel: false,
      isKling26ControlVideoModel: false,
      isHailuoVideoModel: false,
      isVeo31VideoModel: false,
      isSeedance2VideoModel: true,
      seedance2Variant: 'smart',
      seedance2ReferenceAssetCount: 0,
      veo31Variant: 'i2v-fflf',
      falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
      falNumImages: 1,
      activePrimaryImage: null,
      primarySelectionMediaType: 'video',
      hasSelectedStillImage: false,
    }));

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('still image as the first frame');
  });

  it('keeps text-to-video enabled in smart mode when nothing is selected', () => {
    const { result } = renderHook(() => useGenerationGuards({
      apiProvider: 'fal',
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Generate a cinematic flythrough',
      isKlingO1EditMode: false,
      isKlingO1RefV2VMode: false,
      hasSourceVideo: false,
      hasSourceAudio: false,
      isVideoMode: true,
      isUpscaleModel: false,
      isSeedreamModel: false,
      isNanoBananaModel: false,
      isReveModel: false,
      isKlingModel: false,
      isGrokModel: false,
      isGrokImagineVideoModel: false,
      isKlingVideoModel: false,
      isKling26VideoModel: false,
      isKling26ControlVideoModel: false,
      isHailuoVideoModel: false,
      isVeo31VideoModel: false,
      isSeedance2VideoModel: true,
      seedance2Variant: 'smart',
      seedance2ReferenceAssetCount: 0,
      veo31Variant: 'i2v-fflf',
      falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
      falNumImages: 1,
      activePrimaryImage: null,
      primarySelectionMediaType: null,
      hasSelectedStillImage: false,
    }));

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Describe the video you want to create');
  });
});
