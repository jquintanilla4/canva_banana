import type {
  FalAspectRatioSelectionValue,
  FalImageSizeSelectionValue,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  HailuoVariant,
  Kling26AudioSelectionValue,
  KlingO1Variant,
  KlingVariant,
} from './modelConfig';
import {
  FAL_CRYSTAL_CREATIVITY_OPTIONS,
  FAL_CRYSTAL_SCALE_FACTOR_OPTIONS,
  FAL_GEMINI_ASPECT_RATIO_OPTIONS,
  FAL_IMAGE_MODEL_OPTIONS,
  FAL_KLING_ASPECT_RATIO_OPTIONS,
  FAL_KLING_RESOLUTION_OPTIONS,
  FAL_NUM_IMAGE_OPTIONS,
  FAL_REVE_ASPECT_RATIO_OPTIONS,
  FAL_RESOLUTION_OPTIONS,
  FAL_SEEDVR_NOISE_SCALE_OPTIONS,
  FAL_VIDEO_MODEL_OPTIONS,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
  HAILUO_VARIANT_OPTIONS,
  KLING26_AUDIO_OPTIONS,
  KLING_O1_VARIANT_OPTIONS,
  KLING_26_VIDEO_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
} from './modelConfig';

export type PromptBarModelControl = {
  id: string;
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
  isGeminiModel: boolean;
  isReveModel: boolean;
  isKlingModel: boolean;
  isUpscaleModel: boolean;
  isKlingVideoModel: boolean;
  isKlingO1VideoModel: boolean;
  isKling26VideoModel: boolean;
  isHailuoVideoModel: boolean;
  hailuoVariant: HailuoVariant;
  falVideoDuration: string;
  klingVariant: KlingVariant;
  klingO1Variant: KlingO1Variant;
  klingO1KeepAudio: boolean;
  kling26AudioSelection: Kling26AudioSelectionValue;
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
    isGeminiModel,
    isReveModel,
    isKlingModel,
    isUpscaleModel,
    isKlingVideoModel,
    isKlingO1VideoModel,
    isKling26VideoModel,
    isHailuoVideoModel,
    hailuoVariant,
    falVideoDuration,
    klingVariant,
    klingO1Variant,
    klingO1KeepAudio,
    kling26AudioSelection,
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

  const supportsAspectRatioControl = isGeminiModel || isReveModel || isKlingModel || (isSeedreamModel && !shouldShowSeedreamImageSizeControl);
  const shouldShowAspectRatioControl = supportsAspectRatioControl && (apiProvider === 'fal' || !isVideoMode);
  if (shouldShowAspectRatioControl) {
    const aspectRatioOptions = isReveModel
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : isGeminiModel
        ? FAL_GEMINI_ASPECT_RATIO_OPTIONS
        : isSeedreamModel
          ? getSeedreamAspectRatioOptions(falModelId)
          : FAL_KLING_ASPECT_RATIO_OPTIONS;
    controls.push({
      id: 'fal-aspect-ratio-select',
      ariaLabel: 'Select aspect ratio',
      options: aspectRatioOptions.map(option => ({ value: option.value, label: option.label })),
      value: falAspectRatioSelection,
      onChange: onFalAspectRatioChange,
      disabled: isLoading,
    });
  }

  const shouldShowResolutionControl = apiProvider === 'fal' && (isGeminiModel || isKlingModel);
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

  const shouldShowNumImagesControl = apiProvider === 'fal' && !isVideoMode && (isSeedreamModel || isGeminiModel || isReveModel || isKlingModel);
  if (shouldShowNumImagesControl) {
    controls.push({
      id: 'fal-num-images-select',
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

export const getPromptBarModelOptions = (mode: FalModelMode): typeof FAL_IMAGE_MODEL_OPTIONS | typeof FAL_VIDEO_MODEL_OPTIONS =>
  mode === 'video' ? FAL_VIDEO_MODEL_OPTIONS : FAL_IMAGE_MODEL_OPTIONS;

export const shouldShowKlingNegativePrompt = (falModelId: FalVideoModelId | string): boolean =>
  falModelId === KLING_VIDEO_MODEL_ID || falModelId === KLING_26_VIDEO_MODEL_ID || falModelId === KLING_IMAGE_MODEL_ID || falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
