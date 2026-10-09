import type { FalResolutionOption, GenerationFalOptions, NanoBananaThinkingLevel } from '../types';

export const NANO_BANANA_PRO_EDIT_MODEL_ID = 'fal-ai/nano-banana-pro/edit' as const;
export const NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana-pro' as const;
export const NANO_BANANA_21_EDIT_MODEL_ID = 'google/nano-banana-2.1/edit' as const;
export const NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID = 'google/nano-banana-2.1' as const;
export const NANO_BANANA_MAX_OUTPUT_IMAGES = 4;
export const NANO_BANANA_DEFAULTS = {
  aspectRatioSelection: 'default', resolutionSelection: '1K', numImages: 1,
  nanoBananaWebSearch: false, nanoBananaThinkingLevel: 'medium',
} as const satisfies GenerationFalOptions;
export const FAL_RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K (default)' }, { value: '2K', label: '2K' }, { value: '4K', label: '4K' },
] as const satisfies ReadonlyArray<{ value: FalResolutionOption; label: string }>;
export const NANO_BANANA_EDIT_MODEL_IDS = [NANO_BANANA_PRO_EDIT_MODEL_ID, NANO_BANANA_21_EDIT_MODEL_ID] as const;
export type NanoBananaEditModelId = typeof NANO_BANANA_EDIT_MODEL_IDS[number];
export const NANO_BANANA_TEXT_TO_IMAGE_MAP = {
  [NANO_BANANA_PRO_EDIT_MODEL_ID]: NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  [NANO_BANANA_21_EDIT_MODEL_ID]: NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID,
} as const;
export const NANO_BANANA_TEXT_TO_IMAGE_MODEL_IDS = [NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID, NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID] as const;
export const normalizeNanoBananaEndpoint = (value: string | undefined): string | undefined => {
  if (value === 'fal-ai/nano-banana-2/edit') return NANO_BANANA_21_EDIT_MODEL_ID;
  if (value === 'fal-ai/nano-banana-2') return NANO_BANANA_21_TEXT_TO_IMAGE_MODEL_ID;
  if (value === 'fal-ai/nano-banana/edit') return NANO_BANANA_PRO_EDIT_MODEL_ID;
  if (value === 'fal-ai/nano-banana') return NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  return value;
};
export const isNanoBananaEditModelId = (value: string | undefined): value is NanoBananaEditModelId =>
  NANO_BANANA_EDIT_MODEL_IDS.some(id => id === value);
export const isNanoBananaTextToImageModelId = (value: string | undefined): boolean =>
  NANO_BANANA_TEXT_TO_IMAGE_MODEL_IDS.some(id => id === value);
export const getNanoBananaTextToImageModelId = <Model extends NanoBananaEditModelId>(modelId: Model) => NANO_BANANA_TEXT_TO_IMAGE_MAP[modelId];
export const getNanoBananaSelectorModelId = (value: string | undefined): NanoBananaEditModelId | undefined => {
  const endpoint = normalizeNanoBananaEndpoint(value);
  return NANO_BANANA_EDIT_MODEL_IDS.find(id => endpoint === id || endpoint === NANO_BANANA_TEXT_TO_IMAGE_MAP[id]);
};
export const FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Auto (default)' },
  ...(['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16'] as const).map(value => ({ value, label: value })),
] as const;
export const NANO_BANANA_21_ASPECT_RATIO_OPTIONS = [
  ...FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS,
  ...(['4:1', '1:4', '8:1', '1:8'] as const).map(value => ({ value, label: value })),
] as const;
export type NanoBananaAspectRatio<Model extends NanoBananaEditModelId = NanoBananaEditModelId> = Exclude<
  Model extends typeof NANO_BANANA_PRO_EDIT_MODEL_ID
    ? typeof FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS[number]['value']
    : typeof NANO_BANANA_21_ASPECT_RATIO_OPTIONS[number]['value'],
  'placeholder'
>;
export const getNanoBananaAspectRatioOptions = (modelId: string | undefined) =>
  getNanoBananaSelectorModelId(modelId) === NANO_BANANA_21_EDIT_MODEL_ID ? NANO_BANANA_21_ASPECT_RATIO_OPTIONS : FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS;
export const isNanoBananaAspectRatio = <Model extends NanoBananaEditModelId>(value: unknown, modelId: Model): value is NanoBananaAspectRatio<Model> =>
  value !== 'placeholder' && getNanoBananaAspectRatioOptions(modelId).some(option => option.value === value);
export const NANO_BANANA_THINKING_LEVEL_OPTIONS = [
  { value: 'minimal', label: 'Minimal' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
] as const;
export const isNanoBananaThinkingLevel = (value: unknown): value is NanoBananaThinkingLevel =>
  NANO_BANANA_THINKING_LEVEL_OPTIONS.some(option => option.value === value);
