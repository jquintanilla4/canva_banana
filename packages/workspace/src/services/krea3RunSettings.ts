import type { GenerationFalOptions } from '../types';
import {
  KREA_3_DEFAULTS, KREA_3_IMAGE_SIZE_OPTIONS, KREA_3_MODEL_ID,
  isKrea3Variant, isKrea3ReasoningLevel,
  type Krea3ImageSize, type Krea3ReasoningLevel, type Krea3Variant,
} from './krea3Config';
import type { ImageRunKind, ImageRunSettings, ImageRunSettingsValidation } from './imageRunSettings';

const ENDPOINT_MODES = { text_to_image: 'text-to-image', image_edit: 'edit' } as const;
interface Krea3SettingsForKind<Kind extends ImageRunKind> extends ImageRunSettings<Kind> {
  readonly endpoint: `${typeof KREA_3_MODEL_ID}/${typeof ENDPOINT_MODES[Kind]}`;
  readonly variant: Krea3Variant;
  readonly reasoningLevel: Kind extends 'text_to_image' ? 'low' | 'medium' : Krea3ReasoningLevel;
  readonly imageSizeSelection: Krea3ImageSize;
  readonly numImages: 1;
}
export type Krea3RunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? Krea3SettingsForKind<Kind> : never;

export interface Krea3RunSettingsInput<Kind extends ImageRunKind = ImageRunKind> {
  kind: Kind;
  variant?: unknown;
  reasoningLevel?: unknown;
  imageSizeSelection?: unknown;
}

export const resolveKrea3RunSettings = <Kind extends ImageRunKind>(
  input: Krea3RunSettingsInput<Kind>,
  validation: ImageRunSettingsValidation = 'strict',
): Krea3RunSettings<Kind> => {
  const selectedSize = input.imageSizeSelection === undefined || input.imageSizeSelection === 'default'
    ? KREA_3_DEFAULTS.imageSizeSelection : input.imageSizeSelection;
  const size = KREA_3_IMAGE_SIZE_OPTIONS.find(option => option.value === selectedSize);
  if (!size && validation === 'strict') throw new Error('Please select a supported Krea 3 image size.');
  const reasoningLevel = isKrea3ReasoningLevel(input.reasoningLevel)
    && (input.kind === 'image_edit' || input.reasoningLevel === 'low' || input.reasoningLevel === 'medium')
    ? input.reasoningLevel : KREA_3_DEFAULTS.krea3ReasoningLevel;
  return {
    kind: input.kind,
    endpoint: `${KREA_3_MODEL_ID}/${ENDPOINT_MODES[input.kind]}`,
    variant: isKrea3Variant(input.variant) ? input.variant : KREA_3_DEFAULTS.krea3Variant,
    reasoningLevel,
    imageSizeSelection: size?.value ?? KREA_3_DEFAULTS.imageSizeSelection,
    numImages: 1,
  } as Krea3RunSettings<Kind>; // Text generation cannot use edit-only reasoning levels.
};

export const serializeKrea3GenerationOptions = (settings: Krea3RunSettings): GenerationFalOptions => ({
  krea3Variant: settings.variant,
  krea3ReasoningLevel: settings.reasoningLevel,
  imageSizeSelection: settings.imageSizeSelection,
  numImages: settings.numImages,
});
