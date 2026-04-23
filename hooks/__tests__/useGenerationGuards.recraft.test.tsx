import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID } from '../../services/modelConfig';
import { Tool } from '../../types';
import { useGenerationGuards } from '../useGenerationGuards';

describe('useGenerationGuards (Recraft v4 Pro)', () => {
  it('keeps Recraft submit enabled when an image is selected in Canvas mode', () => {
    const { result } = renderHook(() => useGenerationGuards({
      apiProvider: 'fal',
      appMode: 'CANVAS',
      tool: Tool.BRUSH,
      prompt: 'Generate a clean product poster',
      isKlingO1EditMode: false,
      isKlingO1RefV2VMode: false,
      hasSourceVideo: false,
      hasSourceAudio: false,
      isVideoMode: false,
      isUpscaleModel: false,
      isSeedreamModel: false,
      isNanoBananaModel: false,
      isGrokModel: false,
      isGrokImagineVideoModel: false,
      isKlingVideoModel: false,
      isKlingV3ControlVideoModel: false,
      isHailuoVideoModel: false,
      isVeo31VideoModel: false,
      isSeedance2VideoModel: false,
      seedance2Variant: 'smart',
      seedance2ReferenceAssetCount: 0,
      veo31Variant: 'i2v-fflf',
      falModelId: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
      falNumImages: 1,
      activePrimaryImage: { id: 'selected-image' },
      primarySelectionMediaType: 'image',
      hasSelectedStillImage: true,
    }));

    expect(result.current.isTextToImage).toBe(true);
    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Describe the image you want to create');
  });

  it('does not apply the Recraft override while Google is active', () => {
    const { result } = renderHook(() => useGenerationGuards({
      apiProvider: 'google',
      appMode: 'CANVAS',
      tool: Tool.BRUSH,
      prompt: 'Retouch this product poster',
      isKlingO1EditMode: false,
      isKlingO1RefV2VMode: false,
      hasSourceVideo: false,
      hasSourceAudio: false,
      isVideoMode: false,
      isUpscaleModel: false,
      isSeedreamModel: false,
      isNanoBananaModel: false,
      isGrokModel: false,
      isGrokImagineVideoModel: false,
      isKlingVideoModel: false,
      isKlingV3ControlVideoModel: false,
      isHailuoVideoModel: false,
      isVeo31VideoModel: false,
      isSeedance2VideoModel: false,
      seedance2Variant: 'smart',
      seedance2ReferenceAssetCount: 0,
      veo31Variant: 'i2v-fflf',
      falModelId: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
      falNumImages: 1,
      activePrimaryImage: { id: 'selected-image' },
      primarySelectionMediaType: 'image',
      hasSelectedStillImage: true,
    }));

    expect(result.current.isTextToImage).toBe(false);
    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('Describe your edit');
  });
});
