import type { FalImageSizeOption, GenerationFalOptions, Ideogram45EditPrecision, Ideogram45Quality } from '../types';

export const IDEOGRAM_45_MODEL_ID = 'ideogram/v4.5' as const; // One picker entry for generation and editing.
export const IDEOGRAM_45_EDIT_MODEL_ID = 'ideogram/v4.5/edit' as const;
export const isIdeogram45Model = (modelId: string | undefined): boolean =>
  modelId === IDEOGRAM_45_MODEL_ID || modelId === IDEOGRAM_45_EDIT_MODEL_ID;
export const IDEOGRAM_45_DEFAULTS = {
  ideogram45Quality: 'medium',
  ideogram45EditPrecision: 'regular',
  imageSizeSelection: 'auto',
  numImages: 1,
} as const satisfies GenerationFalOptions;
export const IDEOGRAM_45_QUALITY_OPTIONS: ReadonlyArray<{ value: Ideogram45Quality; label: string }> = [
  { value: 'very_low', label: 'Very Low' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
export const IDEOGRAM_45_EDIT_PRECISION_OPTIONS: ReadonlyArray<{ value: Ideogram45EditPrecision; label: string }> = [
  { value: 'regular', label: 'Regular' },
  { value: 'high', label: 'High (preserve unchanged pixels)' },
];
export const isIdeogram45Quality = (value: unknown): value is Ideogram45Quality =>
  IDEOGRAM_45_QUALITY_OPTIONS.some(option => option.value === value);
export const isIdeogram45EditPrecision = (value: unknown): value is Ideogram45EditPrecision =>
  value === 'regular' || value === 'high';
export const getIdeogram45QualityOptions = (isEditing: boolean, precision: Ideogram45EditPrecision) =>
  IDEOGRAM_45_QUALITY_OPTIONS.filter(option => option.value !== 'very_low' || (isEditing && precision === 'regular'));
export const normalizeIdeogram45Quality = (value: unknown, isEditing: boolean, precision: Ideogram45EditPrecision): Ideogram45Quality =>
  getIdeogram45QualityOptions(isEditing, precision).some(option => option.value === value) && isIdeogram45Quality(value)
    ? value : IDEOGRAM_45_DEFAULTS.ideogram45Quality;
export const IDEOGRAM_45_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: FalImageSizeOption; label: string }> = [
  { value: 'auto', label: 'Auto (square / match source)' },
  { value: 'square_hd', label: 'Square (1024x1024)' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: '2048x2048', label: '2K Square (2048x2048)' },
  { value: '2560x1440', label: '2K Landscape (2560x1440)' },
  { value: '1440x2560', label: '2K Portrait (1440x2560)' },
];
