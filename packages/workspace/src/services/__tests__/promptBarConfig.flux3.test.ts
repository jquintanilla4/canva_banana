import { describe, expect, it, vi } from 'vitest';
import { buildFlux3PromptBarControls } from '../promptBarConfig';

const buildControls = (overrides: Partial<Parameters<typeof buildFlux3PromptBarControls>[0]> = {}) => buildFlux3PromptBarControls({
  variant: 'smart',
  aspectRatio: 'auto',
  resolution: '720p',
  duration: 'auto',
  generateAudio: true,
  keyframeTimings: [],
  isLoading: false,
  onVariantChange: vi.fn(),
  onAspectRatioChange: vi.fn(),
  onResolutionChange: vi.fn(),
  onDurationChange: vi.fn(),
  onGenerateAudioChange: vi.fn(),
  onKeyframeTimingChange: vi.fn(),
  ...overrides,
});

describe('promptBarConfig (Flux 3)', () => {
  it('builds Seedance-style controls in the requested order and defaults', () => {
    const controls = buildControls();

    expect(controls.map(control => control.id)).toEqual([
      'flux3-variant-select',
      'flux3-aspect-ratio-select',
      'flux3-duration-select',
      'flux3-resolution-select',
      'flux3-audio-select',
    ]);
    expect(controls.map(control => 'value' in control ? control.value : undefined)).toEqual([
      'smart', 'auto', 'auto', '720p', 'true',
    ]);
  });

  it('offers all variants and documented aspect ratios, resolutions, and durations', () => {
    const controls = buildControls();
    const values = (id: string) => {
      const control = controls.find(candidate => candidate.id === id);
      return control && 'options' in control ? control.options.map(option => option.value) : [];
    };

    expect(values('flux3-variant-select')).toEqual(['smart', 'first-last-frame', 'keyframes', 'extend']);
    expect(values('flux3-aspect-ratio-select')).toEqual(['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16']);
    expect(values('flux3-resolution-select')).toEqual(['720p', '1080p']);
    expect(values('flux3-duration-select')).toEqual(['auto', ...Array.from({ length: 16 }, (_, index) => `${index + 5}`)]);
  });

  it('requires explicit Keyframes duration and adds the timing popover', () => {
    const controls = buildControls({
      variant: 'keyframes',
      keyframeTimings: [
        { imageId: 'a', timestampSeconds: 0 },
        { imageId: 'b', timestampSeconds: 5 },
      ],
      keyframeError: 'Timing error',
    });
    const duration = controls.find(control => control.id === 'flux3-duration-select');
    const keyframes = controls.find(control => control.kind === 'keyframes');

    expect(duration && 'options' in duration ? duration.options[0]?.value : undefined).toBe('5');
    expect(duration && 'value' in duration ? duration.value : undefined).toBe('5');
    expect(keyframes).toEqual(expect.objectContaining({
      label: 'Keyframes 2',
      durationSeconds: 5,
      errorMessage: 'Timing error',
    }));
  });
});
