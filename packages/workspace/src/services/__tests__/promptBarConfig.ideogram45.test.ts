import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import { IDEOGRAM_45_MODEL_ID, GPT_IMAGE_25_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { buildFooterPromptBarControlsInput } from '../promptBarSettingsView';
import { buildSnapshotBinaryFromState, snapshotBinaryToBlob, restoreSnapshotFromFile, type SnapshotMetaState, normalizeSnapshotImageMetadata } from '../snapshotService';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';
import type { GenerationInputs } from '../../types';
import { getModelUiCapabilities } from '../modelCapabilities';

describe('Ideogram 4.5 prompt bar and saved settings', () => {
  const input = {
    apiProvider: 'fal', falModelId: IDEOGRAM_45_MODEL_ID, falModelMode: 'image', isVideoMode: false,
    usingFal: true, falNumImages: 1, falImageSizeSelection: 'auto',
  } as unknown as PromptBarControlsInput;
  const controlsFor = (overrides: Partial<PromptBarControlsInput> = {}) => buildPromptBarModelControls({ ...input, ...overrides }) ?? [];
  const selectFor = (name: string, overrides: Partial<PromptBarControlsInput> = {}) => {
    const control = controlsFor(overrides).find(control => control.id === `fal-ideogram-45-${name}-select`);
    if (!control || !('options' in control)) throw new Error('Missing Ideogram select control');
    return control;
  };

  it('shows quality and precision, enabling edit-only settings when an image is selected', () => {
    expect(selectFor('quality').value).toBe('medium');
    expect(selectFor('quality').options.map(option => option.value)).toEqual(['low', 'medium', 'high']);
    expect(selectFor('edit-precision')).toMatchObject({ value: 'regular', disabled: true });
    const onPrecision = vi.fn();
    const edit = { ideogram45IsEditing: true, onIdeogram45EditPrecisionChange: onPrecision };
    expect(selectFor('edit-precision', edit).disabled).toBe(false);
    selectFor('edit-precision', edit).onChange('high');
    expect(onPrecision).toHaveBeenCalledWith('high');
    expect(selectFor('quality', edit).options.map(option => option.value)).toEqual(['very_low', 'low', 'medium', 'high']);
    const precise = { ...edit, ideogram45EditPrecision: 'high' as const, ideogram45Quality: 'very_low' as const, falImageSizeSelection: '2560x1440' as const };
    expect(selectFor('size', precise)).toMatchObject({ value: 'auto', disabled: true });
    expect(selectFor('quality', precise).value).toBe('medium');
    expect(selectFor('quality', precise).options.map(option => option.value)).toEqual(['low', 'medium', 'high']);
    const num = controlsFor().find(control => control.id === 'fal-num-images-select');
    expect(num && 'options' in num ? num.options.map(option => option.value) : []).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('disables controls while loading and hides them for other providers and models', () => {
    expect(controlsFor({ isLoading: true }).filter(control => control.id.startsWith('fal-ideogram-45-')).every(control => control.disabled)).toBe(true);
    for (const overrides of [{ falModelId: GPT_IMAGE_25_MODEL_ID }, { apiProvider: 'google' as const }, { isVideoMode: true }]) {
      expect(controlsFor(overrides).some(control => control.id.startsWith('fal-ideogram-45-'))).toBe(false);
    }
  });

  it('reconciles Very Low quality when precision changes so Medium stays selected', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.setFalImageModelId(IDEOGRAM_45_MODEL_ID);
      result.current.handleIdeogram45QualityChange('very_low');
    });
    expect(result.current.ideogram45Quality).toBe('very_low');
    act(() => result.current.handleIdeogram45EditPrecisionChange('high'));
    expect(result.current).toMatchObject({ ideogram45Quality: 'medium', ideogram45EditPrecision: 'high' });
    expect(selectFor('quality', { ...result.current, ideogram45IsEditing: true }).value).toBe(result.current.ideogram45Quality);
    act(() => result.current.handleIdeogram45QualityChange('very_low'));
    expect(result.current.ideogram45Quality).toBe('medium');
    act(() => result.current.handleIdeogram45QualityChange('medium'));
    act(() => result.current.handleIdeogram45EditPrecisionChange('regular'));
    expect(result.current).toMatchObject({ ideogram45Quality: 'medium', ideogram45EditPrecision: 'regular' });
  });

  it.each(['low', 'medium', 'high'] as const)('preserves valid %s quality across precision changes', quality => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.handleIdeogram45QualityChange(quality);
      result.current.handleIdeogram45EditPrecisionChange('high');
      result.current.handleIdeogram45EditPrecisionChange('regular');
    });
    expect(result.current).toMatchObject({ ideogram45Quality: quality, ideogram45EditPrecision: 'regular' });
  });

  it('wires live controls, validates handlers, and restores saved settings', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.setFalImageModelId(IDEOGRAM_45_MODEL_ID));
    expect(result.current).toMatchObject({ ideogram45Quality: 'medium', ideogram45EditPrecision: 'regular', falImageSizeSelection: 'auto' });
    const footer = buildFooterPromptBarControlsInput({
      apiProvider: 'fal', fal: result.current, flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
      hasFirstFrameImage: true, isLoading: false, shouldValidateFalOptions: true, isNumImagesInvalid: false,
    });
    expect(footer.ideogram45IsEditing).toBe(true);
    act(() => {
      footer.onIdeogram45QualityChange?.('high');
      footer.onIdeogram45EditPrecisionChange?.('high');
      result.current.handleIdeogram45QualityChange('bad');
      result.current.handleIdeogram45EditPrecisionChange('bad');
      result.current.handleFalNumImagesChange(8);
    });
    expect(result.current).toMatchObject({ ideogram45Quality: 'high', ideogram45EditPrecision: 'high', falNumImages: 8 });
    const generation: GenerationInputs = {
      kind: 'image_edit', prompt: 'Change the sign', provider: 'fal', modelId: IDEOGRAM_45_MODEL_ID, modelMode: 'image',
      falOptions: { ideogram45Quality: 'very_low', ideogram45EditPrecision: 'regular', imageSizeSelection: '2048x2048', numImages: 7 },
    };
    const saved = normalizeSnapshotImageMetadata(JSON.parse(JSON.stringify({ source: 'generated', generation })));
    expect(saved?.generation).toMatchObject(generation);
    act(() => { expect(result.current.applyGenerationSettings(saved!.generation!)).toBe(true); });
    expect(result.current).toMatchObject({ ideogram45Quality: 'very_low', ideogram45EditPrecision: 'regular', falImageSizeSelection: '2048x2048', falNumImages: 7 });
    act(() => { result.current.applyGenerationSettings({ ...generation, falOptions: undefined }); });
    expect(result.current).toMatchObject({ ideogram45Quality: 'medium', ideogram45EditPrecision: 'regular', falImageSizeSelection: 'auto', falNumImages: 1 });
    expect(resolveGenerationTransferOptions({ ...generation, falOptions: { ideogram45Quality: 'bad', ideogram45EditPrecision: 'bad', imageSizeSelection: 'auto_2K', numImages: NaN } } as unknown as GenerationInputs, IDEOGRAM_45_MODEL_ID))
      .toMatchObject({ ideogram45Quality: 'medium', ideogram45EditPrecision: 'regular', imageSizeSelection: 'auto', numImages: 1 });
    const invalid = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, falOptions: { ideogram45Quality: 'bad', ideogram45EditPrecision: 'bad' } } } as never);
    expect(invalid?.generation?.falOptions).toBeUndefined();
    expect(getModelUiCapabilities(IDEOGRAM_45_MODEL_ID)).toMatchObject({ maxReferenceImages: 4, supportsAnnotate: true });
  });

  it('preserves quality and precision through snapshot save and reopen', async () => {
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL = () => 'blob:ideogram-test';
      static revokeObjectURL = () => undefined;
    });
    vi.stubGlobal('Image', class {
      onload?: () => void;
      naturalWidth = 1024;
      naturalHeight = 1024;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    try {
      const generation: GenerationInputs = {
        kind: 'image_edit', prompt: 'Change the sign', provider: 'fal', modelId: IDEOGRAM_45_MODEL_ID, modelMode: 'image',
        falOptions: { ideogram45Quality: 'high', ideogram45EditPrecision: 'high', imageSizeSelection: 'auto', numImages: 8 },
      };
      const binary = await buildSnapshotBinaryFromState({
        images: [{ id: 'ideogram-image', element: document.createElement('img'), mediaType: 'image', x: 0, y: 0, width: 1024, height: 1024, rotation: 0, naturalWidth: 1024, naturalHeight: 1024, file: new File(['image'], 'image.png', { type: 'image/png' }), metadata: { source: 'generated', generation } }],
        notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState,
      });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'ideogram.bcsnap', { type: 'application/octet-stream' }), { brushSize: 20, eraserSize: 20, brushColor: '#000000' });
      expect(restored.images[0]?.metadata?.generation).toMatchObject(generation);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
