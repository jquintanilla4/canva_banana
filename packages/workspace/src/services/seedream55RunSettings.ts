import type { GenerationFalOptions } from '../types';
import {
  SEEDREAM_55_DEFAULTS, SEEDREAM_55_ENDPOINTS, SEEDREAM_55_IMAGE_SIZE_OPTIONS, SEEDREAM_55_MAX_OUTPUT_IMAGES,
  isSeedream55Background, isSeedream55OutputFormat,
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
type Seedream55Operation =
  | (Seedream55ImageSettings & { readonly kind: 'text_to_image'; readonly endpoint: typeof SEEDREAM_55_ENDPOINTS.text_to_image })
  | (Seedream55ImageSettings & { readonly kind: 'image_edit'; readonly endpoint: typeof SEEDREAM_55_ENDPOINTS.image_edit });
export type Seedream55RunSettings<Kind extends ImageRunKind = ImageRunKind> = Extract<Seedream55Operation, { kind: Kind }>;
export function resolveSeedream55RunSettings(kind: 'text_to_image', options: GenerationFalOptions, validation?: ImageRunSettingsValidation): Seedream55RunSettings<'text_to_image'>;
export function resolveSeedream55RunSettings(kind: 'image_edit', options: GenerationFalOptions, validation?: ImageRunSettingsValidation): Seedream55RunSettings<'image_edit'>;
export function resolveSeedream55RunSettings(kind: ImageRunKind, options: GenerationFalOptions, validation?: ImageRunSettingsValidation): Seedream55RunSettings;
export function resolveSeedream55RunSettings(kind: ImageRunKind, options: GenerationFalOptions, validation: ImageRunSettingsValidation = 'strict'): Seedream55RunSettings {
  const selectedSize = options.imageSizeSelection === undefined || options.imageSizeSelection === 'default'
    ? SEEDREAM_55_DEFAULTS.imageSizeSelection : options.imageSizeSelection;
  const size = SEEDREAM_55_IMAGE_SIZE_OPTIONS.find(option => option.value === selectedSize);
  if (!size && validation === 'strict') throw new Error('Please select a supported Seedream 5.5 image size.');
  const background = isSeedream55Background(options.seedream55Background) ? options.seedream55Background : SEEDREAM_55_DEFAULTS.seedream55Background;
  const outputFormat = isSeedream55OutputFormat(options.seedream55OutputFormat)
    ? options.seedream55OutputFormat : SEEDREAM_55_DEFAULTS.seedream55OutputFormat;
  const appearance: Seedream55Appearance = background === 'transparent'
    ? { background, outputFormat: 'png' } : { background, outputFormat };
  const shared: Seedream55ImageSettings = {
    ...appearance,
    imageSizeSelection: size?.value ?? SEEDREAM_55_DEFAULTS.imageSizeSelection,
    numImages: resolveImageRunOutputCount(options.numImages, SEEDREAM_55_MAX_OUTPUT_IMAGES, validation) ?? SEEDREAM_55_DEFAULTS.numImages,
  };
  return kind === 'image_edit' ? { ...shared, kind, endpoint: SEEDREAM_55_ENDPOINTS.image_edit }
    : { ...shared, kind, endpoint: SEEDREAM_55_ENDPOINTS.text_to_image };
}
export const serializeSeedream55GenerationOptions = (settings: Seedream55RunSettings): GenerationFalOptions => ({
  imageSizeSelection: settings.imageSizeSelection, numImages: settings.numImages,
  seedream55Background: settings.background, seedream55OutputFormat: settings.outputFormat,
});
