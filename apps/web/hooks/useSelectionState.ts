import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  DEFAULT_MAX_REFERENCE_IMAGES,
  getMaxReferenceImages,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  isKlingO3VideoModelId,
} from '../services/modelConfig';
import type { ApiProviderId, CanvasImage } from '../types';
import type { UseFalSettingsResult } from './useFalSettings';
import {
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
} from '../utils/seedanceReferences';

type SelectionFalSettings = Pick<
  UseFalSettingsResult,
  | 'falModelId'
  | 'falModelMode'
  | 'falVideoModelId'
  | 'klingVariant'
  | 'klingO3Variant'
  | 'isKlingProVideoSelection'
  | 'isKlingO3VideoModel'
  | 'isKlingV3ControlVideoModel'
  | 'isKlingO3EditMode'
  | 'isLipsyncVideoModel'
  | 'isHeygenV3LipsyncVideoModel'
  | 'isInfinitalkVideoModel'
  | 'isWan27VideoModel'
  | 'isSeedance15VideoModel'
  | 'isSeedance2VideoModel'
  | 'seedance2Variant'
  | 'isVeo31VideoModel'
  | 'veo31Variant'
> & {
  wan27VideoVariant?: UseFalSettingsResult['wan27VideoVariant']; // Missing values fall back to Smart.
  isKlingV3VideoModel?: UseFalSettingsResult['isKlingV3VideoModel']; // Older test stubs and snapshots do not carry this flag.
  isKrea2LargeModel?: UseFalSettingsResult['isKrea2LargeModel']; // Older test stubs do not carry this image flag.
  isMiniMaxH3VideoModel?: UseFalSettingsResult['isMiniMaxH3VideoModel']; // Older test stubs predate H3.
  miniMaxH3Variant?: UseFalSettingsResult['miniMaxH3Variant']; // Missing H3 state defaults to Reference elsewhere.
};

type SelectionOptions = {
  images: CanvasImage[];
  apiProvider: ApiProviderId;
  fal: SelectionFalSettings;
  referenceImageSlotOffset?: number;
  onError: (message: string) => void;
  onReferenceLimit: (maxReferenceImages: number) => void;
};

export type SelectionStateResult = {
  selectedImageIds: string[];
  referenceImageIds: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  seedanceReferenceOrderIds: string[];
  elementImageIds: string[];
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  sourceAudioId: string | null;
  primaryImageId: string | null;
  primaryImage: CanvasImage | null;
  primarySelectionMediaType: CanvasImage['mediaType'] | null;
  activePrimaryImage: (CanvasImage & { element: HTMLImageElement }) | null;
  hasSingleImageSelected: boolean;
  setSelectedImageIds: Dispatch<SetStateAction<string[]>>;
  setReferenceImageIds: Dispatch<SetStateAction<string[]>>;
  setReferenceVideoIds: Dispatch<SetStateAction<string[]>>;
  setReferenceAudioIds: Dispatch<SetStateAction<string[]>>;
  setSeedanceReferenceOrderIds: Dispatch<SetStateAction<string[]>>;
  setElementImageIds: Dispatch<SetStateAction<string[]>>;
  setVideoLastFrameImageId: Dispatch<SetStateAction<string | null>>;
  setSourceVideoId: Dispatch<SetStateAction<string | null>>;
  setSourceAudioId: Dispatch<SetStateAction<string | null>>;
  handleImageSelection: (imageId: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean }) => void;
  replaceCanvasSelection: (imageIds: string[]) => void;
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

const WAN_27_REFERENCE_IMAGE_LIMIT = 20; // Wan reference accepts multiple images.
const WAN_27_REFERENCE_VIDEO_LIMIT = 20; // Wan reference accepts multiple videos.
const WAN_27_EDIT_IMAGE_LIMIT = 1; // Wan edit accepts one optional reference image.
const NO_REFERENCE_LIMIT = 0; // Non-reference modes should not keep video/audio refs.

export const useSelectionState = (options: SelectionOptions): SelectionStateResult => {
  const { images, apiProvider, fal, referenceImageSlotOffset = 0, onError, onReferenceLimit } = options;
  const {
    falModelId,
    falModelMode,
    falVideoModelId,
    klingVariant,
    klingO3Variant,
    isKlingProVideoSelection,
    isKlingV3VideoModel = false,
    isKlingO3VideoModel,
    isKlingV3ControlVideoModel,
    isKlingO3EditMode,
    isLipsyncVideoModel,
    isHeygenV3LipsyncVideoModel,
    isInfinitalkVideoModel,
    isWan27VideoModel,
    isMiniMaxH3VideoModel,
    miniMaxH3Variant,
    isKrea2LargeModel,
    wan27VideoVariant,
    isSeedance15VideoModel,
    isSeedance2VideoModel,
    seedance2Variant,
    isVeo31VideoModel,
    veo31Variant,
  } = fal;
  const isFalProvider = apiProvider === 'fal'; // Fal-only caps should not affect Google selection.
  const isActiveKrea2LargeModel = apiProvider === 'fal' && Boolean(isKrea2LargeModel); // Krea rules apply only while Fal is active.

  const isKlingO3VideoInputMode = isKlingO3EditMode;
  const isWanVideoInputMode =
    apiProvider === 'fal'
    && falModelMode === 'video'
    && (
      falVideoModelId === WAN_VISION_ENHANCER_MODEL_ID
      || falVideoModelId === WAN_ANIMATE_MODEL_ID
      || falVideoModelId === ONE_TO_ALL_ANIMATE_MODEL_ID
    );
  const isVeo31ExtendMode = isVeo31VideoModel && veo31Variant === 'extend';
  const isScailVideoModel = apiProvider === 'fal'
    && falModelMode === 'video'
    && falVideoModelId === SCAIL_VIDEO_MODEL_ID;
  const isWan27ReferenceMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isWan27VideoModel
    && wan27VideoVariant === 'reference';
  const isWan27EditMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isWan27VideoModel
    && wan27VideoVariant === 'edit';
  const isWan27SmartMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isWan27VideoModel
    && !isWan27ReferenceMode
    && !isWan27EditMode;
  const isAudioInputMode = isLipsyncVideoModel || isHeygenV3LipsyncVideoModel || isInfinitalkVideoModel || isWan27SmartMode;
  const isKlingV3ControlVideoInputMode = isKlingV3ControlVideoModel;
  const isSeedance2ReferenceMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isSeedance2VideoModel
    && seedance2Variant === 'reference';
  const isMiniMaxH3ReferenceMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isMiniMaxH3VideoModel
    && miniMaxH3Variant === 'reference';
  const isMultimodalReferenceMode = isSeedance2ReferenceMode || isMiniMaxH3ReferenceMode;
  const multimodalReferenceLabel = isMiniMaxH3ReferenceMode ? 'MiniMax H3' : 'Seedance 2';
  const isVideoInputMode = isKlingO3VideoInputMode
    || isWanVideoInputMode
    || isAudioInputMode
    || isKlingV3ControlVideoInputMode
    || isVeo31ExtendMode
    || isScailVideoModel
    || isWan27EditMode;
  const isKlingO3ReferenceMode = isKlingO3VideoModel && klingO3Variant === 'reference';
  const isKlingV3SmartMode = apiProvider === 'fal' && falModelMode === 'video' && isKlingV3VideoModel;
  const isSeedance15FflfMode = isSeedance15VideoModel;
  const isSeedance2SmartMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isSeedance2VideoModel
    && seedance2Variant === 'smart';
  const isMiniMaxH3StandardMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isMiniMaxH3VideoModel
    && miniMaxH3Variant === 'standard';
  const isVeo31TailCapable = isVeo31VideoModel && veo31Variant === 'i2v-fflf';

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [referenceVideoIds, setReferenceVideoIds] = useState<string[]>([]);
  const [referenceAudioIds, setReferenceAudioIds] = useState<string[]>([]);
  const [seedanceReferenceOrderIds, setSeedanceReferenceOrderIds] = useState<string[]>([]);
  const [elementImageIds, setElementImageIds] = useState<string[]>([]);
  const [videoLastFrameImageId, setVideoLastFrameImageId] = useState<string | null>(null);
  const [sourceVideoId, setSourceVideoId] = useState<string | null>(null);
  const [sourceAudioId, setSourceAudioId] = useState<string | null>(null);

  const primaryImageId = useMemo(() => selectedImageIds[0] ?? null, [selectedImageIds]);
  const hasSingleImageSelected = selectedImageIds.length === 1;

  const primaryImage = useMemo(() => {
    if (!primaryImageId) {
      return null;
    }
    return images.find(img => img.id === primaryImageId) || null;
  }, [images, primaryImageId]);
  const primarySelectionMediaType = primaryImage?.mediaType ?? null;
  const activePrimaryImage = useMemo(() => (
    isImageCanvasMedia(primaryImage) ? primaryImage : null
  ), [primaryImage]);
  const activePrimaryImageId = activePrimaryImage?.id ?? null; // Null means the primary cannot be a Krea style ref.
  const hasActivePrimaryReference = activePrimaryImageId ? referenceImageIds.includes(activePrimaryImageId) : false; // Detect ref clears without primary changes.

  // Ensure selections stay valid when images are deleted or imported.
  useEffect(() => {
    const imageIdSet = new Set(images.map(img => img.id));
    if (
      imageIdSet.size === images.length
      && selectedImageIds.length === 0
      && referenceImageIds.length === 0
      && referenceVideoIds.length === 0
      && referenceAudioIds.length === 0
      && seedanceReferenceOrderIds.length === 0
      && elementImageIds.length === 0
      && !videoLastFrameImageId
      && !sourceVideoId
      && !sourceAudioId
    ) {
      return;
    }

    setSelectedImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setReferenceImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setReferenceVideoIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setReferenceAudioIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setSeedanceReferenceOrderIds(prevIds => prevIds.filter(id => imageIdSet.has(id))); // Dropped assets should also leave the Seedance label order.
    setElementImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setVideoLastFrameImageId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
    setSourceVideoId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
    setSourceAudioId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
  }, [elementImageIds.length, images, referenceAudioIds.length, referenceImageIds.length, referenceVideoIds.length, seedanceReferenceOrderIds.length, selectedImageIds.length, videoLastFrameImageId, sourceVideoId, sourceAudioId]);

  const referenceLimits = useMemo(() => {
    if (isMultimodalReferenceMode) {
      return {
        images: SEEDANCE_REFERENCE_IMAGE_LIMIT,
        videos: SEEDANCE_REFERENCE_VIDEO_LIMIT,
        audios: SEEDANCE_REFERENCE_AUDIO_LIMIT,
      };
    }
    if (isWan27ReferenceMode) {
      return {
        images: WAN_27_REFERENCE_IMAGE_LIMIT,
        videos: WAN_27_REFERENCE_VIDEO_LIMIT,
        audios: NO_REFERENCE_LIMIT,
      };
    }
    if (isWan27EditMode) {
      return {
        images: WAN_27_EDIT_IMAGE_LIMIT,
        videos: NO_REFERENCE_LIMIT,
        audios: NO_REFERENCE_LIMIT,
      };
    }
    const maxReferenceImages = isFalProvider ? getMaxReferenceImages(falModelId) : DEFAULT_MAX_REFERENCE_IMAGES; // Google keeps the app default cap.
    const slotOffset = isFalProvider ? referenceImageSlotOffset : 0; // Reserved input slots are model-specific.
    return {
      images: Math.max(0, maxReferenceImages - slotOffset), // Reserve slots used by extra generated inputs.
      videos: NO_REFERENCE_LIMIT,
      audios: NO_REFERENCE_LIMIT,
    };
  }, [falModelId, isFalProvider, isMultimodalReferenceMode, isWan27EditMode, isWan27ReferenceMode, referenceImageSlotOffset]);

  useEffect(() => {
    if (referenceVideoIds.length > referenceLimits.videos) {
      if (isMultimodalReferenceMode) {
        onError(`${multimodalReferenceLabel} reference supports up to ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos.`);
      }
      setReferenceVideoIds(prevIds => prevIds.slice(0, referenceLimits.videos));
    }
    if (referenceAudioIds.length > referenceLimits.audios) {
      if (isMultimodalReferenceMode) {
        onError(`${multimodalReferenceLabel} reference supports up to ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio tracks.`);
      }
      setReferenceAudioIds(prevIds => prevIds.slice(0, referenceLimits.audios));
    }
    if (isKlingO3VideoModel) {
      return;
    }
    if (referenceImageIds.length > referenceLimits.images) {
      onReferenceLimit(referenceLimits.images);
      setReferenceImageIds(prevIds => prevIds.slice(0, referenceLimits.images));
    }
  }, [isKlingO3VideoModel, isMultimodalReferenceMode, multimodalReferenceLabel, onError, onReferenceLimit, referenceAudioIds.length, referenceImageIds.length, referenceLimits, referenceVideoIds.length]);

  useEffect(() => {
    if (isActiveKrea2LargeModel || !primaryImageId) {
      return;
    }
    setReferenceImageIds(prevIds => prevIds.filter(id => id !== primaryImageId)); // Only Krea can reuse the primary as a style ref.
  }, [isActiveKrea2LargeModel, primaryImageId]);

  useEffect(() => {
    if (!isActiveKrea2LargeModel || !activePrimaryImageId || hasActivePrimaryReference) {
      return; // Only still images can be Krea style references.
    }
    setReferenceImageIds(prevIds =>
      prevIds.includes(activePrimaryImageId) ? prevIds : [activePrimaryImageId, ...prevIds],
    ); // Krea treats the primary image as a style reference like every other.
  }, [activePrimaryImageId, hasActivePrimaryReference, isActiveKrea2LargeModel]);

  useEffect(() => {
    const effectiveSeedanceReferenceIds = isMultimodalReferenceMode
      ? Array.from(new Set([
        ...selectedImageIds,
        ...referenceImageIds,
        ...referenceVideoIds,
        ...referenceAudioIds,
      ]))
      : [];

    setSeedanceReferenceOrderIds(prevIds => {
      if (effectiveSeedanceReferenceIds.length === 0) {
        return prevIds.length === 0 ? prevIds : []; // Empty selections should also clear the order cache.
      }
      const effectiveSeedanceReferenceIdSet = new Set(effectiveSeedanceReferenceIds); // Only keep ids that still count as active refs.
      const preservedIds = prevIds.filter(id => effectiveSeedanceReferenceIdSet.has(id)); // Existing picks keep their place.
      const preservedIdSet = new Set(preservedIds); // New ids append after preserved ones.
      const appendedIds = effectiveSeedanceReferenceIds.filter(id => !preservedIdSet.has(id));
      const nextIds = [...preservedIds, ...appendedIds];
      const isUnchanged = nextIds.length === prevIds.length && nextIds.every((id, index) => id === prevIds[index]); // Avoid extra state churn when nothing moved.
      return isUnchanged ? prevIds : nextIds;
    });
  }, [isMultimodalReferenceMode, referenceAudioIds, referenceImageIds, referenceVideoIds, selectedImageIds]);

  // Clear sourceVideoId when leaving a video input mode (Kling O3 / Wan / 1-to-All / Scail / Lip Sync / HeyGen).
  useEffect(() => {
    if (!isVideoInputMode && sourceVideoId) {
      setSourceVideoId(null);
    }
  }, [isVideoInputMode, sourceVideoId]);

  // Clear sourceAudioId when leaving audio-input modes.
  useEffect(() => {
    if (!isAudioInputMode && sourceAudioId) {
      setSourceAudioId(null);
    }
  }, [isAudioInputMode, sourceAudioId]);

  useEffect(() => {
    if (!isKlingO3VideoModel) {
      if (elementImageIds.length > 0) {
        setElementImageIds([]);
      }
      return;
    }
    const baseMaxReferenceImages = getMaxReferenceImages(falModelId);
    const maxReferences = Math.max(0, baseMaxReferenceImages - elementImageIds.length);
    setReferenceImageIds(prev => {
      if (prev.length <= maxReferences) {
        return prev;
      }
      onReferenceLimit(maxReferences);
      return prev.slice(0, maxReferences);
    });
  }, [elementImageIds.length, falModelId, isKlingO3VideoModel, onReferenceLimit]);

  useEffect(() => {
    if (!isKlingO3VideoModel) {
      return;
    }
    const baseMaxReferenceImages = getMaxReferenceImages(falModelId);
    const maxElements = Math.max(0, baseMaxReferenceImages - referenceImageIds.length);
    setElementImageIds(prev => {
      if (prev.length <= maxElements) {
        return prev;
      }
      onReferenceLimit(maxElements);
      return prev.slice(0, maxElements);
    });
  }, [falModelId, isKlingO3VideoModel, onReferenceLimit, referenceImageIds.length]);

  const handleImageSelection = useCallback((
    imageId: string | null,
    selectionOptions: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean } = {},
  ) => {
    const { multi = false, reference = false, lastFrame = false, element = false } = selectionOptions;
    const targetImage = imageId ? images.find(img => img.id === imageId) : null;
    const isKlingVideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && falVideoModelId === KLING_VIDEO_MODEL_ID;
    const isOneToAllVideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && falVideoModelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
    const isKlingO3VideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && isKlingO3VideoModelId(falVideoModelId);

    if (reference && isMultimodalReferenceMode && targetImage?.mediaType === 'video') {
      if (!imageId) {
        setReferenceVideoIds([]);
        return;
      }
      setReferenceVideoIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < SEEDANCE_REFERENCE_VIDEO_LIMIT) {
          return [...prevIds, imageId];
        }
        onError(`${multimodalReferenceLabel} reference supports up to ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos.`);
        return prevIds;
      });
      return;
    }

    if (reference && isWan27ReferenceMode && targetImage?.mediaType === 'video') {
      if (!imageId) {
        setReferenceVideoIds([]);
        return;
      }
      setReferenceVideoIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < WAN_27_REFERENCE_VIDEO_LIMIT) {
          return [...prevIds, imageId];
        }
        onError(`Wan 2.7 Reference supports up to ${WAN_27_REFERENCE_VIDEO_LIMIT} videos.`);
        return prevIds;
      });
      return;
    }

    if (reference && isWan27ReferenceMode && targetImage?.mediaType === 'audio') {
      onError('Wan 2.7 Reference supports image and video references only.');
      return;
    }

    if (reference && isWan27EditMode && !imageId) {
      setReferenceImageIds([]);
      return;
    }

    if (reference && isWan27EditMode && targetImage?.mediaType !== 'image') {
      onError('Wan 2.7 Edit supports one still reference image.');
      return;
    }

    if (reference && isMultimodalReferenceMode && targetImage?.mediaType === 'audio') {
      if (!imageId) {
        setReferenceAudioIds([]);
        return;
      }
      setReferenceAudioIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < SEEDANCE_REFERENCE_AUDIO_LIMIT) {
          return [...prevIds, imageId];
        }
        onError(`${multimodalReferenceLabel} reference supports up to ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio tracks.`);
        return prevIds;
      });
      return;
    }

    if (reference && isActiveKrea2LargeModel && targetImage?.mediaType !== 'image') {
      onError('Krea 2 Large style references must be still images.');
      return;
    }

    if (reference && targetImage?.mediaType === 'video') {
      if (isOneToAllVideoSelection) {
        onReferenceLimit(0);
        return;
      }
      onError('Reference images must be still images.');
      return;
    }
    if (element && targetImage?.mediaType === 'video') {
      onError('Element images must be still images.');
      return;
    }

    if (lastFrame) {
      if (!isKlingProVideoSelection && !isKlingV3SmartMode && !isKlingO3ReferenceMode && !isWan27SmartMode && !isSeedance15FflfMode && !isSeedance2SmartMode && !isMiniMaxH3StandardMode && !isVeo31TailCapable) {
        return;
      }
      if (!imageId) {
        setVideoLastFrameImageId(null);
        return;
      }
      if (!isImageCanvasMedia(targetImage)) {
        onError('Ending frame must be a still image.');
        return;
      }
      if (primaryImageId && imageId === primaryImageId) {
        setVideoLastFrameImageId(null);
        return;
      }
      setVideoLastFrameImageId(prevId => (prevId === imageId ? null : imageId));
      return;
    }

    if (reference && isKlingVideoSelection) {
      if (klingVariant === 'pro') {
        if (!isImageCanvasMedia(targetImage)) {
          onError('Ending frame must be a still image.');
          return;
        }
        if (primaryImageId && imageId === primaryImageId) {
          setVideoLastFrameImageId(null);
          return;
        }
        setVideoLastFrameImageId(prevId => (prevId === imageId ? null : imageId ?? null));
      }
      return;
    }

    if (element) {
      if (!isKlingO3VideoSelection) {
        return;
      }
      if (primaryImageId && imageId === primaryImageId) {
        return;
      }
      if (!imageId) {
        setElementImageIds([]);
        return;
      }
      const baseMaxReferenceImages = getMaxReferenceImages(falModelId);
      const maxElements = Math.max(0, baseMaxReferenceImages - referenceImageIds.length);
      setReferenceImageIds(prev => prev.filter(id => id !== imageId));
      setElementImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < maxElements) {
          return [...prevIds, imageId];
        }
        onReferenceLimit(maxElements);
        return prevIds;
      });
      return;
    }

    if (reference) {
      if (primaryImageId && imageId === primaryImageId && !isMultimodalReferenceMode && !isWan27ReferenceMode && !isActiveKrea2LargeModel) {
        return;
      }
      if (!imageId) {
        setReferenceImageIds([]);
        return;
      }
      if (isMultimodalReferenceMode) {
        setReferenceImageIds(prevIds => {
          if (prevIds.includes(imageId)) {
            return prevIds.filter(id => id !== imageId);
          }
          if (prevIds.length < SEEDANCE_REFERENCE_IMAGE_LIMIT) {
            return [...prevIds, imageId];
          }
          onError(`${multimodalReferenceLabel} reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images.`);
          return prevIds;
        });
        return;
      }
      if (isWan27ReferenceMode) {
        setReferenceImageIds(prevIds => {
          if (prevIds.includes(imageId)) {
            return prevIds.filter(id => id !== imageId);
          }
          if (prevIds.length < WAN_27_REFERENCE_IMAGE_LIMIT) {
            return [...prevIds, imageId];
          }
          onReferenceLimit(WAN_27_REFERENCE_IMAGE_LIMIT);
          return prevIds;
        });
        return;
      }
      if (isWan27EditMode) {
        setReferenceImageIds(prevIds => {
          if (prevIds.includes(imageId)) {
            return prevIds.filter(id => id !== imageId);
          }
          if (prevIds.length < WAN_27_EDIT_IMAGE_LIMIT) {
            return [imageId];
          }
          onError('Wan 2.7 Edit supports one reference image.');
          return prevIds;
        });
        return;
      }
      // Reference images power Kling prompts; enforce per-model limits.
      const baseMaxReferenceImages = isFalProvider ? getMaxReferenceImages(falModelId) : DEFAULT_MAX_REFERENCE_IMAGES; // Google should not inherit Fal model caps.
      const slotOffset = isFalProvider ? referenceImageSlotOffset : 0; // Annotate input reservation only applies to Fal.
      const maxReferenceImages = isKlingO3VideoSelection
        ? Math.max(0, baseMaxReferenceImages - elementImageIds.length)
        : Math.max(0, baseMaxReferenceImages - slotOffset);
      const isAlreadyReference = referenceImageIds.includes(imageId);
      if (!isAlreadyReference) {
        setElementImageIds(prev => prev.filter(id => id !== imageId));
      }
      setReferenceImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        if (prevIds.length < maxReferenceImages) {
          return [...prevIds, imageId];
        }
        onReferenceLimit(maxReferenceImages);
        return prevIds;
      });
      return;
    }

    if (!imageId) {
      if (!multi) {
        setSelectedImageIds([]);
        setReferenceImageIds([]);
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
        setElementImageIds([]);
        setVideoLastFrameImageId(null);
        setSourceVideoId(null);
        setSourceAudioId(null);
      }
      return;
    }

    if (multi) {
      setReferenceImageIds([]);
      if (!isMultimodalReferenceMode && !isWan27ReferenceMode) {
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
      }
      if (isWan27ReferenceMode) {
        setReferenceAudioIds([]);
      }
      if (!isKlingO3VideoSelection) {
        setElementImageIds([]);
      }
      setVideoLastFrameImageId(null);
      setSelectedImageIds(prevIds => {
        let nextSelectedIds: string[];
        if (prevIds.includes(imageId)) {
          nextSelectedIds = prevIds.filter(id => id !== imageId);
        } else {
          nextSelectedIds = [...prevIds, imageId];
        }
        if (isAudioInputMode && targetImage?.mediaType === 'video') {
          setSourceVideoId(prevId => (prevId === imageId && !nextSelectedIds.includes(imageId)) ? null : imageId);
        }
        if (isAudioInputMode && targetImage?.mediaType === 'audio') {
          setSourceAudioId(prevId => (prevId === imageId && !nextSelectedIds.includes(imageId)) ? null : imageId);
        }
        return nextSelectedIds;
      });
      return;
    }

    if (primaryImageId === imageId && selectedImageIds.length === 1) {
      setReferenceImageIds([]);
      if (!isMultimodalReferenceMode && !isWan27ReferenceMode) {
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
      }
      if (isWan27ReferenceMode) {
        setReferenceAudioIds([]);
      }
      if (!isKlingO3VideoSelection) {
        setElementImageIds([]);
      }
      setVideoLastFrameImageId(null);
      // Clicking the same item again in video input mode clears sourceVideoId
      if (isVideoInputMode && targetImage?.mediaType === 'video' && sourceVideoId === imageId) {
        setSourceVideoId(null);
      }
      // Clicking the same audio again in audio-input mode clears sourceAudioId
      if (isAudioInputMode && targetImage?.mediaType === 'audio' && sourceAudioId === imageId) {
        setSourceAudioId(null);
      }
      return;
    }

    // In video input modes, single-clicking a video sets it as the source video
    if (isVideoInputMode && targetImage?.mediaType === 'video') {
      setSourceVideoId(imageId);
      setSelectedImageIds([imageId]);
      return;
    }

    // In audio-input modes, single-clicking audio sets it as the source audio
    if (isAudioInputMode && targetImage?.mediaType === 'audio') {
      setSourceAudioId(imageId);
      setSelectedImageIds([imageId]);
      return;
    }

    setSelectedImageIds([imageId]);
    if (isWan27VideoModel && targetImage?.mediaType !== 'audio') {
      setSourceAudioId(null);
    }
    setReferenceImageIds([]);
    if (!isMultimodalReferenceMode && !isWan27ReferenceMode) {
      setReferenceVideoIds([]);
      setReferenceAudioIds([]);
    }
    if (isWan27ReferenceMode) {
      setReferenceAudioIds([]);
    }
    if (!isKlingO3VideoSelection) {
      setElementImageIds([]);
    }
    if (videoLastFrameImageId && videoLastFrameImageId === imageId) {
      setVideoLastFrameImageId(null);
    }
  }, [
    apiProvider,
    falModelId,
    falModelMode,
    falVideoModelId,
    images,
    isKlingProVideoSelection,
    isKlingV3SmartMode,
    isKlingO3ReferenceMode,
    isWan27EditMode,
    isWan27VideoModel,
    isWan27SmartMode,
    isSeedance15FflfMode,
    isSeedance2SmartMode,
    isMiniMaxH3StandardMode,
    isVeo31TailCapable,
    klingVariant,
    onError,
    onReferenceLimit,
    primaryImageId,
    falModelId,
    referenceAudioIds.length,
    referenceImageIds.length,
    referenceVideoIds.length,
    elementImageIds.length,
    selectedImageIds.length,
    videoLastFrameImageId,
    isKlingO3VideoInputMode,
    isVideoInputMode,
    sourceVideoId,
    isAudioInputMode,
    sourceAudioId,
    isMultimodalReferenceMode,
    multimodalReferenceLabel,
    isWan27ReferenceMode,
    isActiveKrea2LargeModel,
    referenceImageSlotOffset,
  ]);

  const replaceCanvasSelection = useCallback((imageIds: string[]) => {
    setSelectedImageIds([...imageIds]); // Replace media selection without toggling each item.
    setReferenceImageIds([]); // Marquee selection exits reference-image roles.
    setReferenceVideoIds([]); // Marquee selection exits reference-video roles.
    setReferenceAudioIds([]); // Marquee selection exits reference-audio roles.
    setElementImageIds([]); // Marquee selection exits element-image roles.
    setVideoLastFrameImageId(null); // Marquee selection exits tail-frame selection.
  }, []);

  return {
    selectedImageIds,
    referenceImageIds,
    referenceVideoIds,
    referenceAudioIds,
    seedanceReferenceOrderIds,
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    sourceAudioId,
    primaryImageId,
    primaryImage,
    primarySelectionMediaType,
    activePrimaryImage,
    hasSingleImageSelected,
    setSelectedImageIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setSeedanceReferenceOrderIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setSourceAudioId,
    handleImageSelection,
    replaceCanvasSelection,
  };
};
