import type {
  ApiProviderId,
  FalAspectRatioOption,
  FalImageSizePreset,
  FalResolutionOption,
  FalVideoDuration,
  GenerationKind,
} from '../types';

export const GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID = 'fal-ai/gemini-3-pro-image-preview/edit' as const;
export const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit' as const;
export const SEEDREAM_V45_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/edit' as const;
export const GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/gemini-3-pro-image-preview' as const;
export const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image' as const;
export const SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/text-to-image' as const;
export const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image' as const;
export const KLING_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1' as const;
export const CRYSTAL_UPSCALER_MODEL_ID = 'clarityai/crystal-upscaler' as const;
export const SEEDVR_UPSCALER_MODEL_ID = 'fal-ai/seedvr/upscale/image' as const;
export const HAILUO_IMAGE_TO_VIDEO_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/image-to-video' as const;
export const HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video' as const;
export const HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video' as const;
export const KLING_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/image-to-video' as const;
export const KLING_VIDEO_STANDARD_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video' as const;
export const KLING_VIDEO_PRO_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' as const;
export const KLING_26_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.6/pro/image-to-video' as const;
export const UPSCALE_MODEL_HIGHLIGHT_COLOR = '#3596F8' as const;

export type HailuoVariant = 'standard' | 'pro';
export type KlingVariant = 'standard' | 'pro';
export const KLING_DEFAULT_NEGATIVE_PROMPT = 'blur, distort, and low quality';

export const FAL_IMAGE_MODEL_OPTIONS = [
  { value: GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID, label: 'NanoBanana Pro' },
  { value: SEEDREAM_MODEL_ID, label: 'Seedream v4' },
  { value: SEEDREAM_V45_MODEL_ID, label: 'Seedream v4.5' },
  { value: KLING_IMAGE_MODEL_ID, label: 'Kling O1 Image' },
  { value: REVE_TEXT_TO_IMAGE_MODEL_ID, label: 'Reve Image' },
  { value: CRYSTAL_UPSCALER_MODEL_ID, label: 'Crystal Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
  { value: SEEDVR_UPSCALER_MODEL_ID, label: 'SeedVR2 Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
] as const;

export const FAL_VIDEO_MODEL_OPTIONS = [
  { value: HAILUO_IMAGE_TO_VIDEO_MODEL_ID, label: 'Hailuo 2.3' },
  { value: KLING_VIDEO_MODEL_ID, label: 'Kling 2.5 Turbo' },
  { value: KLING_26_VIDEO_MODEL_ID, label: 'Kling 2.6' },
] as const;

export const HAILUO_VARIANT_OPTIONS: ReadonlyArray<{ value: HailuoVariant; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'pro', label: 'Pro' },
] as const;

export const getHailuoActualModelId = (variant: HailuoVariant): string =>
  variant === 'pro' ? HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID : HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID;

export const KLING_VARIANT_OPTIONS: ReadonlyArray<{ value: KlingVariant; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'pro', label: 'Pro' },
] as const;

export const getKlingActualModelId = (variant: KlingVariant): string =>
  variant === 'pro' ? KLING_VIDEO_PRO_MODEL_ID : KLING_VIDEO_STANDARD_MODEL_ID;

export const FAL_MODEL_OPTIONS = [...FAL_IMAGE_MODEL_OPTIONS, ...FAL_VIDEO_MODEL_OPTIONS] as const;
export const SEEDREAM_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID] as const;
export type SeedreamModelId = typeof SEEDREAM_MODEL_IDS[number];
export const SEEDREAM_TEXT_TO_IMAGE_MAP: Record<SeedreamModelId, string> = {
  [SEEDREAM_MODEL_ID]: SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  [SEEDREAM_V45_MODEL_ID]: SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
};

export type FalModelMode = 'image' | 'video';
export type FalImageSizeSelectionValue = 'placeholder' | 'default' | FalImageSizePreset;
export type FalAspectRatioSelectionValue = 'placeholder' | FalAspectRatioOption;
export type FalResolutionSelectionValue = FalResolutionOption;
export type Kling26AudioSelectionValue = 'placeholder' | 'on' | 'off';

export type FalModelId = typeof FAL_MODEL_OPTIONS[number]['value'];
export type FalImageModelId = typeof FAL_IMAGE_MODEL_OPTIONS[number]['value'];
export type FalVideoModelId = typeof FAL_VIDEO_MODEL_OPTIONS[number]['value'];

export const isFalModelId = (value: string | undefined): value is FalModelId =>
  typeof value === 'string' && FAL_MODEL_OPTIONS.some(option => option.value === value);
export const isFalImageModelId = (value: string | undefined): value is FalImageModelId =>
  typeof value === 'string' && FAL_IMAGE_MODEL_OPTIONS.some(option => option.value === value);
export const isFalVideoModelId = (value: string | undefined): value is FalVideoModelId =>
  typeof value === 'string' && FAL_VIDEO_MODEL_OPTIONS.some(option => option.value === value);
export const isSeedreamModelId = (value: FalModelId | undefined): value is SeedreamModelId =>
  !!value && (SEEDREAM_MODEL_IDS as readonly string[]).includes(value);
export const getSeedreamTextToImageModelId = (modelId: SeedreamModelId): string =>
  SEEDREAM_TEXT_TO_IMAGE_MAP[modelId];

export const isFalImageSizeSelectionValue = (value: unknown): value is FalImageSizeSelectionValue =>
  typeof value === 'string' && FAL_IMAGE_SIZE_OPTIONS.some(option => option.value === value);

export const isFalAspectRatioSelectionValue = (value: unknown): value is FalAspectRatioSelectionValue =>
  typeof value === 'string' && FAL_ASPECT_RATIO_VALUES.has(value as FalAspectRatioSelectionValue);

export const isFalResolutionSelectionValue = (value: unknown): value is FalResolutionSelectionValue =>
  typeof value === 'string' && FAL_RESOLUTION_OPTIONS.some(option => option.value === value);

export const isApiProvider = (value: unknown): value is ApiProviderId =>
  value === 'google' || value === 'fal';
export const isFalModelMode = (value: unknown): value is FalModelMode =>
  value === 'image' || value === 'video';
export const isGenerationKind = (value: unknown): value is GenerationKind =>
  value === 'text_to_image' || value === 'image_edit' || value === 'upscale' || value === 'video';

const LEGACY_NANO_BANANA_MODEL_ID = 'fal-ai/nano-banana/edit' as const;
export const normalizeFalModelId = (value: string | undefined): FalModelId | undefined => {
  if (value === LEGACY_NANO_BANANA_MODEL_ID) {
    return GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  }
  return isFalModelId(value) ? value : undefined;
};

export const ENV_FAL_MODEL_ID = normalizeFalModelId(process.env.FAL_MODEL_ID);
export const DEFAULT_FAL_IMAGE_MODEL_ID: FalImageModelId =
  isFalImageModelId(ENV_FAL_MODEL_ID) ? ENV_FAL_MODEL_ID : GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
export const DEFAULT_FAL_VIDEO_MODEL_ID: FalVideoModelId = HAILUO_IMAGE_TO_VIDEO_MODEL_ID;

export const FAL_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: FalImageSizeSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Match Source' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'auto', label: 'Auto' },
  { value: 'auto_2K', label: 'Auto 2K' },
  { value: 'auto_4K', label: 'Auto 4K' },
] as const;

export const FAL_NUM_IMAGE_OPTIONS = [1, 2, 3, 4] as const;
export const FAL_CRYSTAL_SCALE_FACTOR_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const factor = index + 1;
  return { value: `${factor}`, label: `${factor}x` } as const;
});
export const FAL_CRYSTAL_CREATIVITY_OPTIONS = Array.from({ length: 21 }, (_, index) => {
  const value = (index * 0.5);
  const formatted = value.toFixed(1);
  return { value: formatted, label: formatted } as const;
});
export const FAL_SEEDVR_NOISE_SCALE_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const value = (index + 1) / 10;
  return { value: value.toFixed(1), label: value.toFixed(1) } as const;
});

export const FAL_RESOLUTION_OPTIONS: ReadonlyArray<{ value: FalResolutionSelectionValue; label: string }> = [
  { value: '1K', label: '1K (default)' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const;

export const FAL_KLING_RESOLUTION_OPTIONS: ReadonlyArray<{ value: FalResolutionSelectionValue; label: string }> = [
  { value: '1K', label: '1K (default)' },
  { value: '2K', label: '2K' },
] as const;

export const FAL_GEMINI_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Auto (default)' },
  { value: '21:9', label: '21:9' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
] as const;

export const FAL_REVE_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Default (3:2)' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
] as const;

export const FAL_KLING_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Auto (default)' },
  { value: '21:9', label: '21:9' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
] as const;

export const FAL_ASPECT_RATIO_VALUES = new Set<FalAspectRatioSelectionValue>([
  ...FAL_GEMINI_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_REVE_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_KLING_ASPECT_RATIO_OPTIONS.map(option => option.value),
]);

export const KLING26_AUDIO_OPTIONS: ReadonlyArray<{ value: Kling26AudioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Audio' },
  { value: 'off', label: 'OFF' },
  { value: 'on', label: 'ON' },
] as const;

export const FAL_IMAGE_SIZE_DEFAULT_OPTION = 'default';
export const DEFAULT_MAX_REFERENCE_IMAGES = 13;
export const MODEL_REFERENCE_IMAGE_LIMITS: Partial<Record<FalModelId, number>> = {
  [SEEDREAM_MODEL_ID]: 7,
  [SEEDREAM_V45_MODEL_ID]: 8,
  [KLING_IMAGE_MODEL_ID]: 10,
  [HAILUO_IMAGE_TO_VIDEO_MODEL_ID]: 0,
  [KLING_VIDEO_MODEL_ID]: 0,
  [KLING_26_VIDEO_MODEL_ID]: 0,
};

export const getMaxReferenceImages = (modelId: FalModelId | undefined): number =>
  modelId && MODEL_REFERENCE_IMAGE_LIMITS[modelId] !== undefined
    ? MODEL_REFERENCE_IMAGE_LIMITS[modelId] as number
    : DEFAULT_MAX_REFERENCE_IMAGES;

export const getFalModelLabel = (modelId: FalModelId): string => {
  const match = FAL_MODEL_OPTIONS.find(option => option.value === modelId);
  return match ? match.label : 'FAL Model';
};
