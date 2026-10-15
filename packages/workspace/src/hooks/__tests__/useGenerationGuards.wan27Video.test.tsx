import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tool } from '../../types';
import { WAN_27_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useGenerationGuards } from '../useGenerationGuards';

const renderWan27Guard = (overrides: Partial<Parameters<typeof useGenerationGuards>[0]> = {}) => renderHook(() => useGenerationGuards({
  apiProvider: 'fal',
  appMode: 'CANVAS',
  tool: Tool.FREE_SELECTION,
  prompt: 'A cinematic street scene',
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
  wan27VideoVariant: 'smart',
  wan27ReferenceAssetCount: 0,
  veo31Variant: 'i2v-fflf',
  falModelId: WAN_27_VIDEO_MODEL_ID,
  falNumImages: 1,
  activePrimaryImage: null,
  primarySelectionMediaType: null,
  hasSelectedStillImage: false,
  selectedMediaCount: 0,
  selectedStillImageCount: 0,
  ...overrides,
}));

describe('useGenerationGuards (Wan 2.7 Video)', () => {
  it('keeps text-to-video enabled when no image is selected and a prompt is present', () => {
    const { result } = renderWan27Guard();

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Describe the video you want to create');
  });

  it('requires a prompt for text-to-video when no image is selected', () => {
    const { result } = renderWan27Guard({ prompt: '' });

    expect(result.current.submitDisabled).toBe(true);
  });

  it('allows audio-driven text-to-video with a prompt', () => {
    const { result } = renderWan27Guard({
      primarySelectionMediaType: 'audio',
      hasSourceAudio: true,
    });

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Describe the video you want to create');
  });

  it('allows image-to-video with a selected image and an empty prompt', () => {
    const { result } = renderWan27Guard({
      prompt: '',
      activePrimaryImage: {},
      primarySelectionMediaType: 'image',
      hasSelectedStillImage: true,
    });

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Optionally describe');
  });

  it('allows image-to-video with first-frame audio and no end frame', () => {
    const { result } = renderWan27Guard({
      prompt: '',
      activePrimaryImage: {},
      primarySelectionMediaType: 'image',
      hasSelectedStillImage: true,
      hasSourceAudio: true,
    });

    expect(result.current.submitDisabled).toBe(false);
  });

  it('allows image-to-video with first-frame audio after an end frame is selected', () => {
    const { result } = renderWan27Guard({
      activePrimaryImage: {},
      primarySelectionMediaType: 'image',
      hasSelectedStillImage: true,
      hasSourceAudio: true,
    });

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Optionally describe');
  });

  it('blocks unsupported selected video inputs until continuation is wired', () => {
    const { result } = renderWan27Guard({
      activePrimaryImage: null,
      primarySelectionMediaType: 'video',
    });

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('Clear the current video selection');
  });

  it('enables edit mode with a selected source video and prompt', () => {
    const { result } = renderWan27Guard({
      wan27VideoVariant: 'edit',
      primarySelectionMediaType: 'video',
      hasSourceVideo: true,
    });

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Describe how you want to edit this video');
  });

  it('requires a prompt and source video in edit mode', () => {
    const missingPrompt = renderWan27Guard({
      prompt: '',
      wan27VideoVariant: 'edit',
      primarySelectionMediaType: 'video',
      hasSourceVideo: true,
    });
    const missingVideo = renderWan27Guard({
      wan27VideoVariant: 'edit',
      primarySelectionMediaType: null,
      hasSourceVideo: false,
    });

    expect(missingPrompt.result.current.submitDisabled).toBe(true);
    expect(missingVideo.result.current.submitDisabled).toBe(true);
    expect(missingVideo.result.current.promptPlaceholderText).toContain('select a video');
  });

  it('requires references in Wan 2.7 reference mode', () => {
    const { result } = renderWan27Guard({
      wan27VideoVariant: 'reference',
      wan27ReferenceAssetCount: 0,
    });

    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('tag at least one image or video reference');
  });

  it('enables Wan 2.7 reference mode with a prompt and reference asset', () => {
    const { result } = renderWan27Guard({
      wan27VideoVariant: 'reference',
      wan27ReferenceAssetCount: 1,
    });

    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.promptPlaceholderText).toContain('Wan 2.7 Reference');
  });
});
