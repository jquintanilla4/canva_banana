import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { useFalSettings } from '../../hooks/useFalSettings';

describe('promptBarConfig (Krea 2 Large)', () => {
  it('shows Krea aspect ratio and creativity controls with defaults', () => {
    const controls = buildPromptBarModelControls({
      apiProvider: 'fal',
      falModelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
      falModelMode: 'image',
      isVideoMode: false,
      usingFal: true,
      isKrea2LargeModel: true,
      krea2AspectRatio: '16:9',
      krea2Creativity: 'medium',
      isLoading: false,
      onKrea2AspectRatioChange: vi.fn(),
      onKrea2CreativityChange: vi.fn(),
    } as unknown as PromptBarControlsInput);
    const controlIds = controls?.map(control => control.id) ?? [];

    expect(controlIds).toEqual([
      'fal-krea-2-aspect-ratio-select',
      'fal-krea-2-creativity-select',
    ]);
    expect(controls?.[0] && 'value' in controls[0] ? controls[0].value : undefined).toBe('16:9');
    expect(controls?.[1] && 'value' in controls[1] ? controls[1].value : undefined).toBe('medium');
  });

  it('keeps Krea settings guarded in useFalSettings', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalImageModelId(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID);
    });

    expect(result.current.isKrea2LargeModel).toBe(true);
    expect(result.current.krea2AspectRatio).toBe('16:9');
    expect(result.current.krea2Creativity).toBe('medium');

    act(() => {
      result.current.handleKrea2AspectRatioChange('2.35:1');
      result.current.handleKrea2CreativityChange('high');
      result.current.handleKrea2AspectRatioChange('21:9');
      result.current.handleKrea2CreativityChange('maximum');
    });

    expect(result.current.krea2AspectRatio).toBe('2.35:1');
    expect(result.current.krea2Creativity).toBe('high');
  });
});
