import type { ApiProviderId } from '../types';
import { FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS, getNanoBananaAspectRatioOptions } from './nanoBananaConfig';

export const getNanoBananaAspectRatioOptionsForProvider = (modelId: string | undefined, provider: ApiProviderId) =>
  provider === 'fal' ? getNanoBananaAspectRatioOptions(modelId) : FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS;

export const getGoogleImageAspectRatio = (value: unknown) =>
  FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS.find(option =>
    option.value !== 'default' && option.value !== 'placeholder' && option.value === value,
  )?.value; // Unsupported saved ratios use Google's automatic aspect ratio.
