import type { GenerationFalOptions, KlingV4AspectRatio, KlingV4Duration, KlingV4Resolution, KlingV4Variant } from '../types';
import { KLING_V4_DEFAULTS, KLING_V4_EDIT_VIDEO_MODEL_ID, isKlingV4AspectRatio, isKlingV4Duration, isKlingV4Resolution, isKlingV4Variant } from './klingV4Config';

export interface KlingV4RunSettings {
  readonly variant: KlingV4Variant;
  readonly resolution: KlingV4Resolution;
  readonly aspectRatio: KlingV4AspectRatio;
  readonly duration: KlingV4Duration;
}

export interface KlingV4RunSettingsInput {
  modelId?: string;
  variant?: unknown;
  resolution?: unknown;
  aspectRatio?: unknown;
  duration?: unknown;
}

export const resolveKlingV4RunSettings = (input: KlingV4RunSettingsInput = {}): KlingV4RunSettings => {
  const variant = input.modelId === KLING_V4_EDIT_VIDEO_MODEL_ID ? 'edit'
    : isKlingV4Variant(input.variant) ? input.variant : KLING_V4_DEFAULTS.klingV4Variant;
  const duration = isKlingV4Duration(input.duration) ? input.duration
    : variant === 'edit' ? 'source' : KLING_V4_DEFAULTS.klingV4Duration;
  return {
    variant,
    resolution: isKlingV4Resolution(input.resolution) ? input.resolution : KLING_V4_DEFAULTS.klingV4Resolution,
    aspectRatio: isKlingV4AspectRatio(input.aspectRatio) ? input.aspectRatio : KLING_V4_DEFAULTS.klingV4AspectRatio,
    duration: duration === 'source' && variant === 'generate' ? KLING_V4_DEFAULTS.klingV4Duration : duration,
  };
};

export const serializeKlingV4GenerationOptions = (settings: KlingV4RunSettings) => ({
  klingV4Variant: settings.variant,
  klingV4Resolution: settings.resolution,
  klingV4AspectRatio: settings.aspectRatio,
  klingV4Duration: settings.duration,
} satisfies GenerationFalOptions);
