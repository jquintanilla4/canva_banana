import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KREA_3_MODEL_ID } from '../krea3Config';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { useFalSettings } from '../../hooks/useFalSettings';
import { normalizeSnapshotImageMetadata } from '../snapshotService';
import type { GenerationInputs } from '../../types';

describe('Krea 3 controls and saved settings', () => {
  it('shows generation defaults, edit-only reasoning choices, and disables size for Ultra', () => {
    const input = { apiProvider: 'fal', falModelId: KREA_3_MODEL_ID, falModelMode: 'image', isVideoMode: false, usingFal: true, isLoading: false } as PromptBarControlsInput;
    const selects = (overrides: Partial<PromptBarControlsInput> = {}) => (buildPromptBarModelControls({ ...input, ...overrides }) ?? [])
      .filter(control => control.id.startsWith('fal-krea-3-'));
    expect(selects().map(control => control.id)).toEqual(['variant', 'size', 'reasoning'].map(name => `fal-krea-3-${name}-select`));
    expect(selects().map(control => 'value' in control ? control.value : undefined)).toEqual(['berry', 'auto', 'medium']);
    const reasoning = selects()[2];
    expect('options' in reasoning && reasoning.options.map(option => option.value)).toEqual(['low', 'medium']);
    const editing = selects({ krea3IsEditing: true, krea3Variant: 'jam', krea3ReasoningLevel: 'ultra' });
    expect('options' in editing[2] && editing[2].options.map(option => option.value)).toEqual(['low', 'medium', 'high', 'ultra']);
    expect(editing[1].disabled).toBe(true);
    expect(selects({ isLoading: true }).every(control => control.disabled)).toBe(true);
    expect(selects({ apiProvider: 'google' })).toEqual([]);
    expect(selects({ isVideoMode: true })).toEqual([]);
  });

  it('restores saved controls and resets missing controls independently of live settings', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    const generation: GenerationInputs = { kind: 'image_edit', prompt: 'An edit', provider: 'fal', modelId: 'krea/v3/edit', modelMode: 'image' };
    act(() => {
      result.current.setFalImageModelId(KREA_3_MODEL_ID);
      result.current.handleKrea3VariantChange('jam');
      result.current.handleKrea3ReasoningLevelChange('ultra');
      result.current.handleKrea3VariantChange('invalid');
      result.current.handleKrea3ReasoningLevelChange('invalid');
    });
    expect(result.current).toMatchObject({ krea3Variant: 'jam', krea3ReasoningLevel: 'ultra', falImageSizeSelection: 'auto', falNumImages: 1 });
    const saved = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, falOptions: { krea3Variant: 'jam', krea3ReasoningLevel: 'high', imageSizeSelection: 'portrait_16_9', numImages: 1 } } })!.generation!;
    expect(saved.falOptions).toEqual({ krea3Variant: 'jam', krea3ReasoningLevel: 'high', imageSizeSelection: 'portrait_16_9', numImages: 1 });
    act(() => { expect(result.current.applyGenerationSettings(saved)).toBe(true); });
    expect(result.current).toMatchObject({ falImageModelId: KREA_3_MODEL_ID, krea3Variant: 'jam', krea3ReasoningLevel: 'high', falImageSizeSelection: 'portrait_16_9' });
    act(() => { expect(result.current.applyGenerationSettings(generation)).toBe(true); });
    expect(result.current).toMatchObject({ krea3Variant: 'berry', krea3ReasoningLevel: 'medium', falImageSizeSelection: 'auto', falNumImages: 1 });
  });
});
