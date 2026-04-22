import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HEYGEN_V3_LIPSYNC_MODEL_ID } from '../../services/modelConfig';
import { Tool } from '../../types';
import { useGenerationGuards } from '../useGenerationGuards';

const buildGuardArgs = (overrides: Partial<Parameters<typeof useGenerationGuards>[0]> = {}): Parameters<typeof useGenerationGuards>[0] => ({
  apiProvider: 'fal',
  appMode: 'CANVAS',
  tool: Tool.FREE_SELECTION,
  prompt: '',
  isKlingO1EditMode: false,
  isKlingO1RefV2VMode: false,
  hasSourceVideo: true,
  hasSourceAudio: true,
  isVideoMode: true,
  isUpscaleModel: false,
  isSeedreamModel: false,
  isNanoBananaModel: false,
  isGrokModel: false,
  isGrokImagineVideoModel: false,
  isKlingVideoModel: false,
  isKling26ControlVideoModel: false,
  isHailuoVideoModel: false,
  isVeo31VideoModel: false,
  isSeedance2VideoModel: false,
  seedance2Variant: 'smart',
  seedance2ReferenceAssetCount: 0,
  veo31Variant: 'i2v-fflf',
  falModelId: HEYGEN_V3_LIPSYNC_MODEL_ID,
  falNumImages: 1,
  activePrimaryImage: null,
  primarySelectionMediaType: 'video',
  hasSelectedStillImage: false,
  ...overrides,
});

describe('useGenerationGuards (HeyGen V3 Lipsync)', () => {
  it('allows promptless submission when video and audio are selected', () => {
    const { result } = renderHook(() => useGenerationGuards(buildGuardArgs()));

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.disablePromptInput).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('describe the video segment to lip sync');
  });

  it('requires both source video and source audio', () => {
    const missingVideo = renderHook(() => useGenerationGuards(buildGuardArgs({ hasSourceVideo: false })));
    const missingAudio = renderHook(() => useGenerationGuards(buildGuardArgs({ hasSourceAudio: false })));

    expect(missingVideo.result.current.submitDisabled).toBe(true);
    expect(missingAudio.result.current.submitDisabled).toBe(true);
  });
});
