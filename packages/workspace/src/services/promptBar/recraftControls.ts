import type { PromptBarControl } from '../../components/promptBarControls';
import { RECRAFT_V4_PRO_IMAGE_SIZE_OPTIONS, RECRAFT_V4_PRO_MAX_COLORS, recraftRgbToHex, type RecraftRgbColor } from '../recraftConfig';
import { resolveRecraftRunSettings } from '../recraftRunSettings';

export interface RecraftControlsInput {
  isLoading: boolean;
  imageSize?: string;
  backgroundColor?: RecraftRgbColor;
  colors?: RecraftRgbColor[];
  onImageSizeChange: (value: string) => void;
  onBackgroundColorChange: (value: string) => void;
  onColorChange: (index: number, value: string) => void;
  onAddColor: () => void;
  onRemoveColor: () => void;
}

export const buildRecraftControls = (input: RecraftControlsInput): ReadonlyArray<PromptBarControl> => {
  const settings = resolveRecraftRunSettings({
    imageSize: input.imageSize, backgroundColor: input.backgroundColor, colors: input.colors,
  }, 'restore');
  const controls: PromptBarControl[] = [{
    id: 'recraft-image-size-select',
    prefixLabel: 'Image Size',
    ariaLabel: 'Select Recraft image size',
    options: RECRAFT_V4_PRO_IMAGE_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: settings.imageSize,
    onChange: input.onImageSizeChange,
    disabled: input.isLoading,
  }, {
    kind: 'color',
    id: 'recraft-background-color-picker',
    prefixLabel: 'BG',
    ariaLabel: 'Select Recraft background color',
    value: recraftRgbToHex(settings.backgroundColor),
    onChange: input.onBackgroundColorChange,
    disabled: input.isLoading,
  }];

  settings.colors.forEach((color, index) => {
    controls.push({
      kind: 'color',
      id: `recraft-color-${index + 1}-picker`,
      prefixLabel: `C${index + 1}`,
      ariaLabel: `Select Recraft preferred color ${index + 1}`,
      value: recraftRgbToHex(color),
      onChange: (value: string) => input.onColorChange(index, value),
      disabled: input.isLoading,
    });
  });

  if (settings.colors.length < RECRAFT_V4_PRO_MAX_COLORS) {
    controls.push({
      kind: 'action',
      id: 'recraft-add-color-button',
      label: '+ Color',
      ariaLabel: 'Add Recraft preferred color',
      onClick: input.onAddColor,
      disabled: input.isLoading,
    });
  }

  if (settings.colors.length > 0) {
    controls.push({
      kind: 'action',
      id: 'recraft-remove-color-button',
      label: '- Color',
      ariaLabel: 'Remove Recraft preferred color',
      onClick: input.onRemoveColor,
      disabled: input.isLoading,
    });
  }

  return controls;
};
