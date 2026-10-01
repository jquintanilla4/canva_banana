import type { FalImageSizeOption, Ideogram45EditPrecision, Ideogram45Quality } from '../../types';
import type { GenerateImageEditOptions, GenerateImageOptions } from './types';
import { getFalNumImageMaxForModel } from '../modelConfig';
import {
  IDEOGRAM_45_DEFAULTS,
  IDEOGRAM_45_IMAGE_SIZE_OPTIONS,
  IDEOGRAM_45_MODEL_ID,
  isIdeogram45EditPrecision,
  isIdeogram45Quality,
  normalizeIdeogram45Quality,
} from '../ideogram45Config';

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

const resolveIdeogram45ImageSize = (
  imageSize: FalImageSizeOption | undefined,
  autoSize: 'auto' | 'square_hd',
  preserveSource = false,
): Ideogram45Request['image_size'] => {
  const selectedSize = imageSize === 'default' ? 'auto' : imageSize ?? 'auto';
  if (!IDEOGRAM_45_IMAGE_SIZE_OPTIONS.some(option => option.value === selectedSize)) {
    throw new Error('Please select a supported Ideogram 4.5 image size.');
  }
  if (selectedSize === 'auto' || preserveSource) return autoSize;
  const explicitSize = selectedSize.match(/^(\d+)x(\d+)$/);
  return explicitSize ? { width: Number(explicitSize[1]), height: Number(explicitSize[2]) } : selectedSize;
};

const resolveIdeogram45NumImages = (numImages: number | undefined): Pick<Ideogram45Request, 'num_images'> =>
  typeof numImages === 'number' && Number.isFinite(numImages)
    ? { num_images: Math.min(getFalNumImageMaxForModel(IDEOGRAM_45_MODEL_ID), Math.max(1, Math.floor(numImages))) }
    : {};

export const resolveIdeogram45TextInput = (
  options: Pick<GenerateImageOptions, 'imageSize' | 'ideogram45Quality' | 'numImages' | 'seed'>,
): Omit<Ideogram45TextRequest, 'prompt'> => ({
  image_size: resolveIdeogram45ImageSize(options.imageSize, 'square_hd'),
  quality: isIdeogram45Quality(options.ideogram45Quality) && options.ideogram45Quality !== 'very_low'
    ? options.ideogram45Quality : IDEOGRAM_45_DEFAULTS.ideogram45Quality,
  enable_prompt_expansion: true,
  sync_mode: false,
  ...resolveIdeogram45NumImages(options.numImages),
  ...(typeof options.seed === 'number' && Number.isFinite(options.seed) ? { seed: Math.floor(options.seed) } : {}),
});

export const resolveIdeogram45EditInput = (
  options: Pick<GenerateImageEditOptions, 'imageSize' | 'ideogram45Quality' | 'ideogram45EditPrecision' | 'numImages'>,
): Omit<Ideogram45EditRequest, 'prompt' | 'image_url' | 'reference_image_urls'> => {
  const precision = isIdeogram45EditPrecision(options.ideogram45EditPrecision)
    ? options.ideogram45EditPrecision : IDEOGRAM_45_DEFAULTS.ideogram45EditPrecision;
  return {
    image_size: resolveIdeogram45ImageSize(options.imageSize, 'auto', precision === 'high'),
    quality: normalizeIdeogram45Quality(options.ideogram45Quality, true, precision),
    edit_precision: precision,
    sync_mode: false,
    ...resolveIdeogram45NumImages(options.numImages),
  };
};
