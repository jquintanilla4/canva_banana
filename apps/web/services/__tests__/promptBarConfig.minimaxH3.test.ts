import { describe, expect, it, vi } from 'vitest';
import { MINIMAX_H3_VIDEO_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';

const buildInput = (overrides: Partial<PromptBarControlsInput> = {}): PromptBarControlsInput => ({
  apiProvider: 'fal',
  falModelId: MINIMAX_H3_VIDEO_MODEL_ID,
  falModelMode: 'video',
  isVideoMode: true,
  usingFal: true,
  isMiniMaxH3VideoModel: true,
  miniMaxH3Variant: 'reference',
  miniMaxH3AspectRatio: 'adaptive',
  miniMaxH3Duration: '5',
  miniMaxH3UsesSourceAspectRatio: false,
  isLoading: false,
  onMiniMaxH3VariantChange: vi.fn(),
  onMiniMaxH3AspectRatioChange: vi.fn(),
  onMiniMaxH3DurationChange: vi.fn(),
  ...overrides,
} as unknown as PromptBarControlsInput); // Keep this fixture focused on H3 controls.

describe('promptBarConfig (MiniMax H3)', () => {
  it('uses Reference, Adaptive, and 5 seconds as the configured defaults', () => {
    const controls = buildPromptBarModelControls(buildInput()) ?? [];
    const variant = controls.find(control => control.id === 'minimax-h3-variant-select');
    const aspect = controls.find(control => control.id === 'minimax-h3-aspect-ratio-select');
    const duration = controls.find(control => control.id === 'minimax-h3-duration-select');

    expect(variant && 'value' in variant ? variant.value : undefined).toBe('reference');
    expect(aspect && 'value' in aspect ? aspect.value : undefined).toBe('adaptive');
    expect(duration && 'value' in duration ? duration.value : undefined).toBe('5');
  });

  it('prefixes every H3 control for an embedded prompt bar', () => {
    const controls = buildPromptBarModelControls(buildInput({
      controlIdPrefix: 'prompt-bar-2',
    })) ?? [];

    expect(controls.map(control => control.id)).toEqual([
      'prompt-bar-2-minimax-h3-variant-select',
      'prompt-bar-2-minimax-h3-aspect-ratio-select',
      'prompt-bar-2-minimax-h3-duration-select',
    ]);
  });

  it('offers Adaptive only for Reference and durations from 5 through 15', () => {
    const referenceControls = buildPromptBarModelControls(buildInput()) ?? [];
    const standardControls = buildPromptBarModelControls(buildInput({
      miniMaxH3Variant: 'standard',
      miniMaxH3AspectRatio: '16:9',
    })) ?? [];
    const referenceAspect = referenceControls.find(control => control.id === 'minimax-h3-aspect-ratio-select' && control.kind !== 'action' && control.kind !== 'color');
    const standardAspect = standardControls.find(control => control.id === 'minimax-h3-aspect-ratio-select' && control.kind !== 'action' && control.kind !== 'color');
    const duration = referenceControls.find(control => control.id === 'minimax-h3-duration-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(referenceAspect && 'options' in referenceAspect ? referenceAspect.options.map(option => option.value) : []).toContain('adaptive');
    expect(standardAspect && 'options' in standardAspect ? standardAspect.options.map(option => option.value) : []).not.toContain('adaptive');
    expect(duration && 'options' in duration ? duration.options.map(option => option.value) : []).toEqual([
      '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15',
    ]);
  });

  it('shows a disabled Source aspect ratio for Standard image-to-video', () => {
    const controls = buildPromptBarModelControls(buildInput({
      miniMaxH3Variant: 'standard',
      miniMaxH3AspectRatio: '9:16',
      miniMaxH3UsesSourceAspectRatio: true,
    })) ?? [];
    const aspect = controls.find(control => control.id === 'minimax-h3-aspect-ratio-select' && control.kind !== 'action' && control.kind !== 'color');

    expect(aspect && 'value' in aspect ? aspect.value : undefined).toBe('source');
    expect(aspect && 'disabled' in aspect ? aspect.disabled : undefined).toBe(true);
    expect(aspect && 'options' in aspect ? aspect.options : []).toEqual([{ value: 'source', label: 'Source' }]);
  });
});
