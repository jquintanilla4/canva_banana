import { act, renderHook } from '@testing-library/react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import type { GenerationInputs } from '../../types';
import { normalizeFalModelId, FAL_IMAGE_MODEL_OPTIONS } from '../modelConfig';
import { NANO_BANANA_21_EDIT_MODEL_ID, NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID, NANO_BANANA_PRO_EDIT_MODEL_ID, NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID } from '../nanoBananaConfig';
import { resolveNanoBananaRunSettings, serializeNanoBananaGenerationOptions, type NanoBananaRunSettings } from '../nanoBananaRunSettings';
import { resolveNanoBananaSettingsForRequest, serializeNanoBananaInput } from '../fal/nanoBanana';
import { buildPromptBarModelControls, type PromptBarControlsInput } from '../promptBarConfig';
import { buildNanoBananaControls } from '../promptBar/nanoBananaControls';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';

const modelId = NANO_BANANA_21_EDIT_MODEL_ID;
describe('Nano Banana centralized settings', () => {
  it('constrains resolved endpoints and ratios by operation and model family', () => {
    type Text21 = Extract<NanoBananaRunSettings<'text_to_image'>, { modelId: typeof modelId }>;
    type TextPro = Extract<NanoBananaRunSettings<'text_to_image'>, { modelId: typeof NANO_BANANA_PRO_EDIT_MODEL_ID }>;
    type EditPro = Extract<NanoBananaRunSettings<'image_edit'>, { modelId: typeof NANO_BANANA_PRO_EDIT_MODEL_ID }>;
    const text = resolveNanoBananaRunSettings({ kind: 'text_to_image', modelId });
    expectTypeOf(text.kind).toEqualTypeOf<'text_to_image'>();
    expectTypeOf<Text21['endpoint']>().toEqualTypeOf<typeof NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID>();
    expectTypeOf<TextPro['endpoint']>().toEqualTypeOf<typeof NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID>();
    expectTypeOf<EditPro['endpoint']>().toEqualTypeOf<typeof NANO_BANANA_PRO_EDIT_MODEL_ID>();
    expectTypeOf<Omit<Text21, 'endpoint'> & { endpoint: typeof modelId }>().not.toExtend<NanoBananaRunSettings>();
    expectTypeOf<Omit<Text21, 'endpoint'> & { endpoint: typeof NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID }>().not.toExtend<NanoBananaRunSettings>();
    expectTypeOf<Omit<Text21, 'endpoint'> & { endpoint: 'arbitrary/endpoint' }>().not.toExtend<NanoBananaRunSettings>();
    expectTypeOf<Omit<Text21, 'aspectRatioSelection'> & { aspectRatioSelection: '2:1' }>().not.toExtend<NanoBananaRunSettings>();
    expectTypeOf<Omit<Text21, 'aspectRatioSelection'> & { aspectRatioSelection: 'placeholder' }>().not.toExtend<NanoBananaRunSettings>();
    expectTypeOf<Omit<TextPro, 'aspectRatioSelection'> & { aspectRatioSelection: '8:1' }>().not.toExtend<NanoBananaRunSettings>();
    expectTypeOf(() => {
      // @ts-expect-error An edit operation cannot accept resolved text settings.
      resolveNanoBananaSettingsForRequest('image_edit', { nanoBananaRunSettings: text });
    }).returns.toBeVoid();
  });

  it.each([
    [NANO_BANANA_PRO_EDIT_MODEL_ID, 'text_to_image', NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID],
    [NANO_BANANA_PRO_EDIT_MODEL_ID, 'image_edit', NANO_BANANA_PRO_EDIT_MODEL_ID],
    [modelId, 'text_to_image', NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID],
    [modelId, 'image_edit', modelId],
  ] as const)('routes %s %s to its matching endpoint', (selectedModelId, kind, endpoint) => {
    expect(resolveNanoBananaRunSettings({ kind, modelId: selectedModelId }).endpoint).toBe(endpoint);
  });

  it.each(['4:1', '1:4', '8:1', '1:8'])('restricts %s to 2.1 and repairs incompatible saved Pro settings', aspectRatioSelection => {
    for (const kind of ['text_to_image', 'image_edit'] as const) {
      expect(resolveNanoBananaRunSettings({ kind, modelId, aspectRatioSelection }).aspectRatioSelection).toBe(aspectRatioSelection);
      expect(() => resolveNanoBananaRunSettings({ kind, modelId: NANO_BANANA_PRO_EDIT_MODEL_ID, aspectRatioSelection })).toThrow(/aspect ratio/);
      expect(resolveNanoBananaRunSettings({ kind, modelId: NANO_BANANA_PRO_EDIT_MODEL_ID, aspectRatioSelection }, 'restore').aspectRatioSelection).toBe('default');
    }
  });

  it.each(['fal-ai/nano-banana-2', 'fal-ai/nano-banana-2/edit', NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID, modelId])('migrates %s to the single selector', endpoint => {
    expect(normalizeFalModelId(endpoint)).toBe(modelId);
    expect(FAL_IMAGE_MODEL_OPTIONS.filter(option => option.label === 'NanoBanana 2.1')).toHaveLength(1);
    expect(FAL_IMAGE_MODEL_OPTIONS.map(option => option.label)).not.toContain('NanoBanana 2');
  });

  it.each(['text_to_image', 'image_edit'] as const)('resolves and serializes %s consistently', kind => {
    const settings = resolveNanoBananaRunSettings({ kind, modelId, aspectRatioSelection: '8:1', resolution: '4K', webSearch: true, thinkingLevel: 'high', numImages: 5 });
    expect(settings.endpoint).toBe(kind === 'image_edit' ? modelId : NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID);
    expect(serializeNanoBananaInput(settings)).toMatchObject({ aspect_ratio: '8:1', resolution: '4K', enable_web_search: true, thinking_level: 'high', num_images: 4, sync_mode: false });
    expect(serializeNanoBananaGenerationOptions(settings)).toMatchObject({ aspectRatioSelection: '8:1', resolutionSelection: '4K', nanoBananaWebSearch: true, nanoBananaThinkingLevel: 'high', numImages: 4 });
    expect(serializeNanoBananaInput(resolveNanoBananaRunSettings({ kind, modelId }))).toMatchObject({ enable_web_search: false, thinking_level: 'medium', resolution: '1K' });
  });

  it('validates request sizes and repairs malformed saved settings', () => {
    expect(() => resolveNanoBananaRunSettings({ kind: 'text_to_image', modelId, aspectRatioSelection: 'bad' })).toThrow(/aspect ratio/);
    expect(() => resolveNanoBananaRunSettings({ kind: 'image_edit', modelId, resolution: 'bad' })).toThrow(/resolution/);
    const generation = { kind: 'image_edit', provider: 'fal', modelId, prompt: 'A subject', falOptions: {
      aspectRatioSelection: 'bad', resolutionSelection: 'bad', nanoBananaWebSearch: 'true', nanoBananaThinkingLevel: 'bad', numImages: NaN,
    } } as unknown as GenerationInputs;
    expect(resolveGenerationTransferOptions(generation, modelId)).toMatchObject({ aspectRatioSelection: 'default', resolutionSelection: '1K', nanoBananaWebSearch: false, nanoBananaThinkingLevel: 'medium', numImages: 1 });
  });

  it('keeps Pro controls and requests free of 2.1-only settings', () => {
    const settings = resolveNanoBananaRunSettings({ kind: 'image_edit', modelId: NANO_BANANA_PRO_EDIT_MODEL_ID, webSearch: true, thinkingLevel: 'high' });
    expect(serializeNanoBananaInput(settings)).not.toHaveProperty('enable_web_search');
    expect(serializeNanoBananaInput(settings)).not.toHaveProperty('thinking_level');
    expect(() => resolveNanoBananaRunSettings({ kind: 'image_edit', modelId: NANO_BANANA_PRO_EDIT_MODEL_ID, aspectRatioSelection: '8:1' })).toThrow();
  });

  it('shows dropdown defaults, forwards changes, and disables controls during generation', () => {
    const onWebSearch = vi.fn(); const onThinking = vi.fn();
    const input = { apiProvider: 'fal', falModelId: modelId, isNanoBananaModel: true, falNumImages: 1, isLoading: true,
      onFalAspectRatioChange: vi.fn(), onFalResolutionChange: vi.fn(), onNanoBananaWebSearchChange: onWebSearch, onNanoBananaThinkingLevelChange: onThinking,
    } as unknown as PromptBarControlsInput;
    const controls = (buildPromptBarModelControls(input) ?? []).filter(control => control.id.startsWith('fal-nano-banana-'));
    expect(controls.map(control => 'value' in control ? control.value : undefined)).toEqual(['false', 'medium']);
    expect(controls.every(control => control.disabled)).toBe(true);
    if ('onChange' in controls[0]) controls[0].onChange('true');
    if ('onChange' in controls[1]) controls[1].onChange('high');
    expect(onWebSearch).toHaveBeenCalledWith('true'); expect(onThinking).toHaveBeenCalledWith('high');
    expect((buildPromptBarModelControls({ ...input, apiProvider: 'google' }) ?? []).some(control => control.id.startsWith('fal-nano-banana-'))).toBe(false);
    expect(buildNanoBananaControls({ modelId: NANO_BANANA_PRO_EDIT_MODEL_ID, isLoading: false, onAspectRatioChange: vi.fn(), onResolutionChange: vi.fn(), onWebSearchChange: vi.fn(), onThinkingLevelChange: vi.fn() })).toHaveLength(2);
  });

  it.each(['fal-ai/nano-banana-2', modelId, NANO_BANANA_PRO_EDIT_MODEL_ID])('restores %s independently of live settings', savedModelId => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.handleNanoBananaWebSearchChange('true'); result.current.handleNanoBananaThinkingLevelChange('high');
      result.current.setFalAspectRatioSelection('16:9'); result.current.setFalResolutionSelection('4K'); result.current.setFalNumImages(3);
      result.current.applyGenerationSettings({ kind: 'text_to_image', provider: 'fal', modelId: savedModelId, prompt: 'A subject' });
    });
    expect(result.current).toMatchObject({ falImageModelId: savedModelId === NANO_BANANA_PRO_EDIT_MODEL_ID ? savedModelId : modelId,
      nanoBananaWebSearch: false, nanoBananaThinkingLevel: 'medium', falAspectRatioSelection: 'default', falResolutionSelection: '1K', falNumImages: 1 });
    act(() => result.current.applyGenerationSettings({ kind: 'image_edit', provider: 'fal', modelId, prompt: 'A subject', falOptions: {
      nanoBananaWebSearch: true, nanoBananaThinkingLevel: 'minimal', aspectRatioSelection: '8:1', resolutionSelection: '2K', numImages: 4,
    } }));
    expect(result.current).toMatchObject({ nanoBananaWebSearch: true, nanoBananaThinkingLevel: 'minimal', falAspectRatioSelection: '8:1', falResolutionSelection: '2K', falNumImages: 4 });
  });
});
