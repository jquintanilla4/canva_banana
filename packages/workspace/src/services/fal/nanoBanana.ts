import { resolveNanoBananaRunSettings, type NanoBananaRunSettings } from '../nanoBananaRunSettings';
import { NANO_BANANA_21_EDIT_MODEL_ID } from '../nanoBananaConfig';
import type { ImageRunKind } from '../imageRunSettings';
import type { GenerateImageOptions } from './types';

type NanoBananaOptions<Kind extends ImageRunKind> = Pick<GenerateImageOptions, 'modelId' | 'aspectRatio' | 'resolution' | 'numImages' | 'nanoBananaWebSearch' | 'nanoBananaThinkingLevel'> & {
  nanoBananaRunSettings?: NanoBananaRunSettings<NoInfer<Kind>>;
};
export const resolveNanoBananaSettingsForRequest = <Kind extends ImageRunKind>(kind: Kind, options: NanoBananaOptions<Kind>) =>
  options.nanoBananaRunSettings ?? resolveNanoBananaRunSettings({
    kind, modelId: options.modelId, aspectRatioSelection: options.aspectRatio, resolution: options.resolution,
    numImages: options.numImages, webSearch: options.nanoBananaWebSearch, thinkingLevel: options.nanoBananaThinkingLevel,
  });
export const serializeNanoBananaInput = (settings: NanoBananaRunSettings) => ({
  ...(settings.aspectRatioSelection !== 'default' ? { aspect_ratio: settings.aspectRatioSelection } : {}),
  resolution: settings.resolution, sync_mode: false, output_format: 'png' as const,
  ...(settings.numImages !== undefined ? { num_images: settings.numImages } : {}),
  ...(settings.modelId === NANO_BANANA_21_EDIT_MODEL_ID ? {
    enable_web_search: settings.webSearch, thinking_level: settings.thinkingLevel,
  } : {}),
});
