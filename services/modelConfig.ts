import type {
  ApiProviderId,
  FalAspectRatioOption,
  FalImageSizePreset,
  FalResolutionOption,
  FalVideoDuration,
  GenerationProviderId,
  GenerationKind,
} from '../types';

// Central registry of supported model IDs plus helpers for validation/labeling in the UI.
export const NANO_BANANA_PRO_EDIT_MODEL_ID = 'fal-ai/nano-banana-pro/edit' as const;
export const NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana-pro' as const;
export const NANO_BANANA_2_EDIT_MODEL_ID = 'fal-ai/nano-banana-2/edit' as const; // Nano Banana 2 edit endpoint.
export const NANO_BANANA_2_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana-2' as const; // Nano Banana 2 t2i endpoint.
export const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit' as const;
export const SEEDREAM_V45_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/edit' as const;
export const SEEDREAM_V5_LITE_MODEL_ID = 'fal-ai/bytedance/seedream/v5/lite/edit' as const;
export const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image' as const;
export const SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/text-to-image' as const;
export const SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v5/lite/text-to-image' as const;
export const FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/flux-2-max' as const;
export const FLUX2_MAX_EDIT_MODEL_ID = 'fal-ai/flux-2-max/edit' as const;
export const RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/recraft/v4/pro/text-to-image' as const; // Recraft v4 Pro t2i endpoint.
export const GROK_IMAGINE_IMAGE_MODEL_ID = 'xai/grok-imagine-image' as const; // Grok Imagine image model id.
export const GROK_IMAGINE_IMAGE_EDIT_MODEL_ID = 'xai/grok-imagine-image/edit' as const; // Grok Imagine edit endpoint id.
export const GROK_IMAGINE_VIDEO_MODEL_ID = 'xai/grok-imagine-video/image-to-video' as const; // Grok Imagine image-to-video endpoint id.
export const GROK_IMAGINE_VIDEO_EDIT_MODEL_ID = 'xai/grok-imagine-video/edit-video' as const; // Grok Imagine video edit endpoint id.
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
export const KLING_26_CONTROL_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.6/standard/motion-control' as const;
export const KLING_26_CONTROL_VIDEO_PRO_MODEL_ID = 'fal-ai/kling-video/v2.6/pro/motion-control' as const;
export const WAN_ANIMATE_REPLACE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/replace' as const;
export const WAN_ANIMATE_MOVE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/move' as const;
export const WAN_ANIMATE_MODEL_ID = WAN_ANIMATE_REPLACE_MODEL_ID;
export const WAN_VISION_ENHANCER_MODEL_ID = 'fal-ai/wan-vision-enhancer' as const;
export const ONE_TO_ALL_ANIMATE_MODEL_ID = 'fal-ai/one-to-all-animation/14b' as const;
export const SYNC_LIPSYNC_MODEL_ID = 'fal-ai/sync-lipsync/v3' as const; // Sync v3 endpoint id.
export const HEYGEN_V3_LIPSYNC_MODEL_ID = 'fal-ai/heygen/v3/lipsync/precision' as const; // HeyGen precision lipsync endpoint.
export const INFINITALK_VIDEO_MODEL_ID = 'fal-ai/infinitalk/video-to-video' as const;
export const WAN_27_VIDEO_MODEL_ID = 'fal-ai/wan/v2.7' as const; // Wan 2.7 smart video selector.
export const WAN_27_TEXT_TO_VIDEO_MODEL_ID = 'fal-ai/wan/v2.7/text-to-video' as const; // Wan 2.7 text-to-video endpoint.
export const WAN_27_IMAGE_TO_VIDEO_MODEL_ID = 'fal-ai/wan/v2.7/image-to-video' as const; // Wan 2.7 image-to-video endpoint.
export const WAN_27_REFERENCE_TO_VIDEO_MODEL_ID = 'fal-ai/wan/v2.7/reference-to-video' as const; // Wan 2.7 reference endpoint.
export const WAN_27_EDIT_VIDEO_MODEL_ID = 'fal-ai/wan/v2.7/edit-video' as const; // Wan 2.7 edit-video endpoint.
export const SEEDANCE_15_VIDEO_MODEL_ID = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' as const;
export const SEEDANCE_2_VIDEO_MODEL_ID = 'volcengine/seedance-2' as const;
export const FAL_SEEDANCE_2_VIDEO_MODEL_ID = 'bytedance/seedance-2.0' as const; // Selector id for the Fal Seedance 2 family.
export const FAL_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID = 'bytedance/seedance-2.0/text-to-video' as const; // Fal t2v endpoint.
export const FAL_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID = 'bytedance/seedance-2.0/image-to-video' as const; // Fal i2v endpoint.
export const FAL_SEEDANCE_2_REFERENCE_TO_VIDEO_MODEL_ID = 'bytedance/seedance-2.0/reference-to-video' as const; // Fal reference endpoint.
export const VEO_31_IMAGE_TO_VIDEO_MODEL_ID = 'fal-ai/veo3.1/image-to-video' as const;
export const VEO_31_FFLF_VIDEO_MODEL_ID = 'fal-ai/veo3.1/first-last-frame-to-video' as const;
export const VEO_31_EXTEND_VIDEO_MODEL_ID = 'fal-ai/veo3.1/extend-video' as const;
export const SCAIL_VIDEO_MODEL_ID = 'fal-ai/scail' as const;
export const WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/wan/v2.7/pro/text-to-image' as const;
export const WAN_27_IMAGE_IMAGE_TO_IMAGE_MODEL_ID = 'fal-ai/wan/v2.7/pro/edit' as const;
export const UPSCALE_MODEL_HIGHLIGHT_COLOR = '#3596F8' as const;

export type HailuoVariant = 'standard' | 'pro';
export type KlingVariant = 'standard' | 'pro';
export type KlingO1Variant = 'refI2V' | 'edit' | 'fflf' | 'refV2V';
export type Kling26ControlVariant = 'standard' | 'pro';
export type Kling26ControlDriver = 'image' | 'video';
export type Veo31Variant = 'i2v-fflf' | 'extend';
export type Seedance2Variant = 'smart' | 'reference';
export type Wan27VideoVariant = 'smart' | 'reference' | 'edit';
export type Kling26ControlSoundSelectionValue = 'true' | 'false';
export const KLING_DEFAULT_NEGATIVE_PROMPT = 'blur, distort, and low quality';
export const WAN_DEFAULT_NEGATIVE_PROMPT =
  'oversaturated, overexposed, static, blurry details, subtitles, stylized, artwork, painting, still frame, overall gray, worst quality, low quality, JPEG artifacts, ugly, mutated, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, static motion, cluttered background, three legs, crowded background, walking backwards';
export const ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT =
  'black background, Aerial view, aerial view, overexposed, low quality, deformation, a poor composition, bad hands, bad teeth, bad eyes, bad limbs, distortion';
export const WAN_27_IMAGE_DEFAULT_NEGATIVE_PROMPT = 'low resolution, error, worst quality, low quality, deformed, extra fingers';

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
  { value: GROK_IMAGINE_IMAGE_MODEL_ID, label: 'Grok Imagine' }, // Grok model option.
  { value: NANO_BANANA_2_EDIT_MODEL_ID, label: 'NanoBanana 2' }, // Selector uses edit id.
  { value: NANO_BANANA_PRO_EDIT_MODEL_ID, label: 'NanoBanana Pro' },
  { value: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID, label: 'Recraft v4 Pro' }, // Direct text-to-image endpoint.
  { value: SEEDREAM_MODEL_ID, label: 'Seedream 4' },
  { value: SEEDREAM_V45_MODEL_ID, label: 'Seedream 4.5' },
  { value: SEEDREAM_V5_LITE_MODEL_ID, label: 'Seedream 5 Lite' },
  { value: SEEDVR_UPSCALER_MODEL_ID, label: 'SeedVR2 Upscaler', highlightColor: UPSCALE_MODEL_HIGHLIGHT_COLOR },
  { value: WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID, label: 'Wan 2.7 Pro Image' },
 ] as const;

export const FAL_IMAGE_MODEL_OPTIONS = sortModelOptionsByLabel(FAL_IMAGE_MODEL_OPTIONS_BASE);

const FAL_VIDEO_MODEL_OPTIONS_BASE = [
  { value: ONE_TO_ALL_ANIMATE_MODEL_ID, label: '1-to-All Animate' },
  { value: GROK_IMAGINE_VIDEO_MODEL_ID, label: 'Grok Imagine' },
  { value: HAILUO_IMAGE_TO_VIDEO_MODEL_ID, label: 'Hailuo 2.3' },
  { value: HEYGEN_V3_LIPSYNC_MODEL_ID, label: 'HeyGen V3 Lipsync' },
  { value: INFINITALK_VIDEO_MODEL_ID, label: 'Infinitalk v2v' },
  { value: KLING_VIDEO_MODEL_ID, label: 'Kling 2.5 Turbo' },
  { value: KLING_26_CONTROL_VIDEO_MODEL_ID, label: 'Kling 2.6 Control' },
  { value: KLING_O1_VIDEO_MODEL_ID, label: 'Kling O1 Video' },
  { value: SCAIL_VIDEO_MODEL_ID, label: 'Scail' },
  { value: SEEDANCE_15_VIDEO_MODEL_ID, label: 'Seedance 1.5 FFLF' },
  { value: SEEDANCE_2_VIDEO_MODEL_ID, label: 'Seedance 2' },
  { value: FAL_SEEDANCE_2_VIDEO_MODEL_ID, label: 'Seedance 2 (FAL)' }, // Fal-backed Seedance 2.
  { value: SYNC_LIPSYNC_MODEL_ID, label: 'Sync 3 Lipsync' },
  { value: VEO_31_IMAGE_TO_VIDEO_MODEL_ID, label: 'Veo 3.1' },
  { value: WAN_27_VIDEO_MODEL_ID, label: 'Wan 2.7' },
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

export type Seedance2AspectRatioSelectionValue = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
export type Seedance2ResolutionSelectionValue = '480p' | '720p' | '1080p';
export type Seedance2DurationSelectionValue = '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
export type Seedance2BooleanSelectionValue = 'true' | 'false';

export const SEEDANCE2_VARIANT_OPTIONS: ReadonlyArray<{ value: Seedance2Variant; label: string }> = [
  { value: 'smart', label: 'Smart' },
  { value: 'reference', label: 'Reference' },
] as const;

export const SEEDANCE2_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Seedance2AspectRatioSelectionValue; label: string }> = [
  { value: '21:9', label: '21:9' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
  { value: 'adaptive', label: 'Adaptive' },
] as const;

export const SEEDANCE2_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Seedance2ResolutionSelectionValue; label: string; disabled?: boolean }> = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p (TBR)', disabled: true }, // Keep this visible while blocking selection until docs catch up.
] as const;

export const SEEDANCE2_DURATION_OPTIONS: ReadonlyArray<{ value: Seedance2DurationSelectionValue; label: string }> = [
  { value: '4', label: '4s' },
  { value: '5', label: '5s' },
  { value: '6', label: '6s' },
  { value: '7', label: '7s' },
  { value: '8', label: '8s' },
  { value: '9', label: '9s' },
  { value: '10', label: '10s' },
  { value: '11', label: '11s' },
  { value: '12', label: '12s' },
  { value: '13', label: '13s' },
  { value: '14', label: '14s' },
  { value: '15', label: '15s' },
] as const;

export const SEEDANCE2_AUDIO_OPTIONS: ReadonlyArray<{ value: Seedance2BooleanSelectionValue; label: string }> = [
  { value: 'false', label: 'Off' },
  { value: 'true', label: 'On' },
] as const;

export const SEEDANCE2_CAMERA_FIXED_OPTIONS: ReadonlyArray<{ value: Seedance2BooleanSelectionValue; label: string }> = [
  { value: 'false', label: 'Free' },
  { value: 'true', label: 'Fixed' },
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

export const getVeo31VideoEndpoint = (variant: Veo31Variant): string => {
  if (variant === 'extend') return VEO_31_EXTEND_VIDEO_MODEL_ID;
  return VEO_31_IMAGE_TO_VIDEO_MODEL_ID; // Tail-frame routing handled by caller.
};

export const normalizeVeo31Variant = (value: unknown): Veo31Variant | null => {
  if (value === 'extend') return 'extend';
  if (value === 'i2v-fflf' || value === 'i2v' || value === 'fflf') return 'i2v-fflf';
  return null;
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

export type LipsyncSyncMode = 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap'; // Valid v3 duration modes.
export type HeygenBooleanSelectionValue = 'true' | 'false'; // Dropdown-friendly boolean values.
export type InfinitalkResolutionSelectionValue = '480p' | '720p';
export type InfinitalkSeedSelectionValue = '42' | 'random';
export type InfinitalkAccelerationSelectionValue = 'none' | 'regular' | 'high';
export type InfinitalkDurationSelectionValue = '5s' | '6s' | '10s' | '12s';
export type GrokImagineVideoDurationSelectionValue = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
export type GrokImagineVideoResolutionSelectionValue = '480p' | '720p';
export type GrokImagineVideoAspectRatioSelectionValue = 'auto' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16';

export const LIPSYNC_SYNC_MODE_OPTIONS: ReadonlyArray<{ value: LipsyncSyncMode; label: string }> = [
  { value: 'cut_off', label: 'Cut off' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'loop', label: 'Loop' },
  { value: 'silence', label: 'Silence' },
  { value: 'remap', label: 'Remap' },
] as const; // Prompt bar sync choices.

export const HEYGEN_CAPTION_OPTIONS: ReadonlyArray<{ value: HeygenBooleanSelectionValue; label: string; tooltip: string }> = [
  { value: 'false', label: 'Off', tooltip: 'Do not generate captions in the output video.' },
  { value: 'true', label: 'On', tooltip: 'Generate captions in the output video when HeyGen returns them.' },
] as const;

export const HEYGEN_DYNAMIC_DURATION_OPTIONS: ReadonlyArray<{ value: HeygenBooleanSelectionValue; label: string; tooltip: string }> = [
  { value: 'true', label: 'Dynamic', tooltip: 'Allow HeyGen to adjust the video duration to match the replacement audio.' },
  { value: 'false', label: 'Source', tooltip: 'Keep the source video duration instead of matching the replacement audio.' },
] as const;

export const HEYGEN_MUSIC_TRACK_OPTIONS: ReadonlyArray<{ value: HeygenBooleanSelectionValue; label: string; tooltip: string }> = [
  { value: 'false', label: 'Keep', tooltip: 'Keep background music from the source video.' },
  { value: 'true', label: 'Remove', tooltip: 'Remove background music from the source video.' },
] as const;

export const HEYGEN_SPEECH_ENHANCEMENT_OPTIONS: ReadonlyArray<{ value: HeygenBooleanSelectionValue; label: string; tooltip: string }> = [
  { value: 'false', label: 'Original', tooltip: 'Use the replacement audio without extra speech enhancement.' },
  { value: 'true', label: 'Enhanced', tooltip: 'Enhance the replacement audio quality before syncing.' },
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

export const GROK_IMAGINE_VIDEO_DURATION_OPTIONS: ReadonlyArray<{ value: GrokImagineVideoDurationSelectionValue; label: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: '8', label: '8' },
  { value: '9', label: '9' },
  { value: '10', label: '10' },
  { value: '11', label: '11' },
  { value: '12', label: '12' },
  { value: '13', label: '13' },
  { value: '14', label: '14' },
  { value: '15', label: '15' },
] as const;

export const GROK_IMAGINE_VIDEO_RESOLUTION_OPTIONS: ReadonlyArray<{ value: GrokImagineVideoResolutionSelectionValue; label: string }> = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
] as const;

export const GROK_IMAGINE_VIDEO_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: GrokImagineVideoAspectRatioSelectionValue; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
] as const;

export type Veo31DurationSelectionValue = '4s' | '6s' | '8s' | '7s';
export type Veo31ResolutionSelectionValue = '720p' | '1080p' | '4k';
export type Veo31AspectRatioSelectionValue = 'auto' | '16:9' | '9:16';
export type Veo31AudioSelectionValue = 'on' | 'off';

export const VEO31_VARIANT_OPTIONS: ReadonlyArray<{ value: Veo31Variant; label: string }> = [
  { value: 'i2v-fflf', label: 'i2v / FFLF' },
  { value: 'extend', label: 'Extend' },
] as const;

export const VEO31_DURATION_OPTIONS: ReadonlyArray<{ value: Veo31DurationSelectionValue; label: string }> = [
  { value: '4s', label: '4s' },
  { value: '6s', label: '6s' },
  { value: '8s', label: '8s' },
] as const;

export const VEO31_EXTEND_DURATION_OPTIONS: ReadonlyArray<{ value: Veo31DurationSelectionValue; label: string }> = [
  { value: '7s', label: '7s' },
] as const;

export const VEO31_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Veo31ResolutionSelectionValue; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4k' },
] as const;

export const VEO31_EXTEND_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Veo31ResolutionSelectionValue; label: string }> = [
  { value: '720p', label: '720p' },
] as const;

export const VEO31_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Veo31AspectRatioSelectionValue; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
] as const;

export const VEO31_AUDIO_OPTIONS: ReadonlyArray<{ value: Veo31AudioSelectionValue; label: string }> = [
  { value: 'off', label: 'OFF' },
  { value: 'on', label: 'ON' },
] as const;

// Map display duration to num_frames for Infinitalk API
export const INFINITALK_DURATION_TO_NUM_FRAMES: Record<InfinitalkDurationSelectionValue, number> = {
  '5s': 120,
  '6s': 144,
  '10s': 240,
  '12s': 288,
} as const;

export type Wan27VideoResolutionSelectionValue = '720p' | '1080p';
export type Wan27VideoDurationSelectionValue = '0' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
export type Wan27VideoAspectRatioSelectionValue = 'source' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
export type Wan27VideoPromptExpansionSelectionValue = 'true' | 'false';
export type Wan27VideoAudioSettingSelectionValue = 'auto' | 'origin';

export const WAN_27_VIDEO_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Wan27VideoResolutionSelectionValue; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
] as const;

export const WAN_27_VIDEO_DURATION_OPTIONS: ReadonlyArray<{ value: Wan27VideoDurationSelectionValue; label: string }> = [
  { value: '2', label: '2s' },
  { value: '3', label: '3s' },
  { value: '4', label: '4s' },
  { value: '5', label: '5s' },
  { value: '6', label: '6s' },
  { value: '7', label: '7s' },
  { value: '8', label: '8s' },
  { value: '9', label: '9s' },
  { value: '10', label: '10s' },
  { value: '11', label: '11s' },
  { value: '12', label: '12s' },
  { value: '13', label: '13s' },
  { value: '14', label: '14s' },
  { value: '15', label: '15s' },
] as const;

export const WAN_27_VIDEO_REFERENCE_DURATION_OPTIONS: ReadonlyArray<{ value: Wan27VideoDurationSelectionValue; label: string }> = [
  { value: '2', label: '2s' },
  { value: '3', label: '3s' },
  { value: '4', label: '4s' },
  { value: '5', label: '5s' },
  { value: '6', label: '6s' },
  { value: '7', label: '7s' },
  { value: '8', label: '8s' },
  { value: '9', label: '9s' },
  { value: '10', label: '10s' },
] as const;

export const WAN_27_VIDEO_EDIT_DURATION_OPTIONS: ReadonlyArray<{ value: Wan27VideoDurationSelectionValue; label: string }> = [
  { value: '0', label: 'Match source' },
  { value: '2', label: '2s' },
  { value: '3', label: '3s' },
  { value: '4', label: '4s' },
  { value: '5', label: '5s' },
  { value: '6', label: '6s' },
  { value: '7', label: '7s' },
  { value: '8', label: '8s' },
  { value: '9', label: '9s' },
  { value: '10', label: '10s' },
] as const;

export const WAN_27_VIDEO_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Wan27VideoAspectRatioSelectionValue; label: string }> = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
] as const;

export const WAN_27_VIDEO_EDIT_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Wan27VideoAspectRatioSelectionValue; label: string }> = [
  { value: 'source', label: 'Source' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
] as const;

export const WAN_27_VIDEO_PROMPT_EXPANSION_OPTIONS: ReadonlyArray<{ value: Wan27VideoPromptExpansionSelectionValue; label: string }> = [
  { value: 'true', label: 'ON' },
  { value: 'false', label: 'OFF' },
] as const;

export const WAN_27_VIDEO_AUDIO_SETTING_OPTIONS: ReadonlyArray<{ value: Wan27VideoAudioSettingSelectionValue; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'origin', label: 'Original' },
] as const;

export const WAN_27_VIDEO_VARIANT_OPTIONS: ReadonlyArray<{ value: Wan27VideoVariant; label: string }> = [
  { value: 'smart', label: 'Smart' },
  { value: 'reference', label: 'Reference' },
  { value: 'edit', label: 'Edit' },
] as const;

export type Seedance15AspectRatioSelectionValue = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type Seedance15ResolutionSelectionValue = '480p' | '720p' | '1080p';
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
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' }, // Higher quality output.
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
  value === '480p' || value === '720p' || value === '1080p';

export const isSeedance15DurationSelectionValue = (value: unknown): value is Seedance15DurationSelectionValue =>
  value === '4' || value === '5' || value === '6' || value === '7' || value === '8' || value === '9' || value === '10' || value === '11' || value === '12';

export const isVolcengineSeedance2VideoModel = (modelId: string | undefined): boolean =>
  modelId === SEEDANCE_2_VIDEO_MODEL_ID;

export const isFalSeedance2VideoModel = (modelId: string | undefined): boolean =>
  modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID; // Fal selector guard.

export const isSeedance2VideoModel = (modelId: string | undefined): boolean =>
  isVolcengineSeedance2VideoModel(modelId) || isFalSeedance2VideoModel(modelId); // Shared Seedance 2 UI guard.

export const isSeedance2Variant = (value: unknown): value is Seedance2Variant =>
  value === 'smart' || value === 'reference';

export const isSeedance2AspectRatioSelectionValue = (value: unknown): value is Seedance2AspectRatioSelectionValue =>
  value === '21:9' || value === '16:9' || value === '4:3' || value === '1:1' || value === '3:4' || value === '9:16' || value === 'adaptive';

export const isSeedance2ResolutionSelectionValue = (value: unknown): value is Seedance2ResolutionSelectionValue =>
  value === '480p' || value === '720p' || value === '1080p';

export const isSeedance2DurationSelectionValue = (value: unknown): value is Seedance2DurationSelectionValue =>
  value === '4' || value === '5' || value === '6' || value === '7' || value === '8' || value === '9' || value === '10' || value === '11' || value === '12' || value === '13' || value === '14' || value === '15';

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

// Wan 2.7 Pro Image options
export type Wan27ImageAspectRatioSelectionValue = 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
export type Wan27ImageMaxImagesSelectionValue = '1' | '2' | '3' | '4' | '5';
export type RecraftV4ProImageSizeSelectionValue = 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
export type RecraftRgbColor = { r: number; g: number; b: number };

export const RECRAFT_V4_PRO_MAX_COLORS = 5; // UI cap for preferred colors.
export const RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE: RecraftV4ProImageSizeSelectionValue = 'square_hd'; // Fal default.
export const RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR: RecraftRgbColor = { r: 255, g: 255, b: 255 }; // Neutral background color.

export const WAN_27_IMAGE_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Wan27ImageAspectRatioSelectionValue; label: string }> = [
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'portrait_16_9', label: 'Portrait 16:9' },
  { value: 'portrait_4_3', label: 'Portrait 4:3' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
] as const;

export const WAN_27_IMAGE_MAX_IMAGES_OPTIONS: ReadonlyArray<{ value: Wan27ImageMaxImagesSelectionValue; label: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
] as const;

export const RECRAFT_V4_PRO_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: RecraftV4ProImageSizeSelectionValue; label: string }> = [
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
] as const;

export const isWan27ImageModel = (modelId: string | undefined): boolean =>
  modelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;

export const isRecraftV4ProModel = (modelId: string | undefined): boolean =>
  modelId === RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID;

export const isWan27ImageAspectRatioSelectionValue = (value: unknown): value is Wan27ImageAspectRatioSelectionValue =>
  value === 'square_hd' || value === 'square' || value === 'portrait_4_3' || value === 'portrait_16_9' || value === 'landscape_4_3' || value === 'landscape_16_9';

export const isWan27ImageMaxImagesSelectionValue = (value: unknown): value is Wan27ImageMaxImagesSelectionValue =>
  value === '1' || value === '2' || value === '3' || value === '4' || value === '5';

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

export const FAL_MODEL_OPTIONS = [...FAL_IMAGE_MODEL_OPTIONS_BASE, ...FAL_VIDEO_MODEL_OPTIONS_BASE] as const;
export type FalModelOption = typeof FAL_MODEL_OPTIONS[number];
export const SEEDREAM_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID, SEEDREAM_V5_LITE_MODEL_ID] as const;
export type SeedreamModelId = typeof SEEDREAM_MODEL_IDS[number];
export const SEEDREAM_TEXT_TO_IMAGE_MAP: Record<SeedreamModelId, string> = {
  [SEEDREAM_MODEL_ID]: SEEDREAM_TEXT_TO_IMAGE_MODEL_ID,
  [SEEDREAM_V45_MODEL_ID]: SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID,
  [SEEDREAM_V5_LITE_MODEL_ID]: SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID,
};
export const isSeedreamV45ModelId = (value: string | undefined): boolean =>
  value === SEEDREAM_V45_MODEL_ID || value === SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID;
export const isSeedreamV5LiteModelId = (value: string | undefined): boolean =>
  value === SEEDREAM_V5_LITE_MODEL_ID || value === SEEDREAM_V5_LITE_TEXT_TO_IMAGE_MODEL_ID; // Match both edit and t2i IDs.
export const NANO_BANANA_EDIT_MODEL_IDS = [NANO_BANANA_PRO_EDIT_MODEL_ID, NANO_BANANA_2_EDIT_MODEL_ID] as const; // Edit ids shown in selector.
export type NanoBananaEditModelId = typeof NANO_BANANA_EDIT_MODEL_IDS[number]; // Nano Banana edit id union.
export const NANO_BANANA_TEXT_TO_IMAGE_MAP: Record<NanoBananaEditModelId, string> = {
  [NANO_BANANA_PRO_EDIT_MODEL_ID]: NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID, // Pro edit to t2i.
  [NANO_BANANA_2_EDIT_MODEL_ID]: NANO_BANANA_2_TEXT_TO_IMAGE_MODEL_ID, // V2 edit to t2i.
};
export const NANO_BANANA_TEXT_TO_IMAGE_MODEL_IDS = [
  NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID, // Pro t2i id.
  NANO_BANANA_2_TEXT_TO_IMAGE_MODEL_ID, // V2 t2i id.
] as const; // T2I ids accepted by Fal generation.
export const isNanoBananaEditModelId = (value: string | undefined): value is NanoBananaEditModelId =>
  !!value && (NANO_BANANA_EDIT_MODEL_IDS as readonly string[]).includes(value); // Match Nano Banana edit endpoints.
export const isNanoBananaTextToImageModelId = (value: string | undefined): boolean =>
  !!value && (NANO_BANANA_TEXT_TO_IMAGE_MODEL_IDS as readonly string[]).includes(value); // Match Nano Banana t2i endpoints.
export const getNanoBananaTextToImageModelId = (modelId: NanoBananaEditModelId): string =>
  NANO_BANANA_TEXT_TO_IMAGE_MAP[modelId]; // Resolve matching Nano Banana t2i endpoint.

export type FalModelMode = 'image' | 'video';
export type FalImageSizeSelectionValue = 'placeholder' | 'default' | FalImageSizePreset;
export type FalAspectRatioSelectionValue = 'placeholder' | FalAspectRatioOption;
export type FalResolutionSelectionValue = FalResolutionOption;

export type FalImageModelId = typeof FAL_IMAGE_MODEL_OPTIONS_BASE[number]['value'];
export type FalVideoModelId = typeof FAL_VIDEO_MODEL_OPTIONS_BASE[number]['value'];
export type FalModelId = FalImageModelId | FalVideoModelId;

export const isFalImageModelId = (value: string | undefined): value is FalImageModelId =>
  typeof value === 'string' && FAL_IMAGE_MODEL_OPTIONS.some(option => option.value === value);
export const isFalVideoModelId = (value: string | undefined): value is FalVideoModelId =>
  typeof value === 'string' && FAL_VIDEO_MODEL_OPTIONS.some(option => option.value === value);
export const isFalModelId = (value: string | undefined): value is FalModelId =>
  isFalImageModelId(value) || isFalVideoModelId(value);
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

export const isLipsyncSyncMode = (value: unknown): value is LipsyncSyncMode =>
  value === 'cut_off' || value === 'loop' || value === 'bounce' || value === 'silence' || value === 'remap'; // Runtime guard for saved values.

export const isGrokImagineVideoDurationSelectionValue = (value: unknown): value is GrokImagineVideoDurationSelectionValue =>
  value === '1' || value === '2' || value === '3' || value === '4' || value === '5' || value === '6' || value === '7' || value === '8' || value === '9' || value === '10' || value === '11' || value === '12' || value === '13' || value === '14' || value === '15';

export const isGrokImagineVideoResolutionSelectionValue = (value: unknown): value is GrokImagineVideoResolutionSelectionValue =>
  value === '480p' || value === '720p';

export const isGrokImagineVideoAspectRatioSelectionValue = (value: unknown): value is GrokImagineVideoAspectRatioSelectionValue =>
  value === 'auto' || value === '16:9' || value === '4:3' || value === '3:2' || value === '1:1' || value === '2:3' || value === '3:4' || value === '9:16';

export const isVeo31DurationSelectionValue = (value: unknown): value is Veo31DurationSelectionValue =>
  value === '4s' || value === '6s' || value === '8s' || value === '7s';

export const isVeo31ResolutionSelectionValue = (value: unknown): value is Veo31ResolutionSelectionValue =>
  value === '720p' || value === '1080p' || value === '4k';

export const isVeo31AspectRatioSelectionValue = (value: unknown): value is Veo31AspectRatioSelectionValue =>
  value === 'auto' || value === '16:9' || value === '9:16';

export const isVeo31Variant = (value: unknown): value is Veo31Variant =>
  value === 'i2v-fflf' || value === 'extend';

export const isWan27VideoResolutionSelectionValue = (value: unknown): value is Wan27VideoResolutionSelectionValue =>
  value === '720p' || value === '1080p';

export const isWan27VideoDurationSelectionValue = (value: unknown): value is Wan27VideoDurationSelectionValue =>
  value === '0' || value === '2' || value === '3' || value === '4' || value === '5' || value === '6' || value === '7' || value === '8'
  || value === '9' || value === '10' || value === '11' || value === '12' || value === '13' || value === '14' || value === '15';

export const isWan27VideoAspectRatioSelectionValue = (value: unknown): value is Wan27VideoAspectRatioSelectionValue =>
  value === 'source' || value === '16:9' || value === '9:16' || value === '1:1' || value === '4:3' || value === '3:4';

export const isWan27VideoVariant = (value: unknown): value is Wan27VideoVariant =>
  value === 'smart' || value === 'reference' || value === 'edit';

export const isApiProvider = (value: unknown): value is ApiProviderId =>
  value === 'google' || value === 'fal';
export const isGenerationProvider = (value: unknown): value is GenerationProviderId =>
  value === 'google' || value === 'fal' || value === 'volcengine';
export const isFalModelMode = (value: unknown): value is FalModelMode =>
  value === 'image' || value === 'video';
export const isGenerationKind = (value: unknown): value is GenerationKind =>
  value === 'text_to_image' || value === 'image_edit' || value === 'upscale' || value === 'video';

const LEGACY_NANO_BANANA_MODEL_ID = 'fal-ai/nano-banana/edit' as const;
const LEGACY_SORA_2_PRO_VIDEO_MODEL_ID = 'fal-ai/sora-2/image-to-video/pro' as const;
const LEGACY_WAN_26_VIDEO_MODEL_ID = 'wan/v2.6/image-to-video' as const;
const LEGACY_WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID = 'wan/v2.6/text-to-image' as const;
const LEGACY_WAN_26_IMAGE_IMAGE_TO_IMAGE_MODEL_ID = 'wan/v2.6/image-to-image' as const;
export const LEGACY_SYNC_LIPSYNC_REACT_MODEL_ID = 'fal-ai/sync-lipsync/react-1' as const; // Old Sync React-1 id.
export const normalizeFalModelId = (value: string | undefined): FalModelId | undefined => {
  if (value === LEGACY_NANO_BANANA_MODEL_ID) {
    return NANO_BANANA_PRO_EDIT_MODEL_ID;
  }
  if (value === LEGACY_SYNC_LIPSYNC_REACT_MODEL_ID) {
    return SYNC_LIPSYNC_MODEL_ID;
  }
  if (value === LEGACY_SORA_2_PRO_VIDEO_MODEL_ID) {
    return HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
  }
  if (value === LEGACY_WAN_26_VIDEO_MODEL_ID || value === WAN_27_TEXT_TO_VIDEO_MODEL_ID || value === WAN_27_IMAGE_TO_VIDEO_MODEL_ID || value === WAN_27_REFERENCE_TO_VIDEO_MODEL_ID || value === WAN_27_EDIT_VIDEO_MODEL_ID) {
    return WAN_27_VIDEO_MODEL_ID;
  }
  if (value === LEGACY_WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID || value === LEGACY_WAN_26_IMAGE_IMAGE_TO_IMAGE_MODEL_ID) {
    return WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
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
  { value: 'auto_3K', label: 'Auto 3K' },
  { value: 'auto_4K', label: 'Auto 4K' },
] as const;
export const SEEDREAM_V5_LITE_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: FalImageSizeSelectionValue; label: string }> = [
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 3:4' },
  { value: 'portrait_16_9', label: 'Portrait 9:16' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'auto_2K', label: 'Auto 2K' },
  { value: 'auto_3K', label: 'Auto 3K' },
] as const;
export const getSeedreamImageSizeOptions = (modelId: string | undefined) =>
  isSeedreamV5LiteModelId(modelId) ? SEEDREAM_V5_LITE_IMAGE_SIZE_OPTIONS : FAL_IMAGE_SIZE_OPTIONS; // Keep v4/v4.5 behavior unchanged.

export const FAL_NUM_IMAGE_OPTIONS = [1, 2, 3, 4] as const;
export const FAL_NUM_IMAGE_OPTIONS_SEEDREAM_V5_LITE = [1, 2, 3, 4, 5, 6] as const;
export const getFalNumImageMaxForModel = (modelId: string | undefined): number =>
  isSeedreamV5LiteModelId(modelId) ? 6 : 4; // Seedream 5 Lite supports up to 6 outputs.
export const getFalNumImageOptionsForModel = (modelId: string | undefined): ReadonlyArray<number> =>
  isSeedreamV5LiteModelId(modelId) ? FAL_NUM_IMAGE_OPTIONS_SEEDREAM_V5_LITE : FAL_NUM_IMAGE_OPTIONS; // Drive picker values from model capability.
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

export const FAL_GROK_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: '1:1', label: '1:1' }, // Grok ratio.
  { value: '2:1', label: '2:1' }, // Grok ratio.
  { value: '20:9', label: '20:9' }, // Grok ratio.
  { value: '19.5:9', label: '19.5:9' }, // Grok ratio.
  { value: '16:9', label: '16:9' }, // Grok ratio.
  { value: '4:3', label: '4:3' }, // Grok ratio.
  { value: '3:2', label: '3:2' }, // Grok ratio.
  { value: '2:3', label: '2:3' }, // Grok ratio.
  { value: '3:4', label: '3:4' }, // Grok ratio.
  { value: '9:16', label: '9:16' }, // Grok ratio.
  { value: '9:19.5', label: '9:19.5' }, // Grok ratio.
  { value: '9:20', label: '9:20' }, // Grok ratio.
  { value: '1:2', label: '1:2' }, // Grok ratio.
] as const; // Grok aspect ratio options.

export const FAL_SEEDREAM_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: FalAspectRatioSelectionValue; label: string }> = [
  { value: 'placeholder', label: 'Aspect Ratio' },
  { value: 'default', label: 'Default' },
  { value: '2560x1440', label: '2560 x 1440' },
  { value: '1440x2560', label: '1440 x 2560' },
] as const;
export const getSeedreamAspectRatioOptions = (_modelId: string | undefined) => FAL_SEEDREAM_ASPECT_RATIO_OPTIONS;

export const FAL_ASPECT_RATIO_VALUES = new Set<FalAspectRatioSelectionValue>([
  ...FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS.map(option => option.value),
  ...FAL_GROK_ASPECT_RATIO_OPTIONS.map(option => option.value), // Grok ratio values.
  ...FAL_SEEDREAM_ASPECT_RATIO_OPTIONS.map(option => option.value),
]);

export const FAL_IMAGE_SIZE_DEFAULT_OPTION = 'default';
export const DEFAULT_MAX_REFERENCE_IMAGES = 13;
export const MODEL_REFERENCE_IMAGE_LIMITS: Partial<Record<FalModelId | typeof KLING_O1_VIDEO_EDIT_MODEL_ID | typeof KLING_O1_VIDEO_REF_V2V_MODEL_ID | typeof KLING_O1_VIDEO_FFLF_MODEL_ID | typeof SEEDANCE_15_VIDEO_MODEL_ID, number>> = {
  [NANO_BANANA_PRO_EDIT_MODEL_ID]: 14,
  [NANO_BANANA_2_EDIT_MODEL_ID]: 14, // Same reference cap as Pro.
  [SEEDREAM_MODEL_ID]: 7,
  [SEEDREAM_V45_MODEL_ID]: 10,
  [SEEDREAM_V5_LITE_MODEL_ID]: 9, // Seedream 5 Lite supports 10 total input images.
  [FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID]: 7, // Flux2 Max edit supports up to 8 total images (1 primary + 7 references)
  [GROK_IMAGINE_IMAGE_MODEL_ID]: 0, // Grok Imagine supports only the selected image (no extra references).
  [GROK_IMAGINE_VIDEO_MODEL_ID]: 0,
  [WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID]: 3, // Wan 2.7 Pro Image supports up to 4 total images (1 primary + 3 references)
  [HAILUO_IMAGE_TO_VIDEO_MODEL_ID]: 0,
  [KLING_O1_VIDEO_MODEL_ID]: 6,
  [KLING_O1_VIDEO_EDIT_MODEL_ID]: 4,
  [KLING_O1_VIDEO_REF_V2V_MODEL_ID]: 4,
  [KLING_O1_VIDEO_FFLF_MODEL_ID]: 6,
  [KLING_VIDEO_MODEL_ID]: 0,
  [KLING_26_CONTROL_VIDEO_MODEL_ID]: 0,
  [WAN_ANIMATE_MODEL_ID]: 0,
  [ONE_TO_ALL_ANIMATE_MODEL_ID]: 0,
  [WAN_VISION_ENHANCER_MODEL_ID]: 0,
  [SYNC_LIPSYNC_MODEL_ID]: 0,
  [INFINITALK_VIDEO_MODEL_ID]: 0,
  [VEO_31_IMAGE_TO_VIDEO_MODEL_ID]: 0,
  [WAN_27_VIDEO_MODEL_ID]: 0,
  [SEEDANCE_15_VIDEO_MODEL_ID]: 0,
  [SEEDANCE_2_VIDEO_MODEL_ID]: 9, // Seedance 2 reference mode supports up to 9 image refs.
  [FAL_SEEDANCE_2_VIDEO_MODEL_ID]: 9, // Fal Seedance 2 reference mode supports up to 9 image refs.
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
