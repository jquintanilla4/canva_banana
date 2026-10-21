import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tool } from '../../types';
import { FAL_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_SEEDANCE_25_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useGenerationGuards } from '../useGenerationGuards';

describe('useGenerationGuards (seedance 2)', () => {
  it('disables submit when smart mode has a non-image selection', () => {
    const { result } = renderHook(() => useGenerationGuards({
      apiProvider: 'fal',
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: 'Animate this shot',
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
      isSeedance2VideoModel: true,
      seedance2Variant: 'smart',
      seedance2ReferenceAssetCount: 0,
      veo31Variant: 'i2v-fflf',
      falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
      falNumImages: 1,
      activePrimaryImage: null,
      primarySelectionMediaType: 'video',
      hasSelectedStillImage: false,
      selectedMediaCount: 1,
      selectedStillImageCount: 0,
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
      isSeedance2VideoModel: true,
      seedance2Variant: 'smart',
      seedance2ReferenceAssetCount: 0,
      veo31Variant: 'i2v-fflf',
      falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
      falNumImages: 1,
      activePrimaryImage: null,
      primarySelectionMediaType: null,
      hasSelectedStillImage: false,
      selectedMediaCount: 0,
      selectedStillImageCount: 0,
    }));

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Describe the video you want to create');
  });

  it.each([
    [JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, true, false, false],
    [JIMENG_SEEDANCE_25_VIDEO_MODEL_ID, false, true, false],
    [FAL_SEEDANCE_2_VIDEO_MODEL_ID, true, false, true],
  ])('applies the provider prompt rule for reference model %s', (falModelId, isSeedance2VideoModel, isSeedance25VideoModel, submitDisabled) => {
    const { result } = renderHook(() => useGenerationGuards({
      apiProvider: 'fal',
      appMode: 'CANVAS',
      tool: Tool.FREE_SELECTION,
      prompt: '',
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
      isSeedance2VideoModel,
      seedance2Variant: 'reference',
      seedance2ReferenceAssetCount: 1,
      isSeedance25VideoModel,
      seedance25Variant: 'reference',
      seedance25ReferenceAssetCount: 1,
      veo31Variant: 'i2v-fflf',
      falModelId,
      falNumImages: 1,
      activePrimaryImage: null,
      primarySelectionMediaType: null,
      hasSelectedStillImage: false,
      selectedMediaCount: 0,
      selectedStillImageCount: 0,
    }));

    expect(result.current.submitDisabled).toBe(submitDisabled);
  });

  const buildSeedance2EditExtendArgs = (overrides: Partial<Parameters<typeof useGenerationGuards>[0]> = {}): Parameters<typeof useGenerationGuards>[0] => ({
    apiProvider: 'fal',
    appMode: 'CANVAS',
    tool: Tool.FREE_SELECTION,
    prompt: 'Extend @Video1 with a slow pan',
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
    isSeedance2VideoModel: true,
    seedance2Variant: 'edit',
    seedance2ReferenceAssetCount: 1,
    seedance2ReferenceVideoCount: 1,
    veo31Variant: 'i2v-fflf',
    falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
    falNumImages: 1,
    activePrimaryImage: null,
    primarySelectionMediaType: 'video',
    hasSelectedStillImage: false,
    selectedMediaCount: 1,
    selectedStillImageCount: 0,
    ...overrides,
  });

  it('disables Volcengine Edit submits until a video clip is attached', () => {
    const { result: missing } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      seedance2ReferenceAssetCount: 0,
      seedance2ReferenceVideoCount: 0,
      primarySelectionMediaType: null,
    })));
    const { result: ready } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs()));

    expect(missing.current.submitDisabled).toBe(true);
    expect(missing.current.promptPlaceholderText).toContain('Seedance 2 Edit');
    expect(ready.current.submitDisabled).toBe(false);
    expect(ready.current.promptPlaceholderText).toContain('@Video1');
  });

  it('disables Volcengine Extend submits until a video clip is attached', () => {
    const { result: missing } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      seedance2Variant: 'extend',
      seedance2ReferenceAssetCount: 0,
      seedance2ReferenceVideoCount: 0,
      primarySelectionMediaType: null,
    })));
    const { result: ready } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      seedance2Variant: 'extend',
    })));

    expect(missing.current.submitDisabled).toBe(true);
    expect(missing.current.promptPlaceholderText).toContain('Seedance 2 Extend');
    expect(ready.current.submitDisabled).toBe(false);
    expect(ready.current.promptPlaceholderText).toContain('@Video1');
  });

  it('treats Edit/Extend state on FAL Seedance 2 like Smart instead of a multimodal mode', () => {
    const { result } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2ReferenceAssetCount: 0,
      seedance2ReferenceVideoCount: 0,
    })));

    expect(result.current.submitDisabled).toBe(true); // The Smart unsupported-selection guard still catches stray Volcengine-only variants.
    expect(result.current.promptPlaceholderText).toContain('still image as the first frame');
  });

  it('advertises the raised Seedance 2.5 reference caps for the Volcengine 2.5 sub-model', () => {
    const { result } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      seedance2Variant: 'reference',
      seedance2VolcengineModel: 'seedance25',
      primarySelectionMediaType: null,
    })));

    expect(result.current.promptPlaceholderText).toContain('Seedance 2.5 Reference');
    expect(result.current.promptPlaceholderText).toContain('30 images, 10 videos, and 10 audio clips');
  });

  it('advertises the raised Seedance 2.5 Extend clip cap', () => {
    const { result } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      seedance2Variant: 'extend',
      seedance2VolcengineModel: 'seedance25',
      seedance2ReferenceAssetCount: 0,
      seedance2ReferenceVideoCount: 0,
      primarySelectionMediaType: null,
    })));

    expect(result.current.promptPlaceholderText).toContain('Seedance 2.5 Extend: select up to 10 video clips');
  });

  it('keeps the Seedance 2.0 caps for the standard sub-model', () => {
    const { result } = renderHook(() => useGenerationGuards(buildSeedance2EditExtendArgs({
      seedance2Variant: 'reference',
      seedance2VolcengineModel: 'standard',
      primarySelectionMediaType: null,
    })));

    expect(result.current.promptPlaceholderText).toContain('Seedance 2 Reference');
    expect(result.current.promptPlaceholderText).toContain('9 images, 3 videos, and 3 audio clips');
  });
});
