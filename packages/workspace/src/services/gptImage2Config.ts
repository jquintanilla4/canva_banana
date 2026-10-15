import type { FalGptImage2QualityOption, FalImageSizeOption, GenerationFalOptions } from '../types';

export const GPT_IMAGE_2_EDIT_MODEL_ID = 'openai/gpt-image-2/edit' as const;
export const GPT_IMAGE_2_TEXT_TO_IMAGE_MODEL_ID = 'openai/gpt-image-2' as const;
export const GPT_IMAGE_2_MAX_OUTPUT_IMAGES = 4;
export const GPT_IMAGE_2_NUM_IMAGE_OPTIONS = Array.from({ length: GPT_IMAGE_2_MAX_OUTPUT_IMAGES }, (_, index) => index + 1);
export const GPT_IMAGE_2_DEFAULTS = {
  gptImage2Quality: 'medium',
  imageSizeSelection: 'auto',
  numImages: 1,
} as const satisfies GenerationFalOptions;
export const GPT_IMAGE_2_IMAGE_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto (default)' },
  { value: '2048x2048', label: '2K Square (2048x2048)' },
  { value: '2560x1440', label: '2K Landscape (2560x1440)' },
  { value: '1440x2560', label: '2K Portrait (1440x2560)' },
  { value: '2048x1152', label: 'HD Landscape (2048x1152)' },
  { value: '1152x2048', label: 'HD Portrait (1152x2048)' },
  { value: 'landscape_4_3', label: 'Landscape 4:3 (1024x768)' },
  { value: 'landscape_16_9', label: 'Landscape 16:9 (1024x576)' },
  { value: 'portrait_4_3', label: 'Portrait 3:4 (768x1024)' },
  { value: 'portrait_16_9', label: 'Portrait 9:16 (576x1024)' },
  { value: 'square', label: 'Square (512x512)' },
  { value: 'square_hd', label: 'Square HD (1024x1024)' },
] as const satisfies ReadonlyArray<{ value: FalImageSizeOption; label: string }>;
export type GptImage2ImageSize = (typeof GPT_IMAGE_2_IMAGE_SIZE_OPTIONS)[number]['value']
  | '2688x1152' | '2016x864' | '1344x576' | 'auto_1K' | 'auto_2K' | 'auto_3K' | 'auto_4K'; // Preserve legacy direct-call sizes outside the picker.
export const isGptImage2ImageSize = (value: unknown): value is GptImage2ImageSize =>
  GPT_IMAGE_2_IMAGE_SIZE_OPTIONS.some(option => option.value === value)
  || value === '2688x1152' || value === '2016x864' || value === '1344x576'
  || value === 'auto_1K' || value === 'auto_2K' || value === 'auto_3K' || value === 'auto_4K';
export const GPT_IMAGE_2_QUALITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const satisfies ReadonlyArray<{ value: FalGptImage2QualityOption; label: string }>;
export const isGptImage2QualitySelectionValue = (value: unknown): value is FalGptImage2QualityOption =>
  GPT_IMAGE_2_QUALITY_OPTIONS.some(option => option.value === value);
