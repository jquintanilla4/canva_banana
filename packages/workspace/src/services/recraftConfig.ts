import type { RecraftRgbColor } from '../types';

export type { RecraftRgbColor } from '../types';
export type RecraftV4ProImageSizeSelectionValue = 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';

export const RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/recraft/v4.1/pro/text-to-image' as const; // Keep the legacy export name for saved settings and callers.
export const RECRAFT_V4_PRO_MAX_COLORS = 5; // UI cap for preferred colors.
export const RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE: RecraftV4ProImageSizeSelectionValue = 'square_hd'; // Fal default.
export const RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR: RecraftRgbColor = { r: 255, g: 255, b: 255 }; // Neutral background color.

export const RECRAFT_V4_PRO_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: RecraftV4ProImageSizeSelectionValue; label: string }> = [
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
] as const;

export const isRecraftV4ProModel = (modelId: string | undefined): boolean =>
  modelId === RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID;

export const isRecraftV4ProImageSizeSelectionValue = (value: unknown): value is RecraftV4ProImageSizeSelectionValue =>
  value === 'square_hd' || value === 'square' || value === 'portrait_4_3' || value === 'portrait_16_9' || value === 'landscape_4_3' || value === 'landscape_16_9';

export const clampRecraftRgbChannel = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(255, Math.max(0, Math.round(parsed)));
};

export const normalizeRecraftRgbColor = (value: unknown): RecraftRgbColor | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const color = value as Partial<RecraftRgbColor>;
  return {
    r: clampRecraftRgbChannel(color.r),
    g: clampRecraftRgbChannel(color.g),
    b: clampRecraftRgbChannel(color.b),
  };
};

const toHexPair = (value: number): string => value.toString(16).padStart(2, '0');

export const recraftRgbToHex = (color: RecraftRgbColor): string =>
  `#${toHexPair(clampRecraftRgbChannel(color.r))}${toHexPair(clampRecraftRgbChannel(color.g))}${toHexPair(clampRecraftRgbChannel(color.b))}`;

export const recraftHexToRgb = (value: string): RecraftRgbColor | undefined => {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};
