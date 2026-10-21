import type { PromptBarSelectControl } from '../../components/promptBarControls';
import type { FalGptImage2QualityOption } from '../../types';
import { GPT_IMAGE_2_IMAGE_SIZE_OPTIONS, GPT_IMAGE_2_QUALITY_OPTIONS } from '../gptImage2Config';
import { resolveGptImage2RunSettings } from '../gptImage2RunSettings';

export interface GptImage2ControlsInput {
  isLoading: boolean;
  quality?: FalGptImage2QualityOption;
  imageSizeSelection?: string;
  onSizeChange: (value: string) => void;
  onQualityChange: (value: string) => void;
}

export const buildGptImage2Controls = (input: GptImage2ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveGptImage2RunSettings({
    kind: 'text_to_image', quality: input.quality, imageSizeSelection: input.imageSizeSelection,
  }, 'restore'); // Both operations share the same controls.
  return [{
    id: 'fal-gpt-image-2-size-select',
    prefixLabel: 'Size',
    ariaLabel: 'Select GPT Image 2 image size',
    options: GPT_IMAGE_2_IMAGE_SIZE_OPTIONS,
    value: settings.imageSizeSelection,
    onChange: input.onSizeChange,
    disabled: input.isLoading,
  }, {
    id: 'fal-gpt-image-2-quality-select',
    prefixLabel: 'Quality',
    ariaLabel: 'Select GPT Image 2 quality',
    options: GPT_IMAGE_2_QUALITY_OPTIONS,
    value: settings.quality,
    onChange: input.onQualityChange,
    disabled: input.isLoading,
  }];
};
