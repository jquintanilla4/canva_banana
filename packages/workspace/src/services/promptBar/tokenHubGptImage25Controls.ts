import type { PromptBarSelectControl } from '../../components/promptBarControls';
import type { TokenHubGptImage25Background, TokenHubGptImage25Quality, TokenHubGptImage25Variant } from '../tokenHubGptImage25Config';
import { TOKENHUB_GPT_IMAGE_25_BACKGROUND_OPTIONS, TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS, TOKENHUB_GPT_IMAGE_25_QUALITY_OPTIONS, TOKENHUB_GPT_IMAGE_25_VARIANT_OPTIONS } from '../tokenHubGptImage25Config';
import { resolveTokenHubGptImage25RunSettings } from '../tokenHubGptImage25RunSettings';

export interface TokenHubGptImage25ControlsInput {
  isLoading: boolean;
  quality?: TokenHubGptImage25Quality;
  variant?: TokenHubGptImage25Variant;
  background?: TokenHubGptImage25Background;
  imageSizeSelection?: string;
  onSizeChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onVariantChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
}

export const buildTokenHubGptImage25Controls = (input: TokenHubGptImage25ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveTokenHubGptImage25RunSettings({
    kind: 'text_to_image', quality: input.quality, variant: input.variant,
    background: input.background, imageSizeSelection: input.imageSizeSelection,
  }, 'restore');
  return [{
    id: 'tokenhub-gpt-image-25-variant-select',
    prefixLabel: 'Variant',
    ariaLabel: 'Select GPT Image 2.5 (TokenHub) variant',
    options: TOKENHUB_GPT_IMAGE_25_VARIANT_OPTIONS,
    value: settings.variant,
    onChange: input.onVariantChange,
    disabled: input.isLoading,
  }, {
    id: 'tokenhub-gpt-image-25-size-select',
    prefixLabel: 'Size',
    ariaLabel: 'Select GPT Image 2.5 (TokenHub) size',
    options: TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS,
    value: settings.imageSizeSelection,
    onChange: input.onSizeChange,
    disabled: input.isLoading,
  }, {
    id: 'tokenhub-gpt-image-25-quality-select',
    prefixLabel: 'Quality',
    ariaLabel: 'Select GPT Image 2.5 (TokenHub) quality',
    options: TOKENHUB_GPT_IMAGE_25_QUALITY_OPTIONS,
    value: settings.quality,
    onChange: input.onQualityChange,
    disabled: input.isLoading,
  }, {
    id: 'tokenhub-gpt-image-25-background-select',
    prefixLabel: 'Background',
    ariaLabel: 'Select GPT Image 2.5 (TokenHub) background',
    options: TOKENHUB_GPT_IMAGE_25_BACKGROUND_OPTIONS,
    value: settings.background,
    onChange: input.onBackgroundChange,
    disabled: input.isLoading,
  }];
};
