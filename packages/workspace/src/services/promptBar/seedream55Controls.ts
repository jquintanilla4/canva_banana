import type { PromptBarSelectControl } from '../../components/promptBarControls';
import type { GenerationFalOptions } from '../../types';
import {
  SEEDREAM_55_BACKGROUND_OPTIONS,
  SEEDREAM_55_FORMAT_OPTIONS,
  SEEDREAM_55_JIMENG_CANVAS_MODEL_ID,
  getSeedream55ImageSizeOptions,
} from '../seedream55Config';
import { resolveSeedream55RunSettings } from '../seedream55RunSettings';

interface Seedream55ControlsInput extends Pick<GenerationFalOptions,
  'seedream55Background' | 'seedream55OutputFormat' | 'imageSizeSelection'> {
  modelId?: string;
  isLoading: boolean;
  onSizeChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onOutputFormatChange: (value: string) => void;
}

export const buildSeedream55Controls = (input: Seedream55ControlsInput): PromptBarSelectControl[] => {
  const settings = resolveSeedream55RunSettings('text_to_image', input, 'restore', input.modelId);
  const transparent = settings.background === 'transparent';
  const sizeControl: PromptBarSelectControl = {
      id: 'fal-seedream-55-size-select',
      prefixLabel: 'Size',
      ariaLabel: 'Select Seedream 5.5 image size',
      options: getSeedream55ImageSizeOptions(input.modelId),
      value: settings.imageSizeSelection,
      onChange: input.onSizeChange,
    disabled: input.isLoading,
  };
  if (input.modelId === SEEDREAM_55_JIMENG_CANVAS_MODEL_ID) return [sizeControl];
  return [
    sizeControl,
    {
      id: 'fal-seedream-55-background-select',
      prefixLabel: 'Background',
      ariaLabel: 'Select Seedream 5.5 background',
      options: SEEDREAM_55_BACKGROUND_OPTIONS,
      value: settings.background,
      onChange: input.onBackgroundChange,
      disabled: input.isLoading,
    },
    {
      id: 'fal-seedream-55-format-select',
      prefixLabel: 'Format',
      ariaLabel: 'Select Seedream 5.5 output format',
      options: SEEDREAM_55_FORMAT_OPTIONS,
      value: settings.outputFormat,
      onChange: input.onOutputFormatChange,
      disabled: input.isLoading || transparent,
    },
  ];
};
