import type { GenerationFalOptions } from '../types';
import type { ImageRunSettingsValidation } from './imageRunSettings';
import {
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
  RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE,
  RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR,
  RECRAFT_V4_PRO_MAX_COLORS,
  isRecraftV4ProImageSizeSelectionValue,
  normalizeRecraftRgbColor,
  type RecraftV4ProImageSizeSelectionValue,
  type RecraftRgbColor,
} from './recraftConfig';

export interface RecraftRunSettings {
  readonly kind: 'text_to_image';
  readonly endpoint: typeof RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID;
  readonly imageSize: RecraftV4ProImageSizeSelectionValue;
  readonly backgroundColor: RecraftRgbColor;
  readonly colors: RecraftRgbColor[];
}

export const resolveRecraftRunSettings = (
  input: { imageSize?: unknown; backgroundColor?: unknown; colors?: unknown },
  validation: ImageRunSettingsValidation = 'strict',
): RecraftRunSettings => {
  const imageSize = input.imageSize === undefined ? RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE : input.imageSize;
  if (!isRecraftV4ProImageSizeSelectionValue(imageSize) && validation === 'strict') {
    throw new Error('Please select a supported Recraft image size.');
  }
  return {
    kind: 'text_to_image',
    endpoint: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
    imageSize: isRecraftV4ProImageSizeSelectionValue(imageSize) ? imageSize : RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE,
    backgroundColor: normalizeRecraftRgbColor(input.backgroundColor) ?? { ...RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR },
    colors: Array.isArray(input.colors)
      ? input.colors.map(normalizeRecraftRgbColor).filter((color): color is RecraftRgbColor => Boolean(color)).slice(0, RECRAFT_V4_PRO_MAX_COLORS)
      : [],
  };
};

export const serializeRecraftGenerationOptions = (settings: RecraftRunSettings): GenerationFalOptions => ({
  recraftImageSize: settings.imageSize,
  recraftBackgroundColor: settings.backgroundColor,
  recraftColors: settings.colors,
});
