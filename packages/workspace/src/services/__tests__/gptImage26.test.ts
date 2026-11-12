import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import { Tool, type GenerationInputs } from '../../types';
import { GPT_IMAGE_26_MODEL_ID, GPT_IMAGE_26_IMAGE_SIZE_OPTIONS, isGptImage26Model } from '../gptImage26Config';
import { GPT_IMAGE_25_MODEL_ID } from '../gptImage25Config';
import { FAL_IMAGE_MODEL_OPTIONS, normalizeFalModelId } from '../modelConfig';
import { resolveGptImage26RunSettings, serializeGptImage26GenerationOptions } from '../gptImage26RunSettings';
import { serializeGptImage26Input } from '../fal/gptImage';
import { getModelReferenceCapabilities } from '../modelReferenceCapabilities';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { buildFooterPromptBarControlsInput } from '../promptBarSettingsView';
import { normalizeSnapshotImageMetadata } from '../snapshotService';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';

afterEach(() => vi.restoreAllMocks());
const generation: GenerationInputs = { kind: 'text_to_image', prompt: 'A vector poster', provider: 'fal', modelId: GPT_IMAGE_26_MODEL_ID, modelMode: 'image' };

describe('GPT Image 2.6 Sunburst settings', () => {
  it('shows one canonical picker entry and normalizes only exact supported aliases', () => {
    expect(FAL_IMAGE_MODEL_OPTIONS.filter(option => isGptImage26Model(option.value))).toEqual([{ value: GPT_IMAGE_26_MODEL_ID, label: 'GPT Image 2.6 Sunburst' }]);
    for (const suffix of ['', '/text-to-image', '/edit']) expect(normalizeFalModelId(`${GPT_IMAGE_26_MODEL_ID}${suffix}`)).toBe(GPT_IMAGE_26_MODEL_ID);
    for (const suffix of ['/flare', '/edit/other', '/text-to-image/']) expect(isGptImage26Model(`${GPT_IMAGE_26_MODEL_ID}${suffix}`)).toBe(false);
    expect(getModelReferenceCapabilities(GPT_IMAGE_26_MODEL_ID, Tool.ANNOTATE)).toEqual({ referenceCapacity: 15, annotationSlots: 0, availableReferenceSlots: 15 });
  });

  it.each(GPT_IMAGE_26_IMAGE_SIZE_OPTIONS)('serializes size $value with operation-specific endpoints', ({ value }) => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      const settings = resolveGptImage26RunSettings({ kind, imageSizeSelection: value, numImages: 4 });
      expect(settings.endpoint).toBe(`${GPT_IMAGE_26_MODEL_ID}/${kind === 'image_edit' ? 'edit' : 'text-to-image'}`);
      const dimensions = value.match(/^(\d+)x(\d+)$/);
      expect(serializeGptImage26Input(settings)).toEqual({ image_size: dimensions ? { width: Number(dimensions[1]), height: Number(dimensions[2]) } : value, quality: 'high', background: 'auto', reasoning_effort: 'high', output_format: 'png', num_images: 4, sync_mode: false });
    }
    expectTypeOf(resolveGptImage26RunSettings({ kind: 'image_edit' }).outputFormat).toEqualTypeOf<'png' | 'jpeg' | 'webp' | 'gif'>();
  });

  it('validates GIF frames once and saves effective timing through restore and controls', () => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      const settings = resolveGptImage26RunSettings({ kind, outputFormat: 'gif', frameCount: 16, frameDurationMs: 205, numImages: 4 });
      expect(serializeGptImage26Input(settings)).toMatchObject({ output_format: 'gif', frame_count: 16, frame_duration_ms: 210, num_images: 4 });
      const options = serializeGptImage26GenerationOptions(settings);
      expect(options).toMatchObject({ gptImage26FrameCount: 16, gptImage26FrameDurationMs: 210 });
      const saved = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, kind, falOptions: options } });
      expect(saved?.generation?.falOptions).toMatchObject(options);
      expect(resolveGenerationTransferOptions(saved!.generation!, GPT_IMAGE_26_MODEL_ID)).toMatchObject(options);
    }
    for (const frameCount of [1, 17, 2.5, '9', NaN]) expect(() => resolveGptImage26RunSettings({ kind: 'text_to_image', outputFormat: 'gif', frameCount })).toThrow('frame count');
    for (const frameDurationMs of [19, 2001, 20.5, null, Infinity]) expect(() => resolveGptImage26RunSettings({ kind: 'image_edit', outputFormat: 'gif', frameDurationMs })).toThrow('frame duration');
    expect(resolveGptImage26RunSettings({ kind: 'image_edit', outputFormat: 'gif', frameCount: 1, frameDurationMs: NaN }, 'restore')).toMatchObject({ frameCount: 9, frameDurationMs: 200 });
    expect(serializeGptImage26Input(resolveGptImage26RunSettings({ kind: 'text_to_image', frameCount: 1 }))).not.toHaveProperty('frame_count');
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.applyGenerationSettings({ ...generation, falOptions: { gptImage26OutputFormat: 'gif', gptImage26FrameCount: 12, gptImage26FrameDurationMs: 330 } }));
    expect(result.current).toMatchObject({ gptImage26OutputFormat: 'gif', gptImage26FrameCount: 12, gptImage26FrameDurationMs: 330 });
    const controls = buildPromptBarModelControls(buildFooterPromptBarControlsInput({ apiProvider: 'fal', fal: result.current, flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() }, hasFirstFrameImage: true, isLoading: false, shouldValidateFalOptions: false, isNumImagesInvalid: false })) ?? [];
    expect(controls.find(control => control.id === 'fal-gpt-image-26-frames-select')).toMatchObject({ value: '12' });
    expect(controls.find(control => control.id === 'fal-gpt-image-26-frame-duration-select')).toMatchObject({ value: '330', options: expect.arrayContaining([{ value: '330', label: '330 ms' }]) });
    act(() => result.current.applyGenerationSettings(generation));
    expect(result.current).toMatchObject({ gptImage26FrameCount: 9, gptImage26FrameDurationMs: 200 });
  });

  it('enforces SVG restrictions before requests and repairs old restored settings', () => {
    expect(() => resolveGptImage26RunSettings({ kind: 'image_edit', outputFormat: 'svg' })).toThrow('editing supports');
    expect(() => resolveGptImage26RunSettings({ kind: 'text_to_image', outputFormat: 'svg', numImages: 2 })).toThrow('one image');
    expect(() => resolveGptImage26RunSettings({ kind: 'text_to_image', imageSizeSelection: 'bad' })).toThrow('supported');
    expect(resolveGptImage26RunSettings({ kind: 'image_edit', outputFormat: 'svg', imageSizeSelection: 'bad', numImages: NaN }, 'restore')).toMatchObject({ outputFormat: 'png', imageSizeSelection: 'auto', numImages: 1 });
    expect(resolveGptImage26RunSettings({ kind: 'text_to_image', outputFormat: 'svg', numImages: 4 }, 'restore')).toMatchObject({ outputFormat: 'svg', numImages: 1 });
  });

  it('restores independent controls through snapshot metadata and settings transfer', () => {
    const savedOptions = serializeGptImage26GenerationOptions(resolveGptImage26RunSettings({ kind: 'text_to_image', outputFormat: 'svg', quality: 'max', background: 'transparent', reasoningEffort: 'low', imageSizeSelection: '2560x1440' }));
    const saved = normalizeSnapshotImageMetadata({ source: 'generated', generation: { ...generation, modelId: `${GPT_IMAGE_26_MODEL_ID}/text-to-image`, falOptions: savedOptions } });
    expect(saved?.generation?.falOptions).toEqual(savedOptions);
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => { result.current.applyGenerationSettings(saved!.generation!); });
    expect(result.current).toMatchObject({ falImageModelId: GPT_IMAGE_26_MODEL_ID, gptImage26Quality: 'max', gptImage26Background: 'transparent', gptImage26ReasoningEffort: 'low', gptImage26OutputFormat: 'svg', falNumImages: 1, gptImage25Quality: 'high' });
    act(() => { result.current.applyGenerationSettings(generation); });
    expect(result.current).toMatchObject({ gptImage26Quality: 'high', gptImage26OutputFormat: 'png', gptImage26ReasoningEffort: 'high', gptImage26Background: 'auto' });
    expect(resolveGenerationTransferOptions({ ...generation, kind: 'image_edit', falOptions: savedOptions }, GPT_IMAGE_26_MODEL_ID)).toMatchObject({ gptImage26OutputFormat: 'png', numImages: 1 });
  });

  it('wires live footer controls to independent state and resolves edit visibility', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => { result.current.setFalImageModelId(GPT_IMAGE_26_MODEL_ID); result.current.setFalNumImages(4); });
    const inputFor = (editing: boolean) => buildFooterPromptBarControlsInput({
      apiProvider: 'fal', fal: result.current,
      flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
      hasFirstFrameImage: editing, isLoading: false, shouldValidateFalOptions: false, isNumImagesInvalid: false,
    });
    let controls = buildPromptBarModelControls(inputFor(false)) ?? [];
    const format = controls.find(control => control.id === 'fal-gpt-image-26-format-select');
    if (!format || !('onChange' in format)) throw new Error('Missing format control');
    act(() => { format.onChange('svg'); });
    expect(result.current).toMatchObject({ gptImage26OutputFormat: 'svg', falNumImages: 4 });
    controls = buildPromptBarModelControls(inputFor(false)) ?? [];
    expect(controls.find(control => control.id === 'fal-num-images-select')).toMatchObject({ value: '1', disabled: true });
    controls = buildPromptBarModelControls(inputFor(true)) ?? [];
    expect(controls.find(control => control.id === 'fal-gpt-image-26-format-select')).toMatchObject({ value: 'png' });
  });

  it('preserves four PNG edit outputs when returning to 2.6 with a stored SVG preference', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => { result.current.handleFalModelChange(GPT_IMAGE_26_MODEL_ID); result.current.handleGptImage26OutputFormatChange('svg'); });
    act(() => { result.current.handleFalNumImagesChange(4); });
    const controls = () => buildPromptBarModelControls(buildFooterPromptBarControlsInput({
      apiProvider: 'fal', fal: result.current,
      flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
      hasFirstFrameImage: true, isLoading: false, shouldValidateFalOptions: false, isNumImagesInvalid: false,
    })) ?? [];
    expect(controls().find(control => control.id === 'fal-num-images-select')).toMatchObject({ value: '4' });
    act(() => { result.current.handleFalModelChange(GPT_IMAGE_25_MODEL_ID); });
    act(() => { result.current.handleFalModelChange(GPT_IMAGE_26_MODEL_ID); });
    expect(controls().find(control => control.id === 'fal-gpt-image-26-format-select')).toMatchObject({ value: 'png' });
    expect(controls().find(control => control.id === 'fal-num-images-select')).toMatchObject({ value: '4' });
  });

  it('displays SVG count one and exposes PNG immediately when switching to edit', () => {
    const onFormat = vi.fn();
    const input = { apiProvider: 'fal', falModelId: GPT_IMAGE_26_MODEL_ID, isVideoMode: false, falModelMode: 'image', falImageSizeSelection: 'auto', falNumImages: 4, gptImage26OutputFormat: 'svg', onGptImage26OutputFormatChange: onFormat } as unknown as PromptBarControlsInput;
    const controls = buildPromptBarModelControls(input) ?? [];
    const format = controls.find(control => control.id === 'fal-gpt-image-26-format-select');
    const count = controls.find(control => control.id === 'fal-num-images-select');
    expect(format).toMatchObject({ value: 'svg', options: expect.arrayContaining([{ value: 'svg', label: 'SVG' }]) });
    expect(count).toMatchObject({ value: '1', disabled: true });
    const editFormat = (buildPromptBarModelControls({ ...input, gptImage26IsEditing: true }) ?? []).find(control => control.id === 'fal-gpt-image-26-format-select');
    expect(editFormat).toMatchObject({ value: 'png' });
    if (editFormat && 'options' in editFormat) expect(editFormat.options.some(option => option.value === 'svg')).toBe(false);
    expect(controls.some(control => control.id.includes('variant'))).toBe(false);
    expect((buildPromptBarModelControls({ ...input, apiProvider: 'google' }) ?? []).some(control => control.id.startsWith('fal-gpt-image-26-'))).toBe(false);
  });
});
