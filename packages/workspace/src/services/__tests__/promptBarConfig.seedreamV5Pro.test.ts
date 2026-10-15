import { describe, expect, it, vi } from 'vitest';
import { SEEDREAM_V5_PRO_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';

describe('promptBarConfig (Seedream 5 Pro)', () => {
  it('shows Seedream 5 Pro size and image count controls', () => {
    const controls = buildPromptBarModelControls({
      apiProvider: 'fal',
      falModelId: SEEDREAM_V5_PRO_MODEL_ID,
      falModelMode: 'image',
      isVideoMode: false,
      usingFal: true,
      isSeedreamModel: true,
      falImageSizeSelection: 'auto_2K',
      falAspectRatioSelection: 'default',
      falResolutionSelection: '1K',
      falNumImages: 6,
      isLoading: false,
      shouldValidateFalOptions: true,
      isNumImagesInvalid: false,
      onFalImageSizeChange: vi.fn(),
      onFalAspectRatioChange: vi.fn(),
      onFalResolutionChange: vi.fn(),
      onFalNumImagesChange: vi.fn(),
    } as unknown as PromptBarControlsInput); // Keep the fixture scoped to Seedream controls.

    const sizeControl = controls?.find(control => control.id === 'fal-image-size-select' && control.kind !== 'action' && control.kind !== 'color');
    const numImagesControl = controls?.find(control => control.id === 'fal-num-images-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(controls?.map(control => control.id)).toEqual(['fal-image-size-select', 'fal-num-images-select']);
    expect(sizeControl && 'prefixLabel' in sizeControl ? sizeControl.prefixLabel : undefined).toBe('Size');
    expect(sizeControl && 'options' in sizeControl ? sizeControl.options.map(option => option.value) : []).toEqual([
      'square_hd',
      'square',
      'portrait_4_3',
      'portrait_16_9',
      'landscape_4_3',
      'landscape_16_9',
      'auto_1K',
      'auto_2K',
    ]);
    expect(numImagesControl && 'prefixLabel' in numImagesControl ? numImagesControl.prefixLabel : undefined).toBe('Images');
    expect(numImagesControl && 'options' in numImagesControl ? numImagesControl.options.map(option => option.value) : []).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});
