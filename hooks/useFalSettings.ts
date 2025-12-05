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
  KLING_VIDEO_MODEL_ID,
  REVE_TEXT_TO_IMAGE_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  isFalImageModelId,
  isFalVideoModelId,
  normalizeFalModelId,
  getSeedreamAspectRatioOptions,
  getSeedreamImageSizeOptions,
  isSeedreamV45ModelId,
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
  KlingVariant,
} from '../services/modelConfig';

type UseFalSettingsArgs = {
  apiProvider: ApiProviderId;
};

type FalDerivedState = {
  falModelId: FalModelId;
  isVideoMode: boolean;
  isKlingVideoModel: boolean;
  isKling26VideoModel: boolean;
  isHailuoVideoModel: boolean;
  isUpscaleModel: boolean;
  isKlingProVideoSelection: boolean;
};

type FalHandlers = {
  handleModelModeChange: (mode: FalModelMode) => void;
  handleFalModelChange: (modelId: string) => void;
  handleFalVideoDurationChange: (value: string) => void;
  handleHailuoVariantChange: (value: string) => void;
  handleKlingVariantChange: (value: string) => void;
  handleKling26AudioChange: (value: string) => void;
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
  kling26AudioSelection: Kling26AudioSelectionValue;
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
  setKling26AudioSelection: Dispatch<SetStateAction<Kling26AudioSelectionValue>>;
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
  const [kling26AudioSelection, setKling26AudioSelection] = useState<Kling26AudioSelectionValue>('placeholder');
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
  const isKling26VideoModel = isVideoMode && falVideoModelId === KLING_26_VIDEO_MODEL_ID;
  const isHailuoVideoModel = isVideoMode && falVideoModelId === HAILUO_IMAGE_TO_VIDEO_MODEL_ID;
  const isUpscaleModel = !isVideoMode && (falModelId === CRYSTAL_UPSCALER_MODEL_ID || falModelId === SEEDVR_UPSCALER_MODEL_ID);
  const isKlingProVideoSelection = apiProvider === 'fal' && isKlingVideoModel && klingVariant === 'pro';
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
    if (falVideoModelId === KLING_VIDEO_MODEL_ID || falVideoModelId === KLING_26_VIDEO_MODEL_ID) {
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
    if (isSeedreamV45ModelId(falModelId) && (falImageSizeSelection === '1280x720' || falImageSizeSelection === '1920x1080')) {
      setFalImageSizeSelection('default');
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
    kling26AudioSelection,
    falImageSizeSelection,
    falAspectRatioSelection,
    falResolutionSelection,
    falNumImages,
    falScaleFactor,
    falNoiseScale,
    falCreativity,
    isVideoMode,
    isKlingVideoModel,
    isKling26VideoModel,
    isHailuoVideoModel,
    isUpscaleModel,
    isKlingProVideoSelection,
    handleModelModeChange,
    handleFalModelChange,
    handleFalVideoDurationChange,
    handleHailuoVariantChange,
    handleKlingVariantChange,
    handleKling26AudioChange,
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
    setKling26AudioSelection,
    setFalImageSizeSelection,
    setFalAspectRatioSelection,
    setFalResolutionSelection,
    setFalNumImages,
    setFalScaleFactor,
    setFalNoiseScale,
    setFalCreativity,
  };
}
