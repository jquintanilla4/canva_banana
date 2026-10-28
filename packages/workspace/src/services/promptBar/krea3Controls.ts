import type { PromptBarSelectControl } from '../../components/promptBarControls';
import { KREA_3_IMAGE_SIZE_OPTIONS, KREA_3_VARIANT_OPTIONS, KREA_3_TEXT_REASONING_OPTIONS, KREA_3_EDIT_REASONING_OPTIONS, type Krea3Variant, type Krea3ReasoningLevel } from '../krea3Config';
import { resolveKrea3RunSettings } from '../krea3RunSettings';

export interface Krea3ControlsInput {
  isLoading: boolean;
  isEditing: boolean;
  variant?: Krea3Variant;
  reasoningLevel?: Krea3ReasoningLevel;
  imageSizeSelection?: string;
  onSizeChange: (value: string) => void;
  onVariantChange: (value: string) => void;
  onReasoningLevelChange: (value: string) => void;
}

export const buildKrea3Controls = (input: Krea3ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveKrea3RunSettings({
    kind: input.isEditing ? 'image_edit' : 'text_to_image', variant: input.variant,
    reasoningLevel: input.reasoningLevel, imageSizeSelection: input.imageSizeSelection,
  }, 'restore');
  return [{
    id: 'fal-krea-3-variant-select', prefixLabel: 'Variant', ariaLabel: 'Select Krea 3 variant',
    options: KREA_3_VARIANT_OPTIONS, value: settings.variant, onChange: input.onVariantChange, disabled: input.isLoading,
  }, {
    id: 'fal-krea-3-size-select', prefixLabel: 'Size', ariaLabel: 'Select Krea 3 size',
    options: KREA_3_IMAGE_SIZE_OPTIONS, value: settings.imageSizeSelection, onChange: input.onSizeChange,
    disabled: input.isLoading || settings.reasoningLevel === 'ultra',
  }, {
    id: 'fal-krea-3-reasoning-select', prefixLabel: 'Reasoning', ariaLabel: 'Select Krea 3 reasoning level',
    options: input.isEditing ? KREA_3_EDIT_REASONING_OPTIONS : KREA_3_TEXT_REASONING_OPTIONS,
    value: settings.reasoningLevel, onChange: input.onReasoningLevelChange, disabled: input.isLoading,
  }];
};
