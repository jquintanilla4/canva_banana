import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  ApiProviderId,
  FalVideoDuration,
  GenerationFalOptions,
  GenerationInputs,
  GenerationJimengOptions,
  GenerationVolcengineOptions,
} from '../types';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  DEFAULT_FAL_IMAGE_MODEL_ID,
  DEFAULT_FAL_VIDEO_MODEL_ID,
  FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS,
  FAL_GROK_ASPECT_RATIO_OPTIONS, // Grok aspect ratio options.
  GPT_IMAGE_2_IMAGE_SIZE_OPTIONS,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GPT_IMAGE_2_EDIT_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok model id.
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  getFalNumImageMaxForModel,
  isFlux2MaxImageSizeSelectionValue,
  isGptImage2Model,
  isGptImage2QualitySelectionValue,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isKrea2AspectRatioSelectionValue,
  isKrea2CreativitySelectionValue,
  isKrea2LargeModel as isKrea2LargeModelId,
  isNanoBananaEditModelId,
  isKlingO3DurationSelectionValue,
  isKlingO3VideoModelId,
  isKlingV3CfgScaleSelectionValue,
  isKlingV3DurationSelectionValue,
  isKlingV3ShotDurationSelectionValue,
  isFalImageModelId,
  isFalVideoModelId,
  isSeedreamModelId,
  isSeedreamV5LiteModelId,
  isSeedreamV5ProModelId,
  normalizeFalModelId,
  isVeo31AspectRatioSelectionValue,
  isVeo31DurationSelectionValue,
  isVeo31ResolutionSelectionValue,
  isVeo31Variant,
  normalizeVeo31Variant,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
  isSeedance2AspectRatioSelectionValue,
  isSeedance2DurationSelectionValue,
  isJimengSeedance2ModelVersion,
  isSeedance2ResolutionSelectionValue,
  isSeedance2Variant,
  isSeedance2VideoModel as isSeedance2VideoModelId,
  isJimengSeedance2VideoModel,
  isVolcengineSeedance2VideoModel,
  isRecraftV4ProImageSizeSelectionValue,
  isRecraftV4ProModel,
  KREA_2_DEFAULT_ASPECT_RATIO,
  KREA_2_DEFAULT_CREATIVITY,
  isWan27ImageAspectRatioSelectionValue,
  isWan27ImageMaxImagesSelectionValue,
  isWan27VideoAspectRatioSelectionValue,
  isWan27VideoDurationSelectionValue,
  isWan27VideoResolutionSelectionValue,
  isWan27VideoVariant,
  isMiniMaxH3AspectRatioSelectionValue,
  isMiniMaxH3DurationSelectionValue,
  isMiniMaxH3Variant,
  isUnavailableLegacyTransferModelId,
  normalizeMiniMaxH3AspectRatioForVariant,
  RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR,
  RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE,
  RECRAFT_V4_PRO_MAX_COLORS,
  recraftHexToRgb,
} from '../services/modelConfig';
import {
  applyGenerationTransferOptions,
  resolveGenerationTransferModelId,
  resolveGenerationTransferOptions,
} from '../utils/generationTransferSettings';
import type {
  FalAspectRatioSelectionValue,
  FalGptImage2QualitySelectionValue,
  FalImageModelId,
  FalImageSizeSelectionValue,
  FalModelId,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  Flux2MaxImageSizeSelectionValue,
  KlingO3DurationSelectionValue,
  KlingO3Variant,
  KlingV3ControlOrientation,
  KlingV3CfgScaleSelectionValue,
  KlingV3DurationSelectionValue,
  KlingV3ShotDurationSelectionValue,
  KlingVariant,
  Krea2AspectRatioSelectionValue,
  Krea2CreativitySelectionValue,
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
  LipsyncSyncMode,
  Seedance15AspectRatioSelectionValue,
  Seedance15ResolutionSelectionValue,
  Seedance15DurationSelectionValue,
  Seedance2AspectRatioSelectionValue,
  Seedance2DurationSelectionValue,
  Seedance2ResolutionSelectionValue,
  Seedance2Variant,
  RecraftRgbColor,
  RecraftV4ProImageSizeSelectionValue,
  Wan27VideoAudioSettingSelectionValue,
  Wan27VideoAspectRatioSelectionValue,
  Wan27VideoDurationSelectionValue,
  Wan27VideoResolutionSelectionValue,
  Wan27VideoVariant,
  MiniMaxH3AspectRatioSelectionValue,
  MiniMaxH3DurationSelectionValue,
  MiniMaxH3Variant,
  Wan27ImageAspectRatioSelectionValue,
  Wan27ImageMaxImagesSelectionValue,
  WanAnimateQualitySelectionValue,
  WanAnimateResolutionSelectionValue,
  WanAnimateShiftSelectionValue,
  WanAnimateStepsSelectionValue,
  WanAnimateVariant,
  WanCreativity,
  WanTargetResolution,
  JimengSeedance2ModelVersionSelectionValue,
} from '../services/modelConfig';

type UseFalSettingsArgs = {
  apiProvider: ApiProviderId;
};

type FalDerivedState = {
  falModelId: FalModelId;
  isVideoMode: boolean;
  isKlingVideoModel: boolean;
  isKlingV3VideoModel: boolean;
  isKlingO3VideoModel: boolean;
  isKlingV3ControlVideoModel: boolean;
  isWanAnimateVideoModel: boolean;
  isLipsyncVideoModel: boolean;
  isHeygenV3LipsyncVideoModel: boolean;
  isInfinitalkVideoModel: boolean;
  isGrokImagineVideoModel: boolean;
  isWan27VideoModel: boolean;
  isMiniMaxH3VideoModel: boolean;
  isSeedance15VideoModel: boolean;
  isSeedance2VideoModel: boolean;
  isFalSeedance2VideoModel: boolean;
  isVolcengineSeedance2VideoModel: boolean;
  isJimengSeedance2VideoModel: boolean;
  isVeo31VideoModel: boolean;
  isFlux2MaxModel: boolean;
  isWan27ImageModel: boolean;
  isGptImage2Model: boolean;
  isKrea2LargeModel: boolean;
  isUpscaleModel: boolean;
  isKlingProVideoSelection: boolean;
  isKlingO3EditMode: boolean;
};

type FalHandlers = {
  handleModelModeChange: (mode: FalModelMode) => void;
  handleFalModelChange: (modelId: string) => void;
  handleFalVideoDurationChange: (value: string) => void;
  handleKlingVariantChange: (value: string) => void;
  handleKlingV3DurationChange: (value: string) => void;
  handleKlingV3GenerateAudioChange: (value: boolean) => void;
  handleKlingV3CfgScaleChange: (value: string) => void;
  handleKlingV3MultiPromptEnabledChange: (value: boolean) => void;
  handleKlingV3MultiPromptChange: (value: string) => void;
  handleKlingV3Shot1DurationChange: (value: string) => void;
  handleKlingV3Shot2DurationChange: (value: string) => void;
  handleKlingO3VariantChange: (value: string) => void;
  handleKlingO3DurationChange: (value: string) => void;
  handleKlingO3GenerateAudioChange: (value: boolean) => void;
  handleKlingO3KeepAudioChange: (value: boolean) => void;
  handleKlingV3ControlKeepSoundChange: (value: boolean) => void;
  handleKlingV3ControlOrientationChange: (value: string) => void;
  handleWanTargetResolutionChange: (value: string) => void;
  handleWanCreativityChange: (value: string) => void;
  handleWanAnimateVariantChange: (value: string) => void;
  handleWanAnimateStepsChange: (value: string) => void;
  handleWanAnimateResolutionChange: (value: string) => void;
  handleWanAnimateShiftChange: (value: string) => void;
  handleWanAnimateQualityChange: (value: string) => void;
  handleWanAnimateTurboChange: (value: boolean) => void;
  handleLipsyncSyncModeChange: (value: string) => void;
  handleHeygenEnableCaptionChange: (value: boolean) => void;
  handleHeygenEnableDynamicDurationChange: (value: boolean) => void;
  handleHeygenDisableMusicTrackChange: (value: boolean) => void;
  handleHeygenEnableSpeechEnhancementChange: (value: boolean) => void;
  handleInfinitalkResolutionChange: (value: string) => void;
  handleInfinitalkSeedChange: (value: string) => void;
  handleInfinitalkAccelerationChange: (value: string) => void;
  handleInfinitalkDurationChange: (value: string) => void;
  handleGrokImagineVideoDurationChange: (value: string) => void;
  handleGrokImagineVideoResolutionChange: (value: string) => void;
  handleGrokImagineVideoAspectRatioChange: (value: string) => void;
  handleVeo31VariantChange: (value: string) => void;
  handleVeo31DurationChange: (value: string) => void;
  handleVeo31ResolutionChange: (value: string) => void;
  handleVeo31AspectRatioChange: (value: string) => void;
  handleVeo31GenerateAudioChange: (value: boolean) => void;
  handleWan27VideoResolutionChange: (value: string) => void;
  handleWan27VideoDurationChange: (value: string) => void;
  handleWan27VideoAspectRatioChange: (value: string) => void;
  handleWan27VideoPromptExpansionChange: (value: boolean) => void;
  handleWan27VideoVariantChange: (value: string) => void;
  handleWan27VideoAudioSettingChange: (value: string) => void;
  handleMiniMaxH3VariantChange: (value: string) => void;
  handleMiniMaxH3AspectRatioChange: (value: string) => void;
  handleMiniMaxH3DurationChange: (value: string) => void;
  handleSeedance15AspectRatioChange: (value: string) => void;
  handleSeedance15ResolutionChange: (value: string) => void;
  handleSeedance15DurationChange: (value: string) => void;
  handleSeedance15CameraFixedChange: (value: boolean) => void;
  handleSeedance15AudioChange: (value: boolean) => void;
  handleSeedance2VariantChange: (value: string) => void;
  handleSeedance2JimengModelVersionChange: (value: string) => void;
  handleSeedance2AspectRatioChange: (value: string) => void;
  handleSeedance2ResolutionChange: (value: string) => void;
  handleSeedance2DurationChange: (value: string) => void;
  handleSeedance2GenerateAudioChange: (value: boolean) => void;
  handleSeedance2CameraFixedChange: (value: boolean) => void;
  handleFlux2MaxImageSizeChange: (value: string) => void;
  handleWan27ImageAspectRatioChange: (value: string) => void;
  handleWan27ImageMaxImagesChange: (value: string) => void;
  handleRecraftImageSizeChange: (value: string) => void;
  handleRecraftBackgroundColorChange: (value: string) => void;
  handleRecraftColorChange: (index: number, value: string) => void;
  handleRecraftAddColor: () => void;
  handleRecraftRemoveColor: () => void;
  handleGptImage2QualityChange: (value: string) => void;
  handleKrea2AspectRatioChange: (value: string) => void;
  handleKrea2CreativityChange: (value: string) => void;
  handleFalImageSizeChange: (value: string) => void;
  handleFalAspectRatioChange: (value: string) => void;
  handleFalResolutionChange: (value: string) => void;
  handleFalNumImagesChange: (value: number) => void;
  handleFalScaleFactorChange: (value: string) => void;
  handleFalNoiseScaleChange: (value: string) => void;
  handleFalCreativityChange: (value: string) => void;
};

export type UseFalSettingsResult = FalDerivedState & FalHandlers & {
  falModelMode: FalModelMode;
  falImageModelId: FalImageModelId;
  falVideoModelId: FalVideoModelId;
  falVideoDuration: FalVideoDuration;
  klingVariant: KlingVariant;
  klingV3Duration: KlingV3DurationSelectionValue;
  klingV3GenerateAudio: boolean;
  klingV3CfgScale: KlingV3CfgScaleSelectionValue;
  klingV3MultiPromptEnabled: boolean;
  klingV3MultiPrompt: string;
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
  seedance15AspectRatio: Seedance15AspectRatioSelectionValue;
  seedance15Resolution: Seedance15ResolutionSelectionValue;
  seedance15Duration: Seedance15DurationSelectionValue;
  seedance15CameraFixed: boolean;
  seedance15Audio: boolean;
  seedance2Variant: Seedance2Variant;
  seedance2JimengModelVersion: JimengSeedance2ModelVersionSelectionValue;
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
  gptImage2Quality: FalGptImage2QualitySelectionValue;
  krea2AspectRatio: Krea2AspectRatioSelectionValue;
  krea2Creativity: Krea2CreativitySelectionValue;
  falImageSizeSelection: FalImageSizeSelectionValue;
  falAspectRatioSelection: FalAspectRatioSelectionValue;
  falResolutionSelection: FalResolutionSelectionValue;
  falNumImages: number;
  falScaleFactor: number;
  falNoiseScale: number;
  falCreativity: number;
  setFalModelMode: Dispatch<SetStateAction<FalModelMode>>;
  setFalImageModelId: Dispatch<SetStateAction<FalImageModelId>>;
  setFalVideoModelId: Dispatch<SetStateAction<FalVideoModelId>>;
  setFalVideoDuration: Dispatch<SetStateAction<FalVideoDuration>>;
  setKlingVariant: Dispatch<SetStateAction<KlingVariant>>;
  setKlingV3Duration: Dispatch<SetStateAction<KlingV3DurationSelectionValue>>;
  setKlingV3GenerateAudio: Dispatch<SetStateAction<boolean>>;
  setKlingV3CfgScale: Dispatch<SetStateAction<KlingV3CfgScaleSelectionValue>>;
  setKlingV3MultiPromptEnabled: Dispatch<SetStateAction<boolean>>;
  setKlingV3MultiPrompt: Dispatch<SetStateAction<string>>;
  setKlingV3Shot1Duration: Dispatch<SetStateAction<KlingV3ShotDurationSelectionValue>>;
  setKlingV3Shot2Duration: Dispatch<SetStateAction<KlingV3ShotDurationSelectionValue>>;
  setKlingO3Variant: Dispatch<SetStateAction<KlingO3Variant>>;
  setKlingO3Duration: Dispatch<SetStateAction<KlingO3DurationSelectionValue>>;
  setKlingO3GenerateAudio: Dispatch<SetStateAction<boolean>>;
  setKlingO3KeepAudio: Dispatch<SetStateAction<boolean>>;
  setKlingV3ControlKeepSound: Dispatch<SetStateAction<boolean>>;
  setKlingV3ControlOrientation: Dispatch<SetStateAction<KlingV3ControlOrientation>>;
  setWanTargetResolution: Dispatch<SetStateAction<WanTargetResolution>>;
  setWanCreativity: Dispatch<SetStateAction<WanCreativity>>;
  setWanAnimateVariant: Dispatch<SetStateAction<WanAnimateVariant>>;
  setWanAnimateSteps: Dispatch<SetStateAction<WanAnimateStepsSelectionValue>>;
  setWanAnimateResolution: Dispatch<SetStateAction<WanAnimateResolutionSelectionValue>>;
  setWanAnimateShift: Dispatch<SetStateAction<WanAnimateShiftSelectionValue>>;
  setWanAnimateQuality: Dispatch<SetStateAction<WanAnimateQualitySelectionValue>>;
  setWanAnimateUseTurbo: Dispatch<SetStateAction<boolean>>;
  setLipsyncSyncMode: Dispatch<SetStateAction<LipsyncSyncMode>>;
  setHeygenEnableCaption: Dispatch<SetStateAction<boolean>>;
  setHeygenEnableDynamicDuration: Dispatch<SetStateAction<boolean>>;
  setHeygenDisableMusicTrack: Dispatch<SetStateAction<boolean>>;
  setHeygenEnableSpeechEnhancement: Dispatch<SetStateAction<boolean>>;
  setInfinitalkResolution: Dispatch<SetStateAction<InfinitalkResolutionSelectionValue>>;
  setInfinitalkSeed: Dispatch<SetStateAction<InfinitalkSeedSelectionValue>>;
  setInfinitalkAcceleration: Dispatch<SetStateAction<InfinitalkAccelerationSelectionValue>>;
  setInfinitalkDuration: Dispatch<SetStateAction<InfinitalkDurationSelectionValue>>;
  setGrokImagineVideoDuration: Dispatch<SetStateAction<GrokImagineVideoDurationSelectionValue>>;
  setGrokImagineVideoResolution: Dispatch<SetStateAction<GrokImagineVideoResolutionSelectionValue>>;
  setGrokImagineVideoAspectRatio: Dispatch<SetStateAction<GrokImagineVideoAspectRatioSelectionValue>>;
  setVeo31Variant: Dispatch<SetStateAction<Veo31Variant>>;
  setVeo31Duration: Dispatch<SetStateAction<Veo31DurationSelectionValue>>;
  setVeo31Resolution: Dispatch<SetStateAction<Veo31ResolutionSelectionValue>>;
  setVeo31AspectRatio: Dispatch<SetStateAction<Veo31AspectRatioSelectionValue>>;
  setVeo31GenerateAudio: Dispatch<SetStateAction<boolean>>;
  setWan27VideoResolution: Dispatch<SetStateAction<Wan27VideoResolutionSelectionValue>>;
  setWan27VideoDuration: Dispatch<SetStateAction<Wan27VideoDurationSelectionValue>>;
  setWan27VideoAspectRatio: Dispatch<SetStateAction<Wan27VideoAspectRatioSelectionValue>>;
  setWan27VideoPromptExpansion: Dispatch<SetStateAction<boolean>>;
  setWan27VideoVariant: Dispatch<SetStateAction<Wan27VideoVariant>>;
  setWan27VideoAudioSetting: Dispatch<SetStateAction<Wan27VideoAudioSettingSelectionValue>>;
  setMiniMaxH3Variant: Dispatch<SetStateAction<MiniMaxH3Variant>>;
  setMiniMaxH3AspectRatio: Dispatch<SetStateAction<MiniMaxH3AspectRatioSelectionValue>>;
  setMiniMaxH3Duration: Dispatch<SetStateAction<MiniMaxH3DurationSelectionValue>>;
  setSeedance15AspectRatio: Dispatch<SetStateAction<Seedance15AspectRatioSelectionValue>>;
  setSeedance15Resolution: Dispatch<SetStateAction<Seedance15ResolutionSelectionValue>>;
  setSeedance15Duration: Dispatch<SetStateAction<Seedance15DurationSelectionValue>>;
  setSeedance15CameraFixed: Dispatch<SetStateAction<boolean>>;
  setSeedance15Audio: Dispatch<SetStateAction<boolean>>;
  setSeedance2Variant: Dispatch<SetStateAction<Seedance2Variant>>;
  setSeedance2AspectRatio: Dispatch<SetStateAction<Seedance2AspectRatioSelectionValue>>;
  setSeedance2Resolution: Dispatch<SetStateAction<Seedance2ResolutionSelectionValue>>;
  setSeedance2Duration: Dispatch<SetStateAction<Seedance2DurationSelectionValue>>;
  setSeedance2GenerateAudio: Dispatch<SetStateAction<boolean>>;
  setSeedance2CameraFixed: Dispatch<SetStateAction<boolean>>;
  setFlux2MaxImageSize: Dispatch<SetStateAction<Flux2MaxImageSizeSelectionValue>>;
  setWan27ImageAspectRatio: Dispatch<SetStateAction<Wan27ImageAspectRatioSelectionValue>>;
  setWan27ImageMaxImages: Dispatch<SetStateAction<Wan27ImageMaxImagesSelectionValue>>;
  setRecraftImageSize: Dispatch<SetStateAction<RecraftV4ProImageSizeSelectionValue>>;
  setRecraftBackgroundColor: Dispatch<SetStateAction<RecraftRgbColor>>;
  setRecraftColors: Dispatch<SetStateAction<RecraftRgbColor[]>>;
  setGptImage2Quality: Dispatch<SetStateAction<FalGptImage2QualitySelectionValue>>;
  setKrea2AspectRatio: Dispatch<SetStateAction<Krea2AspectRatioSelectionValue>>;
  setKrea2Creativity: Dispatch<SetStateAction<Krea2CreativitySelectionValue>>;
  setFalImageSizeSelection: Dispatch<SetStateAction<FalImageSizeSelectionValue>>;
  setFalAspectRatioSelection: Dispatch<SetStateAction<FalAspectRatioSelectionValue>>;
  setFalResolutionSelection: Dispatch<SetStateAction<FalResolutionSelectionValue>>;
  setFalNumImages: Dispatch<SetStateAction<number>>;
  setFalScaleFactor: Dispatch<SetStateAction<number>>;
  setFalNoiseScale: Dispatch<SetStateAction<number>>;
  setFalCreativity: Dispatch<SetStateAction<number>>;
  applyGenerationSettings: (generation: GenerationInputs) => boolean;
};

export function useFalSettings({ apiProvider }: UseFalSettingsArgs): UseFalSettingsResult {
  // Centralized store for FAL model selection plus model-specific knobs used across the UI.
  const [falModelMode, setFalModelMode] = useState<FalModelMode>('image');
  const [falImageModelId, setFalImageModelId] = useState<FalImageModelId>(DEFAULT_FAL_IMAGE_MODEL_ID);
  const [falVideoModelId, setFalVideoModelId] = useState<FalVideoModelId>(DEFAULT_FAL_VIDEO_MODEL_ID);
  const [falVideoDuration, setFalVideoDuration] = useState<FalVideoDuration>('6');
  const [klingVariant, setKlingVariant] = useState<KlingVariant>('standard');
  const [klingV3Duration, setKlingV3Duration] = useState<KlingV3DurationSelectionValue>('5');
  const [klingV3GenerateAudio, setKlingV3GenerateAudio] = useState<boolean>(true);
  const [klingV3CfgScale, setKlingV3CfgScale] = useState<KlingV3CfgScaleSelectionValue>('0.5');
  const [klingV3MultiPromptEnabled, setKlingV3MultiPromptEnabled] = useState<boolean>(false);
  const [klingV3MultiPrompt, setKlingV3MultiPrompt] = useState<string>('');
  const [klingV3Shot1Duration, setKlingV3Shot1Duration] = useState<KlingV3ShotDurationSelectionValue>('5');
  const [klingV3Shot2Duration, setKlingV3Shot2Duration] = useState<KlingV3ShotDurationSelectionValue>('5');
  const [klingO3Variant, setKlingO3Variant] = useState<KlingO3Variant>('reference');
  const [klingO3Duration, setKlingO3Duration] = useState<KlingO3DurationSelectionValue>('5');
  const [klingO3GenerateAudio, setKlingO3GenerateAudio] = useState<boolean>(false);
  const [klingO3KeepAudio, setKlingO3KeepAudio] = useState<boolean>(true);
  const [klingV3ControlKeepSound, setKlingV3ControlKeepSound] = useState<boolean>(true);
  const [klingV3ControlOrientation, setKlingV3ControlOrientation] = useState<KlingV3ControlOrientation>('video');
  const [wanTargetResolution, setWanTargetResolution] = useState<WanTargetResolution>('720p');
  const [wanCreativity, setWanCreativity] = useState<WanCreativity>(1);
  const [wanAnimateVariant, setWanAnimateVariant] = useState<WanAnimateVariant>('replace');
  const [wanAnimateSteps, setWanAnimateSteps] = useState<WanAnimateStepsSelectionValue>('20');
  const [wanAnimateResolution, setWanAnimateResolution] = useState<WanAnimateResolutionSelectionValue>('480p');
  const [wanAnimateShift, setWanAnimateShift] = useState<WanAnimateShiftSelectionValue>('5.0');
  const [wanAnimateQuality, setWanAnimateQuality] = useState<WanAnimateQualitySelectionValue>('high');
  const [wanAnimateUseTurbo, setWanAnimateUseTurbo] = useState<boolean>(false);
  const [lipsyncSyncMode, setLipsyncSyncMode] = useState<LipsyncSyncMode>('cut_off'); // Sync v3 default.
  const [heygenEnableCaption, setHeygenEnableCaption] = useState<boolean>(false); // HeyGen captions default off.
  const [heygenEnableDynamicDuration, setHeygenEnableDynamicDuration] = useState<boolean>(true); // HeyGen duration matching default.
  const [heygenDisableMusicTrack, setHeygenDisableMusicTrack] = useState<boolean>(false); // HeyGen keeps music by default.
  const [heygenEnableSpeechEnhancement, setHeygenEnableSpeechEnhancement] = useState<boolean>(false); // HeyGen speech enhancement default off.
  const [infinitalkResolution, setInfinitalkResolution] = useState<InfinitalkResolutionSelectionValue>('480p');
  const [infinitalkSeed, setInfinitalkSeed] = useState<InfinitalkSeedSelectionValue>('42');
  const [infinitalkAcceleration, setInfinitalkAcceleration] = useState<InfinitalkAccelerationSelectionValue>('regular');
  const [infinitalkDuration, setInfinitalkDuration] = useState<InfinitalkDurationSelectionValue>('5s');
  const [grokImagineVideoDuration, setGrokImagineVideoDuration] = useState<GrokImagineVideoDurationSelectionValue>('6');
  const [grokImagineVideoResolution, setGrokImagineVideoResolution] = useState<GrokImagineVideoResolutionSelectionValue>('720p');
  const [grokImagineVideoAspectRatio, setGrokImagineVideoAspectRatio] = useState<GrokImagineVideoAspectRatioSelectionValue>('auto');
  const [veo31Variant, setVeo31Variant] = useState<Veo31Variant>('i2v-fflf');
  const [veo31Duration, setVeo31Duration] = useState<Veo31DurationSelectionValue>('8s');
  const [veo31Resolution, setVeo31Resolution] = useState<Veo31ResolutionSelectionValue>('720p');
  const [veo31AspectRatio, setVeo31AspectRatio] = useState<Veo31AspectRatioSelectionValue>('auto');
  const [veo31GenerateAudio, setVeo31GenerateAudio] = useState<boolean>(true);
  const [wan27VideoResolution, setWan27VideoResolution] = useState<Wan27VideoResolutionSelectionValue>('1080p');
  const [wan27VideoDuration, setWan27VideoDuration] = useState<Wan27VideoDurationSelectionValue>('5');
  const [wan27VideoAspectRatio, setWan27VideoAspectRatio] = useState<Wan27VideoAspectRatioSelectionValue>('16:9');
  const [wan27VideoPromptExpansion, setWan27VideoPromptExpansion] = useState<boolean>(true);
  const [wan27VideoVariant, setWan27VideoVariant] = useState<Wan27VideoVariant>('smart');
  const [wan27VideoAudioSetting, setWan27VideoAudioSetting] = useState<Wan27VideoAudioSettingSelectionValue>('auto');
  const [miniMaxH3Variant, setMiniMaxH3Variant] = useState<MiniMaxH3Variant>('reference');
  const [miniMaxH3AspectRatio, setMiniMaxH3AspectRatio] = useState<MiniMaxH3AspectRatioSelectionValue>('adaptive');
  const [miniMaxH3Duration, setMiniMaxH3Duration] = useState<MiniMaxH3DurationSelectionValue>('5');
  const [seedance15AspectRatio, setSeedance15AspectRatio] = useState<Seedance15AspectRatioSelectionValue>('16:9');
  const [seedance15Resolution, setSeedance15Resolution] = useState<Seedance15ResolutionSelectionValue>('720p');
  const [seedance15Duration, setSeedance15Duration] = useState<Seedance15DurationSelectionValue>('5');
  const [seedance15CameraFixed, setSeedance15CameraFixed] = useState<boolean>(false);
  const [seedance15Audio, setSeedance15Audio] = useState<boolean>(false);
  const [seedance2Variant, setSeedance2Variant] = useState<Seedance2Variant>('reference');
  const [seedance2JimengModelVersion, setSeedance2JimengModelVersion] = useState<JimengSeedance2ModelVersionSelectionValue>('seedance2.0fast');
  const [seedance2AspectRatio, setSeedance2AspectRatio] = useState<Seedance2AspectRatioSelectionValue>('16:9');
  const [seedance2Resolution, setSeedance2Resolution] = useState<Seedance2ResolutionSelectionValue>('720p');
  const [seedance2Duration, setSeedance2Duration] = useState<Seedance2DurationSelectionValue>('5');
  const [seedance2GenerateAudio, setSeedance2GenerateAudio] = useState<boolean>(false);
  const [seedance2CameraFixed, setSeedance2CameraFixed] = useState<boolean>(false);
  const [flux2MaxImageSize, setFlux2MaxImageSize] = useState<Flux2MaxImageSizeSelectionValue>('landscape_4_3');
  const [wan27ImageAspectRatio, setWan27ImageAspectRatio] = useState<Wan27ImageAspectRatioSelectionValue>('landscape_16_9');
  const [wan27ImageMaxImages, setWan27ImageMaxImages] = useState<Wan27ImageMaxImagesSelectionValue>('1');
  const [recraftImageSize, setRecraftImageSize] = useState<RecraftV4ProImageSizeSelectionValue>(RECRAFT_V4_PRO_DEFAULT_IMAGE_SIZE);
  const [recraftBackgroundColor, setRecraftBackgroundColor] = useState<RecraftRgbColor>(RECRAFT_V4_PRO_DEFAULT_BACKGROUND_COLOR);
  const [recraftColors, setRecraftColors] = useState<RecraftRgbColor[]>([]);
  const [gptImage2Quality, setGptImage2Quality] = useState<FalGptImage2QualitySelectionValue>('medium');
  const [krea2AspectRatio, setKrea2AspectRatio] = useState<Krea2AspectRatioSelectionValue>(KREA_2_DEFAULT_ASPECT_RATIO);
  const [krea2Creativity, setKrea2Creativity] = useState<Krea2CreativitySelectionValue>(KREA_2_DEFAULT_CREATIVITY);
  const [falImageSizeSelection, setFalImageSizeSelection] = useState<FalImageSizeSelectionValue>('placeholder');
  const [falAspectRatioSelection, setFalAspectRatioSelection] = useState<FalAspectRatioSelectionValue>('placeholder');
  const [falResolutionSelection, setFalResolutionSelection] = useState<FalResolutionSelectionValue>('1K');
  const [falNumImages, setFalNumImages] = useState(1);
  const [falScaleFactor, setFalScaleFactor] = useState(2);
  const [falNoiseScale, setFalNoiseScale] = useState(0.1);
  const [falCreativity, setFalCreativity] = useState(0);
  const pendingFalVideoDurationTransferRef = useRef<{ modelId: FalVideoModelId; duration: FalVideoDuration } | null>(null); // A saved duration must survive the target model's defaulting effect.

  const falModelId: FalModelId = useMemo(
    () => (falModelMode === 'video' ? falVideoModelId : falImageModelId),
    [falModelMode, falImageModelId, falVideoModelId],
  );
  const isVideoMode = falModelMode === 'video';
  const isKlingVideoModel = isVideoMode && falVideoModelId === KLING_VIDEO_MODEL_ID;
  const isKlingV3VideoModel = isVideoMode && falVideoModelId === KLING_V3_VIDEO_MODEL_ID;
  const isKlingO3VideoModel = isVideoMode && isKlingO3VideoModelId(falVideoModelId);
  const isKlingV3ControlVideoModel = isVideoMode && falVideoModelId === KLING_V3_CONTROL_VIDEO_MODEL_ID;
  const isWanAnimateVideoModel = isVideoMode && falVideoModelId === WAN_ANIMATE_MODEL_ID;
  const isLipsyncVideoModel = isVideoMode && falVideoModelId === SYNC_LIPSYNC_MODEL_ID;
  const isHeygenV3LipsyncVideoModel = isVideoMode && falVideoModelId === HEYGEN_V3_LIPSYNC_MODEL_ID;
  const isInfinitalkVideoModel = isVideoMode && falVideoModelId === INFINITALK_VIDEO_MODEL_ID;
  const isGrokImagineVideoModel = isVideoMode && falVideoModelId === GROK_IMAGINE_VIDEO_MODEL_ID;
  const isWan27VideoModel = isVideoMode && falVideoModelId === WAN_27_VIDEO_MODEL_ID;
  const isMiniMaxH3VideoModel = isVideoMode && falVideoModelId === MINIMAX_H3_VIDEO_MODEL_ID;
  const isSeedance15VideoModel = isVideoMode && falVideoModelId === SEEDANCE_15_VIDEO_MODEL_ID;
  const isSeedance2VideoModel = isVideoMode && isSeedance2VideoModelId(falVideoModelId);
  const isFalSeedance2VideoModel = isVideoMode && falVideoModelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID;
  const isVolcengineSeedance2VideoModelSelection = isVideoMode && isVolcengineSeedance2VideoModel(falVideoModelId);
  const isJimengSeedance2VideoModelSelection = isVideoMode && isJimengSeedance2VideoModel(falVideoModelId);
  const isVeo31VideoModel = isVideoMode && falVideoModelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID;
  const isFlux2MaxModel = !isVideoMode && falImageModelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
  const isWan27ImageModel = !isVideoMode && falImageModelId === WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  const isGptImage2ModelSelection = !isVideoMode && isGptImage2Model(falImageModelId);
  const isKrea2LargeModelSelection = !isVideoMode && isKrea2LargeModelId(falImageModelId);
  const isUpscaleModel = !isVideoMode && (falModelId === CRYSTAL_UPSCALER_MODEL_ID || falModelId === SEEDVR_UPSCALER_MODEL_ID);
  const isKlingProVideoSelection = apiProvider === 'fal' && isKlingVideoModel && klingVariant === 'pro';
  const isKlingO3EditMode = isKlingO3VideoModel && klingO3Variant === 'edit';
  const isSeedreamModel = isSeedreamModelId(falModelId);

  // Non-FAL providers cannot use video mode; reset when switching providers.
  useEffect(() => {
    if (apiProvider !== 'fal' && falModelMode !== 'image') {
      setFalModelMode('image');
    }
  }, [apiProvider, falModelMode]);

  useEffect(() => {
    const pendingTransfer = pendingFalVideoDurationTransferRef.current;
    if (pendingTransfer) {
      pendingFalVideoDurationTransferRef.current = null; // One model transition consumes the pending restore.
      if (pendingTransfer.modelId === falVideoModelId) {
        setFalVideoDuration(pendingTransfer.duration); // Metadata wins over ordinary model-selection defaults.
        return;
      }
    }
    if (
      falVideoModelId === KLING_VIDEO_MODEL_ID
      || isKlingO3VideoModelId(falVideoModelId)
    ) {
      setFalVideoDuration('5');
    }
  }, [falVideoModelId]);

  useEffect(() => {
    if (falVideoModelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID && seedance2JimengModelVersion !== 'seedance2.0_vip' && seedance2Resolution === '1080p') {
      setSeedance2Resolution('720p');
    }
    if (falVideoModelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID && seedance2AspectRatio === 'adaptive') {
      setSeedance2AspectRatio('16:9');
    }
  }, [falVideoModelId, seedance2AspectRatio, seedance2JimengModelVersion, seedance2Resolution]);

  useEffect(() => {
    if (!isWan27VideoModel) {
      return;
    }
    if (wan27VideoVariant === 'edit') {
      if (wan27VideoDuration === '11' || wan27VideoDuration === '12' || wan27VideoDuration === '13' || wan27VideoDuration === '14' || wan27VideoDuration === '15') {
        setWan27VideoDuration('10');
      }
      return;
    }
    if (wan27VideoVariant === 'reference' && (wan27VideoDuration === '0' || wan27VideoDuration === '11' || wan27VideoDuration === '12' || wan27VideoDuration === '13' || wan27VideoDuration === '14' || wan27VideoDuration === '15')) {
      setWan27VideoDuration('10');
    }
  }, [isWan27VideoModel, wan27VideoDuration, wan27VideoVariant]);

  useEffect(() => {
    if (!isWan27VideoModel || wan27VideoVariant === 'edit') {
      return;
    }
    if (wan27VideoDuration === '0') {
      setWan27VideoDuration('5');
    }
    if (wan27VideoAspectRatio === 'source') {
      setWan27VideoAspectRatio('16:9');
    }
  }, [isWan27VideoModel, wan27VideoAspectRatio, wan27VideoDuration, wan27VideoVariant]);

  useEffect(() => {
    if (!isVeo31VideoModel) {
      return;
    }
    const normalizedVariant = normalizeVeo31Variant(veo31Variant);
    if (!normalizedVariant) {
      setVeo31Variant('i2v-fflf');
      return;
    }
    if (normalizedVariant !== veo31Variant) {
      setVeo31Variant(normalizedVariant);
      return;
    }
    if (normalizedVariant === 'extend') {
      if (veo31Duration !== '7s') {
        setVeo31Duration('7s');
      }
      if (veo31Resolution !== '720p') {
        setVeo31Resolution('720p');
      }
      return;
    }
    if (!isVeo31DurationSelectionValue(veo31Duration) || veo31Duration === '7s') {
      setVeo31Duration('8s');
    }
    if (!isVeo31ResolutionSelectionValue(veo31Resolution)) {
      setVeo31Resolution('720p');
    }
  }, [isVeo31VideoModel, veo31Duration, veo31Resolution, veo31Variant]);

  useEffect(() => {
    if (!isVeo31VideoModel) {
      return;
    }
    if (!isVeo31AspectRatioSelectionValue(veo31AspectRatio)) {
      setVeo31AspectRatio('auto');
    }
  }, [isVeo31VideoModel, veo31AspectRatio]);

  useEffect(() => {
    setFalScaleFactor(prev => {
      const normalizedPrev = Number.isFinite(prev) ? Math.round(prev) : 2;
      const clamped = Math.min(10, Math.max(1, normalizedPrev));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  useEffect(() => {
    const maxFalNumImages = getFalNumImageMaxForModel(falModelId); // Clamp to each model's output cap.
    setFalNumImages(prev => {
      const normalizedPrev = Number.isFinite(prev) ? Math.floor(prev) : 1;
      const clamped = Math.min(maxFalNumImages, Math.max(1, normalizedPrev));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  // Noise/creativity sliders are model-specific; normalize values whenever the model changes.
  useEffect(() => {
    setFalNoiseScale(prev => {
      const normalizedPrev = Number.isFinite(prev) ? prev : 0.1;
      const rounded = Math.round(normalizedPrev * 10) / 10;
      const clamped = Math.min(1, Math.max(0.1, rounded));
      return clamped === prev ? prev : clamped;
    });
  }, [falModelId]);

  useEffect(() => {
    if (falModelMode === 'video') {
      return;
    }
    const aspectRatioOptions = falModelId === GROK_IMAGINE_IMAGE_MODEL_ID // Grok model branch.
      ? FAL_GROK_ASPECT_RATIO_OPTIONS // Grok aspect ratios.
      : isSeedreamModel
        ? getSeedreamAspectRatioOptions(falModelId)
        : FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS;
    const validOptions = aspectRatioOptions.map(option => option.value);
    if (!validOptions.includes(falAspectRatioSelection)) {
      const fallbackAspectRatio = falModelId === GROK_IMAGINE_IMAGE_MODEL_ID ? '1:1' : 'default'; // Grok uses 1:1 fallback.
      setFalAspectRatioSelection(fallbackAspectRatio);
    }
  }, [falModelId, falModelMode, falAspectRatioSelection, isSeedreamModel]);

  useEffect(() => {
    if (falModelMode === 'video') {
      return;
    }
    if (falModelId === GPT_IMAGE_2_EDIT_MODEL_ID) {
      const validImageSizeOptions = GPT_IMAGE_2_IMAGE_SIZE_OPTIONS.map(option => option.value);
      if (!validImageSizeOptions.includes(falImageSizeSelection)) {
        setFalImageSizeSelection('auto'); // GPT Image 2 defaults to auto size in the UI.
      }
      return;
    }
    if (!isSeedreamModel) {
      return;
    }
    const validImageSizeOptions = getSeedreamImageSizeOptions(falModelId).map(option => option.value);
    if (!validImageSizeOptions.includes(falImageSizeSelection)) {
      const fallback = isSeedreamV5LiteModelId(falModelId) || isSeedreamV5ProModelId(falModelId) ? 'auto_2K' : 'default'; // Seedream 5 defaults to auto_2K.
      setFalImageSizeSelection(fallback);
    }
  }, [falModelId, falModelMode, falImageSizeSelection, isSeedreamModel]);

  const handleModelModeChange = useCallback((mode: FalModelMode) => {
    setFalModelMode(mode);
  }, []);

  const handleFalModelChange = useCallback((modelId: string) => {
    const normalizedModelId = normalizeFalModelId(modelId);
    if (!normalizedModelId) {
      return;
    }
    if (isFalVideoModelId(normalizedModelId)) {
      setFalModelMode('video');
      setFalVideoModelId(normalizedModelId);
    } else if (isFalImageModelId(normalizedModelId)) {
      setFalModelMode('image');
      setFalImageModelId(normalizedModelId);
    }
  }, []);

  const handleFalVideoDurationChange = useCallback((value: string) => {
    if (value === '10') {
      setFalVideoDuration('10');
      return;
    }
    if (value === '5') {
      setFalVideoDuration('5');
      return;
    }
    setFalVideoDuration('6');
  }, []);

  const handleKlingVariantChange = useCallback((value: string) => {
    const variant = value === 'pro' ? 'pro' : 'standard';
    setKlingVariant(variant);
  }, []);

  const handleKlingV3DurationChange = useCallback((value: string) => {
    if (isKlingV3DurationSelectionValue(value)) {
      setKlingV3Duration(value);
    }
  }, []);

  const handleKlingV3GenerateAudioChange = useCallback((value: boolean) => {
    setKlingV3GenerateAudio(Boolean(value));
  }, []);

  const handleKlingV3CfgScaleChange = useCallback((value: string) => {
    if (isKlingV3CfgScaleSelectionValue(value)) {
      setKlingV3CfgScale(value);
    }
  }, []);

  const handleKlingV3MultiPromptEnabledChange = useCallback((value: boolean) => {
    setKlingV3MultiPromptEnabled(Boolean(value));
  }, []);

  const handleKlingV3MultiPromptChange = useCallback((value: string) => {
    setKlingV3MultiPrompt(value);
  }, []);

  const handleKlingV3Shot1DurationChange = useCallback((value: string) => {
    if (isKlingV3ShotDurationSelectionValue(value)) {
      setKlingV3Shot1Duration(value);
    }
  }, []);

  const handleKlingV3Shot2DurationChange = useCallback((value: string) => {
    if (isKlingV3ShotDurationSelectionValue(value)) {
      setKlingV3Shot2Duration(value);
    }
  }, []);

  const handleKlingO3VariantChange = useCallback((value: string) => {
    const variant: KlingO3Variant = value === 'edit' ? 'edit' : 'reference';
    setKlingO3Variant(variant);
  }, []);

  const handleKlingO3DurationChange = useCallback((value: string) => {
    if (isKlingO3DurationSelectionValue(value)) {
      setKlingO3Duration(value);
    }
  }, []);

  const handleKlingO3GenerateAudioChange = useCallback((value: boolean) => {
    setKlingO3GenerateAudio(Boolean(value));
  }, []);

  const handleKlingO3KeepAudioChange = useCallback((value: boolean) => {
    setKlingO3KeepAudio(Boolean(value));
  }, []);

  const handleKlingV3ControlKeepSoundChange = useCallback((value: boolean) => {
    setKlingV3ControlKeepSound(Boolean(value));
  }, []);

  const handleKlingV3ControlOrientationChange = useCallback((value: string) => {
    setKlingV3ControlOrientation(value === 'image' ? 'image' : 'video');
  }, []);

  const handleWanTargetResolutionChange = useCallback((value: string) => {
    setWanTargetResolution(value === '1080p' ? '1080p' : '720p');
  }, []);

  const handleWanCreativityChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setWanCreativity(1);
      return;
    }
    const clamped = Math.min(4, Math.max(0, Math.round(parsed)));
    setWanCreativity(clamped as WanCreativity);
  }, []);

  const handleWanAnimateVariantChange = useCallback((value: string) => {
    setWanAnimateVariant(value === 'move' ? 'move' : 'replace');
  }, []);

  const handleWanAnimateStepsChange = useCallback((value: string) => {
    if (value === '10' || value === '20' || value === '30' || value === '40') {
      setWanAnimateSteps(value);
    }
  }, []);

  const handleWanAnimateResolutionChange = useCallback((value: string) => {
    if (value === '480p' || value === '580p' || value === '720p') {
      setWanAnimateResolution(value);
    }
  }, []);

  const handleWanAnimateShiftChange = useCallback((value: string) => {
    if (value === '5.0' || value === '6.0' || value === '7.0' || value === '8.0' || value === '9.0' || value === '10.0') {
      setWanAnimateShift(value);
    }
  }, []);

  const handleWanAnimateQualityChange = useCallback((value: string) => {
    setWanAnimateQuality(value === 'maximum' ? 'maximum' : 'high');
  }, []);

  const handleWanAnimateTurboChange = useCallback((value: boolean) => {
    setWanAnimateUseTurbo(Boolean(value));
  }, []);

  const handleLipsyncSyncModeChange = useCallback((value: string) => {
    const valid = ['cut_off', 'loop', 'bounce', 'silence', 'remap'] as const; // Allowed Sync v3 modes.
    if (valid.includes(value as LipsyncSyncMode)) {
      setLipsyncSyncMode(value as LipsyncSyncMode);
    }
  }, []);

  const handleHeygenEnableCaptionChange = useCallback((value: boolean) => {
    setHeygenEnableCaption(Boolean(value));
  }, []);

  const handleHeygenEnableDynamicDurationChange = useCallback((value: boolean) => {
    setHeygenEnableDynamicDuration(Boolean(value));
  }, []);

  const handleHeygenDisableMusicTrackChange = useCallback((value: boolean) => {
    setHeygenDisableMusicTrack(Boolean(value));
  }, []);

  const handleHeygenEnableSpeechEnhancementChange = useCallback((value: boolean) => {
    setHeygenEnableSpeechEnhancement(Boolean(value));
  }, []);

  const handleInfinitalkResolutionChange = useCallback((value: string) => {
    if (value === '480p' || value === '720p') {
      setInfinitalkResolution(value);
    }
  }, []);

  const handleInfinitalkSeedChange = useCallback((value: string) => {
    if (value === '42' || value === 'random') {
      setInfinitalkSeed(value);
    }
  }, []);

  const handleInfinitalkAccelerationChange = useCallback((value: string) => {
    if (value === 'none' || value === 'regular' || value === 'high') {
      setInfinitalkAcceleration(value);
    }
  }, []);

  const handleInfinitalkDurationChange = useCallback((value: string) => {
    if (value === '5s' || value === '6s' || value === '10s' || value === '12s') {
      setInfinitalkDuration(value);
    }
  }, []);

  const handleGrokImagineVideoDurationChange = useCallback((value: string) => {
    if (isGrokImagineVideoDurationSelectionValue(value)) {
      setGrokImagineVideoDuration(value);
    }
  }, []);

  const handleGrokImagineVideoResolutionChange = useCallback((value: string) => {
    if (isGrokImagineVideoResolutionSelectionValue(value)) {
      setGrokImagineVideoResolution(value);
    }
  }, []);

  const handleGrokImagineVideoAspectRatioChange = useCallback((value: string) => {
    if (isGrokImagineVideoAspectRatioSelectionValue(value)) {
      setGrokImagineVideoAspectRatio(value);
    }
  }, []);

  const handleVeo31VariantChange = useCallback((value: string) => {
    const normalized = normalizeVeo31Variant(value);
    setVeo31Variant(normalized ?? 'i2v-fflf');
  }, []);

  const handleVeo31DurationChange = useCallback((value: string) => {
    if (isVeo31DurationSelectionValue(value)) {
      setVeo31Duration(value);
    }
  }, []);

  const handleVeo31ResolutionChange = useCallback((value: string) => {
    if (isVeo31ResolutionSelectionValue(value)) {
      setVeo31Resolution(value);
    }
  }, []);

  const handleVeo31AspectRatioChange = useCallback((value: string) => {
    if (isVeo31AspectRatioSelectionValue(value)) {
      setVeo31AspectRatio(value);
    }
  }, []);

  const handleVeo31GenerateAudioChange = useCallback((value: boolean) => {
    setVeo31GenerateAudio(Boolean(value));
  }, []);

  const handleWan27VideoResolutionChange = useCallback((value: string) => {
    if (isWan27VideoResolutionSelectionValue(value)) {
      setWan27VideoResolution(value);
    }
  }, []);

  const handleWan27VideoDurationChange = useCallback((value: string) => {
    if (isWan27VideoDurationSelectionValue(value)) {
      setWan27VideoDuration(value);
    }
  }, []);

  const handleWan27VideoAspectRatioChange = useCallback((value: string) => {
    if (isWan27VideoAspectRatioSelectionValue(value)) {
      setWan27VideoAspectRatio(value);
    }
  }, []);

  const handleWan27VideoPromptExpansionChange = useCallback((value: boolean) => {
    setWan27VideoPromptExpansion(value);
  }, []);

  const handleWan27VideoVariantChange = useCallback((value: string) => {
    const nextVariant = isWan27VideoVariant(value) ? value : 'smart';
    setWan27VideoVariant(nextVariant);
    if (nextVariant === 'edit') {
      setWan27VideoDuration('0');
      setWan27VideoAspectRatio('source');
      setWan27VideoAudioSetting('auto');
      return;
    }
    setWan27VideoDuration(prev => (prev === '0' ? '5' : prev));
    setWan27VideoAspectRatio(prev => (prev === 'source' ? '16:9' : prev));
  }, []);

  const handleWan27VideoAudioSettingChange = useCallback((value: string) => {
    setWan27VideoAudioSetting(value === 'origin' ? 'origin' : 'auto');
  }, []);

  const handleMiniMaxH3VariantChange = useCallback((value: string) => {
    if (!isMiniMaxH3Variant(value)) {
      return;
    }
    setMiniMaxH3Variant(value);
    setMiniMaxH3AspectRatio(current => normalizeMiniMaxH3AspectRatioForVariant(value, current));
  }, []);

  const handleMiniMaxH3AspectRatioChange = useCallback((value: string) => {
    if (isMiniMaxH3AspectRatioSelectionValue(value)) {
      setMiniMaxH3AspectRatio(value);
    }
  }, []);

  const handleMiniMaxH3DurationChange = useCallback((value: string) => {
    if (isMiniMaxH3DurationSelectionValue(value)) {
      setMiniMaxH3Duration(value);
    }
  }, []);

  const handleSeedance15AspectRatioChange = useCallback((value: string) => {
    const valid = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
    if (valid.includes(value as Seedance15AspectRatioSelectionValue)) {
      setSeedance15AspectRatio(value as Seedance15AspectRatioSelectionValue);
    }
  }, []);

  const handleSeedance15ResolutionChange = useCallback((value: string) => {
    if (value === '480p' || value === '720p' || value === '1080p') {
      setSeedance15Resolution(value);
    }
  }, []);

  const handleSeedance15DurationChange = useCallback((value: string) => {
    const valid = ['4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;
    if (valid.includes(value as Seedance15DurationSelectionValue)) {
      setSeedance15Duration(value as Seedance15DurationSelectionValue);
    }
  }, []);

  const handleSeedance15CameraFixedChange = useCallback((value: boolean) => {
    setSeedance15CameraFixed(value);
  }, []);

  const handleSeedance15AudioChange = useCallback((value: boolean) => {
    setSeedance15Audio(value);
  }, []);

  const handleSeedance2VariantChange = useCallback((value: string) => {
    if (isSeedance2Variant(value)) {
      setSeedance2Variant(value);
    }
  }, []);

  const handleSeedance2JimengModelVersionChange = useCallback((value: string) => {
    if (isJimengSeedance2ModelVersion(value)) {
      setSeedance2JimengModelVersion(value);
      if (value !== 'seedance2.0_vip') {
        setSeedance2Resolution(current => (current === '1080p' ? '720p' : current));
      }
    }
  }, []);

  const handleSeedance2AspectRatioChange = useCallback((value: string) => {
    if (isSeedance2AspectRatioSelectionValue(value)) {
      setSeedance2AspectRatio(value);
    }
  }, []);

  const handleSeedance2ResolutionChange = useCallback((value: string) => {
    if (isSeedance2ResolutionSelectionValue(value)) {
      setSeedance2Resolution(value);
    }
  }, []);

  const handleSeedance2DurationChange = useCallback((value: string) => {
    if (isSeedance2DurationSelectionValue(value)) {
      setSeedance2Duration(value);
    }
  }, []);

  const handleSeedance2GenerateAudioChange = useCallback((value: boolean) => {
    setSeedance2GenerateAudio(Boolean(value));
  }, []);

  const handleSeedance2CameraFixedChange = useCallback((value: boolean) => {
    setSeedance2CameraFixed(Boolean(value));
  }, []);

  const handleFlux2MaxImageSizeChange = useCallback((value: string) => {
    if (isFlux2MaxImageSizeSelectionValue(value)) {
      setFlux2MaxImageSize(value);
    }
  }, []);

  const handleWan27ImageAspectRatioChange = useCallback((value: string) => {
    if (isWan27ImageAspectRatioSelectionValue(value)) {
      setWan27ImageAspectRatio(value);
    }
  }, []);

  const handleWan27ImageMaxImagesChange = useCallback((value: string) => {
    if (isWan27ImageMaxImagesSelectionValue(value)) {
      setWan27ImageMaxImages(value);
    }
  }, []);

  const handleRecraftImageSizeChange = useCallback((value: string) => {
    if (isRecraftV4ProImageSizeSelectionValue(value)) {
      setRecraftImageSize(value);
    }
  }, []);

  const handleRecraftBackgroundColorChange = useCallback((value: string) => {
    const nextColor = recraftHexToRgb(value);
    if (nextColor) {
      setRecraftBackgroundColor(nextColor);
    }
  }, []);

  const handleRecraftColorChange = useCallback((index: number, value: string) => {
    const nextColor = recraftHexToRgb(value);
    if (!nextColor) {
      return;
    }
    setRecraftColors(prev => prev.map((color, colorIndex) => (colorIndex === index ? nextColor : color)).slice(0, RECRAFT_V4_PRO_MAX_COLORS));
  }, []);

  const handleRecraftAddColor = useCallback(() => {
    setRecraftColors(prev => (prev.length >= RECRAFT_V4_PRO_MAX_COLORS ? prev : [...prev, { r: 0, g: 0, b: 0 }]));
  }, []);

  const handleRecraftRemoveColor = useCallback(() => {
    setRecraftColors(prev => prev.slice(0, Math.max(0, prev.length - 1)));
  }, []);

  const handleGptImage2QualityChange = useCallback((value: string) => {
    if (isGptImage2QualitySelectionValue(value)) {
      setGptImage2Quality(value);
    }
  }, []);

  const handleKrea2AspectRatioChange = useCallback((value: string) => {
    if (isKrea2AspectRatioSelectionValue(value)) {
      setKrea2AspectRatio(value);
    }
  }, []);

  const handleKrea2CreativityChange = useCallback((value: string) => {
    if (isKrea2CreativitySelectionValue(value)) {
      setKrea2Creativity(value);
    }
  }, []);

  const handleFalImageSizeChange = useCallback((value: string) => {
    setFalImageSizeSelection(value as FalImageSizeSelectionValue);
  }, []);

  const handleFalAspectRatioChange = useCallback((value: string) => {
    setFalAspectRatioSelection(value as FalAspectRatioSelectionValue);
  }, []);

  const handleFalResolutionChange = useCallback((value: string) => {
    setFalResolutionSelection(value as FalResolutionSelectionValue);
  }, []);

  const handleFalNumImagesChange = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      setFalNumImages(1);
      return;
    }
    const maxFalNumImages = getFalNumImageMaxForModel(falModelId); // Clamp using the active model cap.
    const clamped = Math.min(maxFalNumImages, Math.max(1, Math.floor(value)));
    setFalNumImages(clamped);
  }, [falModelId]);

  const handleFalScaleFactorChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalScaleFactor(2);
      return;
    }
    const clamped = Math.min(10, Math.max(1, Math.round(parsed)));
    setFalScaleFactor(clamped);
  }, []);

  const handleFalNoiseScaleChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalNoiseScale(0.1);
      return;
    }
    const rounded = Math.round(parsed * 10) / 10;
    const clamped = Math.min(1, Math.max(0.1, rounded));
    setFalNoiseScale(clamped);
  }, []);

  const handleFalCreativityChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setFalCreativity(0);
      return;
    }
    const rounded = Math.round(parsed * 2) / 2;
    const clamped = Math.min(10, Math.max(0, rounded));
    setFalCreativity(clamped);
  }, []);

  const applyGenerationSettings = useCallback((generation: GenerationInputs): boolean => {
    if (generation.provider === 'google') {
      return true; // Google has no Fal controls to restore.
    }
    if (isUnavailableLegacyTransferModelId(generation.modelId)) {
      return false; // Removed Kling and Wan models require an explicit new model choice.
    }

    const normalizedModelId = normalizeFalModelId(resolveGenerationTransferModelId(generation));
    if (!normalizedModelId) {
      return false; // Retired or unknown models cannot be represented in the prompt bar.
    }

    const options = resolveGenerationTransferOptions(generation, normalizedModelId);

    if (isFalVideoModelId(normalizedModelId)) {
      if (normalizedModelId !== falVideoModelId && options.videoDuration !== undefined) {
        pendingFalVideoDurationTransferRef.current = { modelId: normalizedModelId, duration: options.videoDuration }; // Skip the default only for this transfer.
      }
      setFalModelMode('video');
      setFalVideoModelId(normalizedModelId);
    } else if (isFalImageModelId(normalizedModelId)) {
      setFalModelMode('image');
      setFalImageModelId(normalizedModelId);
    } else {
      return false; // Keep current settings intact when the model type is invalid.
    }

    applyGenerationTransferOptions(options, {
      imageSizeSelection: setFalImageSizeSelection,
      aspectRatioSelection: value => {
        if (isKrea2LargeModelId(normalizedModelId) && isKrea2AspectRatioSelectionValue(value)) {
          setKrea2AspectRatio(value); // Krea owns a dedicated aspect-ratio picker.
          return;
        }
        setFalAspectRatioSelection(value);
      },
      resolutionSelection: setFalResolutionSelection,
      flux2MaxImageSize: setFlux2MaxImageSize,
      gptImage2Quality: setGptImage2Quality,
      krea2Creativity: setKrea2Creativity,
      numImages: value => setFalNumImages(
        Math.min(getFalNumImageMaxForModel(normalizedModelId), Math.max(1, Math.floor(value))),
      ), // Respect the restored model's output cap.
      scaleFactor: value => setFalScaleFactor(Math.min(10, Math.max(1, Math.round(value)))),
      noiseScale: value => setFalNoiseScale(Math.min(1, Math.max(0.1, value))),
      creativity: value => setFalCreativity(Math.min(10, Math.max(0, value))),
      videoDuration: setFalVideoDuration,
      klingVariant: setKlingVariant,
      klingV3Duration: setKlingV3Duration,
      klingV3GenerateAudio: setKlingV3GenerateAudio,
      klingV3CfgScale: setKlingV3CfgScale,
      klingV3MultiPromptEnabled: setKlingV3MultiPromptEnabled,
      klingV3MultiPrompt: setKlingV3MultiPrompt,
      klingV3Shot1Duration: setKlingV3Shot1Duration,
      klingV3Shot2Duration: setKlingV3Shot2Duration,
      klingO3Variant: setKlingO3Variant,
      klingO3Duration: setKlingO3Duration,
      klingO3GenerateAudio: setKlingO3GenerateAudio,
      klingO3KeepAudio: setKlingO3KeepAudio,
      klingV3ControlKeepSound: setKlingV3ControlKeepSound,
      klingV3ControlOrientation: setKlingV3ControlOrientation,
      wanTargetResolution: setWanTargetResolution,
      wanCreativity: setWanCreativity,
      wanAnimateVariant: setWanAnimateVariant,
      wanAnimateSteps: setWanAnimateSteps,
      wanAnimateResolution: setWanAnimateResolution,
      wanAnimateShift: setWanAnimateShift,
      wanAnimateQuality: setWanAnimateQuality,
      wanAnimateUseTurbo: setWanAnimateUseTurbo,
      lipsyncSyncMode: setLipsyncSyncMode,
      heygenEnableCaption: setHeygenEnableCaption,
      heygenEnableDynamicDuration: setHeygenEnableDynamicDuration,
      heygenDisableMusicTrack: setHeygenDisableMusicTrack,
      heygenEnableSpeechEnhancement: setHeygenEnableSpeechEnhancement,
      infinitalkResolution: setInfinitalkResolution,
      infinitalkSeed: setInfinitalkSeed,
      infinitalkAcceleration: setInfinitalkAcceleration,
      infinitalkDuration: setInfinitalkDuration,
      grokImagineVideoDuration: setGrokImagineVideoDuration,
      grokImagineVideoResolution: setGrokImagineVideoResolution,
      grokImagineVideoAspectRatio: setGrokImagineVideoAspectRatio,
      veo31Variant: setVeo31Variant,
      veo31Duration: setVeo31Duration,
      veo31Resolution: setVeo31Resolution,
      veo31AspectRatio: setVeo31AspectRatio,
      veo31GenerateAudio: setVeo31GenerateAudio,
      wan27VideoResolution: setWan27VideoResolution,
      wan27VideoDuration: setWan27VideoDuration,
      wan27VideoAspectRatio: setWan27VideoAspectRatio,
      wan27VideoPromptExpansion: setWan27VideoPromptExpansion,
      wan27VideoVariant: setWan27VideoVariant,
      wan27VideoAudioSetting: setWan27VideoAudioSetting,
      miniMaxH3Variant: setMiniMaxH3Variant,
      miniMaxH3AspectRatio: setMiniMaxH3AspectRatio,
      miniMaxH3Duration: setMiniMaxH3Duration,
      seedance15AspectRatio: setSeedance15AspectRatio,
      seedance15Resolution: setSeedance15Resolution,
      seedance15Duration: setSeedance15Duration,
      seedance15CameraFixed: setSeedance15CameraFixed,
      seedance15Audio: setSeedance15Audio,
      seedance2Variant: setSeedance2Variant,
      seedance2JimengModelVersion: setSeedance2JimengModelVersion,
      seedance2AspectRatio: setSeedance2AspectRatio,
      seedance2Resolution: setSeedance2Resolution,
      seedance2Duration: setSeedance2Duration,
      seedance2GenerateAudio: setSeedance2GenerateAudio,
      seedance2CameraFixed: setSeedance2CameraFixed,
      recraftImageSize: setRecraftImageSize,
      recraftBackgroundColor: value => setRecraftBackgroundColor({ ...value }),
      recraftColors: value => setRecraftColors(value.map(color => ({ ...color }))),
      wan27ImageAspectRatio: setWan27ImageAspectRatio,
      wan27ImageMaxImages: setWan27ImageMaxImages,
    }); // Each restorable control names its setter once; the shared walker skips options the metadata omits.

    return true; // The supported model and every saved visible control are now restored.
  }, [falVideoModelId]);

  return {
    falModelMode,
    falModelId,
    falImageModelId,
    falVideoModelId,
    falVideoDuration,
    klingVariant,
    klingV3Duration,
    klingV3GenerateAudio,
    klingV3CfgScale,
    klingV3MultiPromptEnabled,
    klingV3MultiPrompt,
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
    seedance15AspectRatio,
    seedance15Resolution,
    seedance15Duration,
    seedance15CameraFixed,
    seedance15Audio,
    seedance2Variant,
    seedance2JimengModelVersion,
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
    gptImage2Quality,
    krea2AspectRatio,
    krea2Creativity,
    isFlux2MaxModel,
    isWan27ImageModel,
    isGptImage2Model: isGptImage2ModelSelection,
    isKrea2LargeModel: isKrea2LargeModelSelection,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    isVideoMode,
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
    isVolcengineSeedance2VideoModel: isVolcengineSeedance2VideoModelSelection,
    isJimengSeedance2VideoModel: isJimengSeedance2VideoModelSelection,
    isUpscaleModel,
    isKlingProVideoSelection,
    isKlingO3EditMode,
    handleModelModeChange,
    handleFalModelChange,
    handleFalVideoDurationChange,
    handleKlingVariantChange,
    handleKlingV3DurationChange,
    handleKlingV3GenerateAudioChange,
    handleKlingV3CfgScaleChange,
    handleKlingV3MultiPromptEnabledChange,
    handleKlingV3MultiPromptChange,
    handleKlingV3Shot1DurationChange,
    handleKlingV3Shot2DurationChange,
    handleKlingO3VariantChange,
    handleKlingO3DurationChange,
    handleKlingO3GenerateAudioChange,
    handleKlingO3KeepAudioChange,
    handleKlingV3ControlKeepSoundChange,
    handleKlingV3ControlOrientationChange,
    handleWanTargetResolutionChange,
    handleWanCreativityChange,
    handleWanAnimateVariantChange,
    handleWanAnimateStepsChange,
    handleWanAnimateResolutionChange,
    handleWanAnimateShiftChange,
    handleWanAnimateQualityChange,
    handleWanAnimateTurboChange,
    handleLipsyncSyncModeChange,
    handleHeygenEnableCaptionChange,
    handleHeygenEnableDynamicDurationChange,
    handleHeygenDisableMusicTrackChange,
    handleHeygenEnableSpeechEnhancementChange,
    handleInfinitalkResolutionChange,
    handleInfinitalkSeedChange,
    handleInfinitalkAccelerationChange,
    handleInfinitalkDurationChange,
    handleGrokImagineVideoDurationChange,
    handleGrokImagineVideoResolutionChange,
    handleGrokImagineVideoAspectRatioChange,
    handleVeo31VariantChange,
    handleVeo31DurationChange,
    handleVeo31ResolutionChange,
    handleVeo31AspectRatioChange,
    handleVeo31GenerateAudioChange,
    handleWan27VideoResolutionChange,
    handleWan27VideoDurationChange,
    handleWan27VideoAspectRatioChange,
    handleWan27VideoPromptExpansionChange,
    handleWan27VideoVariantChange,
    handleWan27VideoAudioSettingChange,
    handleMiniMaxH3VariantChange,
    handleMiniMaxH3AspectRatioChange,
    handleMiniMaxH3DurationChange,
    handleSeedance15AspectRatioChange,
    handleSeedance15ResolutionChange,
    handleSeedance15DurationChange,
    handleSeedance15CameraFixedChange,
    handleSeedance15AudioChange,
    handleSeedance2VariantChange,
    handleSeedance2JimengModelVersionChange,
    handleSeedance2AspectRatioChange,
    handleSeedance2ResolutionChange,
    handleSeedance2DurationChange,
    handleSeedance2GenerateAudioChange,
    handleSeedance2CameraFixedChange,
    handleFlux2MaxImageSizeChange,
    handleWan27ImageAspectRatioChange,
    handleWan27ImageMaxImagesChange,
    handleRecraftImageSizeChange,
    handleRecraftBackgroundColorChange,
    handleRecraftColorChange,
    handleRecraftAddColor,
    handleRecraftRemoveColor,
    handleGptImage2QualityChange,
    handleKrea2AspectRatioChange,
    handleKrea2CreativityChange,
    handleFalImageSizeChange,
    handleFalAspectRatioChange,
    handleFalResolutionChange,
    handleFalNumImagesChange,
    handleFalScaleFactorChange,
    handleFalNoiseScaleChange,
    handleFalCreativityChange,
    setFalModelMode,
    setFalImageModelId,
    setFalVideoModelId,
    setFalVideoDuration,
    setKlingVariant,
    setKlingV3Duration,
    setKlingV3GenerateAudio,
    setKlingV3CfgScale,
    setKlingV3MultiPromptEnabled,
    setKlingV3MultiPrompt,
    setKlingV3Shot1Duration,
    setKlingV3Shot2Duration,
    setKlingO3Variant,
    setKlingO3Duration,
    setKlingO3GenerateAudio,
    setKlingO3KeepAudio,
    setKlingV3ControlKeepSound,
    setKlingV3ControlOrientation,
    setWanTargetResolution,
    setWanCreativity,
    setWanAnimateVariant,
    setWanAnimateSteps,
    setWanAnimateResolution,
    setWanAnimateShift,
    setWanAnimateQuality,
    setWanAnimateUseTurbo,
    setLipsyncSyncMode,
    setHeygenEnableCaption,
    setHeygenEnableDynamicDuration,
    setHeygenDisableMusicTrack,
    setHeygenEnableSpeechEnhancement,
    setInfinitalkResolution,
    setInfinitalkSeed,
    setInfinitalkAcceleration,
    setInfinitalkDuration,
    setGrokImagineVideoDuration,
    setGrokImagineVideoResolution,
    setGrokImagineVideoAspectRatio,
    setVeo31Variant,
    setVeo31Duration,
    setVeo31Resolution,
    setVeo31AspectRatio,
    setVeo31GenerateAudio,
    setWan27VideoResolution,
    setWan27VideoDuration,
    setWan27VideoAspectRatio,
    setWan27VideoPromptExpansion,
    setWan27VideoVariant,
    setWan27VideoAudioSetting,
    setMiniMaxH3Variant,
    setMiniMaxH3AspectRatio,
    setMiniMaxH3Duration,
    setSeedance15AspectRatio,
    setSeedance15Resolution,
    setSeedance15Duration,
    setSeedance15CameraFixed,
    setSeedance15Audio,
    setSeedance2Variant,
    setSeedance2AspectRatio,
    setSeedance2Resolution,
    setSeedance2Duration,
    setSeedance2GenerateAudio,
    setSeedance2CameraFixed,
    setFlux2MaxImageSize,
    setWan27ImageAspectRatio,
    setWan27ImageMaxImages,
    setRecraftImageSize,
    setRecraftBackgroundColor,
    setRecraftColors,
    setGptImage2Quality,
    setKrea2AspectRatio,
    setKrea2Creativity,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
    applyGenerationSettings,
  };
}
