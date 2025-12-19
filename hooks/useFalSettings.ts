import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ApiProviderId, FalVideoDuration } from '../types';
import {
  CRYSTAL_UPSCALER_MODEL_ID,
  DEFAULT_FAL_IMAGE_MODEL_ID,
  DEFAULT_FAL_VIDEO_MODEL_ID,
  FAL_GEMINI_ASPECT_RATIO_OPTIONS,
  FAL_KLING_ASPECT_RATIO_OPTIONS,
  FAL_REVE_ASPECT_RATIO_OPTIONS,
  HAILUO_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_26_VIDEO_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  KLING_O1_VIDEO_MODEL_ID,
  KLING_O1_VIDEO_EDIT_MODEL_ID,
  KLING_O1_VIDEO_REF_V2V_MODEL_ID,
  KLING_O1_VIDEO_FFLF_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  isKlingO1VideoModelId,
  isFalImageModelId,
  isFalVideoModelId,
  normalizeFalModelId,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
} from '../services/modelConfig';
import type {
  FalAspectRatioSelectionValue,
  FalImageModelId,
  FalImageSizeSelectionValue,
  FalModelId,
  FalModelMode,
  FalResolutionSelectionValue,
  FalVideoModelId,
  HailuoVariant,
  Kling26AudioSelectionValue,
  KlingO1Variant,
  KlingVariant,
  LipsyncAudioMode,
  LipsyncEmotion,
  LipsyncModelMode,
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
  isHailuoVideoModel: boolean;
  isWanAnimateVideoModel: boolean;
  isOneToAllAnimateVideoModel: boolean;
  isLipsyncVideoModel: boolean;
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
  const isHailuoVideoModel = isVideoMode && falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
  const isWanAnimateVideoModel = isVideoMode && falVideoModelId === WAN_ANIMATE_MODEL_ID;
  const isOneToAllAnimateVideoModel = isVideoMode && falVideoModelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
  const isLipsyncVideoModel = isVideoMode && falVideoModelId === SYNC_LIPSYNC_MODEL_ID;
  const isUpscaleModel = !isVideoMode && (falModelId === CRYSTAL_UPSCALER_MODEL_ID || falModelId === SEEDVR_UPSCALER_MODEL_ID);
  const isKlingProVideoSelection = apiProvider === 'fal' && isKlingVideoModel && klingVariant === 'pro';
  const isKlingO1EditMode = isKlingO1VideoModel && klingO1Variant === 'edit';
  const isKlingO1RefV2VMode = isKlingO1VideoModel && klingO1Variant === 'refV2V';
  const isSeedreamModel = falModelId === SEEDREAM_MODEL_ID || falModelId === SEEDREAM_V45_MODEL_ID;

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
    if (falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID && hailuoVariant === 'pro' && falVideoDuration !== '6') {
      setFalVideoDuration('6');
    }
  }, [falVideoModelId, hailuoVariant, falVideoDuration]);

  useEffect(() => {
    setFalScaleFactor(prev => {
      const normalizedPrev = Number.isFinite(prev) ? Math.round(prev) : 2;
      const clamped = Math.min(10, Math.max(1, normalizedPrev));
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
      : falModelId === KLING_IMAGE_MODEL_ID
        ? FAL_KLING_ASPECT_RATIO_OPTIONS
        : isSeedreamModel
          ? getSeedreamAspectRatioOptions(falModelId)
          : FAL_GEMINI_ASPECT_RATIO_OPTIONS;
    const validOptions = aspectRatioOptions.map(option => option.value);
    if (!validOptions.includes(falAspectRatioSelection)) {
      setFalAspectRatioSelection('default');
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
      setFalImageSizeSelection('default');
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
    const clamped = Math.min(4, Math.max(1, Math.floor(value)));
    setFalNumImages(clamped);
  }, []);

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
    isHailuoVideoModel,
    isWanAnimateVideoModel,
    isOneToAllAnimateVideoModel,
    isLipsyncVideoModel,
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
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
  };
}
