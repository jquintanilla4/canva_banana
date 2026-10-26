import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings, type UseFalSettingsResult } from '../../hooks/useFalSettings';
import { FLUX_3_TEXT_TO_IMAGE_MODEL_ID, FLUX_3_VIDEO_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls } from '../promptBarConfig';
import { buildFooterPromptBarControlsInput } from '../promptBarSettingsView';

const aspectRatios = ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2'];
const resolutions = ['768sq', '1k', '1.5k', '2k', '4k'];
const buildInput = (fal: UseFalSettingsResult, isLoading = false) => buildFooterPromptBarControlsInput({
  apiProvider: 'fal',
  fal,
  flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
  hasFirstFrameImage: false,
  isLoading,
  shouldValidateFalOptions: false,
  isNumImagesInvalid: false,
});
const imageControls = (fal: UseFalSettingsResult, isLoading = false) =>
  (buildPromptBarModelControls(buildInput(fal, isLoading)) ?? []).filter(control => control.id.startsWith('flux3-image-'));

describe('promptBarConfig (Flux 3 image)', () => {
  it('projects the image defaults and all supported picker options into footer controls', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.setFalImageModelId(FLUX_3_TEXT_TO_IMAGE_MODEL_ID));
    const controls = imageControls(result.current);

    expect(result.current.isFlux3ImageModel).toBe(true);
    expect(controls.map(control => control.id)).toEqual(['flux3-image-aspect-ratio-select', 'flux3-image-resolution-select']);
    expect(controls.map(control => control.ariaLabel)).toEqual(['Select Flux 3 image aspect ratio', 'Select Flux 3 image resolution']);
    expect(controls.map(control => 'value' in control ? control.value : undefined)).toEqual(['auto', '1k']);
    expect(controls.map(control => 'options' in control ? control.options.map(option => option.value) : [])).toEqual([aspectRatios, resolutions]);
    expect(imageControls(result.current, true).every(control => control.disabled)).toBe(true);
  });

  it('wires image callbacks and rejects unsupported picker values', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.setFalImageModelId(FLUX_3_TEXT_TO_IMAGE_MODEL_ID));
    const onAspectRatioChange = vi.fn();
    const onResolutionChange = vi.fn();
    const input = {
      ...buildInput(result.current),
      onFlux3ImageAspectRatioChange: onAspectRatioChange,
      onFlux3ImageResolutionChange: onResolutionChange,
    };
    const controls = (buildPromptBarModelControls(input) ?? []).filter(control => control.id.startsWith('flux3-image-'));
    const [aspectRatio, resolution] = controls;
    if (!aspectRatio || !('options' in aspectRatio) || !resolution || !('options' in resolution)) {
      throw new Error('Missing Flux 3 image pickers');
    }
    aspectRatio.onChange('7:5');
    resolution.onChange('1.5k');
    aspectRatio.onChange('landscape_16_9');
    resolution.onChange('1080p');
    expect(onAspectRatioChange.mock.calls).toEqual([['7:5']]);
    expect(onResolutionChange.mock.calls).toEqual([['1.5k']]);

    const footerControls = imageControls(result.current);
    act(() => {
      const [footerAspectRatio, footerResolution] = footerControls;
      if (footerAspectRatio && 'options' in footerAspectRatio) footerAspectRatio.onChange('5:7');
      if (footerResolution && 'options' in footerResolution) footerResolution.onChange('2k');
    });
    expect(imageControls(result.current).map(control => 'value' in control ? control.value : undefined)).toEqual(['5:7', '2k']);
  });

  it('guards hook changes without touching Flux 3 video settings', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    for (const value of aspectRatios) {
      act(() => result.current.handleFlux3ImageAspectRatioChange(value));
      expect(result.current.flux3ImageAspectRatio).toBe(value);
    }
    for (const value of resolutions) {
      act(() => result.current.handleFlux3ImageResolutionChange(value));
      expect(result.current.flux3ImageResolution).toBe(value);
    }
    act(() => {
      result.current.handleFlux3ImageAspectRatioChange('landscape_16_9');
      result.current.handleFlux3ImageAspectRatioChange('');
      result.current.handleFlux3ImageResolutionChange('720p');
      result.current.handleFlux3ImageResolutionChange('');
    });
    expect(result.current).toMatchObject({
      flux3ImageAspectRatio: '1:2', flux3ImageResolution: '4k', flux3AspectRatio: 'auto', flux3Resolution: '720p',
    });
  });

  it('hides image controls for other models, providers, and video mode', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    expect(imageControls(result.current)).toEqual([]);
    act(() => result.current.setFalImageModelId(FLUX_3_TEXT_TO_IMAGE_MODEL_ID));
    const input = buildInput(result.current);
    expect((buildPromptBarModelControls({ ...input, apiProvider: 'google', usingFal: false }) ?? [])
      .some(control => control.id.startsWith('flux3-image-'))).toBe(false);
    act(() => {
      result.current.setFalVideoModelId(FLUX_3_VIDEO_MODEL_ID);
      result.current.handleModelModeChange('video');
    });
    expect(result.current.isFlux3ImageModel).toBe(false);
    expect(result.current.isFlux3VideoModel).toBe(true);
    expect(imageControls(result.current)).toEqual([]);
  });
});
