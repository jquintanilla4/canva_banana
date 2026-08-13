import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KLING_V3_CONTROL_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { Tool } from '../../types';
import { useGenerationGuards } from '../useGenerationGuards';

const buildGuardArgs = (overrides: Partial<Parameters<typeof useGenerationGuards>[0]> = {}): Parameters<typeof useGenerationGuards>[0] => ({
  apiProvider: 'fal',
  appMode: 'CANVAS',
  tool: Tool.FREE_SELECTION,
  prompt: '',
  isKlingO3EditMode: false,
  hasSourceVideo: true,
  hasSourceAudio: false,
  isVideoMode: true,
  isUpscaleModel: false,
  isSeedreamModel: false,
  isNanoBananaModel: false,
  isGrokModel: false,
  isGrokImagineVideoModel: false,
  isKlingVideoModel: false,
  isKlingO3VideoModel: false,
  isKlingV3ControlVideoModel: true,
  isVeo31VideoModel: false,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  seedance2ReferenceAssetCount: 0,
  veo31Variant: 'i2v-fflf',
  falModelId: KLING_V3_CONTROL_VIDEO_MODEL_ID,
  falNumImages: 1,
  activePrimaryImage: null,
  primarySelectionMediaType: 'image',
  hasSelectedStillImage: true,
  selectedMediaCount: 1,
  selectedStillImageCount: 1,
  ...overrides,
});

describe('useGenerationGuards (Kling v3 Control)', () => {
  it('allows promptless submission when motion video and character image are selected', () => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs()));

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptEmpty).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('Describe the motion or scene you want to transfer');
  });

  it('still requires a motion video and character image', () => {
    const missingVideo = renderHook(() => useGenerationGuards(buildGuardArgs({ hasSourceVideo: false })));
    const missingImage = renderHook(() => useGenerationGuards(buildGuardArgs({ hasSelectedStillImage: false })));

    expect(missingVideo.result.current.submitDisabled).toBe(true);
    expect(missingImage.result.current.submitDisabled).toBe(true);
  });
});
