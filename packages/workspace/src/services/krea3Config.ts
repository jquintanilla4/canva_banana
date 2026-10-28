import type { FalImageSizeOption, GenerationFalOptions } from '../types';

export const KREA_3_MODEL_ID = 'krea/v3' as const;
export const KREA_3_MAX_INPUTS = 8;
export const KREA_3_DEFAULTS = {
  krea3Variant: 'berry',
  krea3ReasoningLevel: 'medium',
  imageSizeSelection: 'auto',
  numImages: 1,
} as const satisfies GenerationFalOptions;

export const isKrea3Model = (modelId: string | undefined): boolean =>
  modelId === KREA_3_MODEL_ID || modelId === `${KREA_3_MODEL_ID}/text-to-image` || modelId === `${KREA_3_MODEL_ID}/edit`;
export const getKrea3SelectorModelId = (modelId: string | undefined): typeof KREA_3_MODEL_ID | undefined =>
  isKrea3Model(modelId) ? KREA_3_MODEL_ID : undefined;

export const KREA_3_VARIANT_OPTIONS = [
  { value: 'berry', label: 'Berry (quality)' },
  { value: 'jam', label: 'Jam (speed)' },
] as const;
export type Krea3Variant = (typeof KREA_3_VARIANT_OPTIONS)[number]['value'];
export const isKrea3Variant = (value: unknown): value is Krea3Variant =>
  KREA_3_VARIANT_OPTIONS.some(option => option.value === value);

export const KREA_3_TEXT_REASONING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
] as const;
export const KREA_3_EDIT_REASONING_OPTIONS = [
  ...KREA_3_TEXT_REASONING_OPTIONS,
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra (2K)' },
] as const;
export type Krea3ReasoningLevel = (typeof KREA_3_EDIT_REASONING_OPTIONS)[number]['value'];
export const isKrea3ReasoningLevel = (value: unknown): value is Krea3ReasoningLevel =>
  KREA_3_EDIT_REASONING_OPTIONS.some(option => option.value === value);

export const KREA_3_IMAGE_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
] as const satisfies ReadonlyArray<{ value: FalImageSizeOption; label: string }>;
export type Krea3ImageSize = (typeof KREA_3_IMAGE_SIZE_OPTIONS)[number]['value'];
