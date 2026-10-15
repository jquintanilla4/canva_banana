import { describe, expect, it, vi } from 'vitest';
import { buildSeedance25PromptBarControls } from '../promptBarConfig';

describe('promptBarConfig (Seedance 2.5)', () => {
  it('builds the five pickers in order with provider defaults', () => {
    const controls = buildSeedance25PromptBarControls({
      variant: 'reference',
      aspectRatio: 'adaptive',
      duration: 'auto',
      resolution: '720p',
      generateAudio: true,
      isLoading: false,
      onVariantChange: vi.fn(),
      onAspectRatioChange: vi.fn(),
      onDurationChange: vi.fn(),
      onResolutionChange: vi.fn(),
      onGenerateAudioChange: vi.fn(),
    });

    expect(controls.map(control => control.id)).toEqual([
      'seedance25-variant-select',
      'seedance25-aspect-ratio-select',
      'seedance25-duration-select',
      'seedance25-resolution-select',
      'seedance25-audio-select',
    ]);
    expect(controls.map(control => 'value' in control ? control.value : undefined)).toEqual([
      'reference',
      'adaptive',
      'auto',
      '720p',
      'true',
    ]);
    expect(controls.map(control => control.id)).not.toContain('seedance25-camera-fixed-select');
  });

  it('offers every documented aspect ratio and Auto plus 4 through 30 seconds', () => {
    const controls = buildSeedance25PromptBarControls({
      variant: 'smart',
      aspectRatio: '16:9',
      duration: '30',
      resolution: '480p',
      generateAudio: false,
      isLoading: false,
      onVariantChange: vi.fn(),
      onAspectRatioChange: vi.fn(),
      onDurationChange: vi.fn(),
      onResolutionChange: vi.fn(),
      onGenerateAudioChange: vi.fn(),
    });
    const aspectRatio = controls.find(control => control.id === 'seedance25-aspect-ratio-select');
    const duration = controls.find(control => control.id === 'seedance25-duration-select');
    const resolution = controls.find(control => control.id === 'seedance25-resolution-select');

    expect(aspectRatio && 'options' in aspectRatio ? aspectRatio.options.map(option => option.value) : []).toEqual([
      'adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16',
    ]);
    expect(duration && 'options' in duration ? duration.options.map(option => option.value) : []).toEqual([
      'auto', ...Array.from({ length: 27 }, (_, index) => `${index + 4}`),
    ]);
    expect(resolution && 'options' in resolution ? resolution.options.map(option => option.value) : []).toEqual(['480p', '720p']);
  });

  it('locks aspect ratio to the source image for Smart image-to-video', () => {
    const onAspectRatioChange = vi.fn();
    const controls = buildSeedance25PromptBarControls({
      variant: 'smart',
      aspectRatio: '16:9',
      duration: 'auto',
      resolution: '720p',
      generateAudio: true,
      usesSourceAspectRatio: true,
      isLoading: false,
      onVariantChange: vi.fn(),
      onAspectRatioChange,
      onDurationChange: vi.fn(),
      onResolutionChange: vi.fn(),
      onGenerateAudioChange: vi.fn(),
    });
    const aspectRatio = controls.find(control => control.id === 'seedance25-aspect-ratio-select');

    expect(aspectRatio && 'value' in aspectRatio ? aspectRatio.value : undefined).toBe('source');
    expect(aspectRatio && 'options' in aspectRatio ? aspectRatio.options : []).toEqual([{ value: 'source', label: 'Source' }]);
    expect(aspectRatio?.disabled).toBe(true);
    if (aspectRatio && 'onChange' in aspectRatio) {
      aspectRatio.onChange('1:1');
    }
    expect(onAspectRatioChange).not.toHaveBeenCalled();
  });
});
