import type { FalImageSizeOption, GenerationFalOptions, GptImage25Background, GptImage25Quality, GptImage25Variant } from '../types';
import { GPT_IMAGE_25_BACKGROUND_OPTIONS, GPT_IMAGE_25_QUALITY_OPTIONS, GPT_IMAGE_25_VARIANT_OPTIONS } from './gptImage25Config';

export const TOKENHUB_GPT_IMAGE_25_MODEL_ID = 'tokenhub/gpt-image-2.5' as const;
export const TOKENHUB_GPT_IMAGE_25_MAX_OUTPUT_IMAGES = 4;
export const TOKENHUB_GPT_IMAGE_25_NUM_IMAGE_OPTIONS = Array.from({ length: TOKENHUB_GPT_IMAGE_25_MAX_OUTPUT_IMAGES }, (_, index) => index + 1);
export const TOKENHUB_GPT_IMAGE_25_DEFAULTS = {
  tokenHubGptImage25Variant: 'sunburst',
  tokenHubGptImage25Quality: 'high',
  tokenHubGptImage25Background: 'auto',
  imageSizeSelection: 'auto',
  numImages: 1,
} as const satisfies GenerationFalOptions;
export type TokenHubGptImage25Variant = GptImage25Variant;
export type TokenHubGptImage25Quality = GptImage25Quality;
export type TokenHubGptImage25Background = GptImage25Background;
export type TokenHubGptImage25ModelId = 'og-image-2-5-flare-standard' | 'og-image-2-5-sunburst-standard';
export const isTokenHubGptImage25Model = (modelId: string | undefined): boolean => modelId === TOKENHUB_GPT_IMAGE_25_MODEL_ID;
export const getTokenHubGptImage25ModelId = (variant: TokenHubGptImage25Variant): TokenHubGptImage25ModelId =>
  variant === 'flare' ? 'og-image-2-5-flare-standard' : 'og-image-2-5-sunburst-standard';
export const isTokenHubGptImage25ProviderModel = (value: unknown): value is TokenHubGptImage25ModelId =>
  value === 'og-image-2-5-flare-standard' || value === 'og-image-2-5-sunburst-standard';
export const TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto (default)' },
  { value: '1024x1024', label: 'Square (1024x1024)' },
  { value: '1536x1024', label: 'Landscape (1536x1024)' },
  { value: '1024x1536', label: 'Portrait (1024x1536)' },
  { value: '2048x2048', label: '2K Square (2048x2048)' },
  { value: '2560x1440', label: '2K Landscape (2560x1440)' },
  { value: '1440x2560', label: '2K Portrait (1440x2560)' },
  { value: '2688x1152', label: '2K Cinematic 21:9 (2688x1152)' },
  { value: '2048x1152', label: 'HD Landscape (2048x1152)' },
  { value: '1152x2048', label: 'HD Portrait (1152x2048)' },
  { value: '2016x864', label: 'HD Cinematic 21:9 (2016x864)' },
  { value: 'landscape_4_3', label: 'Landscape 4:3 (1024x768)' },
  { value: 'portrait_4_3', label: 'Portrait 3:4 (768x1024)' },
  { value: '1344x576', label: 'Cinematic 21:9 (1344x576)' },
] as const satisfies ReadonlyArray<{ value: FalImageSizeOption; label: string }>;
export type TokenHubGptImage25ImageSize = (typeof TOKENHUB_GPT_IMAGE_25_IMAGE_SIZE_OPTIONS)[number]['value'];
export const TOKENHUB_GPT_IMAGE_25_VARIANT_OPTIONS = GPT_IMAGE_25_VARIANT_OPTIONS;
export const isTokenHubGptImage25Variant = (value: unknown): value is TokenHubGptImage25Variant =>
  TOKENHUB_GPT_IMAGE_25_VARIANT_OPTIONS.some(option => option.value === value);
export const TOKENHUB_GPT_IMAGE_25_BACKGROUND_OPTIONS = GPT_IMAGE_25_BACKGROUND_OPTIONS;
export const isTokenHubGptImage25Background = (value: unknown): value is TokenHubGptImage25Background =>
  TOKENHUB_GPT_IMAGE_25_BACKGROUND_OPTIONS.some(option => option.value === value);
export const TOKENHUB_GPT_IMAGE_25_QUALITY_OPTIONS = GPT_IMAGE_25_QUALITY_OPTIONS;
export const isTokenHubGptImage25Quality = (value: unknown): value is TokenHubGptImage25Quality =>
  TOKENHUB_GPT_IMAGE_25_QUALITY_OPTIONS.some(option => option.value === value);
export const serializeTokenHubGptImage25Size = (size: TokenHubGptImage25ImageSize): string => ({
  landscape_4_3: '1024x768',
  portrait_4_3: '768x1024',
  square_hd: '1024x1024',
}[size as FalImageSizeOption] ?? size);
