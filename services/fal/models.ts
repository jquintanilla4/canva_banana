import type { FalAspectRatioOption, FalImageSizeOption } from '../../types'; // UI option types.
import {
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.

const LEGACY_NANO_BANANA_EDIT_MODEL_ID = 'fal-ai/nano-banana/edit'; // Legacy edit id.
const LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana'; // Legacy t2i id.

export const normalizeModelId = (modelId: string | undefined): string | undefined => { // Normalize legacy ids.
  if (modelId === LEGACY_NANO_BANANA_EDIT_MODEL_ID) {
    return NANO_BANANA_PRO_EDIT_MODEL_ID;
  }
  if (modelId === LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID) {
    return NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  }
  return modelId;
};

export const FAL_MODEL_ID = normalizeModelId(process.env.FAL_MODEL_ID) || NANO_BANANA_PRO_EDIT_MODEL_ID; // Default edit model.

const SEEDREAM_EDIT_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID] as const; // Seedream edit ids.
export type SeedreamEditModelId = typeof SEEDREAM_EDIT_MODEL_IDS[number]; // Seedream edit id union.
export const isSeedreamEditModelId = (modelId: string | undefined): modelId is SeedreamEditModelId =>
  !!modelId && (SEEDREAM_EDIT_MODEL_IDS as readonly string[]).includes(modelId); // Seedream edit guard.

const SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS = [SEEDREAM_TEXT_TO_IMAGE_MODEL_ID, SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID] as const; // Seedream t2i ids.
export const isSeedreamTextToImageModelId = (modelId: string | undefined): boolean =>
  !!modelId && (SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS as readonly string[]).includes(modelId); // Seedream t2i guard.

const SEEDREAM_CUSTOM_SIZE_MAP = {
  '2560x1440': { width: 2560, height: 1440 },
  '1440x2560': { width: 1440, height: 2560 },
} as const; // Custom sizes used by Seedream.
type SeedreamCustomSizeKey = keyof typeof SEEDREAM_CUSTOM_SIZE_MAP; // Custom size keys.
const isSeedreamCustomSize = (value: unknown): value is SeedreamCustomSizeKey =>
  value === '2560x1440' || value === '1440x2560'; // Custom size guard.
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
