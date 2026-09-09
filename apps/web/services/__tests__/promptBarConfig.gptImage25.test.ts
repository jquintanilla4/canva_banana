import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import { GPT_IMAGE_25_MODEL_ID, GPT_IMAGE_2_EDIT_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { buildSnapshotBinaryFromState, snapshotBinaryToBlob, restoreSnapshotFromFile, type SnapshotMetaState, normalizeSnapshotImageMetadata } from '../snapshotService';
import type { GenerationInputs } from '../../types';

const generation: GenerationInputs = { kind: 'text_to_image', prompt: 'A subject', provider: 'fal', modelId: GPT_IMAGE_25_MODEL_ID, modelMode: 'image' };

describe('GPT Image 2.5 controls and saved settings', () => {
  it('uses existing select controls, hides them for other models, and disables them while loading', () => {
    const onVariant = vi.fn();
    const input = { apiProvider: 'fal', falModelId: GPT_IMAGE_25_MODEL_ID, isVideoMode: false, falModelMode: 'image', usingFal: true, falNumImages: 1, falImageSizeSelection: 'auto', onGptImage25VariantChange: onVariant, isLoading: true } as unknown as PromptBarControlsInput;
    const controls = buildPromptBarModelControls(input) ?? [];
    const selects = controls.filter(control => control.id.startsWith('fal-gpt-image-25-'));
    expect(selects.map(control => control.id)).toEqual(['variant', 'size', 'quality', 'background'].map(name => `fal-gpt-image-25-${name}-select`));
    expect(selects.map(control => 'value' in control ? control.value : undefined)).toEqual(['sunburst', 'auto', 'high', 'auto']);
    expect(selects.every(control => control.disabled)).toBe(true);
    const variant = selects[0];
    if ('onChange' in variant) variant.onChange('flare');
    expect(onVariant).toHaveBeenCalledWith('flare');
    for (const overrides of [{ falModelId: GPT_IMAGE_2_EDIT_MODEL_ID }, { apiProvider: 'google' as const }, { isVideoMode: true }]) {
      expect((buildPromptBarModelControls({ ...input, ...overrides }) ?? []).some(control => control.id.startsWith('fal-gpt-image-25-'))).toBe(false);
    }
  });

  it('defaults, validates changes, and restores snapshot settings independently of live controls', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.setFalImageModelId(GPT_IMAGE_25_MODEL_ID));
    expect(result.current).toMatchObject({ gptImage25Variant: 'sunburst', gptImage25Background: 'auto', gptImage25Quality: 'high', falImageSizeSelection: 'auto', falNumImages: 1 });
    act(() => {
      result.current.handleGptImage25VariantChange('flare');
      result.current.handleGptImage25BackgroundChange('transparent');
      result.current.handleGptImage25QualityChange('max');
      result.current.handleGptImage25VariantChange('bad');
      result.current.handleGptImage25BackgroundChange('bad');
      result.current.handleGptImage25QualityChange('bad');
    });
    expect(result.current).toMatchObject({ gptImage25Variant: 'flare', gptImage25Background: 'transparent', gptImage25Quality: 'max', gptImage2Quality: 'medium' });
    const saved = normalizeSnapshotImageMetadata(JSON.parse(JSON.stringify({ source: 'generated', generation: { ...generation, falOptions: { gptImage25Variant: 'sunburst', gptImage25Background: 'opaque', gptImage25Quality: 'xhigh', imageSizeSelection: '2048x2048', numImages: 4 } } })));
    act(() => { expect(result.current.applyGenerationSettings(saved!.generation!)).toBe(true); });
    expect(result.current).toMatchObject({ gptImage25Variant: 'sunburst', gptImage25Background: 'opaque', gptImage25Quality: 'xhigh', falImageSizeSelection: '2048x2048', falNumImages: 4 });
    act(() => { result.current.applyGenerationSettings(generation); });
    expect(result.current).toMatchObject({ gptImage25Variant: 'sunburst', gptImage25Background: 'auto', gptImage25Quality: 'high', falImageSizeSelection: 'auto', falNumImages: 1 });
    const invalid = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, falOptions: { gptImage25Variant: 'bad', gptImage25Background: 'bad', gptImage25Quality: 'bad' } } } as never);
    expect(invalid?.generation?.falOptions).toBeUndefined();
  });
  it.each(['2688x1152', '2016x864', '1344x576'] as const)('preserves cinematic %s through snapshot save, reopen, and settings transfer', async imageSizeSelection => {
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL = () => 'blob:gpt25-test';
      static revokeObjectURL = () => undefined;
    });
    vi.stubGlobal('Image', class {
      onload?: () => void;
      naturalWidth = 1024;
      naturalHeight = 1024;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    try {
      const savedGeneration: GenerationInputs = { ...generation, falOptions: { gptImage25Variant: 'flare', gptImage25Quality: 'max', gptImage25Background: 'transparent', imageSizeSelection, numImages: 4 } };
      const binary = await buildSnapshotBinaryFromState({
        images: [{ id: 'gpt25-image', element: document.createElement('img'), mediaType: 'image', x: 0, y: 0, width: 1024, height: 1024, rotation: 0, naturalWidth: 1024, naturalHeight: 1024, file: new File(['image'], 'image.png', { type: 'image/png' }), metadata: { source: 'generated', generation: savedGeneration } }],
        notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState,
      });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'gpt25.bcsnap', { type: 'application/octet-stream' }), { brushSize: 20, eraserSize: 20, brushColor: '#000000' });
      expect(restored.images[0]?.metadata?.generation).toMatchObject(savedGeneration);
      const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
      act(() => { result.current.applyGenerationSettings(restored.images[0].metadata!.generation!); });
      expect(result.current.falImageSizeSelection).toBe(imageSizeSelection);
    } finally {
      vi.unstubAllGlobals();
    }
  });

});
