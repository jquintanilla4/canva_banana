import type { GenerationFalOptions, NanoBananaThinkingLevel } from '../types';
import {
  NANO_BANANA_21_ASPECT_RATIO_OPTIONS,
  NANO_BANANA_21_EDIT_MODEL_ID,
  NANO_BANANA_DEFAULTS,
  NANO_BANANA_MAX_OUTPUT_IMAGES,
  NANO_BANANA_THINKING_LEVEL_OPTIONS,
  isNanoBananaThinkingLevel,
  type NanoBananaAspectRatio,
} from './nanoBananaConfig';

export const TOKENHUB_NANO_BANANA_21_MODEL_ID = 'tokenhub/nano-banana-2.1' as const;
export const TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL = 'gg-nano-banana-2-1-standard' as const;
export const TOKENHUB_NANO_BANANA_MAX_OUTPUT_IMAGES = NANO_BANANA_MAX_OUTPUT_IMAGES;
export const TOKENHUB_NANO_BANANA_NUM_IMAGE_OPTIONS = Array.from({ length: TOKENHUB_NANO_BANANA_MAX_OUTPUT_IMAGES }, (_, index) => index + 1);
export const TOKENHUB_NANO_BANANA_DEFAULTS = {
  aspectRatioSelection: NANO_BANANA_DEFAULTS.aspectRatioSelection,
  resolutionSelection: NANO_BANANA_DEFAULTS.resolutionSelection,
  tokenHubNanoBananaWebSearch: NANO_BANANA_DEFAULTS.nanoBananaWebSearch,
  tokenHubNanoBananaThinkingLevel: NANO_BANANA_DEFAULTS.nanoBananaThinkingLevel,
  numImages: NANO_BANANA_DEFAULTS.numImages,
} as const satisfies GenerationFalOptions;
export type TokenHubNanoBananaAspectRatio = NanoBananaAspectRatio<typeof NANO_BANANA_21_EDIT_MODEL_ID>;
export const TOKENHUB_NANO_BANANA_ASPECT_RATIO_OPTIONS = NANO_BANANA_21_ASPECT_RATIO_OPTIONS;
export const TOKENHUB_NANO_BANANA_THINKING_LEVEL_OPTIONS = NANO_BANANA_THINKING_LEVEL_OPTIONS;
export const isTokenHubNanoBananaModel = (modelId: string | undefined): boolean => modelId === TOKENHUB_NANO_BANANA_21_MODEL_ID;
export const isTokenHubNanoBananaAspectRatio = (value: unknown): value is TokenHubNanoBananaAspectRatio =>
  value !== 'placeholder' && TOKENHUB_NANO_BANANA_ASPECT_RATIO_OPTIONS.some(option => option.value === value);
export const isTokenHubNanoBananaThinkingLevel = (value: unknown): value is NanoBananaThinkingLevel =>
  isNanoBananaThinkingLevel(value);
