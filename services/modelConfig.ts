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
export const REVE_EDIT_MODEL_ID = 'fal-ai/reve/edit' as const;
export const REVE_REMIX_MODEL_ID = 'fal-ai/reve/remix' as const;
export const KLING_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1' as const;
export const FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/flux-2-max' as const;
export const FLUX2_MAX_EDIT_MODEL_ID = 'fal-ai/flux-2-max/edit' as const;
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
export const KLING_26_CONTROL_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.6/standard/motion-control' as const;
export const KLING_26_CONTROL_VIDEO_PRO_MODEL_ID = 'fal-ai/kling-video/v2.6/pro/motion-control' as const;
export const WAN_ANIMATE_REPLACE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/replace' as const;
export const WAN_ANIMATE_MOVE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/move' as const;
export const WAN_ANIMATE_MODEL_ID = WAN_ANIMATE_REPLACE_MODEL_ID;
export const WAN_VISION_ENHANCER_MODEL_ID = 'fal-ai/wan-vision-enhancer' as const;
export const ONE_TO_ALL_ANIMATE_MODEL_ID = 'fal-ai/one-to-all-animation/14b' as const;
export const SYNC_LIPSYNC_MODEL_ID = 'fal-ai/sync-lipsync/react-1' as const;
export const INFINITALK_VIDEO_MODEL_ID = 'fal-ai/infinitalk/video-to-video' as const;
export const WAN_26_I2V_MODEL_ID = 'wan/v2.6/image-to-video' as const;
export const SEEDANCE_15_VIDEO_MODEL_ID = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' as const;
export const SCAIL_VIDEO_MODEL_ID = 'fal-ai/scail' as const;
export const UPSCALE_MODEL_HIGHLIGHT_COLOR = '#3596F8' as const;

export type HailuoVariant = 'standard' | 'pro';
export type KlingVariant = 'standard' | 'pro';
export type KlingO1Variant = 'refI2V' | 'edit' | 'fflf' | 'refV2V';
export type Kling26ControlVariant = 'standard' | 'pro';
export type Kling26ControlDriver = 'image' | 'video';
export type Kling26ControlSoundSelectionValue = 'true' | 'false';
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

const sortModelOptionsByLabel = <T extends { label: string }>(options: readonly T[]): ReadonlyArray<T> =>
  [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

const FAL_IMAGE_MODEL_OPTIONS_BASE = [
  { value: CRYSTAL_UPSCALER_MODEL_ID, label: 'Crystal Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
  { value: FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID, label: 'Flux2 Max' },
  { value: KLING_IMAGE_MODEL_ID, label: 'Kling O1 Image' },
  { value: NANO_BANANA_PRO_EDIT_MODEL_ID, label: 'NanoBanana Pro' },
  { value: REVE_TEXT_TO_IMAGE_MODEL_ID, label: 'Reve Image' },
  { value: SEEDREAM_MODEL_ID, label: 'Seedream v4' },
  { value: SEEDREAM_V45_MODEL_ID, label: 'Seedream v4.5' },
  { value: SEEDVR_UPSCALER_MODEL_ID, label: 'SeedVR2 Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
 ] as const;

export const FAL_IMAGE_MODEL_OPTIONS = sortModelOptionsByLabel(FAL_IMAGE_MODEL_OPTIONS_BASE);

const FAL_VIDEO_MODEL_OPTIONS_BASE = [
  { value: ONE_TO_ALL_ANIMATE_MODEL_ID, label: '1-to-All Animate' },
  { value: HAILUO_IMAGE_TO_VIDEO_MODEL_ID, label: 'Hailuo 2.3' },
  { value: INFINITALK_VIDEO_MODEL_ID, label: 'Infinitalk v2v' },
  { value: KLING_VIDEO_MODEL_ID, label: 'Kling 2.5 Turbo' },
  { value: KLING_26_VIDEO_MODEL_ID, label: 'Kling 2.6' },
  { value: KLING_26_CONTROL_VIDEO_MODEL_ID, label: 'Kling 2.6 Control' },
  { value: KLING_O1_VIDEO_MODEL_ID, label: 'Kling O1 Video' },
  { value: SCAIL_VIDEO_MODEL_ID, label: 'Scail' },
  { value: SEEDANCE_15_VIDEO_MODEL_ID, label: 'Seedance 1.5 FFLF' },
  { value: SYNC_LIPSYNC_MODEL_ID, label: 'Sync React-1' },
  { value: WAN_26_I2V_MODEL_ID, label: 'Wan 2.6' },
  { value: WAN_ANIMATE_MODEL_ID, label: 'Wan Animate' },
  { value: WAN_VISION_ENHANCER_MODEL_ID, label: 'Wan Vision Enhancer', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
] as const;

export const FAL_VIDEO_MODEL_OPTIONS = sortModelOptionsByLabel(FAL_VIDEO_MODEL_OPTIONS_BASE);

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

export const KLING26_CONTROL_VARIANT_OPTIONS: ReadonlyArray<{ value: Kling26ControlVariant; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'pro', label: 'Pro' },
] as const;

export const KLING26_CONTROL_DRIVER_OPTIONS: ReadonlyArray<{ value: Kling26ControlDriver; label: string }> = [
  { value: 'video', label: 'Video (30s)' },
  { value: 'image', label: 'Image (10s)' },
] as const;

export const KLING26_CONTROL_SOUND_OPTIONS: ReadonlyArray<{ value: Kling26ControlSoundSelectionValue; label: string }> = [
  { value: 'true', label: 'True' },
  { value: 'false', label: 'False' },
] as const;

export const getKling26ControlModelId = (variant: Kling26ControlVariant): string =>
  variant === 'pro' ? KLING_26_CONTROL_VIDEO_PRO_MODEL_ID : KLING_26_CONTROL_VIDEO_MODEL_ID;

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
export type InfinitalkResolutionSelectionValue = '480p' | '720p';
export type InfinitalkSeedSelectionValue = '42' | 'random';
export type InfinitalkAccelerationSelectionValue = 'none' | 'regular' | 'high';
export type InfinitalkDurationSelectionValue = '5s' | '6s' | '10s' | '12s';

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

export const INFINITALK_RESOLUTION_OPTIONS: ReadonlyArray<{ value: InfinitalkResolutionSelectionValue; label: string }> = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
] as const;

export const INFINITALK_SEED_OPTIONS: ReadonlyArray<{ value: InfinitalkSeedSelectionValue; label: string }> = [
  { value: '42', label: '42' },
  { value: 'random', label: 'Random' },
] as const;

export const INFINITALK_ACCELERATION_OPTIONS: ReadonlyArray<{ value: InfinitalkAccelerationSelectionValue; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'regular', label: 'Regular' },
  { value: 'high', label: 'High' },
] as const;

export const INFINITALK_DURATION_OPTIONS: ReadonlyArray<{ value: InfinitalkDurationSelectionValue; label: string }> = [
  { value: '5s', label: '5s' },
  { value: '6s', label: '6s' },
  { value: '10s', label: '10s' },
  { value: '12s', label: '12s' },
] as const;

// Map display duration to num_frames for Infinitalk API
export const INFINITALK_DURATION_TO_NUM_FRAMES: Record<InfinitalkDurationSelectionValue, number> = {
  '5s': 120,
  '6s': 144,
  '10s': 240,
  '12s': 288,
} as const;

export type Wan26ResolutionSelectionValue = '720p' | '1080p';
export type Wan26DurationSelectionValue = '5' | '10' | '15';
export type Wan26PromptExpansionSelectionValue = 'true' | 'false';
export type Wan26MultiShotsSelectionValue = 'true' | 'false';

export const WAN_26_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Wan26ResolutionSelectionValue; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
] as const;

export const WAN_26_DURATION_OPTIONS: ReadonlyArray<{ value: Wan26DurationSelectionValue; label: string }> = [
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
] as const;

export const WAN_26_PROMPT_EXPANSION_OPTIONS: ReadonlyArray<{ value: Wan26PromptExpansionSelectionValue; label: string }> = [
  { value: 'true', label: 'ON' },
  { value: 'false', label: 'OFF' },
] as const;

export const WAN_26_MULTI_SHOTS_OPTIONS: ReadonlyArray<{ value: Wan26MultiShotsSelectionValue; label: string }> = [
  { value: 'true', label: 'ON' },
  { value: 'false', label: 'OFF' },
] as const;

export type Seedance15AspectRatioSelectionValue = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type Seedance15ResolutionSelectionValue = '480p' | '720p';
export type Seedance15DurationSelectionValue = '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
export type Seedance15CameraFixedSelectionValue = 'true' | 'false';
export type Seedance15AudioSelectionValue = 'true' | 'false';

export const SEEDANCE15_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Seedance15AspectRatioSelectionValue; label: string }> = [
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
] as const;

export const SEEDANCE15_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Seedance15ResolutionSelectionValue; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
] as const;

export const SEEDANCE15_DURATION_OPTIONS: ReadonlyArray<{ value: Seedance15DurationSelectionValue; label: string }> = [
  { value: '5', label: '5s' },
  { value: '4', label: '4s' },
  { value: '6', label: '6s' },
  { value: '7', label: '7s' },
  { value: '8', label: '8s' },
  { value: '9', label: '9s' },
  { value: '10', label: '10s' },
  { value: '11', label: '11s' },
  { value: '12', label: '12s' },
] as const;

export const SEEDANCE15_CAMERA_FIXED_OPTIONS: ReadonlyArray<{ value: Seedance15CameraFixedSelectionValue; label: string }> = [
  { value: 'false', label: 'OFF' },
  { value: 'true', label: 'ON' },
] as const;

export const SEEDANCE15_AUDIO_OPTIONS: ReadonlyArray<{ value: Seedance15AudioSelectionValue; label: string }> = [
  { value: 'false', label: 'OFF' },
  { value: 'true', label: 'ON' },
] as const;

export const isSeedance15VideoModel = (modelId: string | undefined): boolean =>
  modelId === SEEDANCE_15_VIDEO_MODEL_ID;

export const isSeedance15AspectRatioSelectionValue = (value: unknown): value is Seedance15AspectRatioSelectionValue =>
  value === '21:9' || value === '16:9' || value === '4:3' || value === '1:1' || value === '3:4' || value === '9:16';

export const isSeedance15ResolutionSelectionValue = (value: unknown): value is Seedance15ResolutionSelectionValue =>
  value === '480p' || value === '720p';

export const isSeedance15DurationSelectionValue = (value: unknown): value is Seedance15DurationSelectionValue =>
  value === '4' || value === '5' || value === '6' || value === '7' || value === '8' || value === '9' || value === '10' || value === '11' || value === '12';

// Flux2 Max image size options
export type Flux2MaxImageSizeSelectionValue = 'landscape_4_3' | 'landscape_16_9' | 'portrait_4_3' | 'portrait_16_9' | 'square' | 'square_hd';

export const FLUX2_MAX_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: Flux2MaxImageSizeSelectionValue; label: string }> = [
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'portrait_4_3', label: 'Portrait 4:3' },
  { value: 'portrait_16_9', label: 'Portrait 16:9' },
  { value: 'square', label: 'Square' },
  { value: 'square_hd', label: 'Square HD' },
] as const;

export const isFlux2MaxImageSizeSelectionValue = (value: unknown): value is Flux2MaxImageSizeSelectionValue =>
  value === 'landscape_4_3' || value === 'landscape_16_9' || value === 'portrait_4_3' || value === 'portrait_16_9' || value === 'square' || value === 'square_hd';

export const isFlux2MaxModel = (modelId: string | undefined): boolean =>
  modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;

export const FAL_MODEL_OPTIONS = [...FAL_IMAGE_MODEL_OPTIONS_BASE, ...FAL_VIDEO_MODEL_OPTIONS_BASE] as const;
export type FalModelOption = typeof FAL_MODEL_OPTIONS[number];
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

export type FalModelId = FalModelOption['value'];
export type FalImageModelId = typeof FAL_IMAGE_MODEL_OPTIONS_BASE[number]['value'];
export type FalVideoModelId = typeof FAL_VIDEO_MODEL_OPTIONS_BASE[number]['value'];

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

export const isInfinitalkResolutionSelectionValue = (value: unknown): value is InfinitalkResolutionSelectionValue =>
  value === '480p' || value === '720p';

export const isInfinitalkSeedSelectionValue = (value: unknown): value is InfinitalkSeedSelectionValue =>
  value === '42' || value === 'random';

export const isInfinitalkAccelerationSelectionValue = (value: unknown): value is InfinitalkAccelerationSelectionValue =>
  value === 'none' || value === 'regular' || value === 'high';

export const isInfinitalkDurationSelectionValue = (value: unknown): value is InfinitalkDurationSelectionValue =>
  value === '5s' || value === '6s' || value === '10s' || value === '12s';

export const isWan26ResolutionSelectionValue = (value: unknown): value is Wan26ResolutionSelectionValue =>
  value === '720p' || value === '1080p';

export const isWan26DurationSelectionValue = (value: unknown): value is Wan26DurationSelectionValue =>
  value === '5' || value === '10' || value === '15';

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
export const MODEL_REFERENCE_IMAGE_LIMITS: Partial<Record<FalModelId | typeof KLING_O1_VIDEO_EDIT_MODEL_ID | typeof KLING_O1_VIDEO_REF_V2V_MODEL_ID | typeof KLING_O1_VIDEO_FFLF_MODEL_ID | typeof SEEDANCE_15_VIDEO_MODEL_ID, number>> = {
  [NANO_BANANA_PRO_EDIT_MODEL_ID]: 14,
  [SEEDREAM_MODEL_ID]: 7,
  [SEEDREAM_V45_MODEL_ID]: 10,
  [KLING_IMAGE_MODEL_ID]: 10,
  [REVE_TEXT_TO_IMAGE_MODEL_ID]: 5, // Reve remix supports up to 6 total images (1 primary + 5 references)
  [FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID]: 7, // Flux2 Max edit supports up to 8 total images (1 primary + 7 references)
  [HAILUO_IMAGE_TO_VIDEO_MODEL_ID]: 0,
  [KLING_O1_VIDEO_MODEL_ID]: 6,
  [KLING_O1_VIDEO_EDIT_MODEL_ID]: 4,
  [KLING_O1_VIDEO_REF_V2V_MODEL_ID]: 4,
  [KLING_O1_VIDEO_FFLF_MODEL_ID]: 6,
  [KLING_VIDEO_MODEL_ID]: 0,
  [KLING_26_VIDEO_MODEL_ID]: 0,
  [KLING_26_CONTROL_VIDEO_MODEL_ID]: 0,
  [WAN_ANIMATE_MODEL_ID]: 0,
  [ONE_TO_ALL_ANIMATE_MODEL_ID]: 0,
  [WAN_VISION_ENHANCER_MODEL_ID]: 0,
  [SYNC_LIPSYNC_MODEL_ID]: 0,
  [INFINITALK_VIDEO_MODEL_ID]: 0,
  [WAN_26_I2V_MODEL_ID]: 0,
  [SEEDANCE_15_VIDEO_MODEL_ID]: 0,
  [SCAIL_VIDEO_MODEL_ID]: 0,
};

export const getMaxReferenceImages = (modelId: FalModelId | typeof KLING_O1_VIDEO_EDIT_MODEL_ID | typeof KLING_O1_VIDEO_REF_V2V_MODEL_ID | undefined): number =>
  modelId && MODEL_REFERENCE_IMAGE_LIMITS[modelId] !== undefined
    ? MODEL_REFERENCE_IMAGE_LIMITS[modelId] as number
    : DEFAULT_MAX_REFERENCE_IMAGES;

export const getFalModelLabel = (modelId: FalModelId): string => {
  const match = FAL_MODEL_OPTIONS.find(option => option.value === modelId);
  return match ? match.label : 'FAL Model';
};
