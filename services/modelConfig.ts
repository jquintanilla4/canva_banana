import type {
  ApiProviderId,
  FalAspectRatioOption,
  FalImageSizePreset,
  FalResolutionOption,
  FalVideoDuration,
  GenerationKind,
} from '../types';

// Central registry of supported model IDs plus helpers for validation/labeling in the UI.
export const NANO_BANANA_PRO_EDIT_MODEL_ID = 'fal-ai/nano-banana-pro/edit' as const;
export const NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana-pro' as const;
export const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit' as const;
export const SEEDREAM_V45_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/edit' as const;
export const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image' as const;
export const SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/text-to-image' as const;
export const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image' as const;
export const KLING_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1' as const;
export const CRYSTAL_UPSCALER_MODEL_ID = 'clarityai/crystal-upscaler' as const;
export const SEEDVR_UPSCALER_MODEL_ID = 'fal-ai/seedvr/upscale/image' as const;
export const HAILUO_IMAGE_TO_VIDEO_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/image-to-video' as const;
export const HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video' as const;
export const HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video' as const;
export const KLING_O1_VIDEO_MODEL_ID = 'fal-ai/kling-video/o1/reference-to-video' as const;
export const KLING_O1_VIDEO_EDIT_MODEL_ID = 'fal-ai/kling-video/o1/video-to-video/edit' as const;
export const KLING_O1_VIDEO_REF_V2V_MODEL_ID = 'fal-ai/kling-video/o1/video-to-video/reference' as const;
export const KLING_O1_VIDEO_FFLF_MODEL_ID = 'fal-ai/kling-video/o1/image-to-video' as const;
export const KLING_O1_VIDEO_MODEL_IDS = [
  KLING_O1_VIDEO_MODEL_ID,
  KLING_O1_VIDEO_EDIT_MODEL_ID,
  KLING_O1_VIDEO_REF_V2V_MODEL_ID,
  KLING_O1_VIDEO_FFLF_MODEL_ID,
] as const;
export const KLING_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/image-to-video' as const;
export const KLING_VIDEO_STANDARD_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video' as const;
export const KLING_VIDEO_PRO_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' as const;
export const KLING_26_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.6/pro/image-to-video' as const;
export const WAN_ANIMATE_REPLACE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/replace' as const;
export const WAN_ANIMATE_MOVE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/move' as const;
export const WAN_ANIMATE_MODEL_ID = WAN_ANIMATE_REPLACE_MODEL_ID;
export const WAN_VISION_ENHANCER_MODEL_ID = 'fal-ai/wan-vision-enhancer' as const;
export const ONE_TO_ALL_ANIMATE_MODEL_ID = 'fal-ai/one-to-all-animation/14b' as const;
export const SYNC_LIPSYNC_MODEL_ID = 'fal-ai/sync-lipsync/react-1' as const;
export const UPSCALE_MODEL_HIGHLIGHT_COLOR = '#3596F8' as const;

export type HailuoVariant = 'standard' | 'pro';
export type KlingVariant = 'standard' | 'pro';
export type KlingO1Variant = 'refI2V' | 'edit' | 'fflf' | 'refV2V';
export const KLING_DEFAULT_NEGATIVE_PROMPT = 'blur, distort, and low quality';
export const WAN_DEFAULT_NEGATIVE_PROMPT =
  'oversaturated, overexposed, static, blurry details, subtitles, stylized, artwork, painting, still frame, overall gray, worst quality, low quality, JPEG artifacts, ugly, mutated, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, static motion, cluttered background, three legs, crowded background, walking backwards';
export const ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT =
  'black background, Aerial view, aerial view, overexposed, low quality, deformation, a poor composition, bad hands, bad teeth, bad eyes, bad limbs, distortion';

export type WanTargetResolution = '720p' | '1080p';
export type WanCreativity = 0 | 1 | 2 | 3 | 4;
export type WanCreativitySelectionValue = `${WanCreativity}`;

export const WAN_TARGET_RESOLUTION_OPTIONS: ReadonlyArray<{ value: WanTargetResolution; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
] as const;

export const WAN_CREATIVITY_OPTIONS: ReadonlyArray<{ value: WanCreativitySelectionValue; label: string }> = [
  { value: '0', label: '0 - Minimal change' },
  { value: '1', label: '1 - Subtle enhancement (default)' },
  { value: '2', label: '2 - Medium enhancement' },
  { value: '3', label: '3 - Strong enhancement' },
  { value: '4', label: '4 - Maximum enhancement' },
] as const;

export const FAL_IMAGE_MODEL_OPTIONS = [
  { value: NANO_BANANA_PRO_EDIT_MODEL_ID, label: 'NanoBanana Pro' },
  { value: SEEDREAM_MODEL_ID, label: 'Seedream v4' },
  { value: SEEDREAM_V45_MODEL_ID, label: 'Seedream v4.5' },
  { value: KLING_IMAGE_MODEL_ID, label: 'Kling O1 Image' },
  { value: REVE_TEXT_TO_IMAGE_MODEL_ID, label: 'Reve Image' },
  { value: CRYSTAL_UPSCALER_MODEL_ID, label: 'Crystal Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
  { value: SEEDVR_UPSCALER_MODEL_ID, label: 'SeedVR2 Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
] as const;

export const FAL_VIDEO_MODEL_OPTIONS = [
  { value: HAILUO_IMAGE_TO_VIDEO_MODEL_ID, label: 'Hailuo 2.3' },
  { value: KLING_O1_VIDEO_MODEL_ID, label: 'Kling O1 Video' },
  { value: KLING_VIDEO_MODEL_ID, label: 'Kling 2.5 Turbo' },
  { value: KLING_26_VIDEO_MODEL_ID, label: 'Kling 2.6' },
  { value: WAN_ANIMATE_MODEL_ID, label: 'Wan Animate' },
  { value: ONE_TO_ALL_ANIMATE_MODEL_ID, label: '1-to-All Animate' },
  { value: SYNC_LIPSYNC_MODEL_ID, label: 'Sync React-1' },
  { value: WAN_VISION_ENHANCER_MODEL_ID, label: 'Wan Vision Enhancer', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
] as const;

export const HAILUO_VARIANT_OPTIONS: ReadonlyArray<{ value: HailuoVariant; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'pro', label: 'Pro' },
] as const;

export const getHailuoActualModelId = (variant: HailuoVariant): string =>
  variant === 'pro' ? HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID : HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID;

export const KLING_VARIANT_OPTIONS: ReadonlyArray<{ value: KlingVariant; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'pro', label: 'Pro (FFLF)' },
] as const;

export const getKlingActualModelId = (variant: KlingVariant): string =>
  variant === 'pro' ? KLING_VIDEO_PRO_MODEL_ID : KLING_VIDEO_STANDARD_MODEL_ID;

export const KLING_O1_VARIANT_OPTIONS: ReadonlyArray<{ value: KlingO1Variant; label: string; disabled?: boolean }> = [
  { value: 'refI2V', label: 'Ref-i2v' },
  { value: 'edit', label: 'Edit' },
  { value: 'refV2V', label: 'Ref-v2v' },
  { value: 'fflf', label: 'FFLF (First/Last)' },
] as const;

export const getKlingO1VideoEndpoint = (variant: KlingO1Variant): string => {
  if (variant === 'edit') return KLING_O1_VIDEO_EDIT_MODEL_ID;
  if (variant === 'refV2V') return KLING_O1_VIDEO_REF_V2V_MODEL_ID;
  if (variant === 'fflf') return KLING_O1_VIDEO_FFLF_MODEL_ID;
  return KLING_O1_VIDEO_MODEL_ID;
};

export const isKlingO1VideoModelId = (value: string | undefined): value is typeof KLING_O1_VIDEO_MODEL_IDS[number] =>
  value === KLING_O1_VIDEO_MODEL_ID
  || value === KLING_O1_VIDEO_EDIT_MODEL_ID
  || value === KLING_O1_VIDEO_REF_V2V_MODEL_ID
  || value === KLING_O1_VIDEO_FFLF_MODEL_ID;

export type WanAnimateVariant = 'replace' | 'move';
export type WanAnimateStepsSelectionValue = '10' | '20' | '30' | '40';
export type WanAnimateResolutionSelectionValue = '480p' | '580p' | '720p';
export type WanAnimateShiftSelectionValue = '5.0' | '6.0' | '7.0' | '8.0' | '9.0' | '10.0';
export type WanAnimateQualitySelectionValue = 'high' | 'maximum';

export const WAN_ANIMATE_VARIANT_OPTIONS: ReadonlyArray<{ value: WanAnimateVariant; label: string; disabled?: boolean }> = [
  { value: 'replace', label: 'Keep BG' },
  { value: 'move', label: 'Replace BG' },
] as const;

export const WAN_ANIMATE_STEPS_OPTIONS: ReadonlyArray<{ value: WanAnimateStepsSelectionValue; label: string }> = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '30', label: '30' },
  { value: '40', label: '40' },
] as const;

export const WAN_ANIMATE_RESOLUTION_OPTIONS: ReadonlyArray<{ value: WanAnimateResolutionSelectionValue; label: string }> = [
  { value: '480p', label: '480p' },
  { value: '580p', label: '580p' },
  { value: '720p', label: '720p' },
] as const;

export const WAN_ANIMATE_SHIFT_OPTIONS: ReadonlyArray<{ value: WanAnimateShiftSelectionValue; label: string }> = [
  { value: '5.0', label: '5.0' },
  { value: '6.0', label: '6.0' },
  { value: '7.0', label: '7.0' },
  { value: '8.0', label: '8.0' },
  { value: '9.0', label: '9.0' },
  { value: '10.0', label: '10.0' },
] as const;

export const WAN_ANIMATE_QUALITY_OPTIONS: ReadonlyArray<{ value: WanAnimateQualitySelectionValue; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'maximum', label: 'Max' },
] as const;

export const getWanAnimateVideoEndpoint = (variant: WanAnimateVariant): string => {
  if (variant === 'move') {
    return WAN_ANIMATE_MOVE_MODEL_ID;
  }
  return WAN_ANIMATE_REPLACE_MODEL_ID;
};

export type LipsyncEmotion = 'happy' | 'angry' | 'sad' | 'neutral' | 'disgusted' | 'surprised';
export type LipsyncModelMode = 'lips' | 'face' | 'head';
export type LipsyncAudioMode = 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap';

export const LIPSYNC_EMOTION_OPTIONS: ReadonlyArray<{ value: LipsyncEmotion; label: string }> = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
  { value: 'angry', label: 'Angry' },
  { value: 'sad', label: 'Sad' },
  { value: 'disgusted', label: 'Disgusted' },
  { value: 'surprised', label: 'Surprised' },
] as const;

export const LIPSYNC_MODEL_MODE_OPTIONS: ReadonlyArray<{ value: LipsyncModelMode; label: string }> = [
  { value: 'face', label: 'Face' },
  { value: 'lips', label: 'Lips' },
  { value: 'head', label: 'Head' },
] as const;

export const LIPSYNC_AUDIO_MODE_OPTIONS: ReadonlyArray<{ value: LipsyncAudioMode; label: string }> = [
  { value: 'bounce', label: 'Bounce' },
  { value: 'cut_off', label: 'Cut off' },
  { value: 'loop', label: 'Loop' },
  { value: 'silence', label: 'Silence' },
  { value: 'remap', label: 'Remap' },
] as const;

export const FAL_MODEL_OPTIONS = [...FAL_IMAGE_MODEL_OPTIONS, ...FAL_VIDEO_MODEL_OPTIONS] as const;
export const SEEDREAM_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID] as const;
export type SeedreamModelId = typeof SEEDREAM_MODEL_IDS[number];
export const SEEDREAM_TEXT_TO_IMAGE_MAP: Record<SeedreamModelId, string> = {
  [SEEDREAM_MODEL_ID]: SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  [SEEDREAM_V45_MODEL_ID]: SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
};
export const isSeedreamV45ModelId = (value: string | undefined): boolean =>
  value === SEEDREAM_V45_MODEL_ID || value === SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID;

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
    return NANO_BANANA_PRO_EDIT_MODEL_ID;
  }
  return isFalModelId(value) ? value : undefined;
};

export const ENV_FAL_MODEL_ID = normalizeFalModelId(process.env.FAL_MODEL_ID);
export const DEFAULT_FAL_IMAGE_MODEL_ID: FalImageModelId =
  isFalImageModelId(ENV_FAL_MODEL_ID) ? ENV_FAL_MODEL_ID : NANO_BANANA_PRO_EDIT_MODEL_ID;
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
  { value: '2560x1440', label: '2560 x 1440' },
  { value: '1440x2560', label: '1440 x 2560' },
  { value: 'auto', label: 'Auto' },
  { value: 'auto_2K', label: 'Auto 2K' },
  { value: 'auto_4K', label: 'Auto 4K' },
] as const;
export const getSeedreamImageSizeOptions = (_modelId: string | undefined) => FAL_IMAGE_SIZE_OPTIONS;

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

export const FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
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

export const FAL_SEEDREAM_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Default' },
  { value: '2560x1440', label: '2560 x 1440' },
  { value: '1440x2560', label: '1440 x 2560' },
] as const;
export const getSeedreamAspectRatioOptions = (_modelId: string | undefined) => FAL_SEEDREAM_ASPECT_RATIO_OPTIONS;

export const FAL_ASPECT_RATIO_VALUES = new Set<FalAspectRatioSelectionValue>([
  ...FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_REVE_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_KLING_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_SEEDREAM_ASPECT_RATIO_OPTIONS.map(option => option.value),
]);

export const KLING26_AUDIO_OPTIONS: ReadonlyArray<{ value: Kling26AudioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Audio' },
  { value: 'off', label: 'OFF' },
  { value: 'on', label: 'ON' },
] as const;

export const FAL_IMAGE_SIZE_DEFAULT_OPTION = 'default';
export const DEFAULT_MAX_REFERENCE_IMAGES = 13;
export const MODEL_REFERENCE_IMAGE_LIMITS: Partial<Record<FalModelId | typeof KLING_O1_VIDEO_EDIT_MODEL_ID | typeof KLING_O1_VIDEO_REF_V2V_MODEL_ID | typeof KLING_O1_VIDEO_FFLF_MODEL_ID, number>> = {
  [NANO_BANANA_PRO_EDIT_MODEL_ID]: 14,
  [SEEDREAM_MODEL_ID]: 7,
  [SEEDREAM_V45_MODEL_ID]: 10,
  [KLING_IMAGE_MODEL_ID]: 10,
  [HAILUO_IMAGE_TO_VIDEO_MODEL_ID]: 0,
  [KLING_O1_VIDEO_MODEL_ID]: 6,
  [KLING_O1_VIDEO_EDIT_MODEL_ID]: 4,
  [KLING_O1_VIDEO_REF_V2V_MODEL_ID]: 4,
  [KLING_O1_VIDEO_FFLF_MODEL_ID]: 6,
  [KLING_VIDEO_MODEL_ID]: 0,
  [KLING_26_VIDEO_MODEL_ID]: 0,
  [WAN_ANIMATE_MODEL_ID]: 0,
  [ONE_TO_ALL_ANIMATE_MODEL_ID]: 0,
  [WAN_VISION_ENHANCER_MODEL_ID]: 0,
  [SYNC_LIPSYNC_MODEL_ID]: 0,
};

export const getMaxReferenceImages = (modelId: FalModelId | typeof KLING_O1_VIDEO_EDIT_MODEL_ID | typeof KLING_O1_VIDEO_REF_V2V_MODEL_ID | undefined): number =>
  modelId && MODEL_REFERENCE_IMAGE_LIMITS[modelId] !== undefined
    ? MODEL_REFERENCE_IMAGE_LIMITS[modelId] as number
    : DEFAULT_MAX_REFERENCE_IMAGES;

export const getFalModelLabel = (modelId: FalModelId): string => {
  const match = FAL_MODEL_OPTIONS.find(option => option.value === modelId);
  return match ? match.label : 'FAL Model';
};
