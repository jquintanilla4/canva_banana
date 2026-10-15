import type { GenerationFalOptions, Ideogram45EditPrecision, Ideogram45Quality } from '../types';
import { resolveImageRunOutputCount } from './imageRunSettings';
import {
  IDEOGRAM_45_DEFAULTS,
  IDEOGRAM_45_IMAGE_SIZE_OPTIONS,
  IDEOGRAM_45_MAX_OUTPUT_IMAGES,
  getIdeogram45QualityOptions,
  isIdeogram45EditPrecision,
  normalizeIdeogram45Quality,
  type Ideogram45ImageSize,
} from './ideogram45Config';

interface Ideogram45RunSettingsBase {
  readonly imageSizeSelection: Ideogram45ImageSize;
  readonly numImages?: number; // Omitted counts keep the provider default for direct API callers.
  readonly qualityOptions: Readonly<ReturnType<typeof getIdeogram45QualityOptions>>;
}

export interface Ideogram45TextRunSettings extends Ideogram45RunSettingsBase {
  readonly kind: 'text_to_image';
  readonly quality: Exclude<Ideogram45Quality, 'very_low'>;
  readonly editPrecision: Ideogram45EditPrecision; // Remember the picker preference, but do not send it to the text endpoint.
  readonly preserveSourceSize: false;
  readonly seed?: number;
}

export type Ideogram45EditRunSettings = Ideogram45RunSettingsBase & (
  | { readonly kind: 'image_edit'; readonly editPrecision: 'regular'; readonly quality: Ideogram45Quality; readonly preserveSourceSize: false }
  | { readonly kind: 'image_edit'; readonly editPrecision: 'high'; readonly quality: Exclude<Ideogram45Quality, 'very_low'>; readonly preserveSourceSize: true; readonly imageSizeSelection: 'auto' }
);

export type Ideogram45RunSettings = Ideogram45TextRunSettings | Ideogram45EditRunSettings;

export interface Ideogram45RunSettingsInput {
  kind: Ideogram45RunSettings['kind'];
  quality?: unknown;
  editPrecision?: unknown;
  imageSizeSelection?: unknown;
  numImages?: unknown;
  seed?: unknown;
}

/* eslint-disable no-redeclare -- TypeScript overloads describe one resolver with mode-specific return types. */
export function resolveIdeogram45RunSettings(input: Ideogram45RunSettingsInput & { kind: 'text_to_image' }, validation?: 'strict' | 'restore'): Ideogram45TextRunSettings;
export function resolveIdeogram45RunSettings(input: Ideogram45RunSettingsInput & { kind: 'image_edit' }, validation?: 'strict' | 'restore'): Ideogram45EditRunSettings;
export function resolveIdeogram45RunSettings(input: Ideogram45RunSettingsInput, validation?: 'strict' | 'restore'): Ideogram45RunSettings;
export function resolveIdeogram45RunSettings(
  input: Ideogram45RunSettingsInput,
  validation: 'strict' | 'restore' = 'strict', // Restored settings repair malformed fields; direct requests reject unsupported sizes.
): Ideogram45RunSettings {
  const editPrecision = isIdeogram45EditPrecision(input.editPrecision)
    ? input.editPrecision : IDEOGRAM_45_DEFAULTS.ideogram45EditPrecision;
  const selectedSize = input.imageSizeSelection === 'default' || input.imageSizeSelection === undefined
    ? 'auto' : input.imageSizeSelection;
  const sizeOption = IDEOGRAM_45_IMAGE_SIZE_OPTIONS.find(option => option.value === selectedSize);
  if (!sizeOption && validation === 'strict') {
    throw new Error('Please select a supported Ideogram 4.5 image size.');
  }
  const imageSizeSelection = sizeOption?.value ?? IDEOGRAM_45_DEFAULTS.imageSizeSelection;
  const isEditing = input.kind === 'image_edit';
  const quality = normalizeIdeogram45Quality(input.quality, isEditing, editPrecision);
  const standardQuality = quality === 'very_low' ? IDEOGRAM_45_DEFAULTS.ideogram45Quality : quality;
  const numImages = resolveImageRunOutputCount(input.numImages, IDEOGRAM_45_MAX_OUTPUT_IMAGES, validation);
  const common = {
    imageSizeSelection,
    qualityOptions: getIdeogram45QualityOptions(isEditing, editPrecision),
    ...(numImages !== undefined ? { numImages } : {}),
  };
  if (input.kind === 'text_to_image') {
    return {
      ...common,
      kind: input.kind,
      quality: standardQuality,
      editPrecision,
      preserveSourceSize: false,
      ...(typeof input.seed === 'number' && Number.isFinite(input.seed) ? { seed: Math.floor(input.seed) } : {}),
    };
  }
  if (editPrecision === 'high') {
    return {
      ...common,
      kind: input.kind,
      quality: standardQuality,
      editPrecision,
      preserveSourceSize: true,
      imageSizeSelection: 'auto',
    };
  }
  return { ...common, kind: input.kind, quality, editPrecision, preserveSourceSize: false };
}
/* eslint-enable no-redeclare */

export const serializeIdeogram45GenerationOptions = (settings: Ideogram45RunSettings): GenerationFalOptions => ({
  ideogram45Quality: settings.quality,
  ideogram45EditPrecision: settings.editPrecision,
  imageSizeSelection: settings.imageSizeSelection,
  ...(settings.numImages !== undefined ? { numImages: settings.numImages } : {}),
});
