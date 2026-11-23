import type { ApiProviderId } from '../types';
import { FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS, getNanoBananaAspectRatioOptions } from './nanoBananaConfig';
import { TOKENHUB_NANO_BANANA_ASPECT_RATIO_OPTIONS, isTokenHubNanoBananaModel } from './tokenHubNanoBananaConfig';

export const getNanoBananaAspectRatioOptionsForProvider = (modelId: string | undefined, provider: ApiProviderId) =>
  provider === 'google' ? FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS
    : isTokenHubNanoBananaModel(modelId) ? TOKENHUB_NANO_BANANA_ASPECT_RATIO_OPTIONS
    : getNanoBananaAspectRatioOptions(modelId);

export const getGoogleImageAspectRatio = (value: unknown) =>
  FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS.find(option =>
    option.value !== 'default' && option.value !== 'placeholder' && option.value === value,
  )?.value; // Unsupported saved ratios use Google's automatic aspect ratio.
