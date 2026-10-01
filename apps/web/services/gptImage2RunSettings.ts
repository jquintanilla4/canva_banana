import type { FalGptImage2QualityOption, GenerationFalOptions } from '../types';
import {
  GPT_IMAGE_2_DEFAULTS,
  GPT_IMAGE_2_EDIT_MODEL_ID,
  GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID,
  GPT_IMAGE_2_MAX_OUTPUT_IMAGES,
  isGptImage2ImageSize,
  isGptImage2QualitySelectionValue,
  type GptImage2ImageSize,
} from './gptImage2Config';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettings, type ImageRunSettingsValidation } from './imageRunSettings';

const ENDPOINTS = { text_to_image: GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID, image_edit: GPT_IMAGE_2_EDIT_MODEL_ID } as const;

interface GptImage2SettingsForKind<Kind extends ImageRunKind> extends ImageRunSettings<Kind> {
  readonly endpoint: (typeof ENDPOINTS)[Kind];
  readonly quality: FalGptImage2QualityOption;
  readonly imageSizeSelection: GptImage2ImageSize;
}
export type GptImage2RunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? GptImage2SettingsForKind<Kind> : never;

export interface GptImage2RunSettingsInput<Kind extends ImageRunKind = ImageRunKind> {
  kind: Kind;
  quality?: unknown;
  imageSizeSelection?: unknown;
  numImages?: unknown;
}

export const resolveGptImage2RunSettings = <Kind extends ImageRunKind>(
  input: GptImage2RunSettingsInput<Kind>,
  validation: ImageRunSettingsValidation = 'strict',
): GptImage2RunSettings<Kind> => {
  const selectedSize = input.imageSizeSelection === undefined || input.imageSizeSelection === 'default'
    ? GPT_IMAGE_2_DEFAULTS.imageSizeSelection : input.imageSizeSelection;
  if (!isGptImage2ImageSize(selectedSize) && validation === 'strict') {
    throw new Error('Please select a supported GPT Image 2 image size.');
  }
  const numImages = resolveImageRunOutputCount(input.numImages, GPT_IMAGE_2_MAX_OUTPUT_IMAGES, validation);
  return {
    kind: input.kind,
    endpoint: ENDPOINTS[input.kind],
    quality: isGptImage2QualitySelectionValue(input.quality) ? input.quality : GPT_IMAGE_2_DEFAULTS.gptImage2Quality,
    imageSizeSelection: isGptImage2ImageSize(selectedSize) ? selectedSize : GPT_IMAGE_2_DEFAULTS.imageSizeSelection,
    ...(numImages !== undefined ? { numImages } : {}),
  } as GptImage2RunSettings<Kind>; // The endpoint table pairs each operation with its endpoint.
};

export const serializeGptImage2GenerationOptions = (settings: GptImage2RunSettings): GenerationFalOptions => ({
  gptImage2Quality: settings.quality,
  imageSizeSelection: settings.imageSizeSelection,
  ...(settings.numImages !== undefined ? { numImages: settings.numImages } : {}),
});
