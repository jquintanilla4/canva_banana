import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../../hooks/useFalSettings';
import { useGenerationGuards, type GenerationGuardsArgs } from '../../hooks/useGenerationGuards';
import { Tool } from '../../types';
import { buildSeedream55Controls } from '../promptBar/seedream55Controls';
import { SEEDREAM_55_MODEL_ID } from '../seedream55Config';
import { normalizeSnapshotImageMetadata } from '../snapshotService';

const guardArgs: GenerationGuardsArgs = {
  apiProvider: 'fal', appMode: 'CANVAS', tool: Tool.SELECTION, prompt: '',
  isKlingO3EditMode: false, hasSourceVideo: false, hasSourceAudio: false, isVideoMode: false,
  isUpscaleModel: false, isSeedreamModel: false, isNanoBananaModel: false, isGrokModel: false,
  isGrokImagineVideoModel: false, isKlingVideoModel: false, isKlingO3VideoModel: false,
  isKlingV3ControlVideoModel: false, isVeo31VideoModel: false, isSeedance2VideoModel: false,
  seedance2Variant: 'smart', seedance2ReferenceAssetCount: 0, veo31Variant: 'i2v-fflf',
  falModelId: SEEDREAM_55_MODEL_ID, falNumImages: 1, activePrimaryImage: { id: 'source' },
  primarySelectionMediaType: 'image', hasSelectedStillImage: true, selectedMediaCount: 1, selectedStillImageCount: 1,
};

describe('Seedream 5.5 contextual Layerize settings', () => {
  it('always shows ordinary size and appearance controls without a mode picker', () => {
    const controls = buildSeedream55Controls({
      isLoading: false, onSizeChange: vi.fn(), onBackgroundChange: vi.fn(), onOutputFormatChange: vi.fn(),
    });
    expect(controls.map(control => control.id)).toEqual([
      'fal-seedream-55-size-select', 'fal-seedream-55-background-select', 'fal-seedream-55-format-select',
    ]);
  });

  it('keeps ordinary Generate prompt requirements and image count validation with a selected image', () => {
    const { result, rerender } = renderHook(args => useGenerationGuards(args), { initialProps: guardArgs });
    expect(result.current.submitDisabled).toBe(true);
    expect(result.current.promptPlaceholderText).toContain('Describe your edit');
    rerender({ ...guardArgs, prompt: 'Edit the poster' });
    expect(result.current.submitDisabled).toBe(false);
    rerender({ ...guardArgs, prompt: 'Edit the poster', falNumImages: 7 });
    expect(result.current.submitDisabled).toBe(true);
  });

  it('retains saved Layerize kind and source while dropping the obsolete persisted selector', () => {
    const snapshotJson = JSON.stringify({
      source: 'generated', generation: {
        kind: 'layerize', prompt: 'Separate the title', provider: 'fal',
        modelId: `${SEEDREAM_55_MODEL_ID}/layerize`, modelMode: 'image', primaryImageId: 'source',
        falOptions: { seedream55Mode: 'layerize' },
      },
    });
    const saved = normalizeSnapshotImageMetadata(JSON.parse(snapshotJson));
    const generation = saved?.generation;
    if (!generation) throw new Error('Layerize generation metadata was dropped.');
    expect(generation).toMatchObject({ kind: 'layerize', primaryImageId: 'source', prompt: 'Separate the title' });
    expect(generation.falOptions).toBeUndefined();
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => expect(result.current.applyGenerationSettings(generation)).toBe(true));
    expect(result.current).toMatchObject({ falImageModelId: SEEDREAM_55_MODEL_ID, falImageSizeSelection: 'auto_2K', falNumImages: 1 });
    expect(result.current).not.toHaveProperty('seedream55Mode');
  });
});
