import { describe, expect, it, vi } from 'vitest';
import { FAL_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_MULTIFRAME_VIDEO_MODEL_ID, JIMENG_SEEDANCE_25_VIDEO_MODEL_ID, JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../modelConfig';
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
  seedance2VolcengineModel: 'standard',
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

  it('displays stale Jimeng resolutions safely without dispatching a second channel-change update', () => {
    const onSeedance2JimengModelVersionChange = vi.fn();
    const onSeedance2ResolutionChange = vi.fn();
    const controls = buildPromptBarModelControls(buildInput({
      seedance2JimengModelVersion: 'seedance2.0fast',
      seedance2Resolution: '1080p',
      onSeedance2JimengModelVersionChange,
      onSeedance2ResolutionChange,
    }));
    const resolution = controls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');
    const channel = controls?.find(control => control.id === 'seedance2-jimeng-channel-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(resolution && 'value' in resolution ? resolution.value : undefined).toBe('720p');
    if (channel && 'onChange' in channel) {
      channel.onChange('seedance2.0');
    }
    expect(onSeedance2JimengModelVersionChange).toHaveBeenCalledWith('seedance2.0');
    expect(onSeedance2ResolutionChange).not.toHaveBeenCalled();
  });

  it('hides the unsupported audio-generation toggle for Jimeng Seedance 2.5', () => {
    const controls = buildPromptBarModelControls(buildInput({
      falModelId: JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      isJimengSeedance25VideoModel: true,
    }));

    expect(controls?.map(control => control.id)).not.toContain('seedance25-audio-select');
  });

  it('offers only explicit durations for Jimeng Seedance 2.5', () => {
    const controls = buildPromptBarModelControls(buildInput({
      falModelId: JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      isJimengSeedance25VideoModel: true,
      seedance25Duration: 'auto',
    }));
    const duration = controls?.find(control => control.id === 'seedance25-duration-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(duration && 'options' in duration ? duration.options.map(option => option.value) : []).not.toContain('auto');
    expect(duration && 'value' in duration ? duration.value : undefined).toBe('5');
  });

  it('omits and normalizes the unsupported adaptive ratio for Jimeng Seedance 2.5', () => {
    const controls = buildPromptBarModelControls(buildInput({
      falModelId: JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      isJimengSeedance25VideoModel: true,
      seedance25AspectRatio: 'adaptive',
    }));
    const aspectRatio = controls?.find(control => control.id === 'seedance25-aspect-ratio-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(aspectRatio && 'options' in aspectRatio ? aspectRatio.options.map(option => option.value) : []).not.toContain('adaptive');
    expect(aspectRatio && 'value' in aspectRatio ? aspectRatio.value : undefined).toBe('16:9');
  });

  it('displays the actual 1080p fallback after leaving Jimeng VIP 4K', () => {
    const controls = buildPromptBarModelControls(buildInput({
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isFalSeedance2VideoModel: true,
      isJimengSeedance2VideoModel: false,
      seedance2Resolution: '4k',
    }));
    const resolution = controls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(resolution && 'value' in resolution ? resolution.value : undefined).toBe('1080p');
  });

  it('offers the documented Multi-frame duration and resolution choices', () => {
    const controls = buildPromptBarModelControls(buildInput({
      falModelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isJimengMultiframeVideoModel: true,
    }));
    const duration = controls?.find(control => control.id === 'jimeng-multiframe-duration-select' && control.kind !== 'action' && control.kind !== 'color');
    const resolution = controls?.find(control => control.id === 'jimeng-multiframe-resolution-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(duration && 'options' in duration ? duration.options.map(option => option.value) : []).toEqual(['2', '3', '4', '5', '6', '7', '8']);
    expect(resolution && 'options' in resolution ? resolution.options.map(option => option.value) : []).toEqual(['720p', '1080p']);
  });

  const buildVolcengineInput = (overrides: Partial<PromptBarControlsInput> = {}) => buildInput({
    falModelId: SEEDANCE_2_VIDEO_MODEL_ID,
    isJimengSeedance2VideoModel: false,
    ...overrides,
  });

  it('shows the Volcengine model picker only for the Volcengine provider', () => {
    const veControls = buildPromptBarModelControls(buildVolcengineInput());
    const falControls = buildPromptBarModelControls(buildInput({
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isFalSeedance2VideoModel: true,
      isJimengSeedance2VideoModel: false,
    }));

    expect(veControls?.map(control => control.id)).toContain('seedance2-volcengine-model-select');
    expect(veControls?.map(control => control.id)).not.toContain('seedance2-jimeng-channel-select');
    expect(falControls?.map(control => control.id)).not.toContain('seedance2-volcengine-model-select');
  });

  it('dispatches Volcengine model changes through the picker control', () => {
    const onSeedance2VolcengineModelChange = vi.fn();
    const controls = buildPromptBarModelControls(buildVolcengineInput({ onSeedance2VolcengineModelChange }));
    const picker = controls?.find(control => control.id === 'seedance2-volcengine-model-select' && control.kind !== 'action' && control.kind !== 'color');

    if (picker && 'onChange' in picker) {
      picker.onChange('mini');
    }
    expect(onSeedance2VolcengineModelChange).toHaveBeenCalledWith('mini');
  });

  it('enables every resolution for the Volcengine standard model', () => {
    const controls = buildPromptBarModelControls(buildVolcengineInput({ seedance2Resolution: '4k' }));
    const resolution = controls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(resolution && 'value' in resolution ? resolution.value : undefined).toBe('4k'); // No non-Jimeng 4K fallback for Volcengine standard.
    expect(resolution && 'options' in resolution ? resolution.options.every(option => !option.disabled) : undefined).toBe(true);
  });

  it.each(['fast', 'mini'] as const)('limits the Volcengine %s model to 480p and 720p', model => {
    const controls = buildPromptBarModelControls(buildVolcengineInput({ seedance2VolcengineModel: model, seedance2Resolution: '4k' }));
    const resolution = controls?.find(control => control.id === 'seedance2-resolution-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(resolution && 'value' in resolution ? resolution.value : undefined).toBe('720p');
    expect(resolution && 'options' in resolution ? resolution.options.find(option => option.value === '1080p')?.disabled : undefined).toBe(true);
    expect(resolution && 'options' in resolution ? resolution.options.find(option => option.value === '4k')?.disabled : undefined).toBe(true);
    expect(resolution && 'options' in resolution ? resolution.options.find(option => option.value === '480p')?.disabled : undefined).toBeFalsy();
    expect(resolution && 'options' in resolution ? resolution.options.find(option => option.value === '720p')?.disabled : undefined).toBeFalsy();
  });

  const getVariantValues = (controls: ReturnType<typeof buildPromptBarModelControls>) => {
    const variant = controls?.find(control => control.id === 'seedance2-variant-select' && control.kind !== 'action' && control.kind !== 'color');
    return variant && 'options' in variant ? variant.options.map(option => option.value) : [];
  };

  it('offers Edit and Extend variants only for the Volcengine provider', () => {
    const veControls = buildPromptBarModelControls(buildVolcengineInput());
    const falControls = buildPromptBarModelControls(buildInput({
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isFalSeedance2VideoModel: true,
      isJimengSeedance2VideoModel: false,
    }));
    const jimengControls = buildPromptBarModelControls(buildInput());

    expect(getVariantValues(veControls)).toEqual(['smart', 'reference', 'edit', 'extend']);
    expect(getVariantValues(falControls)).toEqual(['smart', 'reference']);
    expect(getVariantValues(jimengControls)).toEqual(['smart', 'reference']);
  });

  it('displays stray Edit/Extend state as Reference on non-Volcengine providers', () => {
    const controls = buildPromptBarModelControls(buildInput({
      falModelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      isFalSeedance2VideoModel: true,
      isJimengSeedance2VideoModel: false,
      seedance2Variant: 'edit',
    }));
    const variant = controls?.find(control => control.id === 'seedance2-variant-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(variant && 'value' in variant ? variant.value : undefined).toBe('reference');
  });
});
