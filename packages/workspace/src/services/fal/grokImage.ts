import { resolveGrokImageRunSettings, type GrokImageRunSettings } from '../grokImageRunSettings';
import type { ImageRunKind } from '../imageRunSettings';
import type { GenerateImageOptions } from './types';

type GrokImageOptions<Kind extends ImageRunKind> = Pick<GenerateImageOptions,
  'aspectRatio' | 'numImages' | 'grokImageAspectRatio' | 'grokImageResolution' | 'grokImageQuality'
  | 'grokImageOutputFormat' | 'grokImagePassthrough' | 'grokImageEnableSafetyChecker'> & {
  grokImageRunSettings?: GrokImageRunSettings<NoInfer<Kind>>;
};

export const resolveGrokImageSettingsForRequest = <Kind extends ImageRunKind>(kind: Kind, options: GrokImageOptions<Kind>): GrokImageRunSettings<Kind> =>
  options.grokImageRunSettings ?? resolveGrokImageRunSettings({
    kind,
    aspectRatio: options.grokImageAspectRatio !== undefined ? options.grokImageAspectRatio : options.aspectRatio,
    numImages: options.numImages,
    resolution: options.grokImageResolution,
    quality: options.grokImageQuality,
    outputFormat: options.grokImageOutputFormat,
    imagePassthrough: options.grokImagePassthrough,
    enableSafetyChecker: options.grokImageEnableSafetyChecker,
  });

export const serializeGrokImageInput = (settings: GrokImageRunSettings) => ({
  aspect_ratio: settings.aspectRatio,
  resolution: settings.resolution,
  quality: settings.quality,
  output_format: settings.outputFormat,
  image_passthrough: settings.imagePassthrough,
  enable_safety_checker: settings.enableSafetyChecker,
  sync_mode: settings.kind === 'text_to_image',
  ...(settings.numImages !== undefined ? { num_images: settings.numImages } : {}),
});
