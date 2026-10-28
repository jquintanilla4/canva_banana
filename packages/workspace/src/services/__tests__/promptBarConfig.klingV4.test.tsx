import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import { PromptBarModelControlList, type PromptBarSelectControl } from '../../components/promptBarControls';
import type { CanvasVideoPromptBar, GenerationInputs } from '../../types';
import { getNewVideoPromptBarDefaults } from '../../utils/videoPromptBarDefaults';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';
import { KLING_V4_DEFAULTS, KLING_V4_EDIT_VIDEO_MODEL_ID, KLING_V4_VIDEO_MODEL_ID, isKlingV4VideoModel } from '../klingV4Config';
import { buildPromptBarModelControls, getPromptBarModelOptions } from '../promptBarConfig';
import { buildEmbeddedPromptBarControlsInput, buildFooterPromptBarControlsInput } from '../promptBarSettingsView';

const savedGeneration: GenerationInputs = {
  kind: 'video', provider: 'fal', modelId: KLING_V4_VIDEO_MODEL_ID, modelMode: 'video', prompt: 'A moving subject',
};

const footerInput = (fal: ReturnType<typeof useFalSettings>, isLoading = false) => buildFooterPromptBarControlsInput({
  apiProvider: 'fal', fal, flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
  hasFirstFrameImage: false, isLoading, shouldValidateFalOptions: false, isNumImagesInvalid: false,
});

const getSelects = (input: ReturnType<typeof footerInput>) => (buildPromptBarModelControls(input) ?? [])
  .filter((control): control is PromptBarSelectControl => !control.kind || control.kind === 'select');

describe('Kling v4 prompt settings and controls', () => {
  it('offers one model and puts Generate/Edit first using the existing picker', () => {
    expect(getPromptBarModelOptions('video').filter(option => isKlingV4VideoModel(option.value)).map(option => option.value)).toEqual([KLING_V4_VIDEO_MODEL_ID]);
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.handleModelModeChange('video');
      result.current.handleFalModelChange(KLING_V4_VIDEO_MODEL_ID);
    });
    const controls = getSelects(footerInput(result.current));
    expect(controls.map(control => control.id)).toEqual(['variant', 'aspect-ratio', 'resolution', 'duration'].map(name => `kling-v4-${name}-select`));
    expect(controls.map(control => control.value)).toEqual(['generate', '16:9', '1080p', '5']);
    expect(controls[1].options.some(option => option.value === 'auto')).toBe(true);
    expect(controls[3].options.map(option => option.value)).toEqual(Array.from({ length: 28 }, (_, index) => String(index + 3)));
    render(<PromptBarModelControlList controls={controls} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Select Kling v4 variant' }));
    fireEvent.click(screen.getByRole('option', { name: 'Edit' }));
    expect(result.current.klingV4Variant).toBe('edit');
    expect(result.current.klingV4Duration).toBe('source');
    const editControls = getSelects(footerInput(result.current));
    expect(editControls.map(control => control.id)).toEqual(['variant', 'resolution', 'duration'].map(name => `kling-v4-${name}-select`));
    expect(editControls[2].options[0].value).toBe('source');
    act(() => editControls[0].onChange('generate'));
    expect(result.current.klingV4Duration).toBe('5');
  });

  it('validates controls, supports 30 seconds and 720p, and only exposes controls for Fal video', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.applyGenerationSettings(savedGeneration));
    act(() => {
      result.current.handleKlingV4DurationChange('30');
      result.current.handleKlingV4ResolutionChange('720p');
      result.current.handleKlingV4AspectRatioChange('auto');
      result.current.handleKlingV4VariantChange('bad');
      result.current.handleKlingV4ResolutionChange('4k');
      result.current.handleKlingV4AspectRatioChange('source');
      result.current.handleKlingV4DurationChange('31');
      result.current.handleKlingV4DurationChange('source');
    });
    expect(result.current).toMatchObject({ isKlingV4VideoModel: true, klingV4Variant: 'generate', klingV4Duration: '30', klingV4Resolution: '720p', klingV4AspectRatio: 'auto' });
    const input = footerInput(result.current, true);
    expect(getSelects(input).every(control => control.disabled)).toBe(true);
    for (const overrides of [{ usingFal: false, apiProvider: 'google' as const }, { isVideoMode: false }, { falModelId: 'kling/v3' }]) {
      expect(getSelects({ ...input, ...overrides }).some(control => control.id.startsWith('kling-v4-'))).toBe(false);
    }
  });

  it('keeps embedded defaults and edits independent of live settings and other bars', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.applyGenerationSettings({ ...savedGeneration, falOptions: { klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4Duration: '30' } }));
    const defaults = getNewVideoPromptBarDefaults(result.current);
    expect(defaults).toMatchObject({ modelId: KLING_V4_VIDEO_MODEL_ID, falOptions: KLING_V4_DEFAULTS });
    let bar: CanvasVideoPromptBar = { ...defaults, id: 'bar-a', assignedAreaId: null, x: 0, y: 0, width: 400, height: 100, falOptions: undefined };
    const otherBar: CanvasVideoPromptBar = { ...bar, id: 'bar-b' };
    const build = (target = bar) => buildEmbeddedPromptBarControlsInput({
      bar: target,
      barMembership: { orderedMediaIds: [], acceptedImageIds: [], acceptedVideoIds: [], acceptedAudioIds: [], elementImageIds: [], ignoredMediaIds: [], orderLabels: {} },
      fal: result.current, isLoading: false,
      updateBar: (id, updater) => { expect(id).toBe(bar.id); bar = updater(bar); },
    });
    expect(build()).toMatchObject({ isKlingV4VideoModel: true, ...KLING_V4_DEFAULTS });
    expect(getSelects(build()).map(control => control.id)).toEqual(['variant', 'aspect-ratio', 'resolution', 'duration'].map(name => `bar-a-kling-v4-${name}-select`));
    build().onKlingV4VariantChange('edit');
    expect(bar.falOptions).toMatchObject({ klingV4Variant: 'edit', klingV4Duration: 'source' });
    build().onKlingV4ResolutionChange('720p');
    build().onKlingV4DurationChange('30');
    build().onKlingV4AspectRatioChange('21:9');
    expect(build()).toMatchObject({ klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4Duration: '30', klingV4AspectRatio: '21:9' });
    build().onKlingV4VariantChange('generate');
    expect(bar.falOptions?.klingV4Duration).toBe('30');
    build().onKlingV4VariantChange('edit');
    build().onKlingV4VariantChange('generate');
    expect(bar.falOptions?.klingV4Duration).toBe('5');
    const beforeInvalid = bar;
    build().onKlingV4VariantChange('reference');
    build().onKlingV4ResolutionChange('4k');
    build().onKlingV4AspectRatioChange('source');
    build().onKlingV4DurationChange('31');
    build().onKlingV4DurationChange('source');
    expect(bar).toBe(beforeInvalid);
    expect(build(otherBar)).toMatchObject(KLING_V4_DEFAULTS);
    expect(result.current).toMatchObject({ klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4Duration: '30' });
  });

  it.each(['source', '30'] as const)('restores Edit duration %s and resets missing saved values instead of inheriting live settings', duration => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      expect(result.current.applyGenerationSettings({ ...savedGeneration, falOptions: { klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4AspectRatio: '21:9', klingV4Duration: duration } })).toBe(true);
    });
    expect(result.current).toMatchObject({ isKlingV4VideoModel: true, klingV4Variant: 'edit', klingV4Resolution: '720p', klingV4AspectRatio: '21:9', klingV4Duration: duration });
    act(() => { result.current.applyGenerationSettings(savedGeneration); });
    expect(result.current).toMatchObject(KLING_V4_DEFAULTS);
    act(() => { result.current.applyGenerationSettings({ ...savedGeneration, modelId: KLING_V4_EDIT_VIDEO_MODEL_ID }); });
    expect(result.current).toMatchObject({ falVideoModelId: KLING_V4_VIDEO_MODEL_ID, klingV4Variant: 'edit', klingV4Duration: 'source' });
  });

  it('restores explicit Generate settings ahead of an imported Edit endpoint alias', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.applyGenerationSettings({
        ...savedGeneration,
        modelId: KLING_V4_EDIT_VIDEO_MODEL_ID,
        falOptions: { klingV4Variant: 'generate', klingV4Resolution: '720p', klingV4Duration: '9' },
      });
    });
    expect(result.current).toMatchObject({
      falVideoModelId: KLING_V4_VIDEO_MODEL_ID, klingV4Variant: 'generate', klingV4Resolution: '720p', klingV4Duration: '9',
    });
  });

  it('repairs invalid replay fields and refuses Source duration in Generate', () => {
    const invalid = { ...savedGeneration, falOptions: { klingV4Variant: 'bad', klingV4Resolution: '4k', klingV4AspectRatio: 'source', klingV4Duration: '31' } } as unknown as GenerationInputs;
    expect(resolveGenerationTransferOptions(invalid, KLING_V4_VIDEO_MODEL_ID)).toMatchObject(KLING_V4_DEFAULTS);
    expect(resolveGenerationTransferOptions({ ...savedGeneration, falOptions: { klingV4Variant: 'generate', klingV4Duration: 'source' } }, KLING_V4_VIDEO_MODEL_ID).klingV4Duration).toBe('5');
    expect(resolveGenerationTransferOptions({ ...invalid, falOptions: { ...invalid.falOptions, klingV4Variant: 'edit' } }, KLING_V4_VIDEO_MODEL_ID).klingV4Duration).toBe('source');
  });
});
