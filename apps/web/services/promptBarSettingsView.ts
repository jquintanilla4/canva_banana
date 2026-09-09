import type { PromptBarControlsInput } from './promptBarConfig';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  getVolcengineSafeSeedance2Settings,
  isGptImage2EditModelId,
  isJimengSeedance2VideoModel,
  isKlingO3VideoModelId,
  isKrea2LargeModel as isKrea2LargeModelId,
  isNanoBananaEditModelId,
  isSeedance2OutputFormatSelectionValue,
  isSeedance2VideoModel as isSeedance2VideoModelId,
  isSeedance2VolcengineModel,
  isSeedreamModelId,
  normalizeMiniMaxH3AspectRatioForVariant,
  type FalModelId,
  type FalModelMode,
} from './modelConfig';
import type { UseFalSettingsResult } from '../hooks/useFalSettings';
import type { CanvasVideoPromptBar, VideoPromptAreaMembership } from '../types';
import {
  buildEmbeddedFlux3PromptState,
  updateEmbeddedFlux3Duration,
  updateEmbeddedFlux3KeyframeTiming,
  updateEmbeddedFlux3Variant,
} from '../utils/embeddedFlux3';
import { getEmbeddedVideoPromptBarModelId } from '../utils/videoPromptAreas';
import { getJimengSafeSeedance2Resolution } from '../utils/embeddedVideoRouting';

// -----------------------------------------------------------------------------------
// Single source for assembling PromptBarControlsInput.
//
// The footer prompt bar reads live useFalSettings state; embedded canvas prompt bars
// overlay their own persisted options (bar.falOptions and legacy bar fields) on top of
// it. Both views used to be ~215-key literals in App.tsx that had to be edited in
// lockstep for every new model. Model flags now derive from the modelId in one place,
// and each site only supplies its value source and handler adapter.
// -----------------------------------------------------------------------------------

type PromptBarModelFlagKey =
  | 'isVideoMode' | 'usingFal' | 'isSeedreamModel' | 'isNanoBananaModel' | 'isKrea2LargeModel'
  | 'isFlux2MaxModel' | 'isWan27ImageModel' | 'isGptImage2Model' | 'isUpscaleModel'
  | 'isKlingVideoModel' | 'isKlingV3VideoModel' | 'isKlingO3VideoModel' | 'isKlingV3ControlVideoModel'
  | 'isWanAnimateVideoModel' | 'isLipsyncVideoModel' | 'isHeygenV3LipsyncVideoModel'
  | 'isInfinitalkVideoModel' | 'isGrokImagineVideoModel' | 'isVeo31VideoModel' | 'isWan27VideoModel'
  | 'isMiniMaxH3VideoModel' | 'isFlux3VideoModel' | 'isSeedance15VideoModel' | 'isSeedance2VideoModel'
  | 'isFalSeedance2VideoModel' | 'isSeedance25VideoModel' | 'isJimengSeedance2VideoModel'
  | 'isJimengSeedance25VideoModel' | 'isJimengMultiframeVideoModel';

export type PromptBarModelFlags = Pick<PromptBarControlsInput, PromptBarModelFlagKey>;

// Every model flag derives from the active model id, matching the useFalSettings
// derivations. All flags are mode-gated: a stale video-mode selection can no longer
// leak video controls into image mode (previously possible for the Jimeng flags).
export const derivePromptBarModelFlags = (
  apiProvider: 'google' | 'fal',
  modelId: string,
  modelMode: FalModelMode,
): PromptBarModelFlags => {
  const isVideoMode = modelMode === 'video';
  return {
    isVideoMode,
    usingFal: apiProvider === 'fal',
    isSeedreamModel: !isVideoMode && isSeedreamModelId(modelId as FalModelId),
    isNanoBananaModel: !isVideoMode && isNanoBananaEditModelId(modelId),
    isGptImage2Model: !isVideoMode && isGptImage2EditModelId(modelId),
    isKrea2LargeModel: apiProvider === 'fal' && !isVideoMode && isKrea2LargeModelId(modelId), // Krea behavior only applies while Fal is active.
    isFlux2MaxModel: !isVideoMode && modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
    isWan27ImageModel: !isVideoMode && modelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
    isUpscaleModel: !isVideoMode && (modelId === CRYSTAL_UPSCALER_MODEL_ID || modelId === SEEDVR_UPSCALER_MODEL_ID),
    isKlingVideoModel: isVideoMode && modelId === KLING_VIDEO_MODEL_ID,
    isKlingV3VideoModel: isVideoMode && modelId === KLING_V3_VIDEO_MODEL_ID,
    isKlingO3VideoModel: isVideoMode && isKlingO3VideoModelId(modelId),
    isKlingV3ControlVideoModel: isVideoMode && modelId === KLING_V3_CONTROL_VIDEO_MODEL_ID,
    isWanAnimateVideoModel: isVideoMode && modelId === WAN_ANIMATE_MODEL_ID,
    isLipsyncVideoModel: isVideoMode && modelId === SYNC_LIPSYNC_MODEL_ID,
    isHeygenV3LipsyncVideoModel: isVideoMode && modelId === HEYGEN_V3_LIPSYNC_MODEL_ID,
    isInfinitalkVideoModel: isVideoMode && modelId === INFINITALK_VIDEO_MODEL_ID,
    isGrokImagineVideoModel: isVideoMode && modelId === GROK_IMAGINE_VIDEO_MODEL_ID,
    isVeo31VideoModel: isVideoMode && modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
    isWan27VideoModel: isVideoMode && modelId === WAN_27_VIDEO_MODEL_ID,
    isMiniMaxH3VideoModel: isVideoMode && modelId === MINIMAX_H3_VIDEO_MODEL_ID,
    isFlux3VideoModel: isVideoMode && modelId === FLUX_3_VIDEO_MODEL_ID,
    isSeedance15VideoModel: isVideoMode && modelId === SEEDANCE_15_VIDEO_MODEL_ID,
    isSeedance2VideoModel: isVideoMode && isSeedance2VideoModelId(modelId),
    isFalSeedance2VideoModel: isVideoMode && modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID,
    isSeedance25VideoModel: isVideoMode && (modelId === FAL_SEEDANCE_25_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID),
    isJimengSeedance2VideoModel: isVideoMode && (
      isJimengSeedance2VideoModel(modelId)
      || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID
      || modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID
    ),
    isJimengSeedance25VideoModel: isVideoMode && modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
    isJimengMultiframeVideoModel: isVideoMode && modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  };
};

const PROMPT_BAR_VALUE_KEYS = [
  'falVideoDuration', 'klingVariant',
  'klingV3Duration', 'klingV3GenerateAudio', 'klingV3CfgScale', 'klingV3MultiPromptEnabled', 'klingV3Shot1Duration', 'klingV3Shot2Duration',
  'klingO3Variant', 'klingO3Duration', 'klingO3GenerateAudio', 'klingO3KeepAudio',
  'klingV3ControlKeepSound', 'klingV3ControlOrientation',
  'wanTargetResolution', 'wanCreativity',
  'wanAnimateVariant', 'wanAnimateSteps', 'wanAnimateResolution', 'wanAnimateShift', 'wanAnimateQuality', 'wanAnimateUseTurbo',
  'lipsyncSyncMode',
  'heygenEnableCaption', 'heygenEnableDynamicDuration', 'heygenDisableMusicTrack', 'heygenEnableSpeechEnhancement',
  'infinitalkResolution', 'infinitalkSeed', 'infinitalkAcceleration', 'infinitalkDuration',
  'grokImagineVideoDuration', 'grokImagineVideoResolution', 'grokImagineVideoAspectRatio',
  'veo31Variant', 'veo31Duration', 'veo31Resolution', 'veo31AspectRatio', 'veo31GenerateAudio',
  'wan27VideoResolution', 'wan27VideoDuration', 'wan27VideoAspectRatio', 'wan27VideoPromptExpansion', 'wan27VideoVariant', 'wan27VideoAudioSetting',
  'miniMaxH3Variant', 'miniMaxH3AspectRatio', 'miniMaxH3Duration',
  'flux3Variant', 'flux3AspectRatio', 'flux3Resolution', 'flux3Duration', 'flux3GenerateAudio', 'flux3KeyframeTimings',
  'seedance15AspectRatio', 'seedance15Resolution', 'seedance15Duration', 'seedance15CameraFixed', 'seedance15Audio',
  'seedance2Variant', 'seedance2JimengModelVersion', 'seedance2VolcengineModel',
  'seedance2AspectRatio', 'seedance2Resolution', 'seedance2Duration',
  'jimengMultiframeDuration', 'jimengMultiframeResolution',
  'seedance2GenerateAudio', 'seedance2CameraFixed', 'seedance2OutputFormat',
  'seedance25Variant', 'seedance25AspectRatio', 'seedance25Resolution', 'seedance25Duration', 'seedance25GenerateAudio',
  'flux2MaxImageSize', 'wan27ImageAspectRatio', 'wan27ImageMaxImages',
  'recraftImageSize', 'recraftBackgroundColor', 'recraftColors',
  'gptImage25Variant', 'gptImage25Background', 'gptImage25Quality', 'gptImage2Quality', 'krea2AspectRatio', 'krea2Creativity',
  'falScaleFactor', 'falCreativity', 'falNoiseScale',
  'falImageSizeSelection', 'falAspectRatioSelection', 'falResolutionSelection', 'falNumImages',
] as const;

type PromptBarValueKey = typeof PROMPT_BAR_VALUE_KEYS[number];
export type PromptBarSettingsValues = Pick<PromptBarControlsInput, PromptBarValueKey>;

type PromptBarHandlerKey = Extract<keyof PromptBarControlsInput, `on${string}`>;
export type PromptBarHandlerSet = Pick<PromptBarControlsInput, PromptBarHandlerKey>;

// The footer bar reads every value straight from live fal state — key names match 1:1.
const pickFooterPromptBarValues = (fal: UseFalSettingsResult): PromptBarSettingsValues => {
  const values = {} as { [Key in PromptBarValueKey]: PromptBarSettingsValues[Key] };
  for (const key of PROMPT_BAR_VALUE_KEYS) {
    (values as Record<string, unknown>)[key] = fal[key];
  }
  return values;
};

// Embedded bars overlay their persisted state on top of fal state. Precedence per
// field: legacy bar field (older snapshots/tests) > bar.falOptions > embedded default
// or live fal state. Image-model values pass through fal untouched — image branches
// are unreachable for video-only embedded bars.
const buildEmbeddedPromptBarValues = (
  bar: CanvasVideoPromptBar,
  fal: UseFalSettingsResult,
): PromptBarSettingsValues => {
  const options = bar.falOptions ?? {};
  return {
    falVideoDuration: options.videoDuration ?? fal.falVideoDuration,
    klingVariant: options.klingVariant ?? fal.klingVariant,
    klingV3Duration: bar.klingV3Duration ?? options.klingV3Duration ?? '5',
    klingV3GenerateAudio: bar.klingV3GenerateAudio ?? options.klingV3GenerateAudio ?? true,
    klingV3CfgScale: bar.klingV3CfgScale ?? options.klingV3CfgScale ?? '0.5',
    klingV3MultiPromptEnabled: bar.klingV3MultiPromptEnabled ?? options.klingV3MultiPromptEnabled ?? false,
    klingV3Shot1Duration: bar.klingV3Shot1Duration ?? options.klingV3Shot1Duration ?? '5',
    klingV3Shot2Duration: bar.klingV3Shot2Duration ?? options.klingV3Shot2Duration ?? '5',
    klingO3Variant: options.klingO3Variant ?? fal.klingO3Variant,
    klingO3Duration: options.klingO3Duration ?? fal.klingO3Duration,
    klingO3GenerateAudio: options.klingO3GenerateAudio ?? fal.klingO3GenerateAudio,
    klingO3KeepAudio: options.klingO3KeepAudio ?? fal.klingO3KeepAudio,
    klingV3ControlKeepSound: options.klingV3ControlKeepSound ?? fal.klingV3ControlKeepSound,
    klingV3ControlOrientation: options.klingV3ControlOrientation ?? fal.klingV3ControlOrientation,
    wanTargetResolution: options.wanTargetResolution ?? fal.wanTargetResolution,
    wanCreativity: options.wanCreativity ?? fal.wanCreativity,
    wanAnimateVariant: options.wanAnimateVariant ?? fal.wanAnimateVariant,
    wanAnimateSteps: options.wanAnimateSteps ?? fal.wanAnimateSteps,
    wanAnimateResolution: options.wanAnimateResolution ?? fal.wanAnimateResolution,
    wanAnimateShift: options.wanAnimateShift ?? fal.wanAnimateShift,
    wanAnimateQuality: options.wanAnimateQuality ?? fal.wanAnimateQuality,
    wanAnimateUseTurbo: options.wanAnimateUseTurbo ?? fal.wanAnimateUseTurbo,
    lipsyncSyncMode: options.lipsyncSyncMode ?? fal.lipsyncSyncMode,
    heygenEnableCaption: options.heygenEnableCaption ?? fal.heygenEnableCaption,
    heygenEnableDynamicDuration: options.heygenEnableDynamicDuration ?? fal.heygenEnableDynamicDuration,
    heygenDisableMusicTrack: options.heygenDisableMusicTrack ?? fal.heygenDisableMusicTrack,
    heygenEnableSpeechEnhancement: options.heygenEnableSpeechEnhancement ?? fal.heygenEnableSpeechEnhancement,
    infinitalkResolution: options.infinitalkResolution ?? fal.infinitalkResolution,
    infinitalkSeed: options.infinitalkSeed ?? fal.infinitalkSeed,
    infinitalkAcceleration: options.infinitalkAcceleration ?? fal.infinitalkAcceleration,
    infinitalkDuration: options.infinitalkDuration ?? fal.infinitalkDuration,
    grokImagineVideoDuration: options.grokImagineVideoDuration ?? fal.grokImagineVideoDuration,
    grokImagineVideoResolution: options.grokImagineVideoResolution ?? fal.grokImagineVideoResolution,
    grokImagineVideoAspectRatio: options.grokImagineVideoAspectRatio ?? fal.grokImagineVideoAspectRatio,
    veo31Variant: options.veo31Variant ?? fal.veo31Variant,
    veo31Duration: options.veo31Duration ?? fal.veo31Duration,
    veo31Resolution: options.veo31Resolution ?? fal.veo31Resolution,
    veo31AspectRatio: options.veo31AspectRatio ?? fal.veo31AspectRatio,
    veo31GenerateAudio: options.veo31GenerateAudio ?? fal.veo31GenerateAudio,
    wan27VideoResolution: options.wan27VideoResolution ?? fal.wan27VideoResolution,
    wan27VideoDuration: options.wan27VideoDuration ?? fal.wan27VideoDuration,
    wan27VideoAspectRatio: options.wan27VideoAspectRatio ?? fal.wan27VideoAspectRatio,
    wan27VideoPromptExpansion: options.wan27VideoPromptExpansion ?? fal.wan27VideoPromptExpansion,
    wan27VideoVariant: options.wan27VideoVariant ?? fal.wan27VideoVariant,
    wan27VideoAudioSetting: options.wan27VideoAudioSetting ?? fal.wan27VideoAudioSetting,
    miniMaxH3Variant: options.miniMaxH3Variant ?? 'reference',
    miniMaxH3AspectRatio: options.miniMaxH3AspectRatio ?? 'adaptive',
    miniMaxH3Duration: options.miniMaxH3Duration ?? '5',
    flux3Variant: fal.flux3Variant, // Overridden below by the embedded Flux 3 state.
    flux3AspectRatio: fal.flux3AspectRatio,
    flux3Resolution: fal.flux3Resolution,
    flux3Duration: fal.flux3Duration,
    flux3GenerateAudio: fal.flux3GenerateAudio,
    flux3KeyframeTimings: fal.flux3KeyframeTimings,
    seedance15AspectRatio: options.seedance15AspectRatio ?? fal.seedance15AspectRatio,
    seedance15Resolution: options.seedance15Resolution ?? fal.seedance15Resolution,
    seedance15Duration: options.seedance15Duration ?? fal.seedance15Duration,
    seedance15CameraFixed: options.seedance15CameraFixed ?? fal.seedance15CameraFixed,
    seedance15Audio: options.seedance15Audio ?? fal.seedance15Audio,
    seedance2Variant: bar.seedance2Variant,
    seedance2JimengModelVersion: bar.seedance2JimengModelVersion ?? options.seedance2JimengModelVersion ?? fal.seedance2JimengModelVersion,
    seedance2VolcengineModel: bar.seedance2VolcengineModel ?? options.seedance2VolcengineModel ?? fal.seedance2VolcengineModel,
    seedance2AspectRatio: bar.seedance2AspectRatio ?? '16:9',
    seedance2Resolution: bar.seedance2Resolution ?? '720p',
    seedance2Duration: bar.seedance2Duration ?? '5',
    jimengMultiframeDuration: options.multiframeDuration ?? fal.jimengMultiframeDuration,
    jimengMultiframeResolution: options.multiframeResolution ?? fal.jimengMultiframeResolution,
    seedance2GenerateAudio: bar.seedance2GenerateAudio,
    seedance2CameraFixed: bar.seedance2CameraFixed,
    seedance2OutputFormat: bar.seedance2OutputFormat ?? fal.seedance2OutputFormat,
    seedance25Variant: options.seedance25Variant ?? 'reference',
    seedance25AspectRatio: options.seedance25AspectRatio ?? 'adaptive',
    seedance25Resolution: options.seedance25Resolution ?? '720p',
    seedance25Duration: options.seedance25Duration ?? 'auto',
    seedance25GenerateAudio: options.seedance25GenerateAudio ?? true,
    flux2MaxImageSize: fal.flux2MaxImageSize,
    wan27ImageAspectRatio: fal.wan27ImageAspectRatio,
    wan27ImageMaxImages: fal.wan27ImageMaxImages,
    recraftImageSize: fal.recraftImageSize,
    recraftBackgroundColor: fal.recraftBackgroundColor,
    recraftColors: fal.recraftColors,
    gptImage2Quality: fal.gptImage2Quality,
    gptImage25Quality: fal.gptImage25Quality,
    gptImage25Background: fal.gptImage25Background,
    gptImage25Variant: fal.gptImage25Variant,
    krea2AspectRatio: fal.krea2AspectRatio,
    krea2Creativity: fal.krea2Creativity,
    falScaleFactor: fal.falScaleFactor,
    falCreativity: fal.falCreativity,
    falNoiseScale: fal.falNoiseScale,
    falImageSizeSelection: fal.falImageSizeSelection,
    falAspectRatioSelection: fal.falAspectRatioSelection,
    falResolutionSelection: fal.falResolutionSelection,
    falNumImages: fal.falNumImages,
  };
};

type FooterFlux3Handlers = {
  onFlux3DurationChange: (value: string) => void;
  onFlux3KeyframeTimingChange: (imageId: string, timestampSeconds: number) => void;
};

// Footer handlers map straight onto the useFalSettings handler surface; Flux 3
// duration/keyframe edits run through useFlux3PromptState instead.
const createFooterPromptBarHandlers = (
  fal: UseFalSettingsResult,
  flux3: FooterFlux3Handlers,
): PromptBarHandlerSet => ({
  onFalVideoDurationChange: fal.handleFalVideoDurationChange,
  onKlingVariantChange: fal.handleKlingVariantChange,
  onKlingV3DurationChange: fal.handleKlingV3DurationChange,
  onKlingV3GenerateAudioChange: fal.handleKlingV3GenerateAudioChange,
  onKlingV3CfgScaleChange: fal.handleKlingV3CfgScaleChange,
  onKlingV3MultiPromptEnabledChange: fal.handleKlingV3MultiPromptEnabledChange,
  onKlingV3Shot1DurationChange: fal.handleKlingV3Shot1DurationChange,
  onKlingV3Shot2DurationChange: fal.handleKlingV3Shot2DurationChange,
  onKlingO3VariantChange: fal.handleKlingO3VariantChange,
  onKlingO3DurationChange: fal.handleKlingO3DurationChange,
  onKlingO3GenerateAudioChange: fal.handleKlingO3GenerateAudioChange,
  onKlingO3KeepAudioChange: fal.handleKlingO3KeepAudioChange,
  onKlingV3ControlKeepSoundChange: fal.handleKlingV3ControlKeepSoundChange,
  onKlingV3ControlOrientationChange: fal.handleKlingV3ControlOrientationChange,
  onWanTargetResolutionChange: fal.handleWanTargetResolutionChange,
  onWanCreativityChange: fal.handleWanCreativityChange,
  onWanAnimateVariantChange: fal.handleWanAnimateVariantChange,
  onWanAnimateStepsChange: fal.handleWanAnimateStepsChange,
  onWanAnimateResolutionChange: fal.handleWanAnimateResolutionChange,
  onWanAnimateShiftChange: fal.handleWanAnimateShiftChange,
  onWanAnimateQualityChange: fal.handleWanAnimateQualityChange,
  onWanAnimateTurboChange: fal.handleWanAnimateTurboChange,
  onLipsyncSyncModeChange: fal.handleLipsyncSyncModeChange,
  onHeygenEnableCaptionChange: fal.handleHeygenEnableCaptionChange,
  onHeygenEnableDynamicDurationChange: fal.handleHeygenEnableDynamicDurationChange,
  onHeygenDisableMusicTrackChange: fal.handleHeygenDisableMusicTrackChange,
  onHeygenEnableSpeechEnhancementChange: fal.handleHeygenEnableSpeechEnhancementChange,
  onInfinitalkResolutionChange: fal.handleInfinitalkResolutionChange,
  onInfinitalkSeedChange: fal.handleInfinitalkSeedChange,
  onInfinitalkAccelerationChange: fal.handleInfinitalkAccelerationChange,
  onInfinitalkDurationChange: fal.handleInfinitalkDurationChange,
  onGrokImagineVideoDurationChange: fal.handleGrokImagineVideoDurationChange,
  onGrokImagineVideoResolutionChange: fal.handleGrokImagineVideoResolutionChange,
  onGrokImagineVideoAspectRatioChange: fal.handleGrokImagineVideoAspectRatioChange,
  onVeo31VariantChange: fal.handleVeo31VariantChange,
  onVeo31DurationChange: fal.handleVeo31DurationChange,
  onVeo31ResolutionChange: fal.handleVeo31ResolutionChange,
  onVeo31AspectRatioChange: fal.handleVeo31AspectRatioChange,
  onVeo31GenerateAudioChange: fal.handleVeo31GenerateAudioChange,
  onWan27VideoResolutionChange: fal.handleWan27VideoResolutionChange,
  onWan27VideoDurationChange: fal.handleWan27VideoDurationChange,
  onWan27VideoAspectRatioChange: fal.handleWan27VideoAspectRatioChange,
  onWan27VideoPromptExpansionChange: fal.handleWan27VideoPromptExpansionChange,
  onWan27VideoVariantChange: fal.handleWan27VideoVariantChange,
  onWan27VideoAudioSettingChange: fal.handleWan27VideoAudioSettingChange,
  onMiniMaxH3VariantChange: fal.handleMiniMaxH3VariantChange,
  onMiniMaxH3AspectRatioChange: fal.handleMiniMaxH3AspectRatioChange,
  onMiniMaxH3DurationChange: fal.handleMiniMaxH3DurationChange,
  onFlux3VariantChange: fal.handleFlux3VariantChange,
  onFlux3AspectRatioChange: fal.handleFlux3AspectRatioChange,
  onFlux3ResolutionChange: fal.handleFlux3ResolutionChange,
  onFlux3DurationChange: flux3.onFlux3DurationChange,
  onFlux3GenerateAudioChange: fal.handleFlux3GenerateAudioChange,
  onFlux3KeyframeTimingChange: flux3.onFlux3KeyframeTimingChange,
  onSeedance15AspectRatioChange: fal.handleSeedance15AspectRatioChange,
  onSeedance15ResolutionChange: fal.handleSeedance15ResolutionChange,
  onSeedance15DurationChange: fal.handleSeedance15DurationChange,
  onSeedance15CameraFixedChange: fal.handleSeedance15CameraFixedChange,
  onSeedance15AudioChange: fal.handleSeedance15AudioChange,
  onSeedance2VariantChange: fal.handleSeedance2VariantChange,
  onSeedance2JimengModelVersionChange: fal.handleSeedance2JimengModelVersionChange,
  onSeedance2VolcengineModelChange: fal.handleSeedance2VolcengineModelChange,
  onSeedance2AspectRatioChange: fal.handleSeedance2AspectRatioChange,
  onSeedance2ResolutionChange: fal.handleSeedance2ResolutionChange,
  onSeedance2DurationChange: fal.handleSeedance2DurationChange,
  onJimengMultiframeDurationChange: fal.setJimengMultiframeDuration,
  onJimengMultiframeResolutionChange: fal.setJimengMultiframeResolution,
  onSeedance2GenerateAudioChange: fal.handleSeedance2GenerateAudioChange,
  onSeedance2CameraFixedChange: fal.handleSeedance2CameraFixedChange,
  onSeedance2OutputFormatChange: fal.handleSeedance2OutputFormatChange,
  onSeedance25VariantChange: fal.handleSeedance25VariantChange,
  onSeedance25AspectRatioChange: fal.handleSeedance25AspectRatioChange,
  onSeedance25ResolutionChange: fal.handleSeedance25ResolutionChange,
  onSeedance25DurationChange: fal.handleSeedance25DurationChange,
  onSeedance25GenerateAudioChange: fal.handleSeedance25GenerateAudioChange,
  onFlux2MaxImageSizeChange: fal.handleFlux2MaxImageSizeChange,
  onWan27ImageAspectRatioChange: fal.handleWan27ImageAspectRatioChange,
  onWan27ImageMaxImagesChange: fal.handleWan27ImageMaxImagesChange,
  onRecraftImageSizeChange: fal.handleRecraftImageSizeChange,
  onRecraftBackgroundColorChange: fal.handleRecraftBackgroundColorChange,
  onRecraftColorChange: fal.handleRecraftColorChange,
  onRecraftAddColor: fal.handleRecraftAddColor,
  onRecraftRemoveColor: fal.handleRecraftRemoveColor,
  onGptImage2QualityChange: fal.handleGptImage2QualityChange,
  onGptImage25QualityChange: fal.handleGptImage25QualityChange,
  onGptImage25BackgroundChange: fal.handleGptImage25BackgroundChange,
  onGptImage25VariantChange: fal.handleGptImage25VariantChange,
  onKrea2AspectRatioChange: fal.handleKrea2AspectRatioChange,
  onKrea2CreativityChange: fal.handleKrea2CreativityChange,
  onFalScaleFactorChange: fal.handleFalScaleFactorChange,
  onFalCreativityChange: fal.handleFalCreativityChange,
  onFalNoiseScaleChange: fal.handleFalNoiseScaleChange,
  onFalImageSizeChange: fal.handleFalImageSizeChange,
  onFalAspectRatioChange: fal.handleFalAspectRatioChange,
  onFalResolutionChange: fal.handleFalResolutionChange,
  onFalNumImagesChange: fal.handleFalNumImagesChange,
});

export type EmbeddedPromptBarUpdate = (
  barId: string,
  updater: (bar: CanvasVideoPromptBar) => CanvasVideoPromptBar,
) => void;

const NOOP = () => {};

// Embedded handlers persist edits on the bar itself. Simple controls write one
// falOptions key; Kling V3/Seedance 2 legacy fields dual-write so existing snapshots
// and tests keep working; image-model handlers are inert for video-only bars.
const createEmbeddedPromptBarHandlers = (
  bar: CanvasVideoPromptBar,
  barMembership: VideoPromptAreaMembership | undefined,
  updateBar: EmbeddedPromptBarUpdate,
): PromptBarHandlerSet => {
  const updateFalOption = (key: keyof NonNullable<CanvasVideoPromptBar['falOptions']>, value: unknown) => {
    updateBar(bar.id, currentBar => ({
      ...currentBar,
      falOptions: { ...(currentBar.falOptions ?? {}), [key]: value },
    }));
  }; // Store embedded control edits with the bar.
  const updateLegacyAndFal = (patch: Partial<CanvasVideoPromptBar>, key: keyof NonNullable<CanvasVideoPromptBar['falOptions']>, value: unknown) => {
    updateBar(bar.id, currentBar => ({
      ...currentBar,
      ...patch,
      falOptions: { ...(currentBar.falOptions ?? {}), [key]: value },
    }));
  }; // Seedance/Kling legacy fields still drive existing snapshots/tests.

  return {
    onFalVideoDurationChange: value => updateFalOption('videoDuration', value),
    onKlingVariantChange: value => updateFalOption('klingVariant', value),
    onKlingV3DurationChange: value => updateLegacyAndFal({ klingV3Duration: value as CanvasVideoPromptBar['klingV3Duration'] }, 'klingV3Duration', value),
    onKlingV3GenerateAudioChange: value => updateLegacyAndFal({ klingV3GenerateAudio: value }, 'klingV3GenerateAudio', value),
    onKlingV3CfgScaleChange: value => updateLegacyAndFal({ klingV3CfgScale: value as CanvasVideoPromptBar['klingV3CfgScale'] }, 'klingV3CfgScale', value),
    onKlingV3MultiPromptEnabledChange: value => updateLegacyAndFal({ klingV3MultiPromptEnabled: value }, 'klingV3MultiPromptEnabled', value),
    onKlingV3Shot1DurationChange: value => updateLegacyAndFal({ klingV3Shot1Duration: value as CanvasVideoPromptBar['klingV3Shot1Duration'] }, 'klingV3Shot1Duration', value),
    onKlingV3Shot2DurationChange: value => updateLegacyAndFal({ klingV3Shot2Duration: value as CanvasVideoPromptBar['klingV3Shot2Duration'] }, 'klingV3Shot2Duration', value),
    onKlingO3VariantChange: value => updateFalOption('klingO3Variant', value),
    onKlingO3DurationChange: value => updateFalOption('klingO3Duration', value),
    onKlingO3GenerateAudioChange: value => updateFalOption('klingO3GenerateAudio', value),
    onKlingO3KeepAudioChange: value => updateFalOption('klingO3KeepAudio', value),
    onKlingV3ControlKeepSoundChange: value => updateFalOption('klingV3ControlKeepSound', value),
    onKlingV3ControlOrientationChange: value => updateFalOption('klingV3ControlOrientation', value),
    onWanTargetResolutionChange: value => updateFalOption('wanTargetResolution', value),
    onWanCreativityChange: value => updateFalOption('wanCreativity', Number(value)),
    onWanAnimateVariantChange: value => updateFalOption('wanAnimateVariant', value),
    onWanAnimateStepsChange: value => updateFalOption('wanAnimateSteps', value),
    onWanAnimateResolutionChange: value => updateFalOption('wanAnimateResolution', value),
    onWanAnimateShiftChange: value => updateFalOption('wanAnimateShift', value),
    onWanAnimateQualityChange: value => updateFalOption('wanAnimateQuality', value),
    onWanAnimateTurboChange: value => updateFalOption('wanAnimateUseTurbo', value),
    onLipsyncSyncModeChange: value => updateFalOption('lipsyncSyncMode', value),
    onHeygenEnableCaptionChange: value => updateFalOption('heygenEnableCaption', value),
    onHeygenEnableDynamicDurationChange: value => updateFalOption('heygenEnableDynamicDuration', value),
    onHeygenDisableMusicTrackChange: value => updateFalOption('heygenDisableMusicTrack', value),
    onHeygenEnableSpeechEnhancementChange: value => updateFalOption('heygenEnableSpeechEnhancement', value),
    onInfinitalkResolutionChange: value => updateFalOption('infinitalkResolution', value),
    onInfinitalkSeedChange: value => updateFalOption('infinitalkSeed', value),
    onInfinitalkAccelerationChange: value => updateFalOption('infinitalkAcceleration', value),
    onInfinitalkDurationChange: value => updateFalOption('infinitalkDuration', value),
    onGrokImagineVideoDurationChange: value => updateFalOption('grokImagineVideoDuration', value),
    onGrokImagineVideoResolutionChange: value => updateFalOption('grokImagineVideoResolution', value),
    onGrokImagineVideoAspectRatioChange: value => updateFalOption('grokImagineVideoAspectRatio', value),
    onVeo31VariantChange: value => updateFalOption('veo31Variant', value),
    onVeo31DurationChange: value => updateFalOption('veo31Duration', value),
    onVeo31ResolutionChange: value => updateFalOption('veo31Resolution', value),
    onVeo31AspectRatioChange: value => updateFalOption('veo31AspectRatio', value),
    onVeo31GenerateAudioChange: value => updateFalOption('veo31GenerateAudio', value),
    onWan27VideoResolutionChange: value => updateFalOption('wan27VideoResolution', value),
    onWan27VideoDurationChange: value => updateFalOption('wan27VideoDuration', value),
    onWan27VideoAspectRatioChange: value => updateFalOption('wan27VideoAspectRatio', value),
    onWan27VideoPromptExpansionChange: value => updateFalOption('wan27VideoPromptExpansion', value),
    onWan27VideoVariantChange: value => updateFalOption('wan27VideoVariant', value),
    onWan27VideoAudioSettingChange: value => updateFalOption('wan27VideoAudioSetting', value),
    onMiniMaxH3VariantChange: value => {
      updateBar(bar.id, currentBar => {
        const nextVariant = value === 'standard' ? 'standard' : 'reference';
        return {
          ...currentBar,
          falOptions: {
            ...(currentBar.falOptions ?? {}),
            miniMaxH3Variant: nextVariant,
            miniMaxH3AspectRatio: normalizeMiniMaxH3AspectRatioForVariant(nextVariant, currentBar.falOptions?.miniMaxH3AspectRatio),
          },
        };
      });
    },
    onMiniMaxH3AspectRatioChange: value => updateFalOption('miniMaxH3AspectRatio', value),
    onMiniMaxH3DurationChange: value => updateFalOption('miniMaxH3Duration', value),
    onFlux3VariantChange: value => updateBar(bar.id, currentBar => updateEmbeddedFlux3Variant(currentBar, value)),
    onFlux3AspectRatioChange: value => updateFalOption('flux3AspectRatio', value),
    onFlux3ResolutionChange: value => updateFalOption('flux3Resolution', value),
    onFlux3DurationChange: value => updateBar(bar.id, currentBar => updateEmbeddedFlux3Duration(currentBar, value)),
    onFlux3GenerateAudioChange: value => updateFalOption('flux3GenerateAudio', value),
    onFlux3KeyframeTimingChange: (imageId, timestampSeconds) => updateBar(
      bar.id,
      currentBar => updateEmbeddedFlux3KeyframeTiming(currentBar, barMembership, imageId, timestampSeconds),
    ),
    onSeedance15AspectRatioChange: value => updateFalOption('seedance15AspectRatio', value),
    onSeedance15ResolutionChange: value => updateFalOption('seedance15Resolution', value),
    onSeedance15DurationChange: value => updateFalOption('seedance15Duration', value),
    onSeedance15CameraFixedChange: value => updateFalOption('seedance15CameraFixed', value),
    onSeedance15AudioChange: value => updateFalOption('seedance15Audio', value),
    onSeedance2VariantChange: value => updateLegacyAndFal({ seedance2Variant: value as CanvasVideoPromptBar['seedance2Variant'] }, 'seedance2Variant', value),
    onSeedance2JimengModelVersionChange: value => {
      updateBar(bar.id, currentBar => {
        const nextModelVersion = value as CanvasVideoPromptBar['seedance2JimengModelVersion'];
        const savedFalResolution = currentBar.falOptions?.seedance2Resolution;
        return {
          ...currentBar,
          seedance2JimengModelVersion: nextModelVersion,
          seedance2Resolution: getJimengSafeSeedance2Resolution(currentBar.seedance2Resolution, nextModelVersion),
          falOptions: {
            ...(currentBar.falOptions ?? {}),
            seedance2JimengModelVersion: nextModelVersion,
            seedance2Resolution: savedFalResolution
              ? getJimengSafeSeedance2Resolution(savedFalResolution, nextModelVersion)
              : savedFalResolution,
          },
        };
      }); // Keep the channel and its compatible resolution in one history update.
    },
    onSeedance2VolcengineModelChange: value => {
      updateBar(bar.id, currentBar => {
        const nextModel = isSeedance2VolcengineModel(value) ? value : 'standard';
        const safe = getVolcengineSafeSeedance2Settings(nextModel, currentBar); // Shared clamp keeps embedded bars in step with the global hook.
        return {
          ...currentBar,
          seedance2VolcengineModel: nextModel,
          seedance2AspectRatio: safe.seedance2AspectRatio,
          seedance2Resolution: safe.seedance2Resolution,
          seedance2Duration: safe.seedance2Duration,
          seedance2CameraFixed: safe.seedance2CameraFixed,
          falOptions: {
            ...(currentBar.falOptions ?? {}),
            seedance2VolcengineModel: nextModel,
            seedance2AspectRatio: safe.seedance2AspectRatio,
            seedance2Resolution: safe.seedance2Resolution,
            seedance2Duration: safe.seedance2Duration,
            seedance2CameraFixed: safe.seedance2CameraFixed,
          },
        };
      }); // Keep the Volcengine model and its compatible settings in one history update.
    },
    onSeedance2AspectRatioChange: value => updateLegacyAndFal({ seedance2AspectRatio: value as CanvasVideoPromptBar['seedance2AspectRatio'] }, 'seedance2AspectRatio', value),
    onSeedance2ResolutionChange: value => updateLegacyAndFal({ seedance2Resolution: value as CanvasVideoPromptBar['seedance2Resolution'] }, 'seedance2Resolution', value),
    onSeedance2DurationChange: value => updateLegacyAndFal({ seedance2Duration: value as CanvasVideoPromptBar['seedance2Duration'] }, 'seedance2Duration', value),
    onJimengMultiframeDurationChange: value => updateFalOption('multiframeDuration', value),
    onJimengMultiframeResolutionChange: value => updateFalOption('multiframeResolution', value),
    onSeedance2GenerateAudioChange: value => updateLegacyAndFal({ seedance2GenerateAudio: value }, 'seedance2GenerateAudio', value),
    onSeedance2CameraFixedChange: value => updateBar(bar.id, currentBar => ({ ...currentBar, seedance2CameraFixed: value })),
    onSeedance2OutputFormatChange: value => updateBar(bar.id, currentBar => ({
      ...currentBar,
      seedance2OutputFormat: isSeedance2OutputFormatSelectionValue(value) ? value : 'mp4',
    })),
    onSeedance25VariantChange: value => updateFalOption('seedance25Variant', value),
    onSeedance25AspectRatioChange: value => updateFalOption('seedance25AspectRatio', value),
    onSeedance25ResolutionChange: value => updateFalOption('seedance25Resolution', value),
    onSeedance25DurationChange: value => updateFalOption('seedance25Duration', value),
    onSeedance25GenerateAudioChange: value => updateFalOption('seedance25GenerateAudio', value),
    onFlux2MaxImageSizeChange: NOOP,
    onWan27ImageAspectRatioChange: NOOP,
    onWan27ImageMaxImagesChange: NOOP,
    onRecraftImageSizeChange: NOOP,
    onRecraftBackgroundColorChange: NOOP,
    onRecraftColorChange: NOOP,
    onRecraftAddColor: NOOP,
    onRecraftRemoveColor: NOOP,
    onGptImage2QualityChange: NOOP,
    onGptImage25QualityChange: NOOP,
    onGptImage25BackgroundChange: NOOP,
    onGptImage25VariantChange: NOOP,
    onKrea2AspectRatioChange: NOOP,
    onKrea2CreativityChange: NOOP,
    onFalScaleFactorChange: NOOP,
    onFalCreativityChange: NOOP,
    onFalNoiseScaleChange: NOOP,
    onFalImageSizeChange: NOOP,
    onFalAspectRatioChange: value => updateFalOption('aspectRatioSelection', value),
    onFalResolutionChange: NOOP,
    onFalNumImagesChange: NOOP,
  };
};

// The three "first frame drives the aspect ratio" flags derive from resolved values.
// The footer additionally requires the Volcengine 2.5 sub-model for Seedance 2 —
// embedded bars historically did not; that discrepancy is preserved deliberately.
const deriveFirstFrameFlags = (
  site: 'footer' | 'embedded',
  modelId: string,
  flags: PromptBarModelFlags,
  values: PromptBarSettingsValues,
  hasFirstFrameImage: boolean,
) => ({
  miniMaxH3UsesSourceAspectRatio: flags.isMiniMaxH3VideoModel === true
    && values.miniMaxH3Variant === 'standard'
    && hasFirstFrameImage,
  seedance2HasFirstFrame: modelId === SEEDANCE_2_VIDEO_MODEL_ID
    && values.seedance2Variant === 'smart'
    && (site === 'embedded' || values.seedance2VolcengineModel === 'seedance25')
    && hasFirstFrameImage,
  seedance25UsesSourceAspectRatio: flags.isSeedance25VideoModel === true
    && values.seedance25Variant === 'smart'
    && hasFirstFrameImage, // Jimeng image2video omits --ratio, so first-frame Smart uses the source ratio.
});

export type FooterPromptBarInputParams = {
  apiProvider: 'google' | 'fal';
  fal: UseFalSettingsResult;
  flux3: FooterFlux3Handlers & { keyframeError?: string };
  hasFirstFrameImage: boolean;
  isLoading: boolean;
  shouldValidateFalOptions: boolean;
  isNumImagesInvalid: boolean;
};

export const buildFooterPromptBarControlsInput = ({
  apiProvider,
  fal,
  flux3,
  hasFirstFrameImage,
  isLoading,
  shouldValidateFalOptions,
  isNumImagesInvalid,
}: FooterPromptBarInputParams): PromptBarControlsInput => {
  const flags = derivePromptBarModelFlags(apiProvider, fal.falModelId, fal.falModelMode);
  const values = pickFooterPromptBarValues(fal);
  return {
    apiProvider,
    falModelId: fal.falModelId,
    falModelMode: fal.falModelMode,
    ...flags,
    ...values,
    ...deriveFirstFrameFlags('footer', fal.falModelId, flags, values, hasFirstFrameImage),
    flux3KeyframeError: flux3.keyframeError,
    isLoading,
    ...createFooterPromptBarHandlers(fal, flux3),
    shouldValidateFalOptions,
    isNumImagesInvalid,
  };
};

export type EmbeddedPromptBarInputParams = {
  bar: CanvasVideoPromptBar;
  barMembership: VideoPromptAreaMembership | undefined;
  fal: UseFalSettingsResult;
  updateBar: EmbeddedPromptBarUpdate;
  isLoading: boolean;
};

export const buildEmbeddedPromptBarControlsInput = ({
  bar,
  barMembership,
  fal,
  updateBar,
  isLoading,
}: EmbeddedPromptBarInputParams): PromptBarControlsInput => {
  const modelId = getEmbeddedVideoPromptBarModelId(bar.modelId);
  const embeddedFlux3State = buildEmbeddedFlux3PromptState(bar, barMembership);
  const flags = derivePromptBarModelFlags('fal', modelId, 'video');
  const values: PromptBarSettingsValues = {
    ...buildEmbeddedPromptBarValues(bar, fal),
    // Flux 3 embedded state resolves variant/duration/keyframes against the bar's area.
    flux3Variant: embeddedFlux3State.settings.flux3Variant,
    flux3AspectRatio: embeddedFlux3State.settings.flux3AspectRatio,
    flux3Resolution: embeddedFlux3State.settings.flux3Resolution,
    flux3Duration: embeddedFlux3State.settings.flux3Duration,
    flux3GenerateAudio: embeddedFlux3State.settings.flux3GenerateAudio,
    flux3KeyframeTimings: embeddedFlux3State.runPlan.keyframeTimings,
  };
  return {
    apiProvider: 'fal',
    controlIdPrefix: bar.id, // Scope control ids to this embedded bar.
    falModelId: modelId,
    falModelMode: 'video',
    ...flags,
    ...values,
    ...deriveFirstFrameFlags('embedded', modelId, flags, values, Boolean(barMembership?.primaryImageId)),
    flux3KeyframeError: embeddedFlux3State.runPlan.keyframeError ?? undefined,
    isLoading,
    ...createEmbeddedPromptBarHandlers(bar, barMembership, updateBar),
    shouldValidateFalOptions: false,
    isNumImagesInvalid: false,
  };
};
