import { describe, expect, it, vi } from 'vitest';
import { JIMENG_SEEDANCE_2_VIDEO_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';

const buildInput = (overrides: Partial<PromptBarControlsInput> = {}): PromptBarControlsInput => ({
  apiProvider: 'fal',
  falModelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  falModelMode: 'video',
  isVideoMode: true,
  usingFal: true,
  isSeedance2VideoModel: true,
  isFalSeedance2VideoModel: false,
  isJimengSeedance2VideoModel: true,
  seedance2Variant: 'smart',
  seedance2JimengModelVersion: 'seedance2.0fast',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  isLoading: false,
  onSeedance2VariantChange: vi.fn(),
  onSeedance2JimengModelVersionChange: vi.fn(),
  onSeedance2AspectRatioChange: vi.fn(),
  onSeedance2ResolutionChange: vi.fn(),
  onSeedance2DurationChange: vi.fn(),
  onSeedance2GenerateAudioChange: vi.fn(),
  onSeedance2CameraFixedChange: vi.fn(),
  ...overrides,
} as unknown as PromptBarControlsInput); // Keep the fixture focused on Seedance 2 controls.

describe('promptBarConfig (Jimeng Seedance 2)', () => {
  it('shows the Jimeng channel picker', () => {
    const controls = buildPromptBarModelControls(buildInput());
    const controlIds = controls?.map(control => control.id) ?? [];

    expect(controlIds).toContain('seedance2-jimeng-channel-select');
    expect(controlIds).not.toContain('seedance2-audio-select');
  });

  it('only enables 1080p on the seedance2.0_vip channel', () => {
    const fastControls = buildPromptBarModelControls(buildInput({ seedance2JimengModelVersion: 'seedance2.0fast_vip' }));
    const fastResolution = fastControls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');
    const vipControls = buildPromptBarModelControls(buildInput({ seedance2JimengModelVersion: 'seedance2.0_vip' }));
    const vipResolution = vipControls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(fastResolution && 'options' in fastResolution ? fastResolution.options.find(option => option.value === '1080p')?.disabled : undefined).toBe(true);
    expect(vipResolution && 'options' in vipResolution ? vipResolution.options.find(option => option.value === '1080p')?.disabled : undefined).toBe(false);
  });

  it('omits adaptive aspect ratio because Jimeng rejects it', () => {
    const controls = buildPromptBarModelControls(buildInput());
    const aspectRatio = controls?.find(control => control.id === 'seedance2-aspect-ratio-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(aspectRatio && 'options' in aspectRatio ? aspectRatio.options.map(option => option.value) : []).not.toContain('adaptive');
  });

  it('coerces stale Jimeng 1080p selections to 720p on non-VIP channels', () => {
    const onSeedance2ResolutionChange = vi.fn();
    const controls = buildPromptBarModelControls(buildInput({
      seedance2JimengModelVersion: 'seedance2.0fast',
      seedance2Resolution: '1080p',
      onSeedance2ResolutionChange,
    }));
    const resolution = controls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');
    const channel = controls?.find(control => control.id === 'seedance2-jimeng-channel-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(resolution && 'value' in resolution ? resolution.value : undefined).toBe('720p');
    if (channel && 'onChange' in channel) {
      channel.onChange('seedance2.0');
    }
    expect(onSeedance2ResolutionChange).toHaveBeenCalledWith('720p');
  });
});
