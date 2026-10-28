import { resolveRecraftRunSettings, type RecraftRunSettings } from '../recraftRunSettings';
import type { GenerateImageOptions } from './types';

export const resolveRecraftSettingsForRequest = (
  options: Pick<GenerateImageOptions, 'recraftImageSize' | 'recraftBackgroundColor' | 'recraftColors'> & {
    recraftRunSettings?: RecraftRunSettings;
  },
): RecraftRunSettings => options.recraftRunSettings ?? resolveRecraftRunSettings({
  imageSize: options.recraftImageSize,
  backgroundColor: options.recraftBackgroundColor,
  colors: options.recraftColors,
});

export const serializeRecraftInput = (settings: RecraftRunSettings) => ({
  image_size: settings.imageSize,
  background_color: settings.backgroundColor,
  colors: settings.colors,
  enable_safety_checker: true as const,
});
