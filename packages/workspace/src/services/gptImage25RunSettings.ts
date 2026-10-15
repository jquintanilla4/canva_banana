import type { GenerationFalOptions, GptImage25Background, GptImage25Quality, GptImage25Variant } from '../types';
import {
  GPT_IMAGE_25_DEFAULTS,
  GPT_IMAGE_25_MODEL_ID,
  GPT_IMAGE_25_IMAGE_SIZE_OPTIONS,
  GPT_IMAGE_25_MAX_OUTPUT_IMAGES,
  getGptImage25Endpoint,
  getGptImage25EndpointVariant,
  isGptImage25Background,
  isGptImage25Quality,
  isGptImage25Variant,
  type GptImage25ImageSize,
} from './gptImage25Config';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettings, type ImageRunSettingsValidation } from './imageRunSettings';

const ENDPOINT_MODES = { text_to_image: 'text-to-image', image_edit: 'edit' } as const;
interface GptImage25SettingsForKind<Kind extends ImageRunKind> extends ImageRunSettings<Kind> {
  readonly endpoint: `${typeof GPT_IMAGE_25_MODEL_ID}/${GptImage25Variant}/${typeof ENDPOINT_MODES[Kind]}`;
  readonly variant: GptImage25Variant;
  readonly quality: GptImage25Quality;
  readonly background: GptImage25Background;
  readonly imageSizeSelection: GptImage25ImageSize;
}
export type GptImage25RunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? GptImage25SettingsForKind<Kind> : never;

export interface GptImage25RunSettingsInput<Kind extends ImageRunKind = ImageRunKind> {
  kind: Kind;
  modelId?: string;
  variant?: unknown;
  quality?: unknown;
  background?: unknown;
  imageSizeSelection?: unknown;
  numImages?: unknown;
}

export const resolveGptImage25RunSettings = <Kind extends ImageRunKind>(
  input: GptImage25RunSettingsInput<Kind>,
  validation: ImageRunSettingsValidation = 'strict',
): GptImage25RunSettings<Kind> => {
  const variant = isGptImage25Variant(input.variant) ? input.variant
    : getGptImage25EndpointVariant(input.modelId) ?? GPT_IMAGE_25_DEFAULTS.gptImage25Variant;
  const selectedSize = input.imageSizeSelection === undefined || input.imageSizeSelection === 'default'
    ? GPT_IMAGE_25_DEFAULTS.imageSizeSelection : input.imageSizeSelection;
  const sizeOption = GPT_IMAGE_25_IMAGE_SIZE_OPTIONS.find(option => option.value === selectedSize);
  if (!sizeOption && validation === 'strict') {
    throw new Error('Please select a supported GPT Image 2.5 image size.');
  }
  const numImages = resolveImageRunOutputCount(input.numImages, GPT_IMAGE_25_MAX_OUTPUT_IMAGES, validation);
  return {
    kind: input.kind,
    endpoint: getGptImage25Endpoint(variant, ENDPOINT_MODES[input.kind]),
    variant,
    quality: isGptImage25Quality(input.quality) ? input.quality : GPT_IMAGE_25_DEFAULTS.gptImage25Quality,
    background: isGptImage25Background(input.background) ? input.background : GPT_IMAGE_25_DEFAULTS.gptImage25Background,
    imageSizeSelection: sizeOption?.value ?? GPT_IMAGE_25_DEFAULTS.imageSizeSelection,
    ...(numImages !== undefined ? { numImages } : {}),
  } as GptImage25RunSettings<Kind>; // The endpoint table pairs each operation with its endpoint.
};

export const serializeGptImage25GenerationOptions = (settings: GptImage25RunSettings): GenerationFalOptions => ({
  gptImage25Variant: settings.variant,
  gptImage25Quality: settings.quality,
  gptImage25Background: settings.background,
  imageSizeSelection: settings.imageSizeSelection,
  ...(settings.numImages !== undefined ? { numImages: settings.numImages } : {}),
});
