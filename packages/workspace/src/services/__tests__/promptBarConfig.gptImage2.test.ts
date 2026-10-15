import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import type { GenerationInputs } from '../../types';
import { GPT_IMAGE_2_EDIT_MODEL_ID, GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID } from '../gptImage2Config';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { buildGptImage2Controls } from '../promptBar/gptImage2Controls';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';

describe('GPT Image 2 controls and saved settings', () => {
  it('delegates the existing controls and disables them while loading', () => {
    const onSize = vi.fn();
    const onQuality = vi.fn();
    const input = {
      apiProvider: 'fal', falModelId: GPT_IMAGE_2_EDIT_MODEL_ID, isGptImage2Model: true, isVideoMode: false,
      falModelMode: 'image', usingFal: true, falNumImages: 1, falImageSizeSelection: 'auto', isLoading: true,
      onFalImageSizeChange: onSize, onGptImage2QualityChange: onQuality,
    } as unknown as PromptBarControlsInput;
    const selects = (buildPromptBarModelControls(input) ?? []).filter(control => control.id.startsWith('fal-gpt-image-2-'));
    expect(selects.map(control => control.id)).toEqual(['size', 'quality'].map(name => `fal-gpt-image-2-${name}-select`));
    expect(selects.map(control => 'value' in control ? control.value : undefined)).toEqual(['auto', 'medium']);
    expect(selects.every(control => control.disabled)).toBe(true);
    if ('onChange' in selects[0]) selects[0].onChange('2560x1440');
    if ('onChange' in selects[1]) selects[1].onChange('high');
    expect(onSize).toHaveBeenCalledWith('2560x1440');
    expect(onQuality).toHaveBeenCalledWith('high');
    expect((buildPromptBarModelControls({ ...input, apiProvider: 'google' }) ?? []).some(control => control.id.startsWith('fal-gpt-image-2-'))).toBe(false);
  });

  it('preserves valid values in the extracted builder and repairs malformed preview values', () => {
    const input = { isLoading: false, onSizeChange: vi.fn(), onQualityChange: vi.fn() };
    expect(buildGptImage2Controls({ ...input, quality: 'low', imageSizeSelection: 'square' }).map(control => control.value)).toEqual(['square', 'low']);
    expect(buildGptImage2Controls({ ...input, imageSizeSelection: 'bad' }).map(control => control.value)).toEqual(['auto', 'medium']);
  });

  it.each([GPT_IMAGE_2_EDIT_MODEL_ID, GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID])('restores %s independently of live settings', modelId => {
    const generation: GenerationInputs = { kind: 'image_edit', prompt: 'A subject', provider: 'fal', modelId, modelMode: 'image' };
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.setFalImageModelId(GPT_IMAGE_2_EDIT_MODEL_ID);
      result.current.handleGptImage2QualityChange('high');
      result.current.setFalImageSizeSelection('2560x1440');
      result.current.setFalNumImages(3);
      result.current.applyGenerationSettings(generation);
    });
    expect(result.current).toMatchObject({ falImageModelId: GPT_IMAGE_2_EDIT_MODEL_ID, gptImage2Quality: 'medium', falImageSizeSelection: 'auto', falNumImages: 1 });
    act(() => result.current.applyGenerationSettings({
      ...generation, falOptions: { gptImage2Quality: 'low', imageSizeSelection: '2048x2048', numImages: 4 },
    }));
    expect(result.current).toMatchObject({ gptImage2Quality: 'low', falImageSizeSelection: '2048x2048', falNumImages: 4 });
  });

  it('repairs malformed saved quality, size, and count before transferring settings', () => {
    const generation = {
      kind: 'text_to_image', provider: 'fal', prompt: 'A subject', modelId: GPT_IMAGE_2_EDIT_MODEL_ID, modelMode: 'image',
      falOptions: { gptImage2Quality: 'bad', imageSizeSelection: 'bad', numImages: NaN },
    } as unknown as GenerationInputs;
    expect(resolveGenerationTransferOptions(generation, GPT_IMAGE_2_EDIT_MODEL_ID)).toMatchObject({
      gptImage2Quality: 'medium', imageSizeSelection: 'auto', numImages: 1,
    });
  });
});
