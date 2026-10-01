import { resolveGptImage2RunSettings, type GptImage2RunSettings } from '../gptImage2RunSettings';
import { resolveGptImage25RunSettings, type GptImage25RunSettings } from '../gptImage25RunSettings';
import { getGptImage25EndpointVariant } from '../gptImage25Config';
import type { ImageRunKind } from '../imageRunSettings';
import type { GenerateImageOptions } from './types';

type GptImage2Options<Kind extends ImageRunKind> = Pick<GenerateImageOptions, 'imageSize' | 'numImages' | 'gptImage2Quality'> & {
  gptImage2RunSettings?: GptImage2RunSettings<Kind>;
};
type GptImage25Options<Kind extends ImageRunKind> = Pick<GenerateImageOptions, 'modelId' | 'imageSize' | 'numImages' | 'gptImage25Variant' | 'gptImage25Quality' | 'gptImage25Background'> & {
  gptImage25RunSettings?: GptImage25RunSettings<Kind>;
};

export const resolveGptImage2SettingsForRequest = <Kind extends ImageRunKind>(kind: Kind, options: GptImage2Options<Kind>): GptImage2RunSettings<Kind> =>
  options.gptImage2RunSettings ?? resolveGptImage2RunSettings({
    kind, quality: options.gptImage2Quality, imageSizeSelection: options.imageSize, numImages: options.numImages,
  });

export const resolveGptImage25SettingsForRequest = <Kind extends ImageRunKind>(kind: Kind, options: GptImage25Options<Kind>): GptImage25RunSettings<Kind> =>
  options.gptImage25RunSettings ?? resolveGptImage25RunSettings({
    kind, modelId: options.modelId,
    variant: getGptImage25EndpointVariant(options.modelId) ?? options.gptImage25Variant, // Explicit direct-call endpoints keep their variant.
    quality: options.gptImage25Quality, background: options.gptImage25Background,
    imageSizeSelection: options.imageSize, numImages: options.numImages,
  });

const serializeGptImageSize = (size: GptImage2RunSettings['imageSizeSelection']): string | { width: number; height: number } => {
  const dimensions = size.match(/^(\d+)x(\d+)$/);
  return dimensions ? { width: Number(dimensions[1]), height: Number(dimensions[2]) } : size;
};

export const serializeGptImage2Input = (settings: GptImage2RunSettings) => ({
  image_size: serializeGptImageSize(settings.imageSizeSelection),
  quality: settings.quality,
  sync_mode: false as const,
  output_format: 'png' as const,
  ...(settings.numImages !== undefined ? { num_images: settings.numImages } : {}),
});

export const serializeGptImage25Input = (settings: GptImage25RunSettings) => ({
  image_size: serializeGptImageSize(settings.imageSizeSelection),
  quality: settings.quality,
  background: settings.background,
  sync_mode: false as const,
  output_format: 'png' as const,
  ...(settings.numImages !== undefined ? { num_images: settings.numImages } : {}),
});
