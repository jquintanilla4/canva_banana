import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NANO_BANANA_21_EDIT_MODEL_ID } from '../../services/nanoBananaConfig';
import { getGoogleImageAspectRatio } from '../../services/nanoBananaAspectRatioPolicy';
import { buildPromptBarModelControls } from '../../services/promptBarConfig';
import { buildFooterPromptBarControlsInput } from '../../services/promptBarSettingsView';
import type { ApiProviderId } from '../../types';
import { useFalSettings } from '../useFalSettings';

describe('Nano Banana provider aspect ratios', () => {
  it.each(['4:1', '1:4', '8:1', '1:8'])('preserves Fal %s and resets it to Auto for Google', ratio => {
    const { result, rerender } = renderHook(({ apiProvider }: { apiProvider: ApiProviderId }) => useFalSettings({ apiProvider }), {
      initialProps: { apiProvider: 'fal' },
    });
    act(() => {
      result.current.handleFalModelChange(NANO_BANANA_21_EDIT_MODEL_ID);
      result.current.handleFalAspectRatioChange(ratio);
    });
    expect(result.current.falAspectRatioSelection).toBe(ratio);
    rerender({ apiProvider: 'google' });
    expect(result.current.falAspectRatioSelection).toBe('default');

    const controls = buildPromptBarModelControls(buildFooterPromptBarControlsInput({
      apiProvider: 'google', fal: result.current,
      flux3: { onFlux3DurationChange: () => {}, onFlux3KeyframeTimingChange: () => {} },
      hasFirstFrameImage: false, isLoading: false, shouldValidateFalOptions: false, isNumImagesInvalid: false,
    }));
    const picker = controls?.find(control => control.id === 'fal-aspect-ratio-select');
    if (!picker || !('options' in picker)) throw new Error('Missing aspect ratio picker');
    expect(picker.value).toBe('default');
    expect(picker.options.map(option => option.value)).not.toContain(ratio);
  });

  it('preserves a shared aspect ratio when switching to Google', () => {
    const { result, rerender } = renderHook(({ apiProvider }: { apiProvider: ApiProviderId }) => useFalSettings({ apiProvider }), {
      initialProps: { apiProvider: 'fal' },
    });
    act(() => {
      result.current.handleFalModelChange(NANO_BANANA_21_EDIT_MODEL_ID);
      result.current.handleFalAspectRatioChange('16:9');
    });
    rerender({ apiProvider: 'google' });
    expect(result.current.falAspectRatioSelection).toBe('16:9');
  });

  it('resets unsupported ratios when Google replaces remembered Fal video mode', () => {
    const { result, rerender } = renderHook(({ apiProvider }: { apiProvider: ApiProviderId }) => useFalSettings({ apiProvider }), {
      initialProps: { apiProvider: 'fal' },
    });
    act(() => {
      result.current.handleModelModeChange('video');
      result.current.handleFalAspectRatioChange('8:1');
    });
    rerender({ apiProvider: 'google' });
    expect(result.current.falModelMode).toBe('image');
    expect(result.current.falAspectRatioSelection).toBe('default');
  });

  it.each(['4:1', '1:4', '8:1', '1:8', '2:1', 'default', 'placeholder', undefined, null, 1])(
    'omits unsupported Google request ratio %s from saved or live settings', ratio => {
      expect(getGoogleImageAspectRatio(ratio)).toBeUndefined();
    },
  );

  it('forwards supported Google request ratios', () => {
    expect(getGoogleImageAspectRatio('16:9')).toBe('16:9');
  });
});
