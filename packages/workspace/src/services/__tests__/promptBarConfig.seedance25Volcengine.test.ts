import { describe, expect, it, vi } from 'vitest';
import { buildSeedance2PromptBarControls } from '../promptBarConfig';

type Seedance2ControlsInput = Parameters<typeof buildSeedance2PromptBarControls>[0]; // Reuse the runtime signature so tests stay aligned.

const buildInput = (overrides: Partial<Seedance2ControlsInput> = {}): Seedance2ControlsInput => ({
  seedance2Variant: 'reference',
  seedance2VolcengineModel: 'seedance25',
  seedance2AspectRatio: 'adaptive',
  seedance2Resolution: '720p',
  seedance2Duration: 'auto',
  seedance2GenerateAudio: true,
  seedance2CameraFixed: false,
  seedance2OutputFormat: 'mp4',
  showVolcengineModelPicker: true,
  isLoading: false,
  onSeedance2VariantChange: vi.fn(),
  onSeedance2AspectRatioChange: vi.fn(),
  onSeedance2ResolutionChange: vi.fn(),
  onSeedance2DurationChange: vi.fn(),
  onSeedance2GenerateAudioChange: vi.fn(),
  onSeedance2CameraFixedChange: vi.fn(),
  onSeedance2OutputFormatChange: vi.fn(),
  ...overrides,
}); // Volcengine 2.5 defaults keep each control test focused on one delta.

describe('promptBarConfig (Volcengine Seedance 2.5)', () => {
  it('offers the 2.5 sub-model with Auto plus 4-30s durations and the format picker', () => {
    const controls = buildSeedance2PromptBarControls(buildInput());
    const ids = controls.map(control => control.id);

    expect(ids).toContain('seedance2-output-format-select');
    expect(ids).not.toContain('seedance2-camera-fixed-select'); // 2.5 hides the unsupported fixed-camera toggle.

    const model = controls.find(control => control.id === 'seedance2-volcengine-model-select');
    expect(model && 'options' in model ? model.options.map(option => option.value) : []).toEqual(['standard', 'fast', 'mini', 'seedance25']);
    expect(model && 'value' in model ? model.value : undefined).toBe('seedance25');

    const duration = controls.find(control => control.id === 'seedance2-duration-select');
    expect(duration && 'options' in duration ? duration.options.map(option => option.value) : []).toEqual([
      'auto', ...Array.from({ length: 27 }, (_, index) => `${index + 4}`),
    ]);
    expect(duration && 'value' in duration ? duration.value : undefined).toBe('auto');

    const resolution = controls.find(control => control.id === 'seedance2-resolution-select');
    const resolutionOptions = resolution && 'options' in resolution ? resolution.options : [];
    expect(resolutionOptions.find(option => option.value === '1080p')?.disabled).toBe(true);
    expect(resolutionOptions.find(option => option.value === '4k')?.disabled).toBe(true);

    const format = controls.find(control => control.id === 'seedance2-output-format-select');
    expect(format && 'options' in format ? format.options.map(option => option.value) : []).toEqual(['mp4', 'mov']);
    expect(format && 'value' in format ? format.value : undefined).toBe('mp4');
  });

  it('offers Auto plus 4-15s durations for the 2.0 sub-models', () => {
    const controls = buildSeedance2PromptBarControls(buildInput({
      seedance2VolcengineModel: 'standard',
      seedance2Duration: '5',
    }));
    const ids = controls.map(control => control.id);

    expect(ids).toContain('seedance2-camera-fixed-select');
    expect(ids).not.toContain('seedance2-output-format-select');

    const duration = controls.find(control => control.id === 'seedance2-duration-select');
    expect(duration && 'options' in duration ? duration.options.map(option => option.value) : []).toEqual(
      ['auto', ...Array.from({ length: 12 }, (_, index) => `${index + 4}`)],
    ); // Volcengine 2.0 supports Auto or an explicit 4-15s duration.

    const resolution = controls.find(control => control.id === 'seedance2-resolution-select');
    const resolutionOptions = resolution && 'options' in resolution ? resolution.options : [];
    expect(resolutionOptions.find(option => option.value === '4k')?.disabled).toBe(false); // Standard keeps 4K.
  });

  it('keeps the aspect ratio editable for the 2.5 Smart variant', () => {
    const controls = buildSeedance2PromptBarControls(buildInput({
      seedance2Variant: 'smart',
      seedance2AspectRatio: '16:9',
    }));

    const aspectRatio = controls.find(control => control.id === 'seedance2-aspect-ratio-select');
    expect(aspectRatio && 'value' in aspectRatio ? aspectRatio.value : undefined).toBe('16:9');
    expect(aspectRatio?.disabled).toBe(false);
  });

  it('locks the aspect ratio to Adaptive for 2.5 Smart with a first frame', () => {
    const controls = buildSeedance2PromptBarControls(buildInput({
      seedance2Variant: 'smart',
      seedance2AspectRatio: '16:9',
      seedance2HasFirstFrame: true,
    }));

    const aspectRatio = controls.find(control => control.id === 'seedance2-aspect-ratio-select');
    expect(aspectRatio && 'value' in aspectRatio ? aspectRatio.value : undefined).toBe('adaptive');
    expect(aspectRatio?.disabled).toBe(true);
  });

  it('locks the aspect ratio to Adaptive for the 2.5 Extend variant', () => {
    const controls = buildSeedance2PromptBarControls(buildInput({
      seedance2Variant: 'extend',
      seedance2AspectRatio: '16:9',
    }));

    const aspectRatio = controls.find(control => control.id === 'seedance2-aspect-ratio-select');
    expect(aspectRatio && 'value' in aspectRatio ? aspectRatio.value : undefined).toBe('adaptive');
    expect(aspectRatio?.disabled).toBe(true);

    const duration = controls.find(control => control.id === 'seedance2-duration-select');
    expect(duration?.disabled).toBe(false); // Smart and Extend keep the duration picker editable.
  });

  it('locks the 2.5 Edit variant to Adaptive ratio and Auto duration', () => {
    const controls = buildSeedance2PromptBarControls(buildInput({
      seedance2Variant: 'edit',
      seedance2AspectRatio: '16:9',
      seedance2Duration: '10',
    }));

    const aspectRatio = controls.find(control => control.id === 'seedance2-aspect-ratio-select');
    expect(aspectRatio && 'value' in aspectRatio ? aspectRatio.value : undefined).toBe('adaptive');
    expect(aspectRatio?.disabled).toBe(true);

    const duration = controls.find(control => control.id === 'seedance2-duration-select');
    expect(duration && 'value' in duration ? duration.value : undefined).toBe('auto');
    expect(duration?.disabled).toBe(true);
  });

  it('forwards output-format changes through the callback', () => {
    const onSeedance2OutputFormatChange = vi.fn();
    const controls = buildSeedance2PromptBarControls(buildInput({ onSeedance2OutputFormatChange }));
    const format = controls.find(control => control.id === 'seedance2-output-format-select');

    if (format && 'onChange' in format) {
      format.onChange('mov');
    }

    expect(onSeedance2OutputFormatChange).toHaveBeenCalledWith('mov');
  });
});
