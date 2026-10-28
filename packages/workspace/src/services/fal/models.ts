import { normalizeNanoBananaEndpoint } from '../nanoBananaConfig';
import { getFlux3ImageSelectorModelId } from '../flux3ImageConfig';
import { getKrea3SelectorModelId } from '../krea3Config';
import type { FalAspectRatioOption, FalImageSizeOption } from '../../types'; // UI option types.
import {
  GROK_IMAGINE_IMAGE_MODEL_ID,
  NANO_BANANA_PRO_EDIT_MODEL_ID,
  normalizeFalModelId,
  SEEDREAM_V5_LITE_MODEL_ID,
  SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_V5_PRO_MODEL_ID,
  SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID,
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
} from '../modelConfig'; // Canonical model IDs.
import { getRuntimeConfig } from '../runtimeConfig'; // Shared web/desktop config.

const RETIRED_IMAGE_MODEL_IDS = new Set([
  'krea/v2/large/text-to-image',
  'fal-ai/bytedance/seedream/v4/edit',
  'fal-ai/bytedance/seedream/v4/text-to-image',
  'fal-ai/bytedance/seedream/v4.5/edit',
  'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'fal-ai/wan/v2.7/pro/text-to-image',
  'fal-ai/wan/v2.7/pro/edit',
  'wan/v2.6/text-to-image',
  'wan/v2.6/image-to-image',
]); // Saved ids remain rejectable without exposing retired models as supported exports.
export const isRetiredImageModelId = (modelId: string | undefined): boolean =>
  !!modelId && RETIRED_IMAGE_MODEL_IDS.has(modelId);

export const assertSupportedImageModelId = (modelId: string | undefined): void => {
  if (isRetiredImageModelId(modelId)) {
    throw new Error('This image model is no longer supported. Select a supported image model and create a new generation.');
  }
};

const REMOVED_KLING_O1_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1'; // Removed Kling image id.

export const normalizeModelId = (modelId: string | undefined): string | undefined => { // Normalize legacy ids.
  if (modelId === REMOVED_KLING_O1_IMAGE_MODEL_ID) {
    return undefined;
  }
  if (modelId === 'fal-ai/recraft/v4/pro/text-to-image') return RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID; // Upgrade legacy generation requests.
  if (normalizeFalModelId(modelId) === GROK_IMAGINE_IMAGE_MODEL_ID) return GROK_IMAGINE_IMAGE_MODEL_ID; // Share Grok selector aliases with the picker.
  return getKrea3SelectorModelId(modelId) ?? getFlux3ImageSelectorModelId(modelId) ?? normalizeNanoBananaEndpoint(modelId);
};

export const getDefaultFalModelId = (): string => normalizeModelId(getRuntimeConfig().falModelId) || NANO_BANANA_PRO_EDIT_MODEL_ID; // Default edit model.

const SEEDREAM_EDIT_MODEL_IDS = [SEEDREAM_V5_LITE_MODEL_ID, SEEDREAM_V5_PRO_MODEL_ID] as const; // Supported Seedream edit ids.
export type SeedreamEditModelId = typeof SEEDREAM_EDIT_MODEL_IDS[number]; // Seedream edit id union.
export const isSeedreamEditModelId = (modelId: string | undefined): modelId is SeedreamEditModelId =>
  !!modelId && (SEEDREAM_EDIT_MODEL_IDS as readonly string[]).includes(modelId); // Seedream edit guard.

const SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS = [SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID, SEEDREAM_V5_PRO_TEXT_TO_IMAGE_MODEL_ID] as const; // Supported Seedream t2i ids.
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
