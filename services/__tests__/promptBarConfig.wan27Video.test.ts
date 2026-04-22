import { describe, expect, it, vi } from 'vitest';
import {
  WAN_27_VIDEO_MODEL_ID,
} from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';

describe('promptBarConfig (Wan 2.7 Video)', () => {
  it('shows Wan 2.7 smart controls and omits the removed multi-shots control', () => {
    const controls = buildPromptBarModelControls({
      apiProvider: 'fal',
      falModelId: WAN_27_VIDEO_MODEL_ID,
      falModelMode: 'video',
      isVideoMode: true,
      usingFal: true,
      isWan27VideoModel: true,
      wan27VideoResolution: '1080p',
      wan27VideoDuration: '5',
      wan27VideoAspectRatio: '16:9',
      wan27VideoPromptExpansion: true,
      wan27VideoVariant: 'smart',
      isLoading: false,
      onWan27VideoResolutionChange: vi.fn(),
      onWan27VideoDurationChange: vi.fn(),
      onWan27VideoAspectRatioChange: vi.fn(),
      onWan27VideoPromptExpansionChange: vi.fn(),
      onWan27VideoVariantChange: vi.fn(),
    } as unknown as PromptBarControlsInput);
    const controlIds = controls?.map(control => control.id) ?? [];

    expect(controlIds).toEqual([
      'wan27-video-variant-select',
      'wan27-video-aspect-ratio-select',
      'wan27-video-resolution-select',
      'wan27-video-duration-select',
      'wan27-video-prompt-expansion-select',
    ]);
    expect(controlIds).not.toContain('wan26-multi-shots-select');
  });

  it('shows Wan 2.7 reference controls without prompt expansion and limits duration options', () => {
    const controls = buildPromptBarModelControls({
      apiProvider: 'fal',
      falModelId: WAN_27_VIDEO_MODEL_ID,
      falModelMode: 'video',
      isVideoMode: true,
      usingFal: true,
      isWan27VideoModel: true,
      wan27VideoResolution: '1080p',
      wan27VideoDuration: '10',
      wan27VideoAspectRatio: '16:9',
      wan27VideoPromptExpansion: true,
      wan27VideoVariant: 'reference',
      isLoading: false,
      onWan27VideoResolutionChange: vi.fn(),
      onWan27VideoDurationChange: vi.fn(),
      onWan27VideoAspectRatioChange: vi.fn(),
      onWan27VideoPromptExpansionChange: vi.fn(),
      onWan27VideoVariantChange: vi.fn(),
    } as unknown as PromptBarControlsInput);
    const controlIds = controls?.map(control => control.id) ?? [];
    const durationControl = controls?.find(control => control.id === 'wan27-video-duration-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(controlIds).toEqual([
      'wan27-video-variant-select',
      'wan27-video-aspect-ratio-select',
      'wan27-video-resolution-select',
      'wan27-video-duration-select',
    ]);
    expect(durationControl && 'options' in durationControl ? durationControl.options.map(option => option.value) : []).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });
});
