import type { FalImageSizeOption, Ideogram45EditPrecision, Ideogram45Quality } from '../../types';
import type { GenerateImageEditOptions, GenerateImageOptions } from './types';
import {
  resolveIdeogram45RunSettings,
  type Ideogram45EditRunSettings,
  type Ideogram45TextRunSettings,
} from '../ideogram45RunSettings';

interface Ideogram45Request {
  prompt: string;
  image_size: { width: number; height: number } | string;
  num_images?: number;
  sync_mode: false;
}

export interface Ideogram45TextRequest extends Ideogram45Request {
  quality: Exclude<Ideogram45Quality, 'very_low'>;
  enable_prompt_expansion: true;
  seed?: number;
}

export interface Ideogram45EditRequest extends Ideogram45Request {
  image_url: string;
  reference_image_urls?: string[];
  quality: Ideogram45Quality;
  edit_precision: Ideogram45EditPrecision;
}

const serializeIdeogram45ImageSize = (
  imageSize: FalImageSizeOption,
  autoSize: 'auto' | 'square_hd',
): Ideogram45Request['image_size'] => {
  if (imageSize === 'auto') return autoSize;
  const explicitSize = imageSize.match(/^(\d+)x(\d+)$/);
  return explicitSize ? { width: Number(explicitSize[1]), height: Number(explicitSize[2]) } : imageSize;
};

export const serializeIdeogram45TextInput = (
  settings: Ideogram45TextRunSettings,
): Omit<Ideogram45TextRequest, 'prompt'> => ({
  image_size: serializeIdeogram45ImageSize(settings.imageSizeSelection, 'square_hd'),
  quality: settings.quality,
  enable_prompt_expansion: true,
  sync_mode: false,
  ...(settings.numImages !== undefined ? { num_images: settings.numImages } : {}),
  ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
});

export const serializeIdeogram45EditInput = (
  settings: Ideogram45EditRunSettings,
): Omit<Ideogram45EditRequest, 'prompt' | 'image_url' | 'reference_image_urls'> => ({
  image_size: serializeIdeogram45ImageSize(settings.imageSizeSelection, 'auto'),
  quality: settings.quality,
  edit_precision: settings.editPrecision,
  sync_mode: false,
  ...(settings.numImages !== undefined ? { num_images: settings.numImages } : {}),
});

export const resolveIdeogram45TextInput = (
  options: Pick<GenerateImageOptions, 'imageSize' | 'ideogram45Quality' | 'ideogram45EditPrecision' | 'numImages' | 'seed' | 'ideogram45RunSettings'>,
): Omit<Ideogram45TextRequest, 'prompt'> => serializeIdeogram45TextInput(
  options.ideogram45RunSettings ?? resolveIdeogram45RunSettings({
    kind: 'text_to_image', quality: options.ideogram45Quality, editPrecision: options.ideogram45EditPrecision,
    imageSizeSelection: options.imageSize, numImages: options.numImages, seed: options.seed,
  }),
);

export const resolveIdeogram45EditInput = (
  options: Pick<GenerateImageEditOptions, 'imageSize' | 'ideogram45Quality' | 'ideogram45EditPrecision' | 'numImages' | 'ideogram45RunSettings'>,
): Omit<Ideogram45EditRequest, 'prompt' | 'image_url' | 'reference_image_urls'> => serializeIdeogram45EditInput(
  options.ideogram45RunSettings ?? resolveIdeogram45RunSettings({
    kind: 'image_edit', quality: options.ideogram45Quality, editPrecision: options.ideogram45EditPrecision,
    imageSizeSelection: options.imageSize, numImages: options.numImages,
  }),
);
