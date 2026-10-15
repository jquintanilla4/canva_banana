import { describe, expect, it, vi } from 'vitest';
import { KLING_O3_VIDEO_MODEL_ID, KLING_V3_CONTROL_VIDEO_MODEL_ID, KLING_V3_VIDEO_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';

const baseInput = {
  apiProvider: 'fal',
  falModelId: KLING_V3_VIDEO_MODEL_ID,
  falModelMode: 'video',
  isVideoMode: true,
  usingFal: true,
  isKlingV3VideoModel: true,
  klingV3Duration: '5',
  klingV3GenerateAudio: true,
  klingV3CfgScale: '0.5',
  klingV3MultiPromptEnabled: false,
  klingV3Shot1Duration: '5',
  klingV3Shot2Duration: '5',
  isLoading: false,
  onKlingV3DurationChange: vi.fn(),
  onKlingV3GenerateAudioChange: vi.fn(),
  onKlingV3CfgScaleChange: vi.fn(),
  onKlingV3MultiPromptEnabledChange: vi.fn(),
  onKlingV3Shot1DurationChange: vi.fn(),
  onKlingV3Shot2DurationChange: vi.fn(),
} as unknown as PromptBarControlsInput;

describe('promptBarConfig (Kling v3)', () => {
  it('shows single prompt controls when multi prompt is off', () => {
    const controls = buildPromptBarModelControls(baseInput);
    const controlIds = controls?.map(control => control.id) ?? [];

    expect(controlIds).toEqual([
      'kling-v3-multi-select',
      'kling-v3-duration-select',
      'kling-v3-audio-select',
      'kling-v3-cfg-select',
    ]);
  });

  it('shows shot duration controls when multi prompt is on', () => {
    const controls = buildPromptBarModelControls({
      ...baseInput,
      klingV3MultiPromptEnabled: true,
    });
    const controlIds = controls?.map(control => control.id) ?? [];
    const shotControl = controls?.find(control => control.id === 'kling-v3-shot-1-duration-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(controlIds).toEqual([
      'kling-v3-multi-select',
      'kling-v3-shot-1-duration-select',
      'kling-v3-shot-2-duration-select',
      'kling-v3-audio-select',
      'kling-v3-cfg-select',
    ]);
    expect(shotControl && 'options' in shotControl ? shotControl.options.map(option => option.value) : []).toContain('1');
  });

  it('shows Kling 3.0 Control sound and orientation controls without a variant picker', () => {
    const controls = buildPromptBarModelControls({
      ...baseInput,
      falModelId: KLING_V3_CONTROL_VIDEO_MODEL_ID,
      isKlingV3VideoModel: false,
      isKlingV3ControlVideoModel: true,
      klingV3ControlKeepSound: true,
      klingV3ControlOrientation: 'video',
      onKlingV3ControlKeepSoundChange: vi.fn(),
      onKlingV3ControlOrientationChange: vi.fn(),
    } as unknown as PromptBarControlsInput);
    const controlIds = controls?.map(control => control.id) ?? [];

    expect(controlIds).toEqual([
      'kling-v3-control-keep-sound',
      'kling-v3-control-orientation',
    ]);
    expect(controlIds).not.toContain('kling26-control-variant-select');
  });

  it('shows Kling O3 reference controls with duration, audio, and aspect ratio', () => {
    const controls = buildPromptBarModelControls({
      ...baseInput,
      falModelId: KLING_O3_VIDEO_MODEL_ID,
      isKlingV3VideoModel: false,
      isKlingO3VideoModel: true,
      klingO3Variant: 'reference',
      klingO3Duration: '8',
      klingO3GenerateAudio: false,
      klingO3KeepAudio: true,
      falAspectRatioSelection: '1:1',
      onKlingO3VariantChange: vi.fn(),
      onKlingO3DurationChange: vi.fn(),
      onKlingO3GenerateAudioChange: vi.fn(),
      onKlingO3KeepAudioChange: vi.fn(),
      onFalAspectRatioChange: vi.fn(),
    } as unknown as PromptBarControlsInput);
    const controlIds = controls?.map(control => control.id) ?? [];
    const durationControl = controls?.find(control => control.id === 'kling-o3-video-duration-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(controlIds).toEqual([
      'kling-o3-variant-select',
      'kling-o3-video-duration-select',
      'kling-o3-audio-select',
      'kling-o3-aspect-ratio-select',
    ]);
    expect(durationControl && 'options' in durationControl ? durationControl.options.map(option => option.value) : []).toContain('15');
  });

  it('shows only the keep-audio control for Kling O3 edit mode', () => {
    const controls = buildPromptBarModelControls({
      ...baseInput,
      falModelId: KLING_O3_VIDEO_MODEL_ID,
      isKlingV3VideoModel: false,
      isKlingO3VideoModel: true,
      klingO3Variant: 'edit',
      klingO3Duration: '5',
      klingO3GenerateAudio: false,
      klingO3KeepAudio: true,
      onKlingO3VariantChange: vi.fn(),
      onKlingO3DurationChange: vi.fn(),
      onKlingO3GenerateAudioChange: vi.fn(),
      onKlingO3KeepAudioChange: vi.fn(),
    } as unknown as PromptBarControlsInput);
    const controlIds = controls?.map(control => control.id) ?? [];

    expect(controlIds).toEqual([
      'kling-o3-variant-select',
      'kling-o3-keep-audio',
    ]);
  });
});
