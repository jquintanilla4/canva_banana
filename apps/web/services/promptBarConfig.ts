import type {
  FalAspectRatioSelectionValue,
  FalGptImage2QualitySelectionValue,
  FalImageSizeSelectionValue,
  FalModelOption,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  Flux2MaxImageSizeSelectionValue,
  InfinitalkAccelerationSelectionValue,
  InfinitalkDurationSelectionValue,
  InfinitalkResolutionSelectionValue,
  InfinitalkSeedSelectionValue,
  GrokImagineVideoAspectRatioSelectionValue,
  GrokImagineVideoDurationSelectionValue,
  GrokImagineVideoResolutionSelectionValue,
  Veo31AspectRatioSelectionValue,
  Veo31DurationSelectionValue,
  Veo31ResolutionSelectionValue,
  Veo31Variant,
  KlingO3DurationSelectionValue,
  KlingO3Variant,
  KlingV3ControlOrientation,
  KlingV3CfgScaleSelectionValue,
  KlingV3DurationSelectionValue,
  KlingV3ShotDurationSelectionValue,
  KlingVariant,
  Krea2AspectRatioSelectionValue,
  Krea2CreativitySelectionValue,
  LipsyncSyncMode,
  RecraftRgbColor,
  RecraftV4ProImageSizeSelectionValue,
  Seedance15AspectRatioSelectionValue,
  Seedance15ResolutionSelectionValue,
  Seedance15DurationSelectionValue,
  Seedance2AspectRatioSelectionValue,
  Seedance2BooleanSelectionValue,
  JimengSeedance2ModelVersionSelectionValue,
  Seedance2ResolutionSelectionValue,
  Seedance2DurationSelectionValue,
  Seedance2Variant,
  MiniMaxH3AspectRatioSelectionValue,
  MiniMaxH3DurationSelectionValue,
  MiniMaxH3Variant,
  Wan27VideoAudioSettingSelectionValue,
  Wan27VideoAspectRatioSelectionValue,
  Wan27VideoDurationSelectionValue,
  Wan27VideoResolutionSelectionValue,
  Wan27VideoVariant,
  Wan27ImageAspectRatioSelectionValue,
  Wan27ImageMaxImagesSelectionValue,
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
  GPT_IMAGE_2_IMAGE_SIZE_OPTIONS,
  GPT_IMAGE_2_QUALITY_OPTIONS,
  FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS,
  FAL_IMAGE_MODEL_OPTIONS,
  FAL_RESOLUTION_OPTIONS,
  FAL_SEEDVR_NOISE_SCALE_OPTIONS,
  KREA_2_ASPECT_RATIO_OPTIONS,
  KREA_2_CREATIVITY_OPTIONS,
  FAL_VIDEO_MODEL_OPTIONS,
  FLUX2_MAX_IMAGE_SIZE_OPTIONS,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok model id.
  GROK_IMAGINE_VIDEO_ASPECT_RATIO_OPTIONS,
  GROK_IMAGINE_VIDEO_DURATION_OPTIONS,
  GROK_IMAGINE_VIDEO_RESOLUTION_OPTIONS,
  HEYGEN_CAPTION_OPTIONS,
  HEYGEN_DYNAMIC_DURATION_OPTIONS,
  HEYGEN_MUSIC_TRACK_OPTIONS,
  HEYGEN_SPEECH_ENHANCEMENT_OPTIONS,
  getFalNumImageMaxForModel,
  getFalNumImageOptionsForModel,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
  KLING_O3_ASPECT_RATIO_OPTIONS,
  KLING_O3_VARIANT_OPTIONS,
  KLING_V3_CONTROL_ORIENTATION_OPTIONS,
  KLING_V3_CONTROL_SOUND_OPTIONS,
  KLING_V3_AUDIO_OPTIONS,
  KLING_V3_CFG_SCALE_OPTIONS,
  KLING_V3_DURATION_OPTIONS,
  KLING_V3_MULTI_PROMPT_OPTIONS,
  KLING_V3_SHOT_DURATION_OPTIONS,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  LIPSYNC_SYNC_MODE_OPTIONS,
  INFINITALK_ACCELERATION_OPTIONS,
  INFINITALK_DURATION_OPTIONS,
  INFINITALK_RESOLUTION_OPTIONS,
  INFINITALK_SEED_OPTIONS,
  VEO31_ASPECT_RATIO_OPTIONS,
  VEO31_AUDIO_OPTIONS,
  VEO31_DURATION_OPTIONS,
  VEO31_EXTEND_DURATION_OPTIONS,
  VEO31_RESOLUTION_OPTIONS,
  VEO31_EXTEND_RESOLUTION_OPTIONS,
  VEO31_VARIANT_OPTIONS,
  isSeedreamV5LiteModelId,
  isSeedreamV5ProModelId,
  isRecraftV4ProModel,
  RECRAFT_V4_PRO_IMAGE_SIZE_OPTIONS,
  RECRAFT_V4_PRO_MAX_COLORS,
  recraftRgbToHex,
  SYNC_LIPSYNC_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE15_ASPECT_RATIO_OPTIONS,
  SEEDANCE15_RESOLUTION_OPTIONS,
  SEEDANCE15_DURATION_OPTIONS,
  SEEDANCE15_CAMERA_FIXED_OPTIONS,
  SEEDANCE15_AUDIO_OPTIONS,
  SEEDANCE2_VARIANT_OPTIONS,
  SEEDANCE2_ASPECT_RATIO_OPTIONS,
  SEEDANCE2_RESOLUTION_OPTIONS,
  SEEDANCE2_DURATION_OPTIONS,
  SEEDANCE2_AUDIO_OPTIONS,
  SEEDANCE2_CAMERA_FIXED_OPTIONS,
  JIMENG_SEEDANCE2_MODEL_VERSION_OPTIONS,
  MINIMAX_H3_ASPECT_RATIO_OPTIONS,
  MINIMAX_H3_DURATION_OPTIONS,
  MINIMAX_H3_VARIANT_OPTIONS,
  WAN_ANIMATE_MODEL_ID,
  WAN_ANIMATE_QUALITY_OPTIONS,
  WAN_ANIMATE_RESOLUTION_OPTIONS,
  WAN_ANIMATE_SHIFT_OPTIONS,
  WAN_ANIMATE_STEPS_OPTIONS,
  WAN_ANIMATE_VARIANT_OPTIONS,
  WAN_CREATIVITY_OPTIONS,
  WAN_TARGET_RESOLUTION_OPTIONS,
  WAN_VISION_ENHANCER_MODEL_ID,
  WAN_27_VIDEO_AUDIO_SETTING_OPTIONS,
  WAN_27_VIDEO_ASPECT_RATIO_OPTIONS,
  WAN_27_VIDEO_DURATION_OPTIONS,
  WAN_27_VIDEO_EDIT_ASPECT_RATIO_OPTIONS,
  WAN_27_VIDEO_EDIT_DURATION_OPTIONS,
  WAN_27_VIDEO_PROMPT_EXPANSION_OPTIONS,
  WAN_27_VIDEO_REFERENCE_DURATION_OPTIONS,
  WAN_27_VIDEO_RESOLUTION_OPTIONS,
  WAN_27_VIDEO_VARIANT_OPTIONS,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_IMAGE_ASPECT_RATIO_OPTIONS,
  WAN_27_IMAGE_MAX_IMAGES_OPTIONS,
} from './modelConfig';

type PromptBarSelectControl = {
  kind?: 'select';
  id: string;
  prefixLabel?: string;
  hideSelectedValue?: boolean;
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean; tooltip?: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
  tooltip?: string;
};

type PromptBarColorControl = {
  kind: 'color';
  id: string;
  prefixLabel: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
};

type PromptBarActionControl = {
  kind: 'action';
  id: string;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  disabled: boolean;
  errorMessage?: string;
};

export type PromptBarModelControl = PromptBarSelectControl | PromptBarColorControl | PromptBarActionControl;

type Seedance2PromptBarControlsInput = {
  idPrefix?: string;
  seedance2Variant: Seedance2Variant;
  seedance2JimengModelVersion?: JimengSeedance2ModelVersionSelectionValue;
  seedance2AspectRatio: Seedance2AspectRatioSelectionValue;
  seedance2Resolution: Seedance2ResolutionSelectionValue;
  seedance2Duration: Seedance2DurationSelectionValue;
  seedance2GenerateAudio: boolean;
  seedance2CameraFixed: boolean;
  showCameraFixed?: boolean;
  showJimengModelVersion?: boolean;
  showAudio?: boolean;
  allowFullResolution?: boolean;
  isLoading: boolean;
  onSeedance2VariantChange: (value: Seedance2Variant) => void;
  onSeedance2JimengModelVersionChange?: (value: JimengSeedance2ModelVersionSelectionValue) => void;
  onSeedance2AspectRatioChange: (value: Seedance2AspectRatioSelectionValue) => void;
  onSeedance2ResolutionChange: (value: Seedance2ResolutionSelectionValue) => void;
  onSeedance2DurationChange: (value: Seedance2DurationSelectionValue) => void;
  onSeedance2GenerateAudioChange: (value: boolean) => void;
  onSeedance2CameraFixedChange: (value: boolean) => void;
};

const buildSeedance2ControlId = (controlName: string, idPrefix?: string): string =>
  idPrefix ? `${idPrefix}-seedance2-${controlName}-select` : `seedance2-${controlName}-select`;

const getSeedance2BooleanSelectionValue = (value: boolean): Seedance2BooleanSelectionValue => (
  value ? 'true' : 'false'
);

export const buildSeedance2PromptBarControls = ({
  idPrefix,
  seedance2Variant,
  seedance2JimengModelVersion = 'seedance2.0fast',
  seedance2AspectRatio,
  seedance2Resolution,
  seedance2Duration,
  seedance2GenerateAudio,
  seedance2CameraFixed,
  showCameraFixed = true,
  showJimengModelVersion = false,
  showAudio = true,
  allowFullResolution = false,
  isLoading,
  onSeedance2VariantChange,
  onSeedance2JimengModelVersionChange,
  onSeedance2AspectRatioChange,
  onSeedance2ResolutionChange,
  onSeedance2DurationChange,
  onSeedance2GenerateAudioChange,
  onSeedance2CameraFixedChange,
}: Seedance2PromptBarControlsInput): ReadonlyArray<PromptBarModelControl> => {
  const selectedJimengModelVersion = JIMENG_SEEDANCE2_MODEL_VERSION_OPTIONS.find(option => option.value === seedance2JimengModelVersion);
  const supportsJimeng1080p = Boolean(showJimengModelVersion && selectedJimengModelVersion?.supports1080p);
  const seedance2ResolutionValue = showJimengModelVersion && !supportsJimeng1080p && seedance2Resolution === '1080p'
    ? '720p'
    : seedance2Resolution; // Jimeng 1080p is only valid for seedance2.0_vip.
  const resolutionOptions = SEEDANCE2_RESOLUTION_OPTIONS.map(option => ({
    value: option.value,
    label: (allowFullResolution || supportsJimeng1080p) && option.value === '1080p' ? '1080p' : option.label,
    disabled: option.value === '1080p' ? !(allowFullResolution || supportsJimeng1080p) : option.disabled,
  })); // Jimeng 1080p is only valid for seedance2.0_vip.
  const aspectRatioOptions = SEEDANCE2_ASPECT_RATIO_OPTIONS
    .filter(option => !showJimengModelVersion || option.value !== 'adaptive')
    .map(option => ({ value: option.value, label: option.label })); // Jimeng rejects adaptive, so do not offer it.
  const seedance2AspectRatioValue = showJimengModelVersion && seedance2AspectRatio === 'adaptive'
    ? '16:9'
    : seedance2AspectRatio; // Keep hidden Jimeng-invalid state from reaching the select.
  const controls: PromptBarModelControl[] = [{
    id: buildSeedance2ControlId('variant', idPrefix),
    ariaLabel: 'Select Seedance 2 variant',
    options: SEEDANCE2_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: seedance2Variant,
    onChange: (value: string) => onSeedance2VariantChange(value as Seedance2Variant),
    disabled: isLoading,
  }];

  if (showJimengModelVersion) {
    controls.push({
      id: buildSeedance2ControlId('jimeng-channel', idPrefix),
      prefixLabel: 'Channel',
      ariaLabel: 'Select Jimeng Seedance 2 channel',
      options: JIMENG_SEEDANCE2_MODEL_VERSION_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
        tooltip: option.tooltip,
      })),
      value: seedance2JimengModelVersion,
      onChange: (value: string) => {
        onSeedance2JimengModelVersionChange?.(value as JimengSeedance2ModelVersionSelectionValue);
        if (value !== 'seedance2.0_vip' && seedance2Resolution === '1080p') {
          onSeedance2ResolutionChange('720p');
        }
      },
      disabled: isLoading,
      tooltip: selectedJimengModelVersion?.tooltip,
    });
  }

  controls.push({
    id: buildSeedance2ControlId('aspect-ratio', idPrefix),
    prefixLabel: 'AR',
    ariaLabel: 'Select Seedance 2 aspect ratio',
    options: aspectRatioOptions,
    value: seedance2AspectRatioValue,
    onChange: (value: string) => onSeedance2AspectRatioChange(value as Seedance2AspectRatioSelectionValue),
    disabled: isLoading,
  },
  {
    id: buildSeedance2ControlId('duration', idPrefix),
    ariaLabel: 'Select Seedance 2 duration',
    options: SEEDANCE2_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: seedance2Duration,
    onChange: (value: string) => onSeedance2DurationChange(value as Seedance2DurationSelectionValue),
    disabled: isLoading,
  },
  {
    id: buildSeedance2ControlId('resolution', idPrefix),
    prefixLabel: 'Resolution',
    ariaLabel: 'Select Seedance 2 resolution',
    options: resolutionOptions,
    value: seedance2ResolutionValue,
    onChange: (value: string) => onSeedance2ResolutionChange(value as Seedance2ResolutionSelectionValue),
    disabled: isLoading,
  });

  if (showCameraFixed) {
    controls.push({
      id: buildSeedance2ControlId('camera-fixed', idPrefix),
      prefixLabel: 'Camera',
      ariaLabel: 'Toggle Seedance 2 camera fixed',
      options: SEEDANCE2_CAMERA_FIXED_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: getSeedance2BooleanSelectionValue(seedance2CameraFixed),
      onChange: (value: string) => onSeedance2CameraFixedChange(value === 'true'),
      disabled: isLoading,
    });
  }

  if (showAudio) {
    controls.push({
      id: buildSeedance2ControlId('audio', idPrefix),
      prefixLabel: 'Audio',
      ariaLabel: 'Toggle Seedance 2 audio generation',
      options: SEEDANCE2_AUDIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: getSeedance2BooleanSelectionValue(seedance2GenerateAudio),
      onChange: (value: string) => onSeedance2GenerateAudioChange(value === 'true'),
      disabled: isLoading,
    });
  }

  return controls;
};

type MiniMaxH3PromptBarControlsInput = {
  idPrefix?: string;
  variant: MiniMaxH3Variant;
  aspectRatio: MiniMaxH3AspectRatioSelectionValue;
  duration: MiniMaxH3DurationSelectionValue;
  usesSourceAspectRatio: boolean;
  isLoading: boolean;
  onVariantChange: (value: MiniMaxH3Variant) => void;
  onAspectRatioChange: (value: MiniMaxH3AspectRatioSelectionValue) => void;
  onDurationChange: (value: MiniMaxH3DurationSelectionValue) => void;
};

export const buildMiniMaxH3PromptBarControls = ({
  idPrefix,
  variant,
  aspectRatio,
  duration,
  usesSourceAspectRatio,
  isLoading,
  onVariantChange,
  onAspectRatioChange,
  onDurationChange,
}: MiniMaxH3PromptBarControlsInput): ReadonlyArray<PromptBarModelControl> => {
  const controlId = (name: string): string => idPrefix ? `${idPrefix}-minimax-h3-${name}-select` : `minimax-h3-${name}-select`; // Embedded ids stay unique.
  const aspectRatioOptions = variant === 'reference'
    ? MINIMAX_H3_ASPECT_RATIO_OPTIONS
    : MINIMAX_H3_ASPECT_RATIO_OPTIONS.filter(option => option.value !== 'adaptive');
  return [{
    id: controlId('variant'),
    ariaLabel: 'Select MiniMax H3 variant',
    options: MINIMAX_H3_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: variant,
    onChange: value => onVariantChange(value as MiniMaxH3Variant),
    disabled: isLoading,
  }, {
    id: controlId('aspect-ratio'),
    prefixLabel: 'AR',
    ariaLabel: 'Select MiniMax H3 aspect ratio',
    options: usesSourceAspectRatio
      ? [{ value: 'source', label: 'Source' }]
      : aspectRatioOptions.map(option => ({ value: option.value, label: option.label })),
    value: usesSourceAspectRatio ? 'source' : aspectRatio,
    onChange: value => {
      if (!usesSourceAspectRatio) {
        onAspectRatioChange(value as MiniMaxH3AspectRatioSelectionValue);
      }
    },
    disabled: isLoading || usesSourceAspectRatio,
  }, {
    id: controlId('duration'),
    ariaLabel: 'Select MiniMax H3 duration',
    options: MINIMAX_H3_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: duration,
    onChange: value => onDurationChange(value as MiniMaxH3DurationSelectionValue),
    disabled: isLoading,
  }];
};

type KlingV3PromptBarControlsInput = {
  idPrefix?: string;
  klingV3Duration: KlingV3DurationSelectionValue;
  klingV3GenerateAudio: boolean;
  klingV3CfgScale: KlingV3CfgScaleSelectionValue;
  klingV3MultiPromptEnabled: boolean;
  klingV3Shot1Duration: KlingV3ShotDurationSelectionValue;
  klingV3Shot2Duration: KlingV3ShotDurationSelectionValue;
  isLoading: boolean;
  onKlingV3DurationChange: (value: KlingV3DurationSelectionValue) => void;
  onKlingV3GenerateAudioChange: (value: boolean) => void;
  onKlingV3CfgScaleChange: (value: KlingV3CfgScaleSelectionValue) => void;
  onKlingV3MultiPromptEnabledChange: (value: boolean) => void;
  onKlingV3Shot1DurationChange: (value: KlingV3ShotDurationSelectionValue) => void;
  onKlingV3Shot2DurationChange: (value: KlingV3ShotDurationSelectionValue) => void;
};

const buildKlingV3ControlId = (controlName: string, idPrefix?: string): string =>
  idPrefix ? `${idPrefix}-kling-v3-${controlName}-select` : `kling-v3-${controlName}-select`;

const getKlingV3BooleanSelectionValue = (value: boolean): 'true' | 'false' => (
  value ? 'true' : 'false'
);

export const buildKlingV3PromptBarControls = ({
  idPrefix,
  klingV3Duration,
  klingV3GenerateAudio,
  klingV3CfgScale,
  klingV3MultiPromptEnabled,
  klingV3Shot1Duration,
  klingV3Shot2Duration,
  isLoading,
  onKlingV3DurationChange,
  onKlingV3GenerateAudioChange,
  onKlingV3CfgScaleChange,
  onKlingV3MultiPromptEnabledChange,
  onKlingV3Shot1DurationChange,
  onKlingV3Shot2DurationChange,
}: KlingV3PromptBarControlsInput): ReadonlyArray<PromptBarModelControl> => {
  const controls: PromptBarModelControl[] = [{
    id: buildKlingV3ControlId('multi', idPrefix),
    prefixLabel: 'Multi',
    ariaLabel: 'Toggle Kling 3.0 Pro multi prompt',
    options: KLING_V3_MULTI_PROMPT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: getKlingV3BooleanSelectionValue(klingV3MultiPromptEnabled),
    onChange: (value: string) => onKlingV3MultiPromptEnabledChange(value === 'true'),
    disabled: isLoading,
  }];

  if (klingV3MultiPromptEnabled) {
    controls.push({
      id: buildKlingV3ControlId('shot-1-duration', idPrefix),
      prefixLabel: 'Shot 1',
      ariaLabel: 'Select Kling 3.0 Pro first shot duration',
      options: KLING_V3_SHOT_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: klingV3Shot1Duration,
      onChange: (value: string) => onKlingV3Shot1DurationChange(value as KlingV3ShotDurationSelectionValue),
      disabled: isLoading,
    });
    controls.push({
      id: buildKlingV3ControlId('shot-2-duration', idPrefix),
      prefixLabel: 'Shot 2',
      ariaLabel: 'Select Kling 3.0 Pro second shot duration',
      options: KLING_V3_SHOT_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: klingV3Shot2Duration,
      onChange: (value: string) => onKlingV3Shot2DurationChange(value as KlingV3ShotDurationSelectionValue),
      disabled: isLoading,
    });
  } else {
    controls.push({
      id: buildKlingV3ControlId('duration', idPrefix),
      ariaLabel: 'Select Kling 3.0 Pro duration',
      options: KLING_V3_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: klingV3Duration,
      onChange: (value: string) => onKlingV3DurationChange(value as KlingV3DurationSelectionValue),
      disabled: isLoading,
    });
  }

  controls.push({
    id: buildKlingV3ControlId('audio', idPrefix),
    prefixLabel: 'Audio',
    ariaLabel: 'Toggle Kling 3.0 Pro audio generation',
    options: KLING_V3_AUDIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: getKlingV3BooleanSelectionValue(klingV3GenerateAudio),
    onChange: (value: string) => onKlingV3GenerateAudioChange(value === 'true'),
    disabled: isLoading,
  });
  controls.push({
    id: buildKlingV3ControlId('cfg', idPrefix),
    prefixLabel: 'CFG',
    ariaLabel: 'Select Kling 3.0 Pro CFG scale',
    options: KLING_V3_CFG_SCALE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
    value: klingV3CfgScale,
    onChange: (value: string) => onKlingV3CfgScaleChange(value as KlingV3CfgScaleSelectionValue),
    disabled: isLoading,
  });

  return controls;
};

export type PromptBarControlsInput = {
  apiProvider: 'google' | 'fal';
  controlIdPrefix?: string; // Keeps embedded control ids unique.
  falModelId: string;
  falModelMode: FalModelMode;
  isVideoMode: boolean;
  usingFal: boolean;
  isSeedreamModel: boolean;
  isNanoBananaModel: boolean;
  isKrea2LargeModel?: boolean;
  isFlux2MaxModel: boolean;
  isWan27ImageModel: boolean;
  isGptImage2Model?: boolean;
  isUpscaleModel: boolean;
  isKlingVideoModel: boolean;
  isKlingV3VideoModel: boolean;
  isKlingO3VideoModel: boolean;
  isKlingV3ControlVideoModel: boolean;
  isWanAnimateVideoModel: boolean;
  isLipsyncVideoModel: boolean;
  isHeygenV3LipsyncVideoModel: boolean;
  isInfinitalkVideoModel: boolean;
  isGrokImagineVideoModel: boolean;
  isVeo31VideoModel: boolean;
  isWan27VideoModel: boolean;
  isMiniMaxH3VideoModel: boolean;
  isSeedance15VideoModel: boolean;
  isSeedance2VideoModel: boolean;
  isFalSeedance2VideoModel: boolean;
  isJimengSeedance2VideoModel?: boolean;
  falVideoDuration: string;
  klingVariant: KlingVariant;
  klingV3Duration: KlingV3DurationSelectionValue;
  klingV3GenerateAudio: boolean;
  klingV3CfgScale: KlingV3CfgScaleSelectionValue;
  klingV3MultiPromptEnabled: boolean;
  klingV3Shot1Duration: KlingV3ShotDurationSelectionValue;
  klingV3Shot2Duration: KlingV3ShotDurationSelectionValue;
  klingO3Variant: KlingO3Variant;
  klingO3Duration: KlingO3DurationSelectionValue;
  klingO3GenerateAudio: boolean;
  klingO3KeepAudio: boolean;
  klingV3ControlKeepSound: boolean;
  klingV3ControlOrientation: KlingV3ControlOrientation;
  wanTargetResolution: WanTargetResolution;
  wanCreativity: WanCreativity;
  wanAnimateVariant: WanAnimateVariant;
  wanAnimateSteps: WanAnimateStepsSelectionValue;
  wanAnimateResolution: WanAnimateResolutionSelectionValue;
  wanAnimateShift: WanAnimateShiftSelectionValue;
  wanAnimateQuality: WanAnimateQualitySelectionValue;
  wanAnimateUseTurbo: boolean;
  lipsyncSyncMode: LipsyncSyncMode;
  heygenEnableCaption: boolean;
  heygenEnableDynamicDuration: boolean;
  heygenDisableMusicTrack: boolean;
  heygenEnableSpeechEnhancement: boolean;
  infinitalkResolution: InfinitalkResolutionSelectionValue;
  infinitalkSeed: InfinitalkSeedSelectionValue;
  infinitalkAcceleration: InfinitalkAccelerationSelectionValue;
  infinitalkDuration: InfinitalkDurationSelectionValue;
  grokImagineVideoDuration: GrokImagineVideoDurationSelectionValue;
  grokImagineVideoResolution: GrokImagineVideoResolutionSelectionValue;
  grokImagineVideoAspectRatio: GrokImagineVideoAspectRatioSelectionValue;
  veo31Variant: Veo31Variant;
  veo31Duration: Veo31DurationSelectionValue;
  veo31Resolution: Veo31ResolutionSelectionValue;
  veo31AspectRatio: Veo31AspectRatioSelectionValue;
  veo31GenerateAudio: boolean;
  wan27VideoResolution: Wan27VideoResolutionSelectionValue;
  wan27VideoDuration: Wan27VideoDurationSelectionValue;
  wan27VideoAspectRatio: Wan27VideoAspectRatioSelectionValue;
  wan27VideoPromptExpansion: boolean;
  wan27VideoVariant: Wan27VideoVariant;
  wan27VideoAudioSetting: Wan27VideoAudioSettingSelectionValue;
  miniMaxH3Variant: MiniMaxH3Variant;
  miniMaxH3AspectRatio: MiniMaxH3AspectRatioSelectionValue;
  miniMaxH3Duration: MiniMaxH3DurationSelectionValue;
  miniMaxH3UsesSourceAspectRatio: boolean;
  seedance15AspectRatio: Seedance15AspectRatioSelectionValue;
  seedance15Resolution: Seedance15ResolutionSelectionValue;
  seedance15Duration: Seedance15DurationSelectionValue;
  seedance15CameraFixed: boolean;
  seedance15Audio: boolean;
  seedance2Variant: Seedance2Variant;
  seedance2JimengModelVersion?: JimengSeedance2ModelVersionSelectionValue;
  seedance2AspectRatio: Seedance2AspectRatioSelectionValue;
  seedance2Resolution: Seedance2ResolutionSelectionValue;
  seedance2Duration: Seedance2DurationSelectionValue;
  seedance2GenerateAudio: boolean;
  seedance2CameraFixed: boolean;
  flux2MaxImageSize: Flux2MaxImageSizeSelectionValue;
  wan27ImageAspectRatio: Wan27ImageAspectRatioSelectionValue;
  wan27ImageMaxImages: Wan27ImageMaxImagesSelectionValue;
  recraftImageSize: RecraftV4ProImageSizeSelectionValue;
  recraftBackgroundColor: RecraftRgbColor;
  recraftColors: RecraftRgbColor[];
  gptImage2Quality?: FalGptImage2QualitySelectionValue;
  krea2AspectRatio?: Krea2AspectRatioSelectionValue;
  krea2Creativity?: Krea2CreativitySelectionValue;
  falScaleFactor: number;
  falCreativity: number;
  falNoiseScale: number;
  falImageSizeSelection: FalImageSizeSelectionValue;
  falAspectRatioSelection: FalAspectRatioSelectionValue;
  falResolutionSelection: FalResolutionSelectionValue;
  falNumImages: number;
  isLoading: boolean;
  onFalVideoDurationChange: (value: string) => void;
  onKlingVariantChange: (value: string) => void;
  onKlingV3DurationChange: (value: string) => void;
  onKlingV3GenerateAudioChange: (value: boolean) => void;
  onKlingV3CfgScaleChange: (value: string) => void;
  onKlingV3MultiPromptEnabledChange: (value: boolean) => void;
  onKlingV3Shot1DurationChange: (value: string) => void;
  onKlingV3Shot2DurationChange: (value: string) => void;
  onKlingO3VariantChange: (value: string) => void;
  onKlingO3DurationChange: (value: string) => void;
  onKlingO3GenerateAudioChange: (value: boolean) => void;
  onKlingO3KeepAudioChange: (value: boolean) => void;
  onKlingV3ControlKeepSoundChange: (value: boolean) => void;
  onKlingV3ControlOrientationChange: (value: string) => void;
  onWanTargetResolutionChange: (value: string) => void;
  onWanCreativityChange: (value: string) => void;
  onWanAnimateVariantChange: (value: string) => void;
  onWanAnimateStepsChange: (value: string) => void;
  onWanAnimateResolutionChange: (value: string) => void;
  onWanAnimateShiftChange: (value: string) => void;
  onWanAnimateQualityChange: (value: string) => void;
  onWanAnimateTurboChange: (value: boolean) => void;
  onLipsyncSyncModeChange: (value: string) => void;
  onHeygenEnableCaptionChange: (value: boolean) => void;
  onHeygenEnableDynamicDurationChange: (value: boolean) => void;
  onHeygenDisableMusicTrackChange: (value: boolean) => void;
  onHeygenEnableSpeechEnhancementChange: (value: boolean) => void;
  onInfinitalkResolutionChange: (value: string) => void;
  onInfinitalkSeedChange: (value: string) => void;
  onInfinitalkAccelerationChange: (value: string) => void;
  onInfinitalkDurationChange: (value: string) => void;
  onGrokImagineVideoDurationChange: (value: string) => void;
  onGrokImagineVideoResolutionChange: (value: string) => void;
  onGrokImagineVideoAspectRatioChange: (value: string) => void;
  onVeo31VariantChange: (value: string) => void;
  onVeo31DurationChange: (value: string) => void;
  onVeo31ResolutionChange: (value: string) => void;
  onVeo31AspectRatioChange: (value: string) => void;
  onVeo31GenerateAudioChange: (value: boolean) => void;
  onWan27VideoResolutionChange: (value: string) => void;
  onWan27VideoDurationChange: (value: string) => void;
  onWan27VideoAspectRatioChange: (value: string) => void;
  onWan27VideoPromptExpansionChange: (value: boolean) => void;
  onWan27VideoVariantChange: (value: string) => void;
  onWan27VideoAudioSettingChange: (value: string) => void;
  onMiniMaxH3VariantChange: (value: string) => void;
  onMiniMaxH3AspectRatioChange: (value: string) => void;
  onMiniMaxH3DurationChange: (value: string) => void;
  onSeedance15AspectRatioChange: (value: string) => void;
  onSeedance15ResolutionChange: (value: string) => void;
  onSeedance15DurationChange: (value: string) => void;
  onSeedance15CameraFixedChange: (value: boolean) => void;
  onSeedance15AudioChange: (value: boolean) => void;
  onSeedance2VariantChange: (value: string) => void;
  onSeedance2JimengModelVersionChange: (value: string) => void;
  onSeedance2AspectRatioChange: (value: string) => void;
  onSeedance2ResolutionChange: (value: string) => void;
  onSeedance2DurationChange: (value: string) => void;
  onSeedance2GenerateAudioChange: (value: boolean) => void;
  onSeedance2CameraFixedChange: (value: boolean) => void;
  onFlux2MaxImageSizeChange: (value: string) => void;
  onWan27ImageAspectRatioChange: (value: string) => void;
  onWan27ImageMaxImagesChange: (value: string) => void;
  onRecraftImageSizeChange: (value: string) => void;
  onRecraftBackgroundColorChange: (value: string) => void;
  onRecraftColorChange: (index: number, value: string) => void;
  onRecraftAddColor: () => void;
  onRecraftRemoveColor: () => void;
  onGptImage2QualityChange?: (value: string) => void;
  onKrea2AspectRatioChange?: (value: string) => void;
  onKrea2CreativityChange?: (value: string) => void;
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
    controlIdPrefix,
    falModelId,
    falModelMode,
    isVideoMode,
    usingFal,
    isSeedreamModel,
    isNanoBananaModel,
    isKrea2LargeModel = false,
    isFlux2MaxModel,
    isWan27ImageModel,
    isGptImage2Model = false,
    isUpscaleModel,
    isKlingVideoModel,
    isKlingV3VideoModel,
    isKlingO3VideoModel,
    isKlingV3ControlVideoModel,
    isWanAnimateVideoModel,
    isLipsyncVideoModel,
    isHeygenV3LipsyncVideoModel,
    isInfinitalkVideoModel,
    isGrokImagineVideoModel,
    isVeo31VideoModel,
    isWan27VideoModel,
    isMiniMaxH3VideoModel,
    isSeedance15VideoModel,
    isSeedance2VideoModel,
    isFalSeedance2VideoModel,
    isJimengSeedance2VideoModel = false,
    falVideoDuration,
    klingVariant,
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3Shot1Duration,
    klingV3Shot2Duration,
    klingO3Variant,
    klingO3Duration,
    klingO3GenerateAudio,
    klingO3KeepAudio,
    klingV3ControlKeepSound,
    klingV3ControlOrientation,
    wanTargetResolution,
    wanCreativity,
    wanAnimateVariant,
    wanAnimateSteps,
    wanAnimateResolution,
    wanAnimateShift,
    wanAnimateQuality,
    wanAnimateUseTurbo,
    lipsyncSyncMode,
    heygenEnableCaption,
    heygenEnableDynamicDuration,
    heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement,
    infinitalkResolution,
    infinitalkSeed,
    infinitalkAcceleration,
    infinitalkDuration,
    grokImagineVideoDuration,
    grokImagineVideoResolution,
    grokImagineVideoAspectRatio,
    veo31Variant,
    veo31Duration,
    veo31Resolution,
    veo31AspectRatio,
    veo31GenerateAudio,
    wan27VideoResolution,
    wan27VideoDuration,
    wan27VideoAspectRatio,
    wan27VideoPromptExpansion,
    wan27VideoVariant,
    wan27VideoAudioSetting,
    miniMaxH3Variant,
    miniMaxH3AspectRatio,
    miniMaxH3Duration,
    miniMaxH3UsesSourceAspectRatio,
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    seedance2Variant,
    seedance2JimengModelVersion = 'seedance2.0fast',
    seedance2AspectRatio,
    seedance2Resolution,
    seedance2Duration,
    seedance2GenerateAudio,
    seedance2CameraFixed,
    flux2MaxImageSize,
    wan27ImageAspectRatio,
    wan27ImageMaxImages,
    recraftImageSize,
    recraftBackgroundColor,
    recraftColors,
    gptImage2Quality = 'medium',
    krea2AspectRatio = '16:9',
    krea2Creativity = 'medium',
    falScaleFactor,
    falCreativity,
    falNoiseScale,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    isLoading,
    onFalVideoDurationChange,
    onKlingVariantChange,
    onKlingV3DurationChange,
    onKlingV3GenerateAudioChange,
    onKlingV3CfgScaleChange,
    onKlingV3MultiPromptEnabledChange,
    onKlingV3Shot1DurationChange,
    onKlingV3Shot2DurationChange,
    onKlingO3VariantChange,
    onKlingO3DurationChange,
    onKlingO3GenerateAudioChange,
    onKlingO3KeepAudioChange,
    onKlingV3ControlKeepSoundChange,
    onKlingV3ControlOrientationChange,
    onWanTargetResolutionChange,
    onWanCreativityChange,
    onWanAnimateVariantChange,
    onWanAnimateStepsChange,
    onWanAnimateResolutionChange,
    onWanAnimateShiftChange,
    onWanAnimateQualityChange,
    onWanAnimateTurboChange,
    onLipsyncSyncModeChange,
    onHeygenEnableCaptionChange,
    onHeygenEnableDynamicDurationChange,
    onHeygenDisableMusicTrackChange,
    onHeygenEnableSpeechEnhancementChange,
    onInfinitalkResolutionChange,
    onInfinitalkSeedChange,
    onInfinitalkAccelerationChange,
    onInfinitalkDurationChange,
    onGrokImagineVideoDurationChange,
    onGrokImagineVideoResolutionChange,
    onGrokImagineVideoAspectRatioChange,
    onVeo31VariantChange,
    onVeo31DurationChange,
    onVeo31ResolutionChange,
    onVeo31AspectRatioChange,
    onVeo31GenerateAudioChange,
    onWan27VideoResolutionChange,
    onWan27VideoDurationChange,
    onWan27VideoAspectRatioChange,
    onWan27VideoPromptExpansionChange,
    onWan27VideoVariantChange,
    onWan27VideoAudioSettingChange,
    onMiniMaxH3VariantChange,
    onMiniMaxH3AspectRatioChange,
    onMiniMaxH3DurationChange,
    onSeedance15AspectRatioChange,
    onSeedance15ResolutionChange,
    onSeedance15DurationChange,
    onSeedance15CameraFixedChange,
    onSeedance15AudioChange,
    onSeedance2VariantChange,
    onSeedance2JimengModelVersionChange,
    onSeedance2AspectRatioChange,
    onSeedance2ResolutionChange,
    onSeedance2DurationChange,
    onSeedance2GenerateAudioChange,
    onSeedance2CameraFixedChange,
    onFlux2MaxImageSizeChange,
    onWan27ImageAspectRatioChange,
    onWan27ImageMaxImagesChange,
    onRecraftImageSizeChange,
    onRecraftBackgroundColorChange,
    onRecraftColorChange,
    onRecraftAddColor,
    onRecraftRemoveColor,
    onGptImage2QualityChange = () => undefined,
    onKrea2AspectRatioChange = () => undefined,
    onKrea2CreativityChange = () => undefined,
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

  if (isKlingV3VideoModel) {
    controls.push(...buildKlingV3PromptBarControls({
      idPrefix: controlIdPrefix,
      klingV3Duration,
      klingV3GenerateAudio,
      klingV3CfgScale,
      klingV3MultiPromptEnabled,
      klingV3Shot1Duration,
      klingV3Shot2Duration,
      isLoading,
      onKlingV3DurationChange: value => onKlingV3DurationChange(value),
      onKlingV3GenerateAudioChange,
      onKlingV3CfgScaleChange: value => onKlingV3CfgScaleChange(value),
      onKlingV3MultiPromptEnabledChange,
      onKlingV3Shot1DurationChange: value => onKlingV3Shot1DurationChange(value),
      onKlingV3Shot2DurationChange: value => onKlingV3Shot2DurationChange(value),
    }));
  }

  if (isKlingO3VideoModel) {
    controls.push({
      id: 'kling-o3-variant-select',
      ariaLabel: 'Select Kling O3 Video variant',
      options: KLING_O3_VARIANT_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
        disabled: option.disabled,
      })),
      value: klingO3Variant,
      onChange: onKlingO3VariantChange,
      disabled: isLoading,
    });

    if (klingO3Variant === 'reference') {
      controls.push({
        id: 'kling-o3-video-duration-select',
        ariaLabel: 'Select Kling O3 duration',
        options: KLING_V3_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: klingO3Duration,
        onChange: onKlingO3DurationChange,
        disabled: isLoading,
      });

      controls.push({
        id: 'kling-o3-audio-select',
        ariaLabel: 'Toggle Kling O3 audio generation',
        options: KLING_V3_AUDIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: klingO3GenerateAudio ? 'true' : 'false',
        onChange: (value: string) => onKlingO3GenerateAudioChange(value === 'true'),
        disabled: isLoading,
      });

      controls.push({
        id: 'kling-o3-aspect-ratio-select',
        prefixLabel: 'Aspect Ratio',
        ariaLabel: 'Select Kling O3 aspect ratio',
        options: KLING_O3_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: falAspectRatioSelection === '9:16' || falAspectRatioSelection === '1:1' ? falAspectRatioSelection : '16:9',
        onChange: onFalAspectRatioChange,
        disabled: isLoading,
      });
    }

    if (klingO3Variant === 'edit') {
      controls.push({
        id: 'kling-o3-keep-audio',
        ariaLabel: 'Keep original audio',
        options: [
          { value: 'off', label: 'Mute' },
          { value: 'on', label: 'Keep Audio' },
        ],
        value: klingO3KeepAudio ? 'on' : 'off',
        onChange: (value: string) => onKlingO3KeepAudioChange(value === 'on'),
        disabled: isLoading,
      });
    }
  }

  if (isKlingV3ControlVideoModel) {
    controls.push({
      id: 'kling-v3-control-keep-sound',
      prefixLabel: 'Sound',
      ariaLabel: 'Keep original sound',
      options: KLING_V3_CONTROL_SOUND_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
      })),
      value: klingV3ControlKeepSound ? 'true' : 'false',
      onChange: (value: string) => onKlingV3ControlKeepSoundChange(value === 'true'),
      disabled: isLoading,
    });

    controls.push({
      id: 'kling-v3-control-orientation',
      prefixLabel: 'Orientation',
      ariaLabel: 'Select Kling 3.0 Control orientation',
      options: KLING_V3_CONTROL_ORIENTATION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: klingV3ControlOrientation,
      onChange: onKlingV3ControlOrientationChange,
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

  if (isLipsyncVideoModel) {
    controls.push({
      id: 'lipsync-sync-mode-select',
      prefixLabel: 'Sync',
      hideSelectedValue: true,
      ariaLabel: 'Select lip sync mode',
      options: LIPSYNC_SYNC_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: lipsyncSyncMode,
      onChange: onLipsyncSyncModeChange,
      disabled: isLoading,
    });
  }

  if (isHeygenV3LipsyncVideoModel) {
    controls.push({
      id: 'heygen-caption-select',
      prefixLabel: 'Captions',
      ariaLabel: 'Toggle HeyGen captions',
      options: HEYGEN_CAPTION_OPTIONS.map(option => ({ value: option.value, label: option.label, tooltip: option.tooltip })),
      value: heygenEnableCaption ? 'true' : 'false',
      onChange: (value: string) => onHeygenEnableCaptionChange(value === 'true'),
      disabled: isLoading,
      tooltip: heygenEnableCaption ? HEYGEN_CAPTION_OPTIONS[1].tooltip : HEYGEN_CAPTION_OPTIONS[0].tooltip,
    });

    controls.push({
      id: 'heygen-dynamic-duration-select',
      prefixLabel: 'Duration',
      ariaLabel: 'Toggle HeyGen dynamic duration',
      options: HEYGEN_DYNAMIC_DURATION_OPTIONS.map(option => ({ value: option.value, label: option.label, tooltip: option.tooltip })),
      value: heygenEnableDynamicDuration ? 'true' : 'false',
      onChange: (value: string) => onHeygenEnableDynamicDurationChange(value === 'true'),
      disabled: isLoading,
      tooltip: heygenEnableDynamicDuration ? HEYGEN_DYNAMIC_DURATION_OPTIONS[0].tooltip : HEYGEN_DYNAMIC_DURATION_OPTIONS[1].tooltip,
    });

    controls.push({
      id: 'heygen-music-track-select',
      prefixLabel: 'Music',
      ariaLabel: 'Toggle HeyGen music removal',
      options: HEYGEN_MUSIC_TRACK_OPTIONS.map(option => ({ value: option.value, label: option.label, tooltip: option.tooltip })),
      value: heygenDisableMusicTrack ? 'true' : 'false',
      onChange: (value: string) => onHeygenDisableMusicTrackChange(value === 'true'),
      disabled: isLoading,
      tooltip: heygenDisableMusicTrack ? HEYGEN_MUSIC_TRACK_OPTIONS[1].tooltip : HEYGEN_MUSIC_TRACK_OPTIONS[0].tooltip,
    });

    controls.push({
      id: 'heygen-speech-enhancement-select',
      prefixLabel: 'Speech',
      ariaLabel: 'Toggle HeyGen speech enhancement',
      options: HEYGEN_SPEECH_ENHANCEMENT_OPTIONS.map(option => ({ value: option.value, label: option.label, tooltip: option.tooltip })),
      value: heygenEnableSpeechEnhancement ? 'true' : 'false',
      onChange: (value: string) => onHeygenEnableSpeechEnhancementChange(value === 'true'),
      disabled: isLoading,
      tooltip: heygenEnableSpeechEnhancement ? HEYGEN_SPEECH_ENHANCEMENT_OPTIONS[1].tooltip : HEYGEN_SPEECH_ENHANCEMENT_OPTIONS[0].tooltip,
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

  if (isWan27VideoModel) {
    const wan27VariantValue = wan27VideoVariant === 'reference'
      ? 'reference'
      : wan27VideoVariant === 'edit'
        ? 'edit'
        : 'smart';
    const isWan27ReferenceMode = wan27VariantValue === 'reference';
    const isWan27EditMode = wan27VariantValue === 'edit';
    const wan27DurationOptions = isWan27ReferenceMode
      ? WAN_27_VIDEO_REFERENCE_DURATION_OPTIONS
      : isWan27EditMode
        ? WAN_27_VIDEO_EDIT_DURATION_OPTIONS
        : WAN_27_VIDEO_DURATION_OPTIONS;
    const wan27AspectRatioOptions = isWan27EditMode
      ? WAN_27_VIDEO_EDIT_ASPECT_RATIO_OPTIONS
      : WAN_27_VIDEO_ASPECT_RATIO_OPTIONS;

    controls.push({
      id: 'wan27-video-variant-select',
      prefixLabel: 'Variant',
      ariaLabel: 'Select Wan 2.7 variant',
      options: WAN_27_VIDEO_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan27VariantValue,
      onChange: onWan27VideoVariantChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan27-video-aspect-ratio-select',
      prefixLabel: 'AR',
      ariaLabel: 'Select Wan 2.7 aspect ratio',
      options: wan27AspectRatioOptions.map(option => ({ value: option.value, label: option.label })),
      value: wan27VideoAspectRatio,
      onChange: onWan27VideoAspectRatioChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan27-video-resolution-select',
      ariaLabel: 'Select Wan 2.7 resolution',
      options: WAN_27_VIDEO_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan27VideoResolution,
      onChange: onWan27VideoResolutionChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan27-video-duration-select',
      ariaLabel: 'Select Wan 2.7 duration',
      options: wan27DurationOptions.map(option => ({ value: option.value, label: option.label })),
      value: wan27VideoDuration,
      onChange: onWan27VideoDurationChange,
      disabled: isLoading,
    });

    if (isWan27EditMode) {
      controls.push({
        id: 'wan27-video-audio-setting-select',
        prefixLabel: 'Audio',
        ariaLabel: 'Select Wan 2.7 edit audio handling',
        options: WAN_27_VIDEO_AUDIO_SETTING_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: wan27VideoAudioSetting,
        onChange: onWan27VideoAudioSettingChange,
        disabled: isLoading,
      });
    }

    if (!isWan27ReferenceMode && !isWan27EditMode) {
      controls.push({
        id: 'wan27-video-prompt-expansion-select',
        prefixLabel: 'Prompt+',
        ariaLabel: 'Toggle Wan 2.7 prompt expansion',
        options: WAN_27_VIDEO_PROMPT_EXPANSION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
        value: wan27VideoPromptExpansion ? 'true' : 'false',
        onChange: (value: string) => onWan27VideoPromptExpansionChange(value === 'true'),
        disabled: isLoading,
      });
    }
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

  if (isMiniMaxH3VideoModel) {
    controls.push(...buildMiniMaxH3PromptBarControls({
      idPrefix: controlIdPrefix,
      variant: miniMaxH3Variant,
      aspectRatio: miniMaxH3AspectRatio,
      duration: miniMaxH3Duration,
      usesSourceAspectRatio: miniMaxH3UsesSourceAspectRatio,
      isLoading,
      onVariantChange: onMiniMaxH3VariantChange,
      onAspectRatioChange: onMiniMaxH3AspectRatioChange,
      onDurationChange: onMiniMaxH3DurationChange,
    }));
  }

  if (isSeedance2VideoModel) {
    controls.push(...buildSeedance2PromptBarControls({
      idPrefix: controlIdPrefix,
      seedance2Variant,
      seedance2JimengModelVersion,
      seedance2AspectRatio,
      seedance2Resolution,
      seedance2Duration,
      seedance2GenerateAudio,
      seedance2CameraFixed,
      showCameraFixed: !isFalSeedance2VideoModel && !isJimengSeedance2VideoModel,
      showJimengModelVersion: isJimengSeedance2VideoModel,
      showAudio: !isJimengSeedance2VideoModel,
      allowFullResolution: isFalSeedance2VideoModel,
      isLoading,
      onSeedance2VariantChange: value => onSeedance2VariantChange(value),
      onSeedance2JimengModelVersionChange: value => onSeedance2JimengModelVersionChange(value),
      onSeedance2AspectRatioChange: value => onSeedance2AspectRatioChange(value),
      onSeedance2ResolutionChange: value => onSeedance2ResolutionChange(value),
      onSeedance2DurationChange: value => onSeedance2DurationChange(value),
      onSeedance2GenerateAudioChange,
      onSeedance2CameraFixedChange,
    }));
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

  if (!isVideoMode && usingFal && isRecraftV4ProModel(falModelId)) {
    controls.push({
      id: 'recraft-image-size-select',
      prefixLabel: 'Image Size',
      ariaLabel: 'Select Recraft image size',
      options: RECRAFT_V4_PRO_IMAGE_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: recraftImageSize,
      onChange: onRecraftImageSizeChange,
      disabled: isLoading,
    });

    controls.push({
      kind: 'color',
      id: 'recraft-background-color-picker',
      prefixLabel: 'BG',
      ariaLabel: 'Select Recraft background color',
      value: recraftRgbToHex(recraftBackgroundColor),
      onChange: onRecraftBackgroundColorChange,
      disabled: isLoading,
    });

    recraftColors.slice(0, RECRAFT_V4_PRO_MAX_COLORS).forEach((color, index) => {
      controls.push({
        kind: 'color',
        id: `recraft-color-${index + 1}-picker`,
        prefixLabel: `C${index + 1}`,
        ariaLabel: `Select Recraft preferred color ${index + 1}`,
        value: recraftRgbToHex(color),
        onChange: (value: string) => onRecraftColorChange(index, value),
        disabled: isLoading,
      });
    });

    if (recraftColors.length < RECRAFT_V4_PRO_MAX_COLORS) {
      controls.push({
        kind: 'action',
        id: 'recraft-add-color-button',
        label: '+ Color',
        ariaLabel: 'Add Recraft preferred color',
        onClick: onRecraftAddColor,
        disabled: isLoading,
      });
    }

    if (recraftColors.length > 0) {
      controls.push({
        kind: 'action',
        id: 'recraft-remove-color-button',
        label: '- Color',
        ariaLabel: 'Remove Recraft preferred color',
        onClick: onRecraftRemoveColor,
        disabled: isLoading,
      });
    }
  }

  // Wan 2.7 Pro Image controls
  if (!isVideoMode && usingFal && isWan27ImageModel) {
    controls.push({
      id: 'wan27-image-max-images-select',
      prefixLabel: 'Images',
      ariaLabel: 'Select number of images to generate',
      options: WAN_27_IMAGE_MAX_IMAGES_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan27ImageMaxImages,
      onChange: onWan27ImageMaxImagesChange,
      disabled: isLoading,
    });

    controls.push({
      id: 'wan27-image-aspect-ratio-select',
      prefixLabel: 'Aspect Ratio',
      ariaLabel: 'Select output aspect ratio',
      options: WAN_27_IMAGE_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: wan27ImageAspectRatio,
      onChange: onWan27ImageAspectRatioChange,
      disabled: isLoading,
    });
  }

  const isGrokImagineModel = !isVideoMode && falModelId === GROK_IMAGINE_IMAGE_MODEL_ID; // Grok text-to-image model.
  const isSeedreamV5Lite = isSeedreamV5LiteModelId(falModelId); // Seedream 5 Lite uses stricter controls.
  const isSeedreamV5Pro = isSeedreamV5ProModelId(falModelId); // Seedream 5 Pro uses Pro controls.
  const shouldShowSeedreamImageSizeControl = apiProvider === 'fal' && isSeedreamModel; // Show size picker for all Seedream models.
  if (shouldShowSeedreamImageSizeControl) {
    const seedreamImageSizeOptions = getSeedreamImageSizeOptions(falModelId);
    controls.push({
      id: 'fal-image-size-select',
      prefixLabel: isSeedreamV5Pro ? 'Size' : isSeedreamV5Lite ? 'Image Size' : undefined,
      ariaLabel: 'Select Seedream image size',
      options: seedreamImageSizeOptions.map(option => ({ value: option.value, label: option.label })),
      value: falImageSizeSelection,
      onChange: onFalImageSizeChange,
      disabled: isLoading,
    });
  }

  const shouldShowGptImage2ImageControls = apiProvider === 'fal' && isGptImage2Model;
  if (shouldShowGptImage2ImageControls) {
    controls.push({
      id: 'fal-gpt-image-2-size-select',
      prefixLabel: 'Size',
      ariaLabel: 'Select GPT Image 2 image size',
      options: GPT_IMAGE_2_IMAGE_SIZE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: falImageSizeSelection,
      onChange: onFalImageSizeChange,
      disabled: isLoading,
    });
    controls.push({
      id: 'fal-gpt-image-2-quality-select',
      prefixLabel: 'Quality',
      ariaLabel: 'Select GPT Image 2 quality',
      options: GPT_IMAGE_2_QUALITY_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: gptImage2Quality,
      onChange: onGptImage2QualityChange,
      disabled: isLoading,
    });
  }

  const shouldShowKrea2Controls = apiProvider === 'fal' && isKrea2LargeModel;
  if (shouldShowKrea2Controls) {
    controls.push({
      id: 'fal-krea-2-aspect-ratio-select',
      prefixLabel: 'AR',
      ariaLabel: 'Select Krea 2 Large aspect ratio',
      options: KREA_2_ASPECT_RATIO_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: krea2AspectRatio,
      onChange: onKrea2AspectRatioChange,
      disabled: isLoading,
    });
    controls.push({
      id: 'fal-krea-2-creativity-select',
      prefixLabel: 'Creativity',
      ariaLabel: 'Select Krea 2 Large creativity',
      options: KREA_2_CREATIVITY_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: krea2Creativity,
      onChange: onKrea2CreativityChange,
      disabled: isLoading,
    });
  }

  const supportsAspectRatioControl = isNanoBananaModel
    || isGrokImagineModel // Grok aspect ratio support.
    || (isSeedreamModel && !shouldShowSeedreamImageSizeControl); // Include Grok for AR control.
  const shouldShowAspectRatioControl = supportsAspectRatioControl && (apiProvider === 'fal' || !isVideoMode);
  if (shouldShowAspectRatioControl) {
    const aspectRatioOptions = isNanoBananaModel
      ? FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS
      : isGrokImagineModel // Grok aspect ratio branch.
        ? FAL_GROK_ASPECT_RATIO_OPTIONS // Grok aspect ratio options.
        : getSeedreamAspectRatioOptions(falModelId);
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

  const shouldShowResolutionControl = apiProvider === 'fal' && isNanoBananaModel;
  if (shouldShowResolutionControl) {
    controls.push({
      id: 'fal-resolution-select',
      ariaLabel: 'Select resolution',
      options: FAL_RESOLUTION_OPTIONS.map(option => ({ value: option.value, label: option.label })),
      value: falResolutionSelection,
      onChange: onFalResolutionChange,
      disabled: isLoading,
    });
  }

  const shouldShowNumImagesControl = apiProvider === 'fal'
    && !isVideoMode
    && (isSeedreamModel || isNanoBananaModel || isGrokImagineModel || isGptImage2Model); // Include GPT Image 2 for Num control.
  if (shouldShowNumImagesControl) {
    const falNumImageMax = getFalNumImageMaxForModel(falModelId); // Match validation text to model limits.
    const falNumImageOptions = getFalNumImageOptionsForModel(falModelId); // Match picker values to model limits.
    controls.push({
      id: 'fal-num-images-select',
      prefixLabel: isSeedreamV5Lite || isSeedreamV5Pro ? 'Images' : (isGrokImagineModel ? 'Num' : undefined), // Seedream 5 uses prefixed controls.
      ariaLabel: 'Select number of images to generate',
      options: falNumImageOptions.map(option => ({ value: `${option}`, label: `${option}` })),
      value: falNumImages.toString(),
      onChange: (value: string) => onFalNumImagesChange(Number(value)),
      disabled: isLoading,
      errorMessage: shouldValidateFalOptions && isNumImagesInvalid ? `Num images must be between 1 and ${falNumImageMax}.` : undefined,
    });
  }

  return controls.length > 0 ? controls : undefined;
};

export const getPromptBarModelOptions = (mode: FalModelMode): ReadonlyArray<FalModelOption> =>
  mode === 'video' ? FAL_VIDEO_MODEL_OPTIONS : FAL_IMAGE_MODEL_OPTIONS;

export const shouldShowKlingNegativePrompt = (falModelId: FalVideoModelId | string): boolean =>
  falModelId === KLING_VIDEO_MODEL_ID || falModelId === KLING_V3_VIDEO_MODEL_ID || falModelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
