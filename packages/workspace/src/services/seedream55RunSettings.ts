import type { GenerationFalOptions } from '../types';
import {
  SEEDREAM_55_DEFAULTS, SEEDREAM_55_MAX_OUTPUT_IMAGES, SEEDREAM_55_VOLCENGINE_MODEL_ID,
  getSeedream55ImageSizeOptions, isSeedream55Background, isSeedream55OutputFormat,
  type Seedream55ImageSize, type Seedream55Background, type Seedream55OutputFormat,
} from './seedream55Config';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettingsValidation } from './imageRunSettings';

type Seedream55Appearance =
  | { readonly background: 'transparent'; readonly outputFormat: 'png' }
  | { readonly background: Exclude<Seedream55Background, 'transparent'>; readonly outputFormat: Seedream55OutputFormat };
type Seedream55ImageSettings = Seedream55Appearance & {
  readonly numImages: number;
  readonly imageSizeSelection: Seedream55ImageSize;
};
export type Seedream55RunSettings<Kind extends ImageRunKind = ImageRunKind> = {
  [Operation in ImageRunKind]: Seedream55ImageSettings & { readonly kind: Operation };
}[Kind];
export function resolveSeedream55RunSettings<Kind extends ImageRunKind>(
  kind: Kind, options: GenerationFalOptions, validation?: ImageRunSettingsValidation, modelId?: string,
): Seedream55RunSettings<Kind>;
export function resolveSeedream55RunSettings(
  kind: ImageRunKind, options: GenerationFalOptions, validation: ImageRunSettingsValidation = 'strict', modelId?: string,
): Seedream55RunSettings {
  const selectedSize = options.imageSizeSelection === undefined || options.imageSizeSelection === 'default'
    ? SEEDREAM_55_DEFAULTS.imageSizeSelection : options.imageSizeSelection;
  const size = getSeedream55ImageSizeOptions(modelId).find(option => option.value === selectedSize);
  if (!size && validation === 'strict') throw new Error('Please select a supported Seedream 5.5 image size.');
  const background = isSeedream55Background(options.seedream55Background) ? options.seedream55Background : SEEDREAM_55_DEFAULTS.seedream55Background;
  const outputFormat = isSeedream55OutputFormat(options.seedream55OutputFormat)
    ? options.seedream55OutputFormat : SEEDREAM_55_DEFAULTS.seedream55OutputFormat;
  const appearance: Seedream55Appearance = background === 'transparent'
    ? { background, outputFormat: 'png' } : { background, outputFormat };
  return {
    ...appearance, kind,
    imageSizeSelection: size?.value ?? SEEDREAM_55_DEFAULTS.imageSizeSelection,
    numImages: modelId === SEEDREAM_55_VOLCENGINE_MODEL_ID ? 1
      : resolveImageRunOutputCount(options.numImages, SEEDREAM_55_MAX_OUTPUT_IMAGES, validation) ?? SEEDREAM_55_DEFAULTS.numImages,
  };
}
export const serializeSeedream55GenerationOptions = (settings: Seedream55RunSettings): GenerationFalOptions => ({
  imageSizeSelection: settings.imageSizeSelection, numImages: settings.numImages,
  seedream55Background: settings.background, seedream55OutputFormat: settings.outputFormat,
});
