import type { FalAspectRatioOption, FalImageSizeOption } from '../../types'; // UI option types.
import type { GenerateImageOptions } from './types';
import {
  GPT_IMAGE_25_DEFAULTS,
  GPT_IMAGE_25_IMAGE_SIZE_OPTIONS,
  isGptImage25Quality,
  isGptImage25Background,
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V5_LITE_MODEL_ID,
  SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V5_PRO_MODEL_ID,
  SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.
import { getRuntimeConfig } from '../runtimeConfig'; // Shared web/desktop config.

const LEGACY_NANO_BANANA_EDIT_MODEL_ID = 'fal-ai/nano-banana/edit'; // Legacy edit id.
const LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana'; // Legacy t2i id.
const LEGACY_WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID = 'wan/v2.6/text-to-image'; // Legacy Wan image t2i id.
const LEGACY_WAN_26_IMAGE_IMAGE_TO_IMAGE_MODEL_ID = 'wan/v2.6/image-to-image'; // Legacy Wan image edit id.
const REMOVED_KLING_O1_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1'; // Removed Kling image id.

export const normalizeModelId = (modelId: string | undefined): string | undefined => { // Normalize legacy ids.
  if (modelId === LEGACY_NANO_BANANA_EDIT_MODEL_ID) {
    return NANO_BANANA_PRO_EDIT_MODEL_ID;
  }
  if (modelId === LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID) {
    return NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  }
  if (modelId === LEGACY_WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID) {
    return WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  }
  if (modelId === LEGACY_WAN_26_IMAGE_IMAGE_TO_IMAGE_MODEL_ID) {
    return WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID;
  }
  if (modelId === REMOVED_KLING_O1_IMAGE_MODEL_ID) {
    return undefined;
  }
  return modelId;
};

export const FAL_MODEL_ID = normalizeModelId(getRuntimeConfig().falModelId) || NANO_BANANA_PRO_EDIT_MODEL_ID; // Default edit model.

const SEEDREAM_EDIT_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID, SEEDREAM_V5_LITE_MODEL_ID, SEEDREAM_V5_PRO_MODEL_ID] as const; // Seedream edit ids.
export type SeedreamEditModelId = typeof SEEDREAM_EDIT_MODEL_IDS[number]; // Seedream edit id union.
export const isSeedreamEditModelId = (modelId: string | undefined): modelId is SeedreamEditModelId =>
  !!modelId && (SEEDREAM_EDIT_MODEL_IDS as readonly string[]).includes(modelId); // Seedream edit guard.

const SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS = [SEEDREAM_TEXT_TO_IMAGE_MODEL_ID, SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID, SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID, SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID] as const; // Seedream t2i ids.
export const isSeedreamTextToImageModelId = (modelId: string | undefined): boolean =>
  !!modelId && (SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS as readonly string[]).includes(modelId); // Seedream t2i guard.

const SEEDREAM_CUSTOM_SIZE_MAP = {
  '2048x2048': { width: 2048, height: 2048 },
  '2048x1152': { width: 2048, height: 1152 },
  '1152x2048': { width: 1152, height: 2048 },
  '2560x1440': { width: 2560, height: 1440 },
  '1440x2560': { width: 1440, height: 2560 },
} as const; // Custom sizes used by Seedream.
type SeedreamCustomSizeKey = keyof typeof SEEDREAM_CUSTOM_SIZE_MAP; // Custom size keys.
const isSeedreamCustomSize = (value: unknown): value is SeedreamCustomSizeKey =>
  value === '2048x2048'
  || value === '2048x1152'
  || value === '1152x2048'
  || value === '2560x1440'
  || value === '1440x2560'; // Custom size guard.
const getSeedreamCustomSize = (value: string | undefined) =>
  isSeedreamCustomSize(value) ? SEEDREAM_CUSTOM_SIZE_MAP[value] : undefined; // Resolve custom size.

export const resolveSeedreamCustomSizeForModel = (
  _modelId: string | undefined,
  imageSizeOption: FalImageSizeOption | FalAspectRatioOption,
): { width: number; height: number } | undefined => { // Pick custom size when present.
  const baseSize = getSeedreamCustomSize(imageSizeOption);
  if (!baseSize) {
    return undefined;
  }
  return baseSize;
};

const GPT_IMAGE_2_EXPLICIT_SIZE_MAP = {
  '2048x2048': { width: 2048, height: 2048 },
  '2048x1152': { width: 2048, height: 1152 },
  '1152x2048': { width: 1152, height: 2048 },
  '2560x1440': { width: 2560, height: 1440 },
  '1440x2560': { width: 1440, height: 2560 },
  '2688x1152': { width: 2688, height: 1152 },
  '2016x864': { width: 2016, height: 864 },
  '1344x576': { width: 1344, height: 576 },
} as const; // Explicit pixel sizes shared by GPT Image 2 and 2.5.
type GptImage2ExplicitSizeKey = keyof typeof GPT_IMAGE_2_EXPLICIT_SIZE_MAP; // Explicit size keys.
const isGptImage2ExplicitSize = (value: unknown): value is GptImage2ExplicitSizeKey =>
  value === '2048x2048'
  || value === '2048x1152'
  || value === '1152x2048'
  || value === '2560x1440'
  || value === '1440x2560'
  || value === '2688x1152'
  || value === '2016x864'
  || value === '1344x576'; // Explicit size guard.

export const resolveGptImage2SizeForFal = (
  imageSizeOption: FalImageSizeOption,
): { width: number; height: number } | string => { // Convert selected GPT size to Fal input.
  if (imageSizeOption === 'default') {
    return 'auto';
  }
  return isGptImage2ExplicitSize(imageSizeOption)
    ? GPT_IMAGE_2_EXPLICIT_SIZE_MAP[imageSizeOption]
    : imageSizeOption;
};

export const resolveGptImage25Input = (
  options: Pick<GenerateImageOptions, 'imageSize' | 'gptImage25Quality' | 'gptImage25Background'>,
) => {
  const imageSize = options.imageSize ?? GPT_IMAGE_25_DEFAULTS.imageSizeSelection;
  if (imageSize !== 'default' && !GPT_IMAGE_25_IMAGE_SIZE_OPTIONS.some(option => option.value === imageSize)) {
    throw new Error('Please select a supported GPT Image 2.5 image size.');
  }
  return {
    image_size: resolveGptImage2SizeForFal(imageSize),
    quality: isGptImage25Quality(options.gptImage25Quality) ? options.gptImage25Quality : GPT_IMAGE_25_DEFAULTS.gptImage25Quality,
    background: isGptImage25Background(options.gptImage25Background) ? options.gptImage25Background : GPT_IMAGE_25_DEFAULTS.gptImage25Background,
  };
};
