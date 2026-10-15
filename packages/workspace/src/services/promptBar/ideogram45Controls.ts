import type { PromptBarSelectControl } from '../../components/promptBarControls';
import type { Ideogram45EditPrecision, Ideogram45Quality } from '../../types';
import { IDEOGRAM_45_EDIT_PRECISION_OPTIONS, IDEOGRAM_45_IMAGE_SIZE_OPTIONS } from '../ideogram45Config';
import { resolveIdeogram45RunSettings } from '../ideogram45RunSettings';

export interface Ideogram45ControlsInput {
  isEditing: boolean;
  isLoading: boolean;
  quality?: Ideogram45Quality;
  editPrecision?: Ideogram45EditPrecision;
  imageSizeSelection?: string;
  onSizeChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onEditPrecisionChange: (value: string) => void;
}

export const buildIdeogram45Controls = (input: Ideogram45ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveIdeogram45RunSettings({
    kind: input.isEditing ? 'image_edit' : 'text_to_image',
    quality: input.quality,
    editPrecision: input.editPrecision,
    imageSizeSelection: input.imageSizeSelection,
  }, 'restore'); // Preview effective settings without overwriting the user's picker preferences.
  return [{
    id: 'fal-ideogram-45-size-select',
    prefixLabel: 'Size',
    ariaLabel: 'Select Ideogram 4.5 size',
    options: IDEOGRAM_45_IMAGE_SIZE_OPTIONS,
    value: settings.imageSizeSelection,
    onChange: input.onSizeChange,
    disabled: input.isLoading || settings.preserveSourceSize,
    ...(settings.preserveSourceSize ? { tooltip: 'High-precision edits preserve the source size.' } : {}),
  }, {
    id: 'fal-ideogram-45-quality-select',
    prefixLabel: 'Quality',
    ariaLabel: 'Select Ideogram 4.5 quality',
    options: settings.qualityOptions,
    value: settings.quality,
    onChange: input.onQualityChange,
    disabled: input.isLoading,
  }, {
    id: 'fal-ideogram-45-edit-precision-select',
    prefixLabel: 'Edit precision',
    ariaLabel: 'Select Ideogram 4.5 edit precision',
    options: IDEOGRAM_45_EDIT_PRECISION_OPTIONS,
    value: settings.editPrecision,
    onChange: input.onEditPrecisionChange,
    disabled: input.isLoading || !input.isEditing,
    tooltip: input.isEditing ? 'High precision restores unchanged pixels.' : 'Select an image to enable edit precision.',
  }];
};
