import { TokenHubImageError } from './tokenhub-gateway.mjs';

export const TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL = 'gg-nano-banana-2-1-standard';

const VALID_RESOLUTIONS = new Set(['1K', '2K', '4K']);
const VALID_THINKING_LEVELS = new Set(['minimal', 'medium', 'high']);
const VALID_ASPECT_RATIOS = new Set(['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16', '4:1', '1:4', '8:1', '1:8']);
export const assertTokenHubNanoBananaAspectRatio = value => {
  if (value !== undefined && !VALID_ASPECT_RATIOS.has(value)) {
    throw new TokenHubImageError('aspect_ratio is not supported.', { status: 400 });
  }
};
export const assertTokenHubNanoBananaResolution = value => {
  if (!VALID_RESOLUTIONS.has(value)) {
    throw new TokenHubImageError('resolution must be 1K, 2K, or 4K.', { status: 400 });
  }
};

export const assertTokenHubNanoBananaThinkingLevel = value => {
  if (!VALID_THINKING_LEVELS.has(value)) {
    throw new TokenHubImageError('thinking_level is not supported.', { status: 400 });
  }
};
