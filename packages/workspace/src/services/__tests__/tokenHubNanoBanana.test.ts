import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import { Tool, type GenerationInputs } from '../../types';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';
import { getModelUiCapabilities } from '../modelCapabilities';
import { getModelReferenceCapabilities } from '../modelReferenceCapabilities';
import { NANO_BANANA_21_EDIT_MODEL_ID } from '../nanoBananaConfig';
import { buildPromptBarModelControls, getPromptBarModelOptions } from '../promptBarConfig';
import { buildFooterPromptBarControlsInput } from '../promptBarSettingsView';
import { buildSnapshotBinaryFromState, normalizeSnapshotImageMetadata, restoreSnapshotFromFile, snapshotBinaryToBlob, type SnapshotMetaState } from '../snapshotService';
import { TOKENHUB_NANO_BANANA_21_MODEL_ID, TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL } from '../tokenHubNanoBananaConfig';
import { resolveTokenHubNanoBananaRunSettings, serializeTokenHubNanoBananaGenerationOptions, serializeTokenHubNanoBananaInput } from '../tokenHubNanoBananaRunSettings';

const modelId = TOKENHUB_NANO_BANANA_21_MODEL_ID;
const options = {
  aspectRatioSelection: '8:1', resolutionSelection: '4K', numImages: 4,
  tokenHubNanoBananaWebSearch: true, tokenHubNanoBananaThinkingLevel: 'high',
} satisfies GenerationInputs['falOptions'];
const generation: GenerationInputs = { kind: 'image_edit', prompt: 'Make a panorama', provider: 'tokenhub', modelId, modelMode: 'image', falOptions: options };

describe('TokenHub NanoBanana 2.1', () => {
  it('registers a single image picker entry with camera settings and 14 references', () => {
    const models = getPromptBarModelOptions('image');
    expect(models.filter(model => model.value === modelId)).toEqual([{ value: modelId, label: 'NanoBanana 2.1 (TokenHub)' }]);
    expect(models.filter(model => model.value === NANO_BANANA_21_EDIT_MODEL_ID)).toHaveLength(1);
    expect(getPromptBarModelOptions('video').some(model => model.value === modelId)).toBe(false);
    expect(getModelUiCapabilities(modelId)).toMatchObject({ provider: 'tokenhub', supportsCameraSettings: true, maxReferenceImages: 14 });
    expect(getModelReferenceCapabilities(modelId, Tool.ANNOTATE)).toMatchObject({ availableReferenceSlots: 14 });
  });

  it('shows and restores live controls independently of the fal model', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.handleFalModelChange(NANO_BANANA_21_EDIT_MODEL_ID);
      result.current.handleNanoBananaWebSearchChange('false');
      result.current.handleNanoBananaThinkingLevelChange('minimal');
      result.current.handleFalModelChange(modelId);
      result.current.handleTokenHubNanoBananaWebSearchChange('true');
      result.current.handleTokenHubNanoBananaThinkingLevelChange('high');
      result.current.handleTokenHubNanoBananaThinkingLevelChange('invalid');
      result.current.handleFalAspectRatioChange('8:1');
      result.current.handleFalResolutionChange('4K');
      result.current.handleFalNumImagesChange(4);
    });
    const getControls = (hasFirstFrameImage: boolean) => buildPromptBarModelControls(buildFooterPromptBarControlsInput({
      apiProvider: 'fal', fal: result.current,
      flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
      hasFirstFrameImage, isLoading: false, shouldValidateFalOptions: true, isNumImagesInvalid: false,
    })) ?? [];
    const editControls = getControls(true);
    const selects = editControls.filter(control => control.id.startsWith('tokenhub-nano-banana-'));
    expect(selects.map(control => 'value' in control ? control.value : undefined)).toEqual(['8:1', '4K', 'high']);
    const generationControls = getControls(false);
    const generationSelects = generationControls.filter(control => control.id.startsWith('tokenhub-nano-banana-'));
    expect(generationSelects).toHaveLength(3);
    expect(generationSelects[0]).toMatchObject({
      id: 'tokenhub-nano-banana-aspect-ratio-select', value: '8:1', disabled: false,
      options: [
        { value: 'placeholder', label: 'Aspect Ratio' }, { value: 'default', label: 'Auto (default)' },
        ...['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16', '4:1', '1:4', '8:1', '1:8'].map(value => ({ value, label: value })),
      ],
    });
    const generationResolution = generationSelects[1];
    expect(generationResolution).toMatchObject({
      id: 'tokenhub-nano-banana-resolution-select', value: '4K', disabled: false,
      options: [{ value: '1K', label: '1K (default)' }, { value: '2K', label: '2K' }, { value: '4K', label: '4K' }],
    });
    if (!generationResolution || !('onChange' in generationResolution)) throw new Error('Missing generation resolution control');
    for (const resolution of ['1K', '2K', '4K']) {
      act(() => generationResolution.onChange(resolution));
      expect(getControls(false).find(control => control.id === 'tokenhub-nano-banana-resolution-select')).toMatchObject({ value: resolution });
      expect(getControls(false).find(control => control.id === 'tokenhub-nano-banana-aspect-ratio-select')).toMatchObject({ value: '8:1' });
    }
    const generationThinkingLevel = generationSelects[2];
    expect(generationThinkingLevel).toMatchObject({
      id: 'tokenhub-nano-banana-thinking-level-select', value: 'high', disabled: false,
      options: [{ value: 'minimal', label: 'Minimal' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }],
    });
    if (!generationThinkingLevel || !('onChange' in generationThinkingLevel)) throw new Error('Missing generation thinking level control');
    for (const thinkingLevel of ['minimal', 'medium', 'high']) {
      act(() => generationThinkingLevel.onChange(thinkingLevel));
      expect(getControls(false).find(control => control.id === 'tokenhub-nano-banana-thinking-level-select')).toMatchObject({ value: thinkingLevel });
      expect(getControls(true).find(control => control.id === 'tokenhub-nano-banana-thinking-level-select')).toMatchObject({ value: thinkingLevel });
    }
    expect(generationControls.find(control => control.id === 'tokenhub-nano-banana-web-search-select')).toBeUndefined();
    expect(editControls.find(control => control.id === 'tokenhub-nano-banana-web-search-select')).toBeUndefined();
    const generationAspectRatio = generationSelects[0];
    if (!generationAspectRatio || !('onChange' in generationAspectRatio)) throw new Error('Missing generation aspect ratio control');
    act(() => generationAspectRatio.onChange('default'));
    expect(getControls(false).find(control => control.id === 'tokenhub-nano-banana-aspect-ratio-select')).toMatchObject({ value: 'default' });
    expect(generationControls.find(control => control.id === 'fal-num-images-select')).toMatchObject({
      value: '4', options: ['1', '2', '3', '4'].map(value => ({ value, label: value })),
    });
    const count = editControls.find(control => control.id === 'fal-num-images-select');
    expect(count).toMatchObject({ value: '4', options: ['1', '2', '3', '4'].map(value => ({ value, label: value })) });
    expect(result.current).toMatchObject({ nanoBananaWebSearch: false, nanoBananaThinkingLevel: 'minimal' });
  });

  it.each(['text_to_image', 'image_edit'] as const)('serializes settings for %s under the TokenHub model', kind => {
    const settings = resolveTokenHubNanoBananaRunSettings({
      kind, aspectRatioSelection: '8:1', resolution: '4K', numImages: 4, webSearch: true, thinkingLevel: 'high',
    });
    expect(settings.kind).toBe(kind);
    expect(serializeTokenHubNanoBananaGenerationOptions(settings)).toEqual(options);
    expect(serializeTokenHubNanoBananaInput(settings)).toEqual({
      model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, aspect_ratio: '8:1', resolution: '4K',
      thinking_level: 'high', n: 4,
    });
  });

  it.each(['text_to_image', 'image_edit'] as const)('normalizes output counts for %s', kind => {
    for (const [numImages, expected] of [[undefined, 1], [0, 1], [2.9, 2], [9, 4], [NaN, 1]] as const) {
      expect(resolveTokenHubNanoBananaRunSettings({ kind, numImages }).numImages).toBe(expected);
      expect(resolveTokenHubNanoBananaRunSettings({ kind, numImages }, 'restore').numImages).toBe(expected);
    }
  });

  it('restores invalid or older settings under the TokenHub model', () => {
    const invalid = { aspectRatioSelection: 'bad', resolution: 'bad', numImages: 'bad', webSearch: 'bad', thinkingLevel: 'bad' };
    expect(() => resolveTokenHubNanoBananaRunSettings({ kind: 'image_edit', ...invalid })).toThrow(/aspect ratio and resolution/);
    expect(resolveTokenHubNanoBananaRunSettings({ kind: 'image_edit', ...invalid }, 'restore')).toMatchObject({
      kind: 'image_edit', model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL, aspectRatioSelection: 'default',
      resolution: '1K', numImages: 1, webSearch: false, thinkingLevel: 'medium',
    });
    expect(resolveGenerationTransferOptions({
      ...generation, falOptions: { nanoBananaWebSearch: true, nanoBananaThinkingLevel: 'high' },
    }, modelId)).toMatchObject({ tokenHubNanoBananaWebSearch: false, tokenHubNanoBananaThinkingLevel: 'medium', numImages: 1 });
    expect(normalizeSnapshotImageMetadata(JSON.parse(JSON.stringify({
      source: 'generated', generation: { ...generation, falOptions: { aspectRatioSelection: '1:1', tokenHubNanoBananaWebSearch: 'true', tokenHubNanoBananaThinkingLevel: 'invalid' } },
    })))?.generation?.falOptions).toEqual({ aspectRatioSelection: '1:1' });
  });

  it('round-trips a snapshot and transfers its Nano settings to the picker', async () => {
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL = () => 'blob:tokenhub-nano-test';
      static revokeObjectURL = () => undefined;
    });
    vi.stubGlobal('Image', class {
      onload?: () => void;
      naturalWidth = 1024;
      naturalHeight = 1024;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    try {
      const binary = await buildSnapshotBinaryFromState({
        images: [{
          id: 'tokenhub-nano', element: document.createElement('img'), mediaType: 'image', x: 0, y: 0,
          width: 1024, height: 1024, rotation: 0, naturalWidth: 1024, naturalHeight: 1024,
          file: new File(['image'], 'image.png', { type: 'image/png' }),
          metadata: { source: 'generated', generation },
        }],
        notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState,
      });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'tokenhub-nano.bcsnap'), {
        brushSize: 20, eraserSize: 20, brushColor: '#000000',
      });
      const saved = restored.images[0]?.metadata?.generation;
      expect(saved).toMatchObject(generation);
      if (!saved) throw new Error('Missing saved generation');
      const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
      act(() => { expect(result.current.applyGenerationSettings(saved)).toBe(true); });
      expect(result.current).toMatchObject({
        falImageModelId: modelId, falAspectRatioSelection: '8:1', falResolutionSelection: '4K', falNumImages: 4,
        tokenHubNanoBananaWebSearch: true, tokenHubNanoBananaThinkingLevel: 'high',
        nanoBananaWebSearch: false, nanoBananaThinkingLevel: 'medium',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
