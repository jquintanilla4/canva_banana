export const KREA_2_STYLE_STRENGTH_MIN = -2;
export const KREA_2_STYLE_STRENGTH_MAX = 2;
export const KREA_2_STYLE_STRENGTH_DEFAULT = 1;

export const normalizeKrea2StyleStrength = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  const rounded = Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : KREA_2_STYLE_STRENGTH_DEFAULT; // Krea sliders move by tenths.
  return Math.min(KREA_2_STYLE_STRENGTH_MAX, Math.max(KREA_2_STYLE_STRENGTH_MIN, rounded));
}; // One clamp keeps the slider, the request payload, and metadata transfer in agreement.
