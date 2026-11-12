import { resolveGptImage26RunSettings, type GptImage26RunSettings } from '../gptImage26RunSettings';
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

type GptImage26Options<Kind extends ImageRunKind> = Pick<GenerateImageOptions, 'imageSize' | 'numImages' | 'gptImage26Quality' | 'gptImage26Background' | 'gptImage26ReasoningEffort' | 'gptImage26OutputFormat' | 'gptImage26FrameCount' | 'gptImage26FrameDurationMs'> & {
  gptImage26RunSettings?: GptImage26RunSettings<Kind>;
};
export function resolveGptImage26SettingsForRequest(kind: 'text_to_image', options: GptImage26Options<'text_to_image'>): GptImage26RunSettings<'text_to_image'>;
export function resolveGptImage26SettingsForRequest(kind: 'image_edit', options: GptImage26Options<'image_edit'>): GptImage26RunSettings<'image_edit'>;
export function resolveGptImage26SettingsForRequest(kind: ImageRunKind, options: GptImage26Options<ImageRunKind>): GptImage26RunSettings {
  const settings = options.gptImage26RunSettings;
  if (settings) {
    if (settings.kind !== kind) throw new Error('GPT Image 2.6 settings do not match the requested operation.');
    if (settings.outputFormat === 'svg' && (kind === 'image_edit' || settings.numImages !== 1)) throw new Error('GPT Image 2.6 SVG output supports one text-to-image result.');
    return settings;
  }
  return resolveGptImage26RunSettings({
    kind, quality: options.gptImage26Quality, background: options.gptImage26Background,
    reasoningEffort: options.gptImage26ReasoningEffort, outputFormat: options.gptImage26OutputFormat,
    frameCount: options.gptImage26FrameCount, frameDurationMs: options.gptImage26FrameDurationMs,
    imageSizeSelection: options.imageSize, numImages: options.numImages,
  });
}
export const serializeGptImage26Input = (settings: GptImage26RunSettings) => ({
  image_size: serializeGptImageSize(settings.imageSizeSelection), quality: settings.quality,
  background: settings.background, reasoning_effort: settings.reasoningEffort,
  output_format: settings.outputFormat, num_images: settings.numImages, sync_mode: false,
  ...(settings.outputFormat === 'gif' ? { frame_count: settings.frameCount, frame_duration_ms: settings.frameDurationMs } : {}),
});
