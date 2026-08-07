import type {
  GenerationFalOptions,
  GenerationInputs,
  GenerationJimengOptions,
  GenerationVolcengineOptions,
} from '../types';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KREA_2_DEFAULT_ASPECT_RATIO,
  KREA_2_DEFAULT_CREATIVITY,
  MINIMAX_H3_VIDEO_MODEL_ID,
  RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR,
  RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  isFalImageModelId,
  isGptImage2Model,
  isKrea2LargeModel as isKrea2LargeModelId,
  isNanoBananaEditModelId,
  isRecraftV4ProModel,
  isSeedance2VideoModel as isSeedance2VideoModelId,
  isSeedreamModelId,
  isSeedreamV5LiteModelId,
  isSeedreamV5ProModelId,
  type FalModelId,
} from '../services/modelConfig';

export type GenerationTransferOptions = GenerationFalOptions & GenerationVolcengineOptions & GenerationJimengOptions; // Shared shape covers every provider-backed prompt control.

/** Setter per restorable option; a missing key means the prompt bar never restores that control. */
export type GenerationTransferOptionSetters = {
  [Key in keyof GenerationTransferOptions]?: (value: NonNullable<GenerationTransferOptions[Key]>) => void;
};

export const getGenerationTransferOptionDefaults = (
  modelId: FalModelId,
  restoredOptions: GenerationTransferOptions = {},
): GenerationTransferOptions => {
  if (modelId === KLING_VIDEO_MODEL_ID) return { videoDuration: '5', klingVariant: 'standard' }; // Kling 2.5 defaults.
  if (modelId === KLING_V3_VIDEO_MODEL_ID) {
    return {
      klingV3Duration: '5',
      klingV3GenerateAudio: true,
      klingV3CfgScale: '0.5',
      klingV3MultiPromptEnabled: false,
      klingV3MultiPrompt: '',
      klingV3Shot1Duration: '5',
      klingV3Shot2Duration: '5',
    }; // Kling 3 defaults prevent partial metadata from keeping a live second shot.
  }
  if (modelId === KLING_O3_VIDEO_MODEL_ID) {
    return { klingO3Variant: restoredOptions.klingO3Variant ?? 'reference', klingO3Duration: '5', klingO3GenerateAudio: false, klingO3KeepAudio: true, aspectRatioSelection: '16:9' }; // Reference mode is the family default.
  }
  if (modelId === KLING_V3_CONTROL_VIDEO_MODEL_ID) return { klingV3ControlKeepSound: true, klingV3ControlOrientation: 'video' }; // Kling Control defaults.
  if (modelId === WAN_VISION_ENHANCER_MODEL_ID) return { wanTargetResolution: '720p', wanCreativity: 1 }; // Vision Enhancer defaults.
  if (modelId === WAN_ANIMATE_MODEL_ID) {
    return {
      wanAnimateVariant: 'replace',
      wanAnimateSteps: '20',
      wanAnimateResolution: '480p',
      wanAnimateShift: '5.0',
      wanAnimateQuality: 'high',
      wanAnimateUseTurbo: false,
    }; // Wan Animate defaults.
  }
  if (modelId === SYNC_LIPSYNC_MODEL_ID) return { lipsyncSyncMode: 'cut_off' }; // Sync default.
  if (modelId === HEYGEN_V3_LIPSYNC_MODEL_ID) {
    return {
      heygenEnableCaption: false,
      heygenEnableDynamicDuration: true,
      heygenDisableMusicTrack: false,
      heygenEnableSpeechEnhancement: false,
    }; // HeyGen defaults.
  }
  if (modelId === INFINITALK_VIDEO_MODEL_ID) {
    return { infinitalkResolution: '480p', infinitalkSeed: '42', infinitalkAcceleration: 'regular', infinitalkDuration: '5s' }; // Infinitalk defaults.
  }
  if (modelId === GROK_IMAGINE_VIDEO_MODEL_ID) {
    return { grokImagineVideoDuration: '6', grokImagineVideoResolution: '720p', grokImagineVideoAspectRatio: 'auto' }; // Grok video defaults.
  }
  if (modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID) {
    return { veo31Variant: 'i2v-fflf', veo31Duration: '8s', veo31Resolution: '720p', veo31AspectRatio: 'auto', veo31GenerateAudio: true }; // Veo defaults.
  }
  if (modelId === WAN_27_VIDEO_MODEL_ID) {
    const variant = restoredOptions.wan27VideoVariant ?? 'smart'; // Resolve the mode before choosing its dependent defaults.
    return {
      wan27VideoVariant: variant,
      wan27VideoResolution: '1080p',
      wan27VideoDuration: variant === 'edit' ? '0' : '5',
      wan27VideoAspectRatio: variant === 'edit' ? 'source' : '16:9',
      wan27VideoPromptExpansion: true,
      wan27VideoAudioSetting: 'auto',
    }; // Edit mode owns source-based defaults while other modes use generated-video defaults.
  }
  if (modelId === MINIMAX_H3_VIDEO_MODEL_ID) {
    const variant = restoredOptions.miniMaxH3Variant ?? 'reference'; // Standard mode cannot represent the Reference-only Adaptive ratio.
    return { miniMaxH3Variant: variant, miniMaxH3AspectRatio: variant === 'standard' ? '16:9' : 'adaptive', miniMaxH3Duration: '5' }; // H3 defaults follow the restored variant.
  }
  if (modelId === SEEDANCE_15_VIDEO_MODEL_ID) {
    return { seedance15AspectRatio: '16:9', seedance15Resolution: '720p', seedance15Duration: '5', seedance15CameraFixed: false, seedance15Audio: false }; // Seedance 1.5 defaults.
  }
  if (modelId === FAL_SEEDANCE_25_VIDEO_MODEL_ID) {
    return {
      seedance25Variant: 'reference',
      seedance25AspectRatio: 'adaptive',
      seedance25Resolution: '720p',
      seedance25Duration: 'auto',
      seedance25GenerateAudio: true,
    }; // Seedance 2.5 follows the provider defaults.
  }
  if (isSeedance2VideoModelId(modelId)) {
    return {
      seedance2Variant: 'reference',
      seedance2JimengModelVersion: 'seedance2.0fast',
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '720p',
      seedance2Duration: '5',
      seedance2GenerateAudio: false,
      seedance2CameraFixed: false,
    }; // Shared Seedance 2 defaults.
  }

  const imageDefaults: GenerationTransferOptions = isFalImageModelId(modelId) ? { numImages: 1 } : {}; // Image runs default to one output.
  if (modelId === CRYSTAL_UPSCALER_MODEL_ID) return { ...imageDefaults, scaleFactor: 2, creativity: 0 }; // Crystal defaults.
  if (modelId === SEEDVR_UPSCALER_MODEL_ID) return { ...imageDefaults, scaleFactor: 2, noiseScale: 0.1 }; // SeedVR defaults.
  if (modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID) return { ...imageDefaults, flux2MaxImageSize: 'landscape_4_3' }; // Flux defaults.
  if (isGptImage2Model(modelId)) return { ...imageDefaults, imageSizeSelection: 'auto', gptImage2Quality: 'medium' }; // GPT Image defaults.
  if (isKrea2LargeModelId(modelId)) return { ...imageDefaults, aspectRatioSelection: KREA_2_DEFAULT_ASPECT_RATIO, krea2Creativity: KREA_2_DEFAULT_CREATIVITY }; // Krea defaults.
  if (modelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID) return { ...imageDefaults, wan27ImageAspectRatio: 'landscape_16_9', wan27ImageMaxImages: '1' }; // Wan image defaults.
  if (isRecraftV4ProModel(modelId)) {
    return { ...imageDefaults, recraftImageSize: RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE, recraftBackgroundColor: { ...RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR }, recraftColors: [] }; // Recraft defaults.
  }
  if (isSeedreamModelId(modelId)) {
    return { ...imageDefaults, imageSizeSelection: isSeedreamV5LiteModelId(modelId) || isSeedreamV5ProModelId(modelId) ? 'auto_2K' : 'default' }; // Seedream defaults vary by generation.
  }
  if (isNanoBananaEditModelId(modelId)) return { ...imageDefaults, aspectRatioSelection: 'default', resolutionSelection: '1K' }; // Nano Banana defaults.
  if (modelId === GROK_IMAGINE_IMAGE_MODEL_ID) return { ...imageDefaults, aspectRatioSelection: '1:1' }; // Grok image default.
  return imageDefaults; // Models without visible controls only reset their output count.
};

/** Saved options for the restored model, with defaults filling in anything legacy metadata omits. */
export const resolveGenerationTransferOptions = (
  generation: GenerationInputs,
  normalizedModelId: FalModelId,
): GenerationTransferOptions => {
  const savedOptions = (generation.provider === 'jimeng'
    ? generation.jimengOptions
    : generation.provider === 'volcengine'
      ? generation.volcengineOptions
      : generation.falOptions) ?? {}; // Legacy generations may only contain provider and model metadata.
  const inferredVariantOptions: GenerationTransferOptions = normalizedModelId === KLING_O3_VIDEO_MODEL_ID
    ? { klingO3Variant: generation.modelId === KLING_O3_VIDEO_EDIT_MODEL_ID ? 'edit' : 'reference' }
    : normalizedModelId === WAN_27_VIDEO_MODEL_ID
      ? {
          wan27VideoVariant: generation.modelId === WAN_27_EDIT_VIDEO_MODEL_ID
            ? 'edit'
            : generation.modelId === WAN_27_REFERENCE_TO_VIDEO_MODEL_ID ? 'reference' : 'smart',
        }
      : {}; // Current endpoint ids encode the variant when older metadata omits it.
  const restoredOptions = {
    ...inferredVariantOptions,
    ...savedOptions,
  }; // Explicit saved controls take precedence over endpoint inference.
  return {
    ...getGenerationTransferOptionDefaults(normalizedModelId, restoredOptions),
    ...restoredOptions,
  }; // Missing legacy fields use the selected model's defaults instead of unrelated live values.
};

/** Selector model id for providers whose metadata still records their own endpoint. */
export const resolveGenerationTransferModelId = (generation: GenerationInputs): string | undefined =>
  generation.provider === 'jimeng'
    ? JIMENG_SEEDANCE_2_VIDEO_MODEL_ID
    : generation.provider === 'volcengine'
      ? SEEDANCE_2_VIDEO_MODEL_ID
      : generation.modelId; // Local providers use their selector model even in older metadata.

export const applyGenerationTransferOptions = (
  options: GenerationTransferOptions,
  setters: GenerationTransferOptionSetters,
): void => {
  (Object.keys(setters) as (keyof GenerationTransferOptions)[]).forEach(key => {
    const value = options[key];
    if (value === undefined) {
      return; // Options the saved generation never carried keep their model default.
    }
    (setters[key] as (restored: unknown) => void)(value);
  });
};
