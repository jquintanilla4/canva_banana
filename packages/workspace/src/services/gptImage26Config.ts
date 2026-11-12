import type { FalImageSizeOption, GenerationFalOptions } from '../types';

export const GPT_IMAGE_26_MODEL_ID = 'openai/gpt-image-2.6/sunburst';
export const GPT_IMAGE_26_MAX_OUTPUT_IMAGES = 4;
export const GPT_IMAGE_26_OUTPUT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'] as const;
export const GPT_IMAGE_26_NUM_IMAGE_OPTIONS = [1, 2, 3, 4];
export const isGptImage26Model = (modelId: string | undefined): boolean =>
  modelId === GPT_IMAGE_26_MODEL_ID || modelId === `${GPT_IMAGE_26_MODEL_ID}/text-to-image` || modelId === `${GPT_IMAGE_26_MODEL_ID}/edit`;
export const GPT_IMAGE_26_DEFAULTS = {
  gptImage26Quality: 'high', gptImage26Background: 'auto', gptImage26ReasoningEffort: 'high',
  gptImage26OutputFormat: 'png', gptImage26FrameCount: 9, gptImage26FrameDurationMs: 200, imageSizeSelection: 'auto', numImages: 1,
} as const satisfies GenerationFalOptions;
export const GPT_IMAGE_26_IMAGE_SIZE_OPTIONS = [
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

export type GptImage26ImageSize = (typeof GPT_IMAGE_26_IMAGE_SIZE_OPTIONS)[number]['value'];
export const GPT_IMAGE_26_QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }, { value: 'xhigh', label: 'XHigh' }, { value: 'max', label: 'Max' },
] as const;
export const GPT_IMAGE_26_BACKGROUND_OPTIONS = [
  { value: 'auto', label: 'Auto' }, { value: 'transparent', label: 'Transparent' }, { value: 'opaque', label: 'Opaque' },
] as const;
export const GPT_IMAGE_26_REASONING_OPTIONS = [
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
] as const;
export const GPT_IMAGE_26_RASTER_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' },
] as const;
export const GPT_IMAGE_26_IMAGE_FORMAT_OPTIONS = [...GPT_IMAGE_26_RASTER_FORMAT_OPTIONS, { value: 'gif', label: 'GIF' }] as const;
export const GPT_IMAGE_26_FORMAT_OPTIONS = [...GPT_IMAGE_26_IMAGE_FORMAT_OPTIONS, { value: 'svg', label: 'SVG' }] as const;
export type GptImage26Quality = (typeof GPT_IMAGE_26_QUALITY_OPTIONS)[number]['value'];
export type GptImage26Background = (typeof GPT_IMAGE_26_BACKGROUND_OPTIONS)[number]['value'];
export type GptImage26ReasoningEffort = (typeof GPT_IMAGE_26_REASONING_OPTIONS)[number]['value'];
export type GptImage26RasterFormat = (typeof GPT_IMAGE_26_RASTER_FORMAT_OPTIONS)[number]['value'];
export type GptImage26OutputFormat = (typeof GPT_IMAGE_26_FORMAT_OPTIONS)[number]['value'];
export const isGptImage26Quality = (value: unknown): value is GptImage26Quality => GPT_IMAGE_26_QUALITY_OPTIONS.some(option => option.value === value);
export const isGptImage26Background = (value: unknown): value is GptImage26Background => GPT_IMAGE_26_BACKGROUND_OPTIONS.some(option => option.value === value);
export const isGptImage26ReasoningEffort = (value: unknown): value is GptImage26ReasoningEffort => GPT_IMAGE_26_REASONING_OPTIONS.some(option => option.value === value);
export const isGptImage26OutputFormat = (value: unknown): value is GptImage26OutputFormat => GPT_IMAGE_26_FORMAT_OPTIONS.some(option => option.value === value);
