import type { FalResolutionOption, GenerationFalOptions, NanoBananaThinkingLevel } from '../types';
import {
  TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
  TOKENHUB_NANO_BANANA_DEFAULTS,
  TOKENHUB_NANO_BANANA_MAX_OUTPUT_IMAGES,
  isTokenHubNanoBananaAspectRatio,
  isTokenHubNanoBananaThinkingLevel,
  type TokenHubNanoBananaAspectRatio,
} from './tokenHubNanoBananaConfig';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettings, type ImageRunSettingsValidation } from './imageRunSettings';

interface TokenHubNanoBananaSettingsForKind<Kind extends ImageRunKind> extends ImageRunSettings<Kind> {
  readonly model: typeof TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL;
  readonly aspectRatioSelection: TokenHubNanoBananaAspectRatio;
  readonly resolution: FalResolutionOption;
  readonly webSearch: boolean;
  readonly thinkingLevel: NanoBananaThinkingLevel;
}
export type TokenHubNanoBananaRunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? TokenHubNanoBananaSettingsForKind<Kind> : never;

export interface TokenHubNanoBananaRunSettingsInput<Kind extends ImageRunKind> {
  kind: Kind;
  aspectRatioSelection?: unknown;
  resolution?: unknown;
  webSearch?: unknown;
  thinkingLevel?: unknown;
  numImages?: unknown;
}

export const resolveTokenHubNanoBananaRunSettings = <Kind extends ImageRunKind>(
  input: TokenHubNanoBananaRunSettingsInput<Kind>,
  validation: ImageRunSettingsValidation = 'strict',
): TokenHubNanoBananaRunSettings<Kind> => {
  const selectedAspectRatio = input.aspectRatioSelection === 'auto' ? 'default' : input.aspectRatioSelection ?? TOKENHUB_NANO_BANANA_DEFAULTS.aspectRatioSelection;
  const validAspectRatio = isTokenHubNanoBananaAspectRatio(selectedAspectRatio);
  const resolution = input.resolution ?? TOKENHUB_NANO_BANANA_DEFAULTS.resolutionSelection;
  const validResolution = resolution === '1K' || resolution === '2K' || resolution === '4K';
  if (validation === 'strict' && (!validAspectRatio || !validResolution)) {
    throw new Error('Please select a supported NanoBanana 2.1 (TokenHub) aspect ratio and resolution.');
  }
  return {
    kind: input.kind,
    model: TOKENHUB_NANO_BANANA_21_PROVIDER_MODEL,
    aspectRatioSelection: validAspectRatio ? selectedAspectRatio : TOKENHUB_NANO_BANANA_DEFAULTS.aspectRatioSelection,
    resolution: validResolution ? resolution : TOKENHUB_NANO_BANANA_DEFAULTS.resolutionSelection,
    webSearch: typeof input.webSearch === 'boolean' ? input.webSearch : TOKENHUB_NANO_BANANA_DEFAULTS.tokenHubNanoBananaWebSearch,
    thinkingLevel: isTokenHubNanoBananaThinkingLevel(input.thinkingLevel) ? input.thinkingLevel : TOKENHUB_NANO_BANANA_DEFAULTS.tokenHubNanoBananaThinkingLevel,
    numImages: resolveImageRunOutputCount(input.numImages, TOKENHUB_NANO_BANANA_MAX_OUTPUT_IMAGES, validation) ?? 1,
  } as TokenHubNanoBananaRunSettings<Kind>;
};

export const serializeTokenHubNanoBananaGenerationOptions = (settings: TokenHubNanoBananaRunSettings): GenerationFalOptions => ({
  aspectRatioSelection: settings.aspectRatioSelection,
  resolutionSelection: settings.resolution,
  tokenHubNanoBananaWebSearch: settings.webSearch,
  tokenHubNanoBananaThinkingLevel: settings.thinkingLevel,
  numImages: settings.numImages,
});

export const serializeTokenHubNanoBananaInput = (settings: TokenHubNanoBananaRunSettings) => ({
  model: settings.model,
  ...(settings.aspectRatioSelection !== 'default' ? { aspect_ratio: settings.aspectRatioSelection } : {}),
  resolution: settings.resolution,
  enable_web_search: settings.webSearch,
  thinking_level: settings.thinkingLevel,
  n: settings.numImages,
  output_format: 'png' as const,
});
