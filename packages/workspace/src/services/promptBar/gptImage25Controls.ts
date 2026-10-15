import type { PromptBarSelectControl } from '../../components/promptBarControls';
import type { GptImage25Background, GptImage25Quality, GptImage25Variant } from '../../types';
import { GPT_IMAGE_25_BACKGROUND_OPTIONS, GPT_IMAGE_25_IMAGE_SIZE_OPTIONS, GPT_IMAGE_25_QUALITY_OPTIONS, GPT_IMAGE_25_VARIANT_OPTIONS } from '../gptImage25Config';
import { resolveGptImage25RunSettings } from '../gptImage25RunSettings';

export interface GptImage25ControlsInput {
  isLoading: boolean;
  quality?: GptImage25Quality;
  variant?: GptImage25Variant;
  background?: GptImage25Background;
  imageSizeSelection?: string;
  onSizeChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onVariantChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
}

export const buildGptImage25Controls = (input: GptImage25ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveGptImage25RunSettings({
    kind: 'text_to_image', quality: input.quality, variant: input.variant,
    background: input.background, imageSizeSelection: input.imageSizeSelection,
  }, 'restore'); // Both operations share the same controls.
  return [{
    id: 'fal-gpt-image-25-variant-select',
    prefixLabel: 'Variant',
    ariaLabel: 'Select GPT Image 2.5 variant',
    options: GPT_IMAGE_25_VARIANT_OPTIONS,
    value: settings.variant,
    onChange: input.onVariantChange,
    disabled: input.isLoading,
  }, {
    id: 'fal-gpt-image-25-size-select',
    prefixLabel: 'Size',
    ariaLabel: 'Select GPT Image 2.5 size',
    options: GPT_IMAGE_25_IMAGE_SIZE_OPTIONS,
    value: settings.imageSizeSelection,
    onChange: input.onSizeChange,
    disabled: input.isLoading,
  }, {
    id: 'fal-gpt-image-25-quality-select',
    prefixLabel: 'Quality',
    ariaLabel: 'Select GPT Image 2.5 quality',
    options: GPT_IMAGE_25_QUALITY_OPTIONS,
    value: settings.quality,
    onChange: input.onQualityChange,
    disabled: input.isLoading,
  }, {
    id: 'fal-gpt-image-25-background-select',
    prefixLabel: 'Background',
    ariaLabel: 'Select GPT Image 2.5 background',
    options: GPT_IMAGE_25_BACKGROUND_OPTIONS,
    value: settings.background,
    onChange: input.onBackgroundChange,
    disabled: input.isLoading,
  }];
};
