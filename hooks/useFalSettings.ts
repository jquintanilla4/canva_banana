import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ApiProviderId, FalVideoDuration } from '../types';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  DEFAULT_FAL_IMAGE_MODEL_ID,
  DEFAULT_FAL_VIDEO_MODEL_ID,
  FAL_NANO_BANANA_ASPECT_RATIO_OPTIONS,
  FAL_GROK_ASPECT_RATIO_OPTIONS, // Grok aspect ratio options.
  FAL_KLING_ASPECT_RATIO_OPTIONS,
  FAL_REVE_ASPECT_RATIO_OPTIONS,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID, // Grok model id.
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_26_CONTROL_VIDEO_MODEL_ID,
  KLING_26_VIDEO_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  KLING_O1_VIDEO_MODEL_ID,
  KLING_O1_VIDEO_EDIT_MODEL_ID,
  KLING_O1_VIDEO_REF_V2V_MODEL_ID,
  KLING_O1_VIDEO_FFLF_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  SORA_2_PRO_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_26_I2V_MODEL_ID,
  WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  getFalNumImageMaxForModel,
  isFlux2MaxImageSizeSelectionValue,
  isGrokImagineVideoAspectRatioSelectionValue,
  isGrokImagineVideoDurationSelectionValue,
  isGrokImagineVideoResolutionSelectionValue,
  isKlingO1VideoModelId,
  isFalImageModelId,
  isFalVideoModelId,
  isSeedreamModelId,
  isSeedreamV5LiteModelId,
  normalizeFalModelId,
  isVeo31AspectRatioSelectionValue,
  isVeo31DurationSelectionValue,
  isVeo31ResolutionSelectionValue,
  isVeo31Variant,
  normalizeVeo31Variant,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
  isWan26ImageAspectRatioSelectionValue,
  isWan26ImageMaxImagesSelectionValue,
} from '../services/modelConfig';
import type {
  FalAspectRatioSelectionValue,
  FalImageModelId,
  FalImageSizeSelectionValue,
  FalModelId,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  Flux2MaxImageSizeSelectionValue,
  HailuoVariant,
  Kling26AudioSelectionValue,
  Kling26ControlDriver,
  Kling26ControlVariant,
  KlingO1Variant,
  KlingVariant,
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
} from '../services/modelConfig';

type UseFalSettingsArgs = {
  apiProvider: ApiProviderId;
};

type FalDerivedState = {
  falModelId: FalModelId;
  isVideoMode: boolean;
  isKlingVideoModel: boolean;
  isKlingO1VideoModel: boolean;
  isKling26VideoModel: boolean;
  isKling26ControlVideoModel: boolean;
  isHailuoVideoModel: boolean;
  isWanAnimateVideoModel: boolean;
  isOneToAllAnimateVideoModel: boolean;
  isLipsyncVideoModel: boolean;
  isInfinitalkVideoModel: boolean;
  isGrokImagineVideoModel: boolean;
  isSora2ProVideoModel: boolean;
  isWan26I2VVideoModel: boolean;
  isSeedance15VideoModel: boolean;
  isVeo31VideoModel: boolean;
  isFlux2MaxModel: boolean;
  isWan26ImageModel: boolean;
  isUpscaleModel: boolean;
  isKlingProVideoSelection: boolean;
  isKlingO1EditMode: boolean;
  isKlingO1RefV2VMode: boolean;
};

type FalHandlers = {
  handleModelModeChange: (mode: FalModelMode) => void;
  handleFalModelChange: (modelId: string) => void;
  handleFalVideoDurationChange: (value: string) => void;
  handleHailuoVariantChange: (value: string) => void;
  handleKlingVariantChange: (value: string) => void;
  handleKlingO1VariantChange: (value: string) => void;
  handleKlingO1KeepAudioChange: (value: boolean) => void;
  handleKling26AudioChange: (value: string) => void;
  handleKling26ControlVariantChange: (value: string) => void;
  handleKling26ControlKeepSoundChange: (value: boolean) => void;
  handleKling26ControlDriverChange: (value: string) => void;
  handleWanTargetResolutionChange: (value: string) => void;
  handleWanCreativityChange: (value: string) => void;
  handleWanAnimateVariantChange: (value: string) => void;
  handleWanAnimateStepsChange: (value: string) => void;
  handleWanAnimateResolutionChange: (value: string) => void;
  handleOneToAllAnimateResolutionChange: (value: string) => void;
  handleWanAnimateShiftChange: (value: string) => void;
  handleWanAnimateQualityChange: (value: string) => void;
  handleWanAnimateTurboChange: (value: boolean) => void;
  handleLipsyncEmotionChange: (value: string) => void;
  handleLipsyncModelModeChange: (value: string) => void;
  handleLipsyncAudioModeChange: (value: string) => void;
  handleInfinitalkResolutionChange: (value: string) => void;
  handleInfinitalkSeedChange: (value: string) => void;
  handleInfinitalkAccelerationChange: (value: string) => void;
  handleInfinitalkDurationChange: (value: string) => void;
  handleGrokImagineVideoDurationChange: (value: string) => void;
  handleGrokImagineVideoResolutionChange: (value: string) => void;
  handleGrokImagineVideoAspectRatioChange: (value: string) => void;
  handleSora2ProResolutionChange: (value: string) => void;
  handleSora2ProAspectRatioChange: (value: string) => void;
  handleSora2ProDurationChange: (value: string) => void;
  handleVeo31VariantChange: (value: string) => void;
  handleVeo31DurationChange: (value: string) => void;
  handleVeo31ResolutionChange: (value: string) => void;
  handleVeo31AspectRatioChange: (value: string) => void;
  handleVeo31GenerateAudioChange: (value: boolean) => void;
  handleWan26ResolutionChange: (value: string) => void;
  handleWan26DurationChange: (value: string) => void;
  handleWan26PromptExpansionChange: (value: boolean) => void;
  handleWan26MultiShotsChange: (value: boolean) => void;
  handleSeedance15AspectRatioChange: (value: string) => void;
  handleSeedance15ResolutionChange: (value: string) => void;
  handleSeedance15DurationChange: (value: string) => void;
  handleSeedance15CameraFixedChange: (value: boolean) => void;
  handleSeedance15AudioChange: (value: boolean) => void;
  handleFlux2MaxImageSizeChange: (value: string) => void;
  handleWan26ImageAspectRatioChange: (value: string) => void;
  handleWan26ImageMaxImagesChange: (value: string) => void;
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
  hailuoVariant: HailuoVariant;
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
  setHailuoVariant: Dispatch<SetStateAction<HailuoVariant>>;
  setKlingVariant: Dispatch<SetStateAction<KlingVariant>>;
  setKlingO1Variant: Dispatch<SetStateAction<KlingO1Variant>>;
  setKlingO1KeepAudio: Dispatch<SetStateAction<boolean>>;
  setKling26AudioSelection: Dispatch<SetStateAction<Kling26AudioSelectionValue>>;
  setKling26ControlVariant: Dispatch<SetStateAction<Kling26ControlVariant>>;
  setKling26ControlKeepSound: Dispatch<SetStateAction<boolean>>;
  setKling26ControlDriver: Dispatch<SetStateAction<Kling26ControlDriver>>;
  setWanTargetResolution: Dispatch<SetStateAction<WanTargetResolution>>;
  setWanCreativity: Dispatch<SetStateAction<WanCreativity>>;
  setWanAnimateVariant: Dispatch<SetStateAction<WanAnimateVariant>>;
  setWanAnimateSteps: Dispatch<SetStateAction<WanAnimateStepsSelectionValue>>;
  setWanAnimateResolution: Dispatch<SetStateAction<WanAnimateResolutionSelectionValue>>;
  setOneToAllAnimateResolution: Dispatch<SetStateAction<WanAnimateResolutionSelectionValue>>;
  setWanAnimateShift: Dispatch<SetStateAction<WanAnimateShiftSelectionValue>>;
  setWanAnimateQuality: Dispatch<SetStateAction<WanAnimateQualitySelectionValue>>;
  setWanAnimateUseTurbo: Dispatch<SetStateAction<boolean>>;
  setLipsyncEmotion: Dispatch<SetStateAction<LipsyncEmotion>>;
  setLipsyncModelMode: Dispatch<SetStateAction<LipsyncModelMode>>;
  setLipsyncAudioMode: Dispatch<SetStateAction<LipsyncAudioMode>>;
  setInfinitalkResolution: Dispatch<SetStateAction<InfinitalkResolutionSelectionValue>>;
  setInfinitalkSeed: Dispatch<SetStateAction<InfinitalkSeedSelectionValue>>;
  setInfinitalkAcceleration: Dispatch<SetStateAction<InfinitalkAccelerationSelectionValue>>;
  setInfinitalkDuration: Dispatch<SetStateAction<InfinitalkDurationSelectionValue>>;
  setGrokImagineVideoDuration: Dispatch<SetStateAction<GrokImagineVideoDurationSelectionValue>>;
  setGrokImagineVideoResolution: Dispatch<SetStateAction<GrokImagineVideoResolutionSelectionValue>>;
  setGrokImagineVideoAspectRatio: Dispatch<SetStateAction<GrokImagineVideoAspectRatioSelectionValue>>;
  setSora2ProResolution: Dispatch<SetStateAction<Sora2ProResolutionSelectionValue>>;
  setSora2ProAspectRatio: Dispatch<SetStateAction<Sora2ProAspectRatioSelectionValue>>;
  setSora2ProDuration: Dispatch<SetStateAction<Sora2ProDurationSelectionValue>>;
  setVeo31Variant: Dispatch<SetStateAction<Veo31Variant>>;
  setVeo31Duration: Dispatch<SetStateAction<Veo31DurationSelectionValue>>;
  setVeo31Resolution: Dispatch<SetStateAction<Veo31ResolutionSelectionValue>>;
  setVeo31AspectRatio: Dispatch<SetStateAction<Veo31AspectRatioSelectionValue>>;
  setVeo31GenerateAudio: Dispatch<SetStateAction<boolean>>;
  setWan26Resolution: Dispatch<SetStateAction<Wan26ResolutionSelectionValue>>;
  setWan26Duration: Dispatch<SetStateAction<Wan26DurationSelectionValue>>;
  setWan26PromptExpansion: Dispatch<SetStateAction<boolean>>;
  setWan26MultiShots: Dispatch<SetStateAction<boolean>>;
  setSeedance15AspectRatio: Dispatch<SetStateAction<Seedance15AspectRatioSelectionValue>>;
  setSeedance15Resolution: Dispatch<SetStateAction<Seedance15ResolutionSelectionValue>>;
  setSeedance15Duration: Dispatch<SetStateAction<Seedance15DurationSelectionValue>>;
  setSeedance15CameraFixed: Dispatch<SetStateAction<boolean>>;
  setSeedance15Audio: Dispatch<SetStateAction<boolean>>;
  setFlux2MaxImageSize: Dispatch<SetStateAction<Flux2MaxImageSizeSelectionValue>>;
  setWan26ImageAspectRatio: Dispatch<SetStateAction<Wan26ImageAspectRatioSelectionValue>>;
  setWan26ImageMaxImages: Dispatch<SetStateAction<Wan26ImageMaxImagesSelectionValue>>;
  setFalImageSizeSelection: Dispatch<SetStateAction<FalImageSizeSelectionValue>>;
  setFalAspectRatioSelection: Dispatch<SetStateAction<FalAspectRatioSelectionValue>>;
  setFalResolutionSelection: Dispatch<SetStateAction<FalResolutionSelectionValue>>;
  setFalNumImages: Dispatch<SetStateAction<number>>;
  setFalScaleFactor: Dispatch<SetStateAction<number>>;
  setFalNoiseScale: Dispatch<SetStateAction<number>>;
  setFalCreativity: Dispatch<SetStateAction<number>>;
};

export function useFalSettings({ apiProvider }: UseFalSettingsArgs): UseFalSettingsResult {
  // Centralized store for FAL model selection plus model-specific knobs used across the UI.
  const [falModelMode, setFalModelMode] = useState<FalModelMode>('image');
  const [falImageModelId, setFalImageModelId] = useState<FalImageModelId>(DEFAULT_FAL_IMAGE_MODEL_ID);
  const [falVideoModelId, setFalVideoModelId] = useState<FalVideoModelId>(DEFAULT_FAL_VIDEO_MODEL_ID);
  const [falVideoDuration, setFalVideoDuration] = useState<FalVideoDuration>('6');
  const [hailuoVariant, setHailuoVariant] = useState<HailuoVariant>('standard');
  const [klingVariant, setKlingVariant] = useState<KlingVariant>('standard');
  const [klingO1Variant, setKlingO1Variant] = useState<KlingO1Variant>('refI2V');
  const [klingO1KeepAudio, setKlingO1KeepAudio] = useState<boolean>(false);
  const [kling26AudioSelection, setKling26AudioSelection] = useState<Kling26AudioSelectionValue>('placeholder');
  const [kling26ControlVariant, setKling26ControlVariant] = useState<Kling26ControlVariant>('standard');
  const [kling26ControlKeepSound, setKling26ControlKeepSound] = useState<boolean>(true);
  const [kling26ControlDriver, setKling26ControlDriver] = useState<Kling26ControlDriver>('video');
  const [wanTargetResolution, setWanTargetResolution] = useState<WanTargetResolution>('720p');
  const [wanCreativity, setWanCreativity] = useState<WanCreativity>(1);
  const [wanAnimateVariant, setWanAnimateVariant] = useState<WanAnimateVariant>('replace');
  const [wanAnimateSteps, setWanAnimateSteps] = useState<WanAnimateStepsSelectionValue>('20');
  const [wanAnimateResolution, setWanAnimateResolution] = useState<WanAnimateResolutionSelectionValue>('480p');
  const [oneToAllAnimateResolution, setOneToAllAnimateResolution] = useState<WanAnimateResolutionSelectionValue>('480p');
  const [wanAnimateShift, setWanAnimateShift] = useState<WanAnimateShiftSelectionValue>('5.0');
  const [wanAnimateQuality, setWanAnimateQuality] = useState<WanAnimateQualitySelectionValue>('high');
  const [wanAnimateUseTurbo, setWanAnimateUseTurbo] = useState<boolean>(false);
  const [lipsyncEmotion, setLipsyncEmotion] = useState<LipsyncEmotion>('neutral');
  const [lipsyncModelMode, setLipsyncModelMode] = useState<LipsyncModelMode>('face');
  const [lipsyncAudioMode, setLipsyncAudioMode] = useState<LipsyncAudioMode>('bounce');
  const [infinitalkResolution, setInfinitalkResolution] = useState<InfinitalkResolutionSelectionValue>('480p');
  const [infinitalkSeed, setInfinitalkSeed] = useState<InfinitalkSeedSelectionValue>('42');
  const [infinitalkAcceleration, setInfinitalkAcceleration] = useState<InfinitalkAccelerationSelectionValue>('regular');
  const [infinitalkDuration, setInfinitalkDuration] = useState<InfinitalkDurationSelectionValue>('5s');
  const [grokImagineVideoDuration, setGrokImagineVideoDuration] = useState<GrokImagineVideoDurationSelectionValue>('6');
  const [grokImagineVideoResolution, setGrokImagineVideoResolution] = useState<GrokImagineVideoResolutionSelectionValue>('720p');
  const [grokImagineVideoAspectRatio, setGrokImagineVideoAspectRatio] = useState<GrokImagineVideoAspectRatioSelectionValue>('auto');
  const [sora2ProResolution, setSora2ProResolution] = useState<Sora2ProResolutionSelectionValue>('auto');
  const [sora2ProAspectRatio, setSora2ProAspectRatio] = useState<Sora2ProAspectRatioSelectionValue>('auto');
  const [sora2ProDuration, setSora2ProDuration] = useState<Sora2ProDurationSelectionValue>('4');
  const [veo31Variant, setVeo31Variant] = useState<Veo31Variant>('i2v-fflf');
  const [veo31Duration, setVeo31Duration] = useState<Veo31DurationSelectionValue>('8s');
  const [veo31Resolution, setVeo31Resolution] = useState<Veo31ResolutionSelectionValue>('720p');
  const [veo31AspectRatio, setVeo31AspectRatio] = useState<Veo31AspectRatioSelectionValue>('auto');
  const [veo31GenerateAudio, setVeo31GenerateAudio] = useState<boolean>(true);
  const [wan26Resolution, setWan26Resolution] = useState<Wan26ResolutionSelectionValue>('720p');
  const [wan26Duration, setWan26Duration] = useState<Wan26DurationSelectionValue>('5');
  const [wan26PromptExpansion, setWan26PromptExpansion] = useState<boolean>(true);
  const [wan26MultiShots, setWan26MultiShots] = useState<boolean>(false);
  const [seedance15AspectRatio, setSeedance15AspectRatio] = useState<Seedance15AspectRatioSelectionValue>('16:9');
  const [seedance15Resolution, setSeedance15Resolution] = useState<Seedance15ResolutionSelectionValue>('720p');
  const [seedance15Duration, setSeedance15Duration] = useState<Seedance15DurationSelectionValue>('5');
  const [seedance15CameraFixed, setSeedance15CameraFixed] = useState<boolean>(false);
  const [seedance15Audio, setSeedance15Audio] = useState<boolean>(false);
  const [flux2MaxImageSize, setFlux2MaxImageSize] = useState<Flux2MaxImageSizeSelectionValue>('landscape_4_3');
  const [wan26ImageAspectRatio, setWan26ImageAspectRatio] = useState<Wan26ImageAspectRatioSelectionValue>('landscape_16_9');
  const [wan26ImageMaxImages, setWan26ImageMaxImages] = useState<Wan26ImageMaxImagesSelectionValue>('1');
  const [falImageSizeSelection, setFalImageSizeSelection] = useState<FalImageSizeSelectionValue>('placeholder');
  const [falAspectRatioSelection, setFalAspectRatioSelection] = useState<FalAspectRatioSelectionValue>('placeholder');
  const [falResolutionSelection, setFalResolutionSelection] = useState<FalResolutionSelectionValue>('1K');
  const [falNumImages, setFalNumImages] = useState(1);
  const [falScaleFactor, setFalScaleFactor] = useState(2);
  const [falNoiseScale, setFalNoiseScale] = useState(0.1);
  const [falCreativity, setFalCreativity] = useState(0);

  const falModelId: FalModelId = useMemo(
    () => (falModelMode === 'video' ? falVideoModelId : falImageModelId),
    [falModelMode, falImageModelId, falVideoModelId],
  );
  const isVideoMode = falModelMode === 'video';
  const isKlingVideoModel = isVideoMode && falVideoModelId === KLING_VIDEO_MODEL_ID;
  const isKlingO1VideoModel = isVideoMode && isKlingO1VideoModelId(falVideoModelId);
  const isKling26VideoModel = isVideoMode && falVideoModelId === KLING_26_VIDEO_MODEL_ID;
  const isKling26ControlVideoModel = isVideoMode && falVideoModelId === KLING_26_CONTROL_VIDEO_MODEL_ID;
  const isHailuoVideoModel = isVideoMode && falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
  const isWanAnimateVideoModel = isVideoMode && falVideoModelId === WAN_ANIMATE_MODEL_ID;
  const isOneToAllAnimateVideoModel = isVideoMode && falVideoModelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
  const isLipsyncVideoModel = isVideoMode && falVideoModelId === SYNC_LIPSYNC_MODEL_ID;
  const isInfinitalkVideoModel = isVideoMode && falVideoModelId === INFINITALK_VIDEO_MODEL_ID;
  const isGrokImagineVideoModel = isVideoMode && falVideoModelId === GROK_IMAGINE_VIDEO_MODEL_ID;
  const isSora2ProVideoModel = isVideoMode && falVideoModelId === SORA_2_PRO_VIDEO_MODEL_ID;
  const isWan26I2VVideoModel = isVideoMode && falVideoModelId === WAN_26_I2V_MODEL_ID;
  const isSeedance15VideoModel = isVideoMode && falVideoModelId === SEEDANCE_15_VIDEO_MODEL_ID;
  const isVeo31VideoModel = isVideoMode && falVideoModelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID;
  const isFlux2MaxModel = !isVideoMode && falImageModelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
  const isWan26ImageModel = !isVideoMode && falImageModelId === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  const isUpscaleModel = !isVideoMode && (falModelId === CRYSTAL_UPSCALER_MODEL_ID || falModelId === SEEDVR_UPSCALER_MODEL_ID);
  const isKlingProVideoSelection = apiProvider === 'fal' && isKlingVideoModel && klingVariant === 'pro';
  const isKlingO1EditMode = isKlingO1VideoModel && klingO1Variant === 'edit';
  const isKlingO1RefV2VMode = isKlingO1VideoModel && klingO1Variant === 'refV2V';
  const isSeedreamModel = isSeedreamModelId(falModelId);

  // Non-FAL providers cannot use video mode; reset when switching providers.
  useEffect(() => {
    if (apiProvider !== 'fal' && falModelMode !== 'image') {
      setFalModelMode('image');
    }
  }, [apiProvider, falModelMode]);

  // Kling image model does not support 4K; downgrade silently for UX.
  useEffect(() => {
    if (falModelId === KLING_IMAGE_MODEL_ID && falResolutionSelection === '4K') {
      setFalResolutionSelection('2K');
    }
  }, [falModelId, falResolutionSelection]);

  useEffect(() => {
    if (falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID) {
      setFalVideoDuration(prev => (prev === '10' ? '10' : '6'));
      return;
    }
    if (
      falVideoModelId === KLING_VIDEO_MODEL_ID
      || falVideoModelId === KLING_26_VIDEO_MODEL_ID
      || falVideoModelId === KLING_O1_VIDEO_MODEL_ID
      || falVideoModelId === KLING_O1_VIDEO_EDIT_MODEL_ID
      || falVideoModelId === KLING_O1_VIDEO_REF_V2V_MODEL_ID
      || falVideoModelId === KLING_O1_VIDEO_FFLF_MODEL_ID
    ) {
      setFalVideoDuration(prev => (prev === '10' ? '10' : '5'));
    }
  }, [falVideoModelId]);

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
    if (falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID && hailuoVariant === 'pro' && falVideoDuration !== '6') {
      setFalVideoDuration('6');
    }
  }, [falVideoModelId, hailuoVariant, falVideoDuration]);

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
    const aspectRatioOptions = falModelId === REVE_TEXT_TO_IMAGE_MODEL_ID
      ? FAL_REVE_ASPECT_RATIO_OPTIONS
      : falModelId === GROK_IMAGINE_IMAGE_MODEL_ID // Grok model branch.
        ? FAL_GROK_ASPECT_RATIO_OPTIONS // Grok aspect ratios.
      : falModelId === KLING_IMAGE_MODEL_ID
        ? FAL_KLING_ASPECT_RATIO_OPTIONS
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
    if (!isSeedreamModel) {
      return;
    }
    const validImageSizeOptions = getSeedreamImageSizeOptions(falModelId).map(option => option.value);
    if (!validImageSizeOptions.includes(falImageSizeSelection)) {
      const fallback = isSeedreamV5LiteModelId(falModelId) ? 'auto_2K' : 'default'; // Seedream 5 Lite defaults to auto_2K.
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

  const handleHailuoVariantChange = useCallback((value: string) => {
    const variant = value === 'pro' ? 'pro' : 'standard';
    setHailuoVariant(variant);
    if (variant === 'pro') {
      setFalVideoDuration('6');
    }
  }, []);

  const handleKlingVariantChange = useCallback((value: string) => {
    const variant = value === 'pro' ? 'pro' : 'standard';
    setKlingVariant(variant);
  }, []);

  const handleKlingO1VariantChange = useCallback((value: string) => {
    const variant: KlingO1Variant = value === 'edit' || value === 'fflf' || value === 'refV2V' ? value : 'refI2V';
    setKlingO1Variant(variant);
  }, []);

  const handleKlingO1KeepAudioChange = useCallback((value: boolean) => {
    setKlingO1KeepAudio(value);
  }, []);

  const handleKling26AudioChange = useCallback((value: string) => {
    if (value === 'on') {
      setKling26AudioSelection('on');
      return;
    }
    if (value === 'off') {
      setKling26AudioSelection('off');
      return;
    }
    setKling26AudioSelection('placeholder');
  }, []);

  const handleKling26ControlVariantChange = useCallback((value: string) => {
    setKling26ControlVariant(value === 'pro' ? 'pro' : 'standard');
  }, []);

  const handleKling26ControlKeepSoundChange = useCallback((value: boolean) => {
    setKling26ControlKeepSound(Boolean(value));
  }, []);

  const handleKling26ControlDriverChange = useCallback((value: string) => {
    setKling26ControlDriver(value === 'image' ? 'image' : 'video');
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

  const handleOneToAllAnimateResolutionChange = useCallback((value: string) => {
    if (value === '480p' || value === '580p' || value === '720p') {
      setOneToAllAnimateResolution(value);
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

  const handleLipsyncEmotionChange = useCallback((value: string) => {
    const valid = ['happy', 'angry', 'sad', 'neutral', 'disgusted', 'surprised'] as const;
    if (valid.includes(value as LipsyncEmotion)) {
      setLipsyncEmotion(value as LipsyncEmotion);
    }
  }, []);

  const handleLipsyncModelModeChange = useCallback((value: string) => {
    const valid = ['lips', 'face', 'head'] as const;
    if (valid.includes(value as LipsyncModelMode)) {
      setLipsyncModelMode(value as LipsyncModelMode);
    }
  }, []);

  const handleLipsyncAudioModeChange = useCallback((value: string) => {
    const valid = ['cut_off', 'loop', 'bounce', 'silence', 'remap'] as const;
    if (valid.includes(value as LipsyncAudioMode)) {
      setLipsyncAudioMode(value as LipsyncAudioMode);
    }
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

  const handleSora2ProResolutionChange = useCallback((value: string) => {
    if (value === 'auto' || value === '720p' || value === '1080p') {
      setSora2ProResolution(value);
    }
  }, []);

  const handleSora2ProAspectRatioChange = useCallback((value: string) => {
    if (value === 'auto' || value === '9:16' || value === '16:9') {
      setSora2ProAspectRatio(value);
    }
  }, []);

  const handleSora2ProDurationChange = useCallback((value: string) => {
    if (value === '4' || value === '8' || value === '12') {
      setSora2ProDuration(value);
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

  const handleWan26ResolutionChange = useCallback((value: string) => {
    if (value === '720p' || value === '1080p') {
      setWan26Resolution(value);
    }
  }, []);

  const handleWan26DurationChange = useCallback((value: string) => {
    if (value === '5' || value === '10' || value === '15') {
      setWan26Duration(value);
    }
  }, []);

  const handleWan26PromptExpansionChange = useCallback((value: boolean) => {
    setWan26PromptExpansion(value);
    if (!value) {
      setWan26MultiShots(false);
    }
  }, []);

  const handleWan26MultiShotsChange = useCallback((value: boolean) => {
    setWan26MultiShots(value);
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

  const handleFlux2MaxImageSizeChange = useCallback((value: string) => {
    if (isFlux2MaxImageSizeSelectionValue(value)) {
      setFlux2MaxImageSize(value);
    }
  }, []);

  const handleWan26ImageAspectRatioChange = useCallback((value: string) => {
    if (isWan26ImageAspectRatioSelectionValue(value)) {
      setWan26ImageAspectRatio(value);
    }
  }, []);

  const handleWan26ImageMaxImagesChange = useCallback((value: string) => {
    if (isWan26ImageMaxImagesSelectionValue(value)) {
      setWan26ImageMaxImages(value);
    }
  }, []);

  const handleFalImageSizeChange = useCallback((value: string) => {
    setFalImageSizeSelection(value as FalImageSizeSelectionValue);
  }, []);

  const handleFalAspectRatioChange = useCallback((value: string) => {
    setFalAspectRatioSelection(value as FalAspectRatioSelectionValue);
  }, []);

  const handleFalResolutionChange = useCallback((value: string) => {
    const nextValue = value === '4K' && falModelId === KLING_IMAGE_MODEL_ID ? '2K' : value;
    setFalResolutionSelection(nextValue as FalResolutionSelectionValue);
  }, [falModelId]);

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

  return {
    falModelMode,
    falModelId,
    falImageModelId,
    falVideoModelId,
    falVideoDuration,
    hailuoVariant,
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
    isFlux2MaxModel,
    isWan26ImageModel,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    isVideoMode,
    isKlingVideoModel,
    isKlingO1VideoModel,
    isKling26VideoModel,
    isKling26ControlVideoModel,
    isHailuoVideoModel,
    isWanAnimateVideoModel,
    isOneToAllAnimateVideoModel,
    isLipsyncVideoModel,
    isInfinitalkVideoModel,
    isGrokImagineVideoModel,
    isSora2ProVideoModel,
    isVeo31VideoModel,
    isWan26I2VVideoModel,
    isSeedance15VideoModel,
    isUpscaleModel,
    isKlingProVideoSelection,
    isKlingO1EditMode,
    isKlingO1RefV2VMode,
    handleModelModeChange,
    handleFalModelChange,
    handleFalVideoDurationChange,
    handleHailuoVariantChange,
    handleKlingVariantChange,
    handleKlingO1VariantChange,
    handleKlingO1KeepAudioChange,
    handleKling26AudioChange,
    handleKling26ControlVariantChange,
    handleKling26ControlKeepSoundChange,
    handleKling26ControlDriverChange,
    handleWanTargetResolutionChange,
    handleWanCreativityChange,
    handleWanAnimateVariantChange,
    handleWanAnimateStepsChange,
    handleWanAnimateResolutionChange,
    handleOneToAllAnimateResolutionChange,
    handleWanAnimateShiftChange,
    handleWanAnimateQualityChange,
    handleWanAnimateTurboChange,
    handleLipsyncEmotionChange,
    handleLipsyncModelModeChange,
    handleLipsyncAudioModeChange,
    handleInfinitalkResolutionChange,
    handleInfinitalkSeedChange,
    handleInfinitalkAccelerationChange,
    handleInfinitalkDurationChange,
    handleGrokImagineVideoDurationChange,
    handleGrokImagineVideoResolutionChange,
    handleGrokImagineVideoAspectRatioChange,
    handleSora2ProResolutionChange,
    handleSora2ProAspectRatioChange,
    handleSora2ProDurationChange,
    handleVeo31VariantChange,
    handleVeo31DurationChange,
    handleVeo31ResolutionChange,
    handleVeo31AspectRatioChange,
    handleVeo31GenerateAudioChange,
    handleWan26ResolutionChange,
    handleWan26DurationChange,
    handleWan26PromptExpansionChange,
    handleWan26MultiShotsChange,
    handleSeedance15AspectRatioChange,
    handleSeedance15ResolutionChange,
    handleSeedance15DurationChange,
    handleSeedance15CameraFixedChange,
    handleSeedance15AudioChange,
    handleFlux2MaxImageSizeChange,
    handleWan26ImageAspectRatioChange,
    handleWan26ImageMaxImagesChange,
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
    setHailuoVariant,
    setKlingVariant,
    setKlingO1Variant,
    setKlingO1KeepAudio,
    setKling26AudioSelection,
    setKling26ControlVariant,
    setKling26ControlKeepSound,
    setKling26ControlDriver,
    setWanTargetResolution,
    setWanCreativity,
    setWanAnimateVariant,
    setWanAnimateSteps,
    setWanAnimateResolution,
    setOneToAllAnimateResolution,
    setWanAnimateShift,
    setWanAnimateQuality,
    setWanAnimateUseTurbo,
    setLipsyncEmotion,
    setLipsyncModelMode,
    setLipsyncAudioMode,
    setInfinitalkResolution,
    setInfinitalkSeed,
    setInfinitalkAcceleration,
    setInfinitalkDuration,
    setGrokImagineVideoDuration,
    setGrokImagineVideoResolution,
    setGrokImagineVideoAspectRatio,
    setSora2ProResolution,
    setSora2ProAspectRatio,
    setSora2ProDuration,
    setVeo31Variant,
    setVeo31Duration,
    setVeo31Resolution,
    setVeo31AspectRatio,
    setVeo31GenerateAudio,
    setWan26Resolution,
    setWan26Duration,
    setWan26PromptExpansion,
    setWan26MultiShots,
    setSeedance15AspectRatio,
    setSeedance15Resolution,
    setSeedance15Duration,
    setSeedance15CameraFixed,
    setSeedance15Audio,
    setFlux2MaxImageSize,
    setWan26ImageAspectRatio,
    setWan26ImageMaxImages,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
  };
}
