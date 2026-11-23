import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GenerationInputs } from '../../types';
import { useFalSettings } from '../../hooks/useFalSettings';
import { resolveGenerationTransferOptions } from '../../utils/generationTransferSettings';
import { GPT_IMAGE_25_MODEL_ID, GPT_IMAGE_2_EDIT_MODEL_ID } from '../modelConfig';
import { buildPromptBarModelControls, getPromptBarModelOptions, type PromptBarControlsInput } from '../promptBarConfig';
import { buildSnapshotBinaryFromState, normalizeSnapshotImageMetadata, restoreSnapshotFromFile, snapshotBinaryToBlob, type SnapshotMetaState } from '../snapshotService';
import { TOKENHUB_GPT_IMAGE_25_MODEL_ID } from '../tokenHubGptImage25Config';

const generation: GenerationInputs = {
  kind: 'text_to_image', prompt: 'A subject', provider: 'tokenhub', modelId: TOKENHUB_GPT_IMAGE_25_MODEL_ID, modelMode: 'image',
};

describe('TokenHub GPT Image 2.5 controls and saved settings', () => {
  it('adds one TokenHub picker entry and preserves the fal entry', () => {
    const options = getPromptBarModelOptions('image');
    expect(options.filter(option => option.value === TOKENHUB_GPT_IMAGE_25_MODEL_ID)).toEqual([
      { value: TOKENHUB_GPT_IMAGE_25_MODEL_ID, label: 'GPT Image 2.5 (TokenHub)' },
    ]);
    expect(options.filter(option => option.value === GPT_IMAGE_25_MODEL_ID)).toEqual([
      { value: GPT_IMAGE_25_MODEL_ID, label: 'GPT Image 2.5' },
    ]);
  });

  it('shows independent OpenAI controls and output count only for TokenHub', () => {
    const onVariant = vi.fn();
    const input = {
      apiProvider: 'fal', falModelId: TOKENHUB_GPT_IMAGE_25_MODEL_ID, isVideoMode: false, falModelMode: 'image', usingFal: true,
      falNumImages: 1, falImageSizeSelection: 'auto', onTokenHubGptImage25VariantChange: onVariant, isLoading: true,
    } as unknown as PromptBarControlsInput;
    const controls = buildPromptBarModelControls(input) ?? [];
    const selects = controls.filter(control => control.id.startsWith('tokenhub-gpt-image-25-'));
    expect(selects.map(control => control.id)).toEqual(['variant', 'size', 'quality', 'background'].map(name => `tokenhub-gpt-image-25-${name}-select`));
    expect(selects.map(control => 'value' in control ? control.value : undefined)).toEqual(['sunburst', 'auto', 'high', 'auto']);
    expect(selects.every(control => control.disabled)).toBe(true);
    expect(controls.some(control => control.id === 'fal-num-images-select')).toBe(true);
    if ('onChange' in selects[0]) selects[0].onChange('flare');
    expect(onVariant).toHaveBeenCalledWith('flare');
    for (const falModelId of [GPT_IMAGE_25_MODEL_ID, GPT_IMAGE_2_EDIT_MODEL_ID]) {
      expect((buildPromptBarModelControls({ ...input, falModelId }) ?? []).some(control => control.id.startsWith('tokenhub-gpt-image-25-'))).toBe(false);
    }
  });

  it('validates handlers and restores TokenHub snapshot options independently of fal settings', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => {
      result.current.handleGptImage25VariantChange('flare');
      result.current.handleGptImage25QualityChange('low');
      result.current.handleTokenHubGptImage25VariantChange('sunburst');
      result.current.handleTokenHubGptImage25QualityChange('max');
      result.current.handleTokenHubGptImage25BackgroundChange('opaque');
      result.current.handleTokenHubGptImage25VariantChange('bad');
      result.current.handleTokenHubGptImage25QualityChange('bad');
      result.current.handleTokenHubGptImage25BackgroundChange('bad');
    });
    expect(result.current).toMatchObject({
      gptImage25Variant: 'flare', gptImage25Quality: 'low',
      tokenHubGptImage25Variant: 'sunburst', tokenHubGptImage25Quality: 'max', tokenHubGptImage25Background: 'opaque',
    });
    const metadata = normalizeSnapshotImageMetadata(JSON.parse(JSON.stringify({
      source: 'generated', generation: {
        ...generation,
        falOptions: {
          tokenHubGptImage25Variant: 'flare', tokenHubGptImage25Quality: 'xhigh', tokenHubGptImage25Background: 'transparent',
          imageSizeSelection: '2048x2048', numImages: 4,
        },
      },
    })));
    act(() => { expect(result.current.applyGenerationSettings(metadata!.generation!)).toBe(true); });
    expect(result.current).toMatchObject({
      falImageModelId: TOKENHUB_GPT_IMAGE_25_MODEL_ID,
      gptImage25Variant: 'flare', gptImage25Quality: 'low',
      tokenHubGptImage25Variant: 'flare', tokenHubGptImage25Quality: 'xhigh', tokenHubGptImage25Background: 'transparent',
      falImageSizeSelection: '2048x2048', falNumImages: 4,
    });
  });

  it('restores defaults for missing or malformed saved options', () => {
    const saved = {
      ...generation,
      falOptions: { tokenHubGptImage25Variant: 'bad', tokenHubGptImage25Quality: 'bad', tokenHubGptImage25Background: 'bad', imageSizeSelection: 'bad', numImages: NaN },
    } as unknown as GenerationInputs;
    expect(resolveGenerationTransferOptions(saved, TOKENHUB_GPT_IMAGE_25_MODEL_ID)).toMatchObject({
      tokenHubGptImage25Variant: 'sunburst', tokenHubGptImage25Quality: 'high', tokenHubGptImage25Background: 'auto', imageSizeSelection: 'auto', numImages: 1,
    });
  });

  it('preserves TokenHub generation settings through snapshot save and reopen', async () => {
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL = () => 'blob:tokenhub-test';
      static revokeObjectURL = () => undefined;
    });
    vi.stubGlobal('Image', class {
      onload?: () => void;
      naturalWidth = 1024;
      naturalHeight = 1024;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    try {
      const savedGeneration: GenerationInputs = {
        ...generation,
        falOptions: {
          tokenHubGptImage25Variant: 'flare', tokenHubGptImage25Quality: 'max', tokenHubGptImage25Background: 'transparent',
          imageSizeSelection: '1536x1024', numImages: 4,
        },
      };
      const binary = await buildSnapshotBinaryFromState({
        images: [{
          id: 'tokenhub-image', element: document.createElement('img'), mediaType: 'image', x: 0, y: 0, width: 1024, height: 1024,
          rotation: 0, naturalWidth: 1024, naturalHeight: 1024, file: new File(['image'], 'image.png', { type: 'image/png' }),
          metadata: { source: 'generated', generation: savedGeneration },
        }],
        notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState,
      });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'tokenhub.bcsnap', { type: 'application/octet-stream' }), {
        brushSize: 20, eraserSize: 20, brushColor: '#000000',
      });
      expect(restored.images[0]?.metadata?.generation).toMatchObject(savedGeneration);
      const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
      act(() => { expect(result.current.applyGenerationSettings(restored.images[0].metadata!.generation!)).toBe(true); });
      expect(result.current).toMatchObject({
        falImageModelId: TOKENHUB_GPT_IMAGE_25_MODEL_ID, tokenHubGptImage25Variant: 'flare', tokenHubGptImage25Quality: 'max',
        tokenHubGptImage25Background: 'transparent', falImageSizeSelection: '1536x1024', falNumImages: 4,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
