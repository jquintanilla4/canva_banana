import type { GenerationFalOptions } from '../types';
import {
  TOKENHUB_GPT_IMAGE_25_DEFAULTS,
  TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS,
  TOKENHUB_GPT_IMAGE_25_MAX_OUTPUT_IMAGES,
  getTokenHubGptImage25ModelId,
  isTokenHubGptImage25Background,
  isTokenHubGptImage25Quality,
  isTokenHubGptImage25Variant,
  serializeTokenHubGptImage25Size,
  type TokenHubGptImage25Background,
  type TokenHubGptImage25ImageSize,
  type TokenHubGptImage25ModelId,
  type TokenHubGptImage25Quality,
  type TokenHubGptImage25Variant,
} from './tokenHubGptImage25Config';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettings, type ImageRunSettingsValidation } from './imageRunSettings';

interface TokenHubGptImage25SettingsForKind<Kind extends ImageRunKind> extends ImageRunSettings<Kind> {
  readonly model: TokenHubGptImage25ModelId;
  readonly variant: TokenHubGptImage25Variant;
  readonly quality: TokenHubGptImage25Quality;
  readonly background: TokenHubGptImage25Background;
  readonly imageSizeSelection: TokenHubGptImage25ImageSize;
}
export type TokenHubGptImage25RunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? TokenHubGptImage25SettingsForKind<Kind> : never;

export interface TokenHubGptImage25RunSettingsInput<Kind extends ImageRunKind = ImageRunKind> {
  kind: Kind;
  variant?: unknown;
  quality?: unknown;
  background?: unknown;
  imageSizeSelection?: unknown;
  numImages?: unknown;
}

export const resolveTokenHubGptImage25RunSettings = <Kind extends ImageRunKind>(
  input: TokenHubGptImage25RunSettingsInput<Kind>,
  validation: ImageRunSettingsValidation = 'strict',
): TokenHubGptImage25RunSettings<Kind> => {
  const variant = isTokenHubGptImage25Variant(input.variant) ? input.variant : TOKENHUB_GPT_IMAGE_25_DEFAULTS.tokenHubGptImage25Variant;
  const selectedSize = input.imageSizeSelection === undefined || input.imageSizeSelection === 'default'
    ? TOKENHUB_GPT_IMAGE_25_DEFAULTS.imageSizeSelection : input.imageSizeSelection;
  const sizeOption = TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS.find(option => option.value === selectedSize);
  if (!sizeOption && validation === 'strict') {
    throw new Error('Please select a supported GPT Image 2.5 (TokenHub) image size.');
  }
  const numImages = resolveImageRunOutputCount(input.numImages, TOKENHUB_GPT_IMAGE_25_MAX_OUTPUT_IMAGES, validation) ?? 1;
  return {
    kind: input.kind,
    model: getTokenHubGptImage25ModelId(variant),
    variant,
    quality: isTokenHubGptImage25Quality(input.quality) ? input.quality : TOKENHUB_GPT_IMAGE_25_DEFAULTS.tokenHubGptImage25Quality,
    background: isTokenHubGptImage25Background(input.background) ? input.background : TOKENHUB_GPT_IMAGE_25_DEFAULTS.tokenHubGptImage25Background,
    imageSizeSelection: sizeOption?.value ?? TOKENHUB_GPT_IMAGE_25_DEFAULTS.imageSizeSelection,
    numImages,
  } as TokenHubGptImage25RunSettings<Kind>;
};

export const serializeTokenHubGptImage25GenerationOptions = (settings: TokenHubGptImage25RunSettings): GenerationFalOptions => ({
  tokenHubGptImage25Variant: settings.variant,
  tokenHubGptImage25Quality: settings.quality,
  tokenHubGptImage25Background: settings.background,
  imageSizeSelection: settings.imageSizeSelection,
  numImages: settings.numImages,
});

export const serializeTokenHubGptImage25Input = (settings: TokenHubGptImage25RunSettings) => ({
  model: settings.model,
  size: serializeTokenHubGptImage25Size(settings.imageSizeSelection),
  quality: settings.quality,
  background: settings.background,
  n: settings.numImages,
  output_format: 'png' as const,
});
