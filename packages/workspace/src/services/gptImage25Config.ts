import type { FalImageSizeOption, GenerationFalOptions, GptImage25Background, GptImage25Quality, GptImage25Variant } from '../types';

export const GPT_IMAGE_25_MODEL_ID = 'openai/gpt-image-2.5' as const;
export const GPT_IMAGE_25_MAX_OUTPUT_IMAGES = 4;
export const GPT_IMAGE_25_NUM_IMAGE_OPTIONS = Array.from({ length: GPT_IMAGE_25_MAX_OUTPUT_IMAGES }, (_, index) => index + 1);
export const GPT_IMAGE_25_DEFAULTS = {
  gptImage25Variant: 'sunburst',
  gptImage25Quality: 'high',
  gptImage25Background: 'auto',
  imageSizeSelection: 'auto',
  numImages: 1,
} as const satisfies GenerationFalOptions;
export const isGptImage25Model = (modelId: string | undefined): boolean =>
  modelId === GPT_IMAGE_25_MODEL_ID || /^openai\/gpt-image-2\.5\/(flare|sunburst)\/(edit|text-to-image)$/.test(modelId ?? '');
export const getGptImage25Endpoint = <Variant extends GptImage25Variant, Mode extends 'edit' | 'text-to-image'>(variant: Variant, mode: Mode): `${typeof GPT_IMAGE_25_MODEL_ID}/${Variant}/${Mode}` =>
  `${GPT_IMAGE_25_MODEL_ID}/${variant}/${mode}`;
export const getGptImage25EndpointVariant = (modelId: string | undefined): GptImage25Variant | undefined =>
  modelId !== GPT_IMAGE_25_MODEL_ID && isGptImage25Model(modelId)
    ? modelId?.includes('/flare/') ? 'flare' : 'sunburst' : undefined;
export const GPT_IMAGE_25_IMAGE_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto (default)' },
  { value: '2048x2048', label: '2K Square (2048x2048)' },
  { value: '2560x1440', label: '2K Landscape (2560x1440)' },
  { value: '1440x2560', label: '2K Portrait (1440x2560)' },
  { value: '2688x1152', label: '2K Cinematic 21:9 (2688x1152)' },
  { value: '2048x1152', label: 'HD Landscape (2048x1152)' },
  { value: '1152x2048', label: 'HD Portrait (1152x2048)' },
  { value: '2016x864', label: 'HD Cinematic 21:9 (2016x864)' },
  { value: 'landscape_4_3', label: 'Landscape 4:3 (1024x768)' },
  { value: 'portrait_4_3', label: 'Portrait 3:4 (768x1024)' },
  { value: 'square_hd', label: 'Square HD (1024x1024)' },
  { value: '1344x576', label: 'Cinematic 21:9 (1344x576)' },
] as const satisfies ReadonlyArray<{ value: FalImageSizeOption; label: string }>;
export type GptImage25ImageSize = (typeof GPT_IMAGE_25_IMAGE_SIZE_OPTIONS)[number]['value'];
export const GPT_IMAGE_25_VARIANT_OPTIONS = [
  { value: 'flare', label: 'Flare' },
  { value: 'sunburst', label: 'Sunburst' },
] as const satisfies ReadonlyArray<{ value: GptImage25Variant; label: string }>;
export const isGptImage25Variant = (value: unknown): value is GptImage25Variant =>
  GPT_IMAGE_25_VARIANT_OPTIONS.some(option => option.value === value);
export const GPT_IMAGE_25_BACKGROUND_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'transparent', label: 'Transparent' },
  { value: 'opaque', label: 'Opaque' },
] as const satisfies ReadonlyArray<{ value: GptImage25Background; label: string }>;
export const isGptImage25Background = (value: unknown): value is GptImage25Background =>
  GPT_IMAGE_25_BACKGROUND_OPTIONS.some(option => option.value === value);
export const GPT_IMAGE_25_QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' },
] as const satisfies ReadonlyArray<{ value: GptImage25Quality; label: string }>;
export const isGptImage25Quality = (value: unknown): value is GptImage25Quality =>
  GPT_IMAGE_25_QUALITY_OPTIONS.some(option => option.value === value);
