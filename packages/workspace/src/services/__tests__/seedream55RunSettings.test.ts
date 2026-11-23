import { describe, expect, it } from 'vitest';
import { Tool } from '../../types';
import { FAL_IMAGE_MODEL_OPTIONS, getFalNumImageMaxForModel, getFalNumImageOptionsForModel, isFalImageSizeSelectionValue, isGenerationKind, normalizeFalModelId } from '../modelConfig';
import { getModelReferenceCapabilities } from '../modelReferenceCapabilities';
import { SEEDREAM_55_MODEL_ID, isSeedream55Model } from '../seedream55Config';
import { resolveSeedream55RunSettings, serializeSeedream55GenerationOptions } from '../seedream55RunSettings';

describe('Seedream 5.5 run settings', () => {
  it('represents every endpoint with one picker entry and shared capabilities', () => {
    expect(FAL_IMAGE_MODEL_OPTIONS.filter(option => isSeedream55Model(option.value))).toEqual([{ value: SEEDREAM_55_MODEL_ID, label: 'Seedream 5.5' }]);
    for (const suffix of ['', '/text-to-image', '/edit', '/layerize']) {
      const id = `${SEEDREAM_55_MODEL_ID}${suffix}`;
      expect(normalizeFalModelId(id)).toBe(SEEDREAM_55_MODEL_ID);
      expect(getFalNumImageMaxForModel(id)).toBe(6);
      expect(getFalNumImageOptionsForModel(id)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(getModelReferenceCapabilities(id, Tool.SELECTION)).toEqual({ referenceCapacity: 9, annotationSlots: 0, availableReferenceSlots: 9 });
      expect(getModelReferenceCapabilities(id, Tool.ANNOTATE)).toEqual({ referenceCapacity: 9, annotationSlots: 1, availableReferenceSlots: 8 });
    }
    expect(isFalImageSizeSelectionValue('auto_1.5K')).toBe(true);
    expect(isGenerationKind('layerize')).toBe(true);
  });
  it('shares defaults and normalizes transparent output through persistence', () => {
    expect(resolveSeedream55RunSettings('text_to_image', {})).toEqual({ kind: 'text_to_image', endpoint: `${SEEDREAM_55_MODEL_ID}/text-to-image`, numImages: 1, imageSizeSelection: 'auto_2K', background: 'auto', outputFormat: 'png' });
    const settings = resolveSeedream55RunSettings('image_edit', { imageSizeSelection: 'auto_1.5K', numImages: 10, seedream55Background: 'transparent', seedream55OutputFormat: 'jpeg' });
    expect(settings).toMatchObject({ numImages: 6, outputFormat: 'png', background: 'transparent' });
    expect(serializeSeedream55GenerationOptions(settings)).toEqual({ imageSizeSelection: 'auto_1.5K', numImages: 6, seedream55Background: 'transparent', seedream55OutputFormat: 'png' });
    expect(resolveSeedream55RunSettings('text_to_image', { seedream55OutputFormat: 'jpeg' }).outputFormat).toBe('jpeg');
  });
  it('rejects unsupported sizes for runs and restores safe saved values', () => {
    expect(() => resolveSeedream55RunSettings('image_edit', { imageSizeSelection: 'auto_4K' })).toThrow('supported Seedream 5.5');
    expect(resolveSeedream55RunSettings('image_edit', { imageSizeSelection: 'auto_4K', numImages: Number.NaN }, 'restore')).toMatchObject({ imageSizeSelection: 'auto_2K', numImages: 1 });
  });
});
