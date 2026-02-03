import type {
  FalAspectRatioSelectionValue,
  FalImageSizeSelectionValue,
  FalModelOption,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  Flux2MaxImageSizeSelectionValue,
  HailuoVariant,
  InfinitalkAccelerationSelectionValue,
  InfinitalkDurationSelectionValue,
  InfinitalkResolutionSelectionValue,
  InfinitalkSeedSelectionValue,
  GrokImagineVideoAspectRatioSelectionValue,
  GrokImagineVideoDurationSelectionValue,
  GrokImagineVideoResolutionSelectionValue,
  Sora2ProAspectRatioSelectionValue,
  Sora2ProDurationSelectionValue,
  Sora2ProResolutionSelectionValue,
  Veo31AspectRatioSelectionValue,
  Veo31DurationSelectionValue,
  Veo31ResolutionSelectionValue,
  Veo31Variant,
  Kling26AudioSelectionValue,
  Kling26ControlDriver,
  Kling26ControlVariant,
  KlingO1Variant,
  KlingVariant,
  LipsyncAudioMode,
  LipsyncEmotion,
  LipsyncModelMode,
  Seedance15AspectRatioSelectionValue,
  Seedance15ResolutionSelectionValue,
  Seedance15DurationSelectionValue,
  Wan26DurationSelectionValue,
  Wan26ResolutionSelectionValue,
  Wan26ImageAspectRatioSelectionValue,
  Wan26ImageMaxImagesSelectionValue,
  WanAnimateQualitySelectionValue,
  WanAnimateResolutionSelectionValue,
  WanAnimateShiftSelectionValue,
  WanAnimateStepsSelectionValue,
  WanAnimateVariant,
  WanCreativity,
  WanTargetResolution,
} from './modelConfig';
import {
  FAL_CRYSTAL_CREATIVITY_OPTIONS,
  FAL_CRYSTAL_SCALE_FACTOR_OPTIONS,
  FAL_GROK_ASPECT_RATIO_OPTIONS, // Grok aspect ratio options.
  FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS,
  FAL_IMAGE_MODEL_OPTIONS,
  FAL_KLING_ASPECT_RATIO_OPTIONS,
  FAL_KLING_RESOLUTION_OPTIONS,
  FAL_NUM_IMAGE_OPTIONS,
  FAL_REVE_ASPECT_RATIO_OPTIONS,
  FAL_RESOLUTION_OPTIONS,
  FAL_SEEDVR_NOISE_SCALE_OPTIONS,
  FAL_VIDEO_MODEL_OPTIONS,
  FLUX2_MAX_IMAGE_SIZE_OPTIONS,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok model id.
  GROK_IMAGINE_VIDEO_ASPECT_RATIO_OPTIONS,
  GROK_IMAGINE_VIDEO_DURATION_OPTIONS,
  GROK_IMAGINE_VIDEO_RESOLUTION_OPTIONS,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
  HAILUO_VARIANT_OPTIONS,
  KLING26_AUDIO_OPTIONS,
  KLING26_CONTROL_DRIVER_OPTIONS,
  KLING26_CONTROL_SOUND_OPTIONS,
  KLING26_CONTROL_VARIANT_OPTIONS,
  KLING_O1_VARIANT_OPTIONS,
  KLING_26_VIDEO_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  LIPSYNC_AUDIO_MODE_OPTIONS,
  LIPSYNC_EMOTION_OPTIONS,
  LIPSYNC_MODEL_MODE_OPTIONS,
  INFINITALK_ACCELERATION_OPTIONS,
  INFINITALK_DURATION_OPTIONS,
  INFINITALK_RESOLUTION_OPTIONS,
  INFINITALK_SEED_OPTIONS,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SORA_2_PRO_ASPECT_RATIO_OPTIONS,
  SORA_2_PRO_DURATION_OPTIONS,
  SORA_2_PRO_RESOLUTION_OPTIONS,
  VEO31_ASPECT_RATIO_OPTIONS,
  VEO31_AUDIO_OPTIONS,
  VEO31_DURATION_OPTIONS,
  VEO31_EXTEND_DURATION_OPTIONS,
  VEO31_RESOLUTION_OPTIONS,
  VEO31_EXTEND_RESOLUTION_OPTIONS,
  VEO31_VARIANT_OPTIONS,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE15_ASPECT_RATIO_OPTIONS,
  SEEDANCE15_RESOLUTION_OPTIONS,
  SEEDANCE15_DURATION_OPTIONS,
  SEEDANCE15_CAMERA_FIXED_OPTIONS,
  SEEDANCE15_AUDIO_OPTIONS,
  WAN_ANIMATE_MODEL_ID,
  WAN_ANIMATE_QUALITY_OPTIONS,
  WAN_ANIMATE_RESOLUTION_OPTIONS,
  WAN_ANIMATE_SHIFT_OPTIONS,
  WAN_ANIMATE_STEPS_OPTIONS,
  WAN_ANIMATE_VARIANT_OPTIONS,
  WAN_CREATIVITY_OPTIONS,
  WAN_TARGET_RESOLUTION_OPTIONS,
  WAN_VISION_ENHANCER_MODEL_ID,
  WAN_26_I2V_MODEL_ID,
  WAN_26_RESOLUTION_OPTIONS,
  WAN_26_DURATION_OPTIONS,
  WAN_26_PROMPT_EXPANSION_OPTIONS,
  WAN_26_MULTI_SHOTS_OPTIONS,
  WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_26_IMAGE_ASPECT_RATIO_OPTIONS,
  WAN_26_IMAGE_MAX_IMAGES_OPTIONS,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
} from './modelConfig';

export type PromptBarModelControl = {
  id: string;
  prefixLabel?: string;
  hideSelectedValue?: boolean;
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
};

export type PromptBarControlsInput = {
  apiProvider: 'google' | 'fal';
  falModelId: string;
  falModelMode: FalModelMode;
  isVideoMode: boolean;
  usingFal: boolean;
  isSeedreamModel: boolean;
  isNanoBananaModel: boolean;
  isReveModel: boolean;
  isKlingModel: boolean;
  isFlux2MaxModel: boolean;
  isWan26ImageModel: boolean;
  isUpscaleModel: boolean;
  isKlingVideoModel: boolean;
  isKlingO1VideoModel: boolean;
  isKling26VideoModel: boolean;
  isKling26ControlVideoModel: boolean;
  isHailuoVideoModel: boolean;
  isWanAnimateVideoModel: boolean;
  isLipsyncVideoModel: boolean;
  isInfinitalkVideoModel: boolean;
  isGrokImagineVideoModel: boolean;
  isSora2ProVideoModel: boolean;
  isVeo31VideoModel: boolean;
  isWan26I2VVideoModel: boolean;
  isSeedance15VideoModel: boolean;
  hailuoVariant: HailuoVariant;
  falVideoDuration: string;
  klingVariant: KlingVariant;
  klingO1Variant: KlingO1Variant;
  klingO1KeepAudio: boolean;
  kling26AudioSelection: Kling26AudioSelectionValue;
  kling26ControlVariant: Kling26ControlVariant;
  kling26ControlKeepSound: boolean;
  kling26ControlDriver: Kling26ControlDriver;
  wanTargetResolution: WanTargetResolution;
  wanCreativity: WanCreativity;
  wanAnimateVariant: WanAnimateVariant;
  wanAnimateSteps: WanAnimateStepsSelectionValue;
  wanAnimateResolution: WanAnimateResolutionSelectionValue;
  oneToAllAnimateResolution: WanAnimateResolutionSelectionValue;
  wanAnimateShift: WanAnimateShiftSelectionValue;
  wanAnimateQuality: WanAnimateQualitySelectionValue;
  wanAnimateUseTurbo: boolean;
  lipsyncEmotion: LipsyncEmotion;
  lipsyncModelMode: LipsyncModelMode;
  lipsyncAudioMode: LipsyncAudioMode;
  infinitalkResolution: InfinitalkResolutionSelectionValue;
  infinitalkSeed: InfinitalkSeedSelectionValue;
  infinitalkAcceleration: InfinitalkAccelerationSelectionValue;
  infinitalkDuration: InfinitalkDurationSelectionValue;
  grokImagineVideoDuration: GrokImagineVideoDurationSelectionValue;
  grokImagineVideoResolution: GrokImagineVideoResolutionSelectionValue;
  grokImagineVideoAspectRatio: GrokImagineVideoAspectRatioSelectionValue;
  sora2ProResolution: Sora2ProResolutionSelectionValue;
  sora2ProAspectRatio: Sora2ProAspectRatioSelectionValue;
  sora2ProDuration: Sora2ProDurationSelectionValue;
  veo31Variant: Veo31Variant;
  veo31Duration: Veo31DurationSelectionValue;
  veo31Resolution: Veo31ResolutionSelectionValue;
  veo31AspectRatio: Veo31AspectRatioSelectionValue;
  veo31GenerateAudio: boolean;
  wan26Resolution: Wan26ResolutionSelectionValue;
  wan26Duration: Wan26DurationSelectionValue;
  wan26PromptExpansion: boolean;
  wan26MultiShots: boolean;
  seedance15AspectRatio: Seedance15AspectRatioSelectionValue;
  seedance15Resolution: Seedance15ResolutionSelectionValue;
  seedance15Duration: Seedance15DurationSelectionValue;
  seedance15CameraFixed: boolean;
  seedance15Audio: boolean;
  flux2MaxImageSize: Flux2MaxImageSizeSelectionValue;
  wan26ImageAspectRatio: Wan26ImageAspectRatioSelectionValue;
  wan26ImageMaxImages: Wan26ImageMaxImagesSelectionValue;
  falScaleFactor: number;
  falCreativity: number;
  falNoiseScale: number;
  falImageSizeSelection: FalImageSizeSelectionValue;
  falAspectRatioSelection: FalAspectRatioSelectionValue;
  falResolutionSelection: FalResolutionSelectionValue;
  falNumImages: number;
  isLoading: boolean;
  onHailuoVariantChange: (value: string) => void;
  onFalVideoDurationChange: (value: string) => void;
  onKlingVariantChange: (value: string) => void;
  onKlingO1VariantChange: (value: string) => void;
  onKlingO1KeepAudioChange: (value: boolean) => void;
  onKling26AudioChange: (value: string) => void;
  onKling26ControlVariantChange: (value: string) => void;
  onKling26ControlKeepSoundChange: (value: boolean) => void;
  onKling26ControlDriverChange: (value: string) => void;
  onWanTargetResolutionChange: (value: string) => void;
  onWanCreativityChange: (value: string) => void;
  onWanAnimateVariantChange: (value: string) => void;
  onWanAnimateStepsChange: (value: string) => void;
  onWanAnimateResolutionChange: (value: string) => void;
  onOneToAllAnimateResolutionChange: (value: string) => void;
  onWanAnimateShiftChange: (value: string) => void;
  onWanAnimateQualityChange: (value: string) => void;
  onWanAnimateTurboChange: (value: boolean) => void;
  onLipsyncEmotionChange: (value: string) => void;
  onLipsyncModelModeChange: (value: string) => void;
  onLipsyncAudioModeChange: (value: string) => void;
  onInfinitalkResolutionChange: (value: string) => void;
  onInfinitalkSeedChange: (value: string) => void;
  onInfinitalkAccelerationChange: (value: string) => void;
  onInfinitalkDurationChange: (value: string) => void;
  onGrokImagineVideoDurationChange: (value: string) => void;
  onGrokImagineVideoResolutionChange: (value: string) => void;
  onGrokImagineVideoAspectRatioChange: (value: string) => void;
  onSora2ProResolutionChange: (value: string) => void;
  onSora2ProAspectRatioChange: (value: string) => void;
  onSora2ProDurationChange: (value: string) => void;
  onVeo31VariantChange: (value: string) => void;
  onVeo31DurationChange: (value: string) => void;
  onVeo31ResolutionChange: (value: string) => void;
  onVeo31AspectRatioChange: (value: string) => void;
  onVeo31GenerateAudioChange: (value: boolean) => void;
  onWan26ResolutionChange: (value: string) => void;
  onWan26DurationChange: (value: string) => void;
  onWan26PromptExpansionChange: (value: boolean) => void;
  onWan26MultiShotsChange: (value: boolean) => void;
  onSeedance15AspectRatioChange: (value: string) => void;
  onSeedance15ResolutionChange: (value: string) => void;
  onSeedance15DurationChange: (value: string) => void;
  onSeedance15CameraFixedChange: (value: boolean) => void;
  onSeedance15AudioChange: (value: boolean) => void;
  onFlux2MaxImageSizeChange: (value: string) => void;
  onWan26ImageAspectRatioChange: (value: string) => void;
  onWan26ImageMaxImagesChange: (value: string) => void;
  onFalScaleFactorChange: (value: string) => void;
  onFalCreativityChange: (value: string) => void;
  onFalNoiseScaleChange: (value: string) => void;
  onFalImageSizeChange: (value: string) => void;
  onFalAspectRatioChange: (value: string) => void;
  onFalResolutionChange: (value: string) => void;
  onFalNumImagesChange: (value: number) => void;
  shouldValidateFalOptions: boolean;
  isNumImagesInvalid: boolean;
};

// Map model/provider state into select configs consumed by PromptBar.
export const buildPromptBarModelControls = (input: PromptBarControlsInput): ReadonlyArray<PromptBarModelControl> | undefined => {
  const {
    apiProvider,
    falModelId,
    falModelMode,
    isVideoMode,
    usingFal,
    isSeedreamModel,
    isNanoBananaModel,
    isReveModel,
    isKlingModel,
    isFlux2MaxModel,
    isWan26ImageModel,
    isUpscaleModel,
    isKlingVideoModel,
    isKlingO1VideoModel,
    isKling26VideoModel,
    isKling26ControlVideoModel,
    isHailuoVideoModel,
    isWanAnimateVideoModel,
    isLipsyncVideoModel,
    isInfinitalkVideoModel,
    isGrokImagineVideoModel,
    isSora2ProVideoModel,
    isVeo31VideoModel,
    isWan26I2VVideoModel,
    isSeedance15VideoModel,
    hailuoVariant,
    falVideoDuration,
    klingVariant,
    klingO1Variant,
    klingO1KeepAudio,
    kling26AudioSelection,
    kling26ControlVariant,
    kling26ControlKeepSound,
    kling26ControlDriver,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
    oneToAllAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    lipsyncEmotion,
    lipsyncModelMode,
    lipsyncAudioMode,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    infinitalkDuration,
    grokImagineVideoDuration,
    grokImagineVideoResolution,
    grokImagineVideoAspectRatio,
    sora2ProResolution,
    sora2ProAspectRatio,
    sora2ProDuration,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan26Resolution,
    wan26Duration,
    wan26PromptExpansion,
    wan26MultiShots,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    flux2MaxImageSize,
    wan26ImageAspectRatio,
    wan26ImageMaxImages,
    falScaleFactor,
    falCreativity,
    falNoiseScale,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    isLoading,
    onHailuoVariantChange,
    onFalVideoDurationChange,
    onKlingVariantChange,
    onKlingO1VariantChange,
    onKlingO1KeepAudioChange,
    onKling26AudioChange,
    onKling26ControlVariantChange,
    onKling26ControlKeepSoundChange,
    onKling26ControlDriverChange,
    onWanTargetResolutionChange,
    onWanCreativityChange,
    onWanAnimateVariantChange,
    onWanAnimateStepsChange,
    onWanAnimateResolutionChange,
    onOneToAllAnimateResolutionChange,
    onWanAnimateShiftChange,
    onWanAnimateQualityChange,
    onWanAnimateTurboChange,
    onLipsyncEmotionChange,
    onLipsyncModelModeChange,
    onLipsyncAudioModeChange,
    onInfinitalkResolutionChange,
    onInfinitalkSeedChange,
    onInfinitalkAccelerationChange,
    onInfinitalkDurationChange,
    onGrokImagineVideoDurationChange,
    onGrokImagineVideoResolutionChange,
    onGrokImagineVideoAspectRatioChange,
    onSora2ProResolutionChange,
    onSora2ProAspectRatioChange,
    onSora2ProDurationChange,
    onVeo31VariantChange,
    onVeo31DurationChange,
    onVeo31ResolutionChange,
    onVeo31AspectRatioChange,
    onVeo31GenerateAudioChange,
    onWan26ResolutionChange,
    onWan26DurationChange,
    onWan26PromptExpansionChange,
    onWan26MultiShotsChange,
    onSeedance15AspectRatioChange,
    onSeedance15ResolutionChange,
    onSeedance15DurationChange,
    onSeedance15CameraFixedChange,
    onSeedance15AudioChange,
    onFlux2MaxImageSizeChange,
    onWan26ImageAspectRatioChange,
    onWan26ImageMaxImagesChange,
    onFalScaleFactorChange,
    onFalCreativityChange,
    onFalNoiseScaleChange,
    onFalImageSizeChange,
    onFalAspectRatioChange,
    onFalResolutionChange,
    onFalNumImagesChange,
    shouldValidateFalOptions,
    isNumImagesInvalid,
  } = input;

  const controls: PromptBarModelControl[] = [];
  const isOneToAllAnimateVideoModel = isVideoMode && falModelId === ONE_TO_ALL_ANIMATE_MODEL_ID;

  if (isHailuoVideoModel) {
    const isProVariant = hailuoVariant === 'pro';
    controls.push({
      id: 'hailuo-variant-select',
      ariaLabel: 'Select Hailuo 2.3 variant',
      options: HAILUO_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: hailuoVariant,
      onChange: onHailuoVariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'fal-video-duration-select',
      ariaLabel: isProVariant ? 'Hailuo 2.3 Pro duration (6s only)' : 'Select Hailuo 2.3 Standard duration',
      options: isProVariant
        ? [{ value: '6', label: '6s' }]
        : [
          { value: '6', label: '6s' },
          { value: '10', label: '10s' },
        ],
      value: isProVariant ? '6' : falVideoDuration,
      onChange: onFalVideoDurationChange,
      disabled: isLoading || isProVariant,
    });
  }

  if (isKlingVideoModel) {
    controls.push({
      id: 'kling-variant-select',
      ariaLabel: 'Select Kling 2.5 Turbo variant',
      options: [
        ...[{ value: 'standard', label: 'Standard' }],
        ...[{ value: 'pro', label: 'Pro (FFLF)' }],
      ],
      value: klingVariant,
      onChange: onKlingVariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'kling-video-duration-select',
      ariaLabel: 'Select Kling 2.5 Turbo duration',
      options: [
        { value: '5', label: '5s' },
        { value: '10', label: '10s' },
      ],
      value: falVideoDuration === '10' ? '10' : '5',
      onChange: onFalVideoDurationChange,
      disabled: isLoading,
    });
  }

  if (isKlingO1VideoModel) {
    controls.push({
      id: 'kling-o1-variant-select',
      ariaLabel: 'Select Kling O1 Video variant',
      options: KLING_O1_VARIANT_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
        disabled: option.disabled,
      })),
      value: klingO1Variant,
      onChange: onKlingO1VariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'kling-o1-video-duration-select',
      ariaLabel: 'Select Kling O1 duration',
      options: [
        { value: '5', label: '5s' },
        { value: '10', label: '10s' },
      ],
      value: falVideoDuration === '10' ? '10' : '5',
      onChange: onFalVideoDurationChange,
      disabled: isLoading,
    });

    // Keep audio toggle for edit and refV2V variants (both accept video input)
    if (klingO1Variant === 'edit' || klingO1Variant === 'refV2V') {
      controls.push({
        id: 'kling-o1-keep-audio',
        ariaLabel: 'Keep original audio',
        options: [
          { value: 'off', label: 'Mute' },
          { value: 'on', label: 'Keep Audio' },
        ],
        value: klingO1KeepAudio ? 'on' : 'off',
        onChange: (value: string) => onKlingO1KeepAudioChange(value === 'on'),
        disabled: isLoading,
      });
    }
  }

  if (isKling26VideoModel) {
    controls.push({
      id: 'kling26-variant-select',
      ariaLabel: 'Kling 2.6 Pro variant',
      options: [{ value: 'pro', label: 'Pro' }],
      value: 'pro',
      onChange: () => {},
      disabled: true,
    });

    controls.push({
      id: 'kling26-video-duration-select',
      ariaLabel: 'Select Kling 2.6 duration',
      options: [
        { value: '5', label: '5s' },
        { value: '10', label: '10s' },
      ],
      value: falVideoDuration === '10' ? '10' : '5',
      onChange: onFalVideoDurationChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'kling26-audio-select',
      ariaLabel: 'Select Kling 2.6 audio',
      options: KLING26_AUDIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: kling26AudioSelection,
      onChange: onKling26AudioChange,
      disabled: isLoading,
    });
  }

  if (isKling26ControlVideoModel) {
    controls.push({
      id: 'kling26-control-variant-select',
      ariaLabel: 'Select Kling 2.6 Control variant',
      options: KLING26_CONTROL_VARIANT_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
      })),
      value: kling26ControlVariant,
      onChange: onKling26ControlVariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'kling26-control-keep-sound',
      prefixLabel: 'Sound',
      ariaLabel: 'Keep original sound',
      options: KLING26_CONTROL_SOUND_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
      })),
      value: kling26ControlKeepSound ? 'true' : 'false',
      onChange: (value: string) => onKling26ControlKeepSoundChange(value === 'true'),
      disabled: isLoading,
    });

    controls.push({
      id: 'kling26-control-driver',
      prefixLabel: 'Driver',
      ariaLabel: 'Select control driver',
      options: KLING26_CONTROL_DRIVER_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: kling26ControlDriver,
      onChange: onKling26ControlDriverChange,
      disabled: isLoading,
    });
  }

  if (isWanAnimateVideoModel) {
    controls.push({
      id: 'wan-animate-variant-select',
      ariaLabel: 'Select Wan Animate variant',
      options: WAN_ANIMATE_VARIANT_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
        disabled: option.disabled,
      })),
      value: wanAnimateVariant,
      onChange: onWanAnimateVariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan-animate-steps-select',
      prefixLabel: 'Steps',
      hideSelectedValue: true,
      ariaLabel: 'Select Wan Animate steps',
      options: WAN_ANIMATE_STEPS_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wanAnimateSteps,
      onChange: onWanAnimateStepsChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan-animate-resolution-select',
      prefixLabel: 'Resolution',
      hideSelectedValue: true,
      ariaLabel: 'Select Wan Animate resolution',
      options: WAN_ANIMATE_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wanAnimateResolution,
      onChange: onWanAnimateResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan-animate-shift-select',
      prefixLabel: 'Shift',
      hideSelectedValue: true,
      ariaLabel: 'Select Wan Animate shift',
      options: WAN_ANIMATE_SHIFT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wanAnimateShift,
      onChange: onWanAnimateShiftChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan-animate-quality-select',
      prefixLabel: 'Quality',
      hideSelectedValue: true,
      ariaLabel: 'Select Wan Animate quality',
      options: WAN_ANIMATE_QUALITY_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wanAnimateQuality,
      onChange: onWanAnimateQualityChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan-animate-turbo-select',
      prefixLabel: 'Turbo',
      hideSelectedValue: true,
      ariaLabel: 'Toggle Wan Animate turbo',
      options: [
        { value: 'off', label: 'OFF' },
        { value: 'on', label: 'ON' },
      ],
      value: wanAnimateUseTurbo ? 'on' : 'off',
      onChange: (value: string) => onWanAnimateTurboChange(value === 'on'),
      disabled: isLoading,
    });
  }

  if (isOneToAllAnimateVideoModel) {
    controls.push({
      id: 'one-to-all-resolution-select',
      prefixLabel: 'Resolution',
      hideSelectedValue: true,
      ariaLabel: 'Select 1-to-All Animate resolution',
      options: WAN_ANIMATE_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: oneToAllAnimateResolution,
      onChange: onOneToAllAnimateResolutionChange,
      disabled: isLoading,
    });
  }

  if (isLipsyncVideoModel) {
    controls.push({
      id: 'lipsync-emotion-select',
      prefixLabel: 'Emotion',
      hideSelectedValue: true,
      ariaLabel: 'Select lip sync emotion',
      options: LIPSYNC_EMOTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: lipsyncEmotion,
      onChange: onLipsyncEmotionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'lipsync-mode-select',
      prefixLabel: 'Mode',
      hideSelectedValue: true,
      ariaLabel: 'Select lip sync mode',
      options: LIPSYNC_MODEL_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: lipsyncModelMode,
      onChange: onLipsyncModelModeChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'lipsync-audio-select',
      prefixLabel: 'Audio',
      hideSelectedValue: true,
      ariaLabel: 'Select lip sync audio mode',
      options: LIPSYNC_AUDIO_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: lipsyncAudioMode,
      onChange: onLipsyncAudioModeChange,
      disabled: isLoading,
    });
  }

  if (isInfinitalkVideoModel) {
    controls.push({
      id: 'infinitalk-duration-select',
      ariaLabel: 'Select Infinitalk duration',
      options: INFINITALK_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: infinitalkDuration,
      onChange: onInfinitalkDurationChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'infinitalk-resolution-select',
      prefixLabel: 'Resolution',
      ariaLabel: 'Select Infinitalk resolution',
      options: INFINITALK_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: infinitalkResolution,
      onChange: onInfinitalkResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'infinitalk-seed-select',
      prefixLabel: 'Seed',
      ariaLabel: 'Select Infinitalk seed',
      options: INFINITALK_SEED_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: infinitalkSeed,
      onChange: onInfinitalkSeedChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'infinitalk-acceleration-select',
      prefixLabel: 'Acceleration',
      ariaLabel: 'Select Infinitalk acceleration',
      options: INFINITALK_ACCELERATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: infinitalkAcceleration,
      onChange: onInfinitalkAccelerationChange,
      disabled: isLoading,
    });
  }

  if (isGrokImagineVideoModel) {
    controls.push({
      id: 'grok-imagine-video-duration-select',
      prefixLabel: 'Duration',
      ariaLabel: 'Select Grok Imagine Video duration',
      options: GROK_IMAGINE_VIDEO_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: grokImagineVideoDuration,
      onChange: onGrokImagineVideoDurationChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'grok-imagine-video-resolution-select',
      prefixLabel: 'Resolution',
      ariaLabel: 'Select Grok Imagine Video resolution',
      options: GROK_IMAGINE_VIDEO_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: grokImagineVideoResolution,
      onChange: onGrokImagineVideoResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'grok-imagine-video-aspect-ratio-select',
      prefixLabel: 'AR',
      ariaLabel: 'Select Grok Imagine Video aspect ratio',
      options: GROK_IMAGINE_VIDEO_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: grokImagineVideoAspectRatio,
      onChange: onGrokImagineVideoAspectRatioChange,
      disabled: isLoading,
    });
  }

  if (isSora2ProVideoModel) {
    controls.push({
      id: 'sora2-pro-resolution-select',
      prefixLabel: 'Resolution',
      ariaLabel: 'Select Sora 2 Pro resolution',
      options: SORA_2_PRO_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: sora2ProResolution,
      onChange: onSora2ProResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'sora2-pro-aspect-ratio-select',
      prefixLabel: 'AR',
      ariaLabel: 'Select Sora 2 Pro aspect ratio',
      options: SORA_2_PRO_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: sora2ProAspectRatio,
      onChange: onSora2ProAspectRatioChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'sora2-pro-duration-select',
      prefixLabel: 'Duration',
      ariaLabel: 'Select Sora 2 Pro duration',
      options: SORA_2_PRO_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: sora2ProDuration,
      onChange: onSora2ProDurationChange,
      disabled: isLoading,
    });
  }

  if (isVeo31VideoModel) {
    const durationOptions = veo31Variant === 'extend' ? VEO31_EXTEND_DURATION_OPTIONS : VEO31_DURATION_OPTIONS;
    const resolutionOptions = veo31Variant === 'extend' ? VEO31_EXTEND_RESOLUTION_OPTIONS : VEO31_RESOLUTION_OPTIONS;

    controls.push({
      id: 'veo31-variant-select',
      ariaLabel: 'Select Veo 3.1 variant',
      options: VEO31_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: veo31Variant,
      onChange: onVeo31VariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'veo31-duration-select',
      ariaLabel: 'Select Veo 3.1 duration',
      options: durationOptions.map(option => ({ value: option.value, label: option.label })),
      value: veo31Duration,
      onChange: onVeo31DurationChange,
      disabled: isLoading || (veo31Variant === 'extend' && durationOptions.length === 1),
    });

    controls.push({
      id: 'veo31-resolution-select',
      prefixLabel: 'Resolution',
      ariaLabel: 'Select Veo 3.1 resolution',
      options: resolutionOptions.map(option => ({ value: option.value, label: option.label })),
      value: veo31Resolution,
      onChange: onVeo31ResolutionChange,
      disabled: isLoading || (veo31Variant === 'extend' && resolutionOptions.length === 1),
    });

    controls.push({
      id: 'veo31-audio-select',
      prefixLabel: 'Audio',
      ariaLabel: 'Toggle Veo 3.1 audio generation',
      options: VEO31_AUDIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: veo31GenerateAudio ? 'on' : 'off',
      onChange: (value: string) => onVeo31GenerateAudioChange(value === 'on'),
      disabled: isLoading,
    });

    controls.push({
      id: 'veo31-aspect-ratio-select',
      prefixLabel: 'AR',
      ariaLabel: 'Select Veo 3.1 aspect ratio',
      options: VEO31_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: veo31AspectRatio,
      onChange: onVeo31AspectRatioChange,
      disabled: isLoading,
    });
  }

  if (isWan26I2VVideoModel) {
    controls.push({
      id: 'wan26-resolution-select',
      ariaLabel: 'Select Wan 2.6 resolution',
      options: WAN_26_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan26Resolution,
      onChange: onWan26ResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan26-duration-select',
      ariaLabel: 'Select Wan 2.6 duration',
      options: WAN_26_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan26Duration,
      onChange: onWan26DurationChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan26-prompt-expansion-select',
      prefixLabel: 'Prompt+',
      ariaLabel: 'Toggle Wan 2.6 prompt expansion',
      options: WAN_26_PROMPT_EXPANSION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan26PromptExpansion ? 'true' : 'false',
      onChange: (value: string) => onWan26PromptExpansionChange(value === 'true'),
      disabled: isLoading,
    });

    controls.push({
      id: 'wan26-multi-shots-select',
      prefixLabel: 'Multi-shots',
      ariaLabel: 'Toggle Wan 2.6 multi-shots',
      options: WAN_26_MULTI_SHOTS_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan26MultiShots ? 'true' : 'false',
      onChange: (value: string) => onWan26MultiShotsChange(value === 'true'),
      disabled: isLoading || !wan26PromptExpansion,
    });
  }

  if (isSeedance15VideoModel) {
    controls.push({
      id: 'seedance15-aspect-ratio-select',
      prefixLabel: 'AR',
      ariaLabel: 'Select Seedance 1.5 aspect ratio',
      options: SEEDANCE15_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: seedance15AspectRatio,
      onChange: onSeedance15AspectRatioChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'seedance15-duration-select',
      ariaLabel: 'Select Seedance 1.5 duration',
      options: SEEDANCE15_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: seedance15Duration,
      onChange: onSeedance15DurationChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'seedance15-resolution-select',
      prefixLabel: 'Resolution',
      ariaLabel: 'Select Seedance 1.5 resolution',
      options: SEEDANCE15_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: seedance15Resolution,
      onChange: onSeedance15ResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'seedance15-camera-fixed-select',
      prefixLabel: 'Camera Fixed',
      ariaLabel: 'Toggle Seedance 1.5 camera fixed',
      options: SEEDANCE15_CAMERA_FIXED_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: seedance15CameraFixed ? 'true' : 'false',
      onChange: (value: string) => onSeedance15CameraFixedChange(value === 'true'),
      disabled: isLoading,
    });

    controls.push({
      id: 'seedance15-audio-select',
      prefixLabel: 'Audio',
      ariaLabel: 'Toggle Seedance 1.5 audio generation',
      options: SEEDANCE15_AUDIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: seedance15Audio ? 'true' : 'false',
      onChange: (value: string) => onSeedance15AudioChange(value === 'true'),
      disabled: isLoading,
    });
  }

  const shouldShowWanControls = isVideoMode && falModelId === WAN_VISION_ENHANCER_MODEL_ID;
  if (shouldShowWanControls) {
    controls.push({
      id: 'wan-target-resolution-select',
      ariaLabel: 'Select Wan Vision Enhancer resolution',
      options: WAN_TARGET_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wanTargetResolution,
      onChange: onWanTargetResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan-creativity-select',
      ariaLabel: 'Select Wan Vision Enhancer creativity',
      options: WAN_CREATIVITY_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: `${wanCreativity}`,
      onChange: onWanCreativityChange,
      disabled: isLoading,
    });
  }

  if (!isVideoMode && usingFal && isUpscaleModel) {
    controls.push({
      id: 'fal-scale-factor-select',
      ariaLabel: 'Select scale factor',
      options: FAL_CRYSTAL_SCALE_FACTOR_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: `${falScaleFactor}`,
      onChange: onFalScaleFactorChange,
      disabled: isLoading,
    });

    if (falModelId === 'clarityai/crystal-upscaler') {
      controls.push({
        id: 'fal-creativity-select',
        ariaLabel: 'Select Crystal Upscaler creativity',
        options: FAL_CRYSTAL_CREATIVITY_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: falCreativity.toFixed(1),
        onChange: onFalCreativityChange,
        disabled: isLoading,
      });
    }
  }

  if (!isVideoMode && usingFal && falModelId === 'fal-ai/seedvr/upscale/image') {
    controls.push({
      id: 'fal-noise-scale-select',
      ariaLabel: 'Select SeedVR2 noise scale',
      options: FAL_SEEDVR_NOISE_SCALE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: falNoiseScale.toFixed(1),
      onChange: onFalNoiseScaleChange,
      disabled: isLoading,
    });
  }

  // Flux2 Max image size control
  if (!isVideoMode && usingFal && isFlux2MaxModel) {
    controls.push({
      id: 'flux2-max-image-size-select',
      prefixLabel: 'Resolution',
      ariaLabel: 'Select Flux2 Max image size',
      options: FLUX2_MAX_IMAGE_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: flux2MaxImageSize,
      onChange: onFlux2MaxImageSizeChange,
      disabled: isLoading,
    });
  }

  // Wan 2.6 Image controls
  if (!isVideoMode && usingFal && isWan26ImageModel) {
    controls.push({
      id: 'wan26-image-max-images-select',
      prefixLabel: 'Images',
      ariaLabel: 'Select number of images to generate',
      options: WAN_26_IMAGE_MAX_IMAGES_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan26ImageMaxImages,
      onChange: onWan26ImageMaxImagesChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan26-image-aspect-ratio-select',
      prefixLabel: 'Aspect Ratio',
      ariaLabel: 'Select output aspect ratio',
      options: WAN_26_IMAGE_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan26ImageAspectRatio,
      onChange: onWan26ImageAspectRatioChange,
      disabled: isLoading,
    });
  }

  const isGrokImagineModel = !isVideoMode && falModelId === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image model.
  const shouldShowSeedreamImageSizeControl = apiProvider === 'fal' && (falModelId === SEEDREAM_MODEL_ID || falModelId === SEEDREAM_V45_MODEL_ID);
  if (shouldShowSeedreamImageSizeControl) {
    const seedreamImageSizeOptions = getSeedreamImageSizeOptions(falModelId);
    controls.push({
      id: 'fal-image-size-select',
      ariaLabel: 'Select Seedream image size',
      options: seedreamImageSizeOptions.map(option => ({ value: option.value, label: option.label })),
      value: falImageSizeSelection,
      onChange: onFalImageSizeChange,
      disabled: isLoading,
    });
  }

  const supportsAspectRatioControl = isNanoBananaModel
    || isReveModel
    || isKlingModel
    || isGrokImagineModel // Grok aspect ratio support.
    || (isSeedreamModel && !shouldShowSeedreamImageSizeControl); // Include Grok for AR control.
  const shouldShowAspectRatioControl = supportsAspectRatioControl && (apiProvider === 'fal' || !isVideoMode);
  if (shouldShowAspectRatioControl) {
    const aspectRatioOptions = isReveModel
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : isNanoBananaModel
        ? FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS
        : isGrokImagineModel // Grok aspect ratio branch.
          ? FAL_GROK_ASPECT_RATIO_OPTIONS // Grok aspect ratio options.
          : isSeedreamModel
            ? getSeedreamAspectRatioOptions(falModelId)
            : FAL_KLING_ASPECT_RATIO_OPTIONS;
    controls.push({
      id: 'fal-aspect-ratio-select',
      prefixLabel: isGrokImagineModel ? 'AR' : undefined, // Grok uses short label.
      ariaLabel: 'Select aspect ratio',
      options: aspectRatioOptions.map(option => ({ value: option.value, label: option.label })),
      value: falAspectRatioSelection,
      onChange: onFalAspectRatioChange,
      disabled: isLoading,
    });
  }

  const shouldShowResolutionControl = apiProvider === 'fal' && (isNanoBananaModel || isKlingModel);
  if (shouldShowResolutionControl) {
    const resolutionOptions = isKlingModel ? FAL_KLING_RESOLUTION_OPTIONS : FAL_RESOLUTION_OPTIONS;
    const resolutionValue = isKlingModel && falResolutionSelection === '4K' ? '2K' : falResolutionSelection;
    controls.push({
      id: 'fal-resolution-select',
      ariaLabel: 'Select resolution',
      options: resolutionOptions.map(option => ({ value: option.value, label: option.label })),
      value: resolutionValue,
      onChange: onFalResolutionChange,
      disabled: isLoading,
    });
  }

  const shouldShowNumImagesControl = apiProvider === 'fal'
    && !isVideoMode
    && (isSeedreamModel || isNanoBananaModel || isReveModel || isKlingModel || isGrokImagineModel); // Include Grok for Num control.
  if (shouldShowNumImagesControl) {
    controls.push({
      id: 'fal-num-images-select',
      prefixLabel: isGrokImagineModel ? 'Num' : undefined, // Grok uses short label.
      ariaLabel: 'Select number of images to generate',
      options: FAL_NUM_IMAGE_OPTIONS.map(option => ({ value: `${option}`, label: `${option}` })),
      value: falNumImages.toString(),
      onChange: (value: string) => onFalNumImagesChange(Number(value)),
      disabled: isLoading,
      errorMessage: shouldValidateFalOptions && isNumImagesInvalid ? 'Num images must be between 1 and 4.' : undefined,
    });
  }

  return controls.length > 0 ? controls : undefined;
};

export const getPromptBarModelOptions = (mode: FalModelMode): ReadonlyArray<FalModelOption> =>
  mode === 'video' ? FAL_VIDEO_MODEL_OPTIONS : FAL_IMAGE_MODEL_OPTIONS;

export const shouldShowKlingNegativePrompt = (falModelId: FalVideoModelId | string): boolean =>
  falModelId === KLING_VIDEO_MODEL_ID || falModelId === KLING_26_VIDEO_MODEL_ID || falModelId === KLING_IMAGE_MODEL_ID || falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID || falModelId === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
