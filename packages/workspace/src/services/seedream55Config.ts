import type { FalImageSizeOption, GenerationFalOptions, GenerationInputs } from '../types';

export const SEEDREAM_55_MODEL_ID = 'bytedance/seedream/v5.5';
export const SEEDREAM_55_ENDPOINTS = {
  text_to_image: `${SEEDREAM_55_MODEL_ID}/text-to-image`,
  image_edit: `${SEEDREAM_55_MODEL_ID}/edit`,
  layerize: `${SEEDREAM_55_MODEL_ID}/layerize`,
} as const;
export const isSeedream55LayerizeGeneration = (generation: GenerationInputs): boolean =>
  generation.kind === 'layerize' || generation.modelId === SEEDREAM_55_ENDPOINTS.layerize;
export const SEEDREAM_55_MAX_OUTPUT_IMAGES = 6;
export const SEEDREAM_55_NUM_IMAGE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
export const isSeedream55Model = (modelId: string | undefined): boolean =>
  modelId === SEEDREAM_55_MODEL_ID || Object.values(SEEDREAM_55_ENDPOINTS).some(endpoint => endpoint === modelId);
export const SEEDREAM_55_DEFAULTS = {
  imageSizeSelection: 'auto_2K', numImages: 1,
  seedream55Background: 'auto', seedream55OutputFormat: 'png',
} as const satisfies GenerationFalOptions;
export const SEEDREAM_55_IMAGE_SIZE_OPTIONS = [
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'auto_1K', label: 'Auto 1K' },
  { value: 'auto_1.5K', label: 'Auto 1.5K' },
  { value: 'auto_2K', label: 'Auto 2K (default)' },
] as const satisfies ReadonlyArray<{ value: FalImageSizeOption; label: string }>;
export const SEEDREAM_55_BACKGROUND_OPTIONS = [
  { value: 'auto', label: 'Auto' }, { value: 'opaque', label: 'Opaque' }, { value: 'transparent', label: 'Transparent' },
] as const;
export const SEEDREAM_55_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' },
] as const;
export type Seedream55ImageSize = (typeof SEEDREAM_55_IMAGE_SIZE_OPTIONS)[number]['value'];
export type Seedream55Background = (typeof SEEDREAM_55_BACKGROUND_OPTIONS)[number]['value'];
export type Seedream55OutputFormat = (typeof SEEDREAM_55_FORMAT_OPTIONS)[number]['value'];
export const isSeedream55Background = (value: unknown): value is Seedream55Background => SEEDREAM_55_BACKGROUND_OPTIONS.some(option => option.value === value);
export const isSeedream55OutputFormat = (value: unknown): value is Seedream55OutputFormat => SEEDREAM_55_FORMAT_OPTIONS.some(option => option.value === value);
