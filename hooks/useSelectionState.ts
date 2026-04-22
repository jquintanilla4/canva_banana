import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  getMaxReferenceImages,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  isKlingO1VideoModelId,
} from '../services/modelConfig';
import type { ApiProviderId, CanvasImage, CanvasNote } from '../types';
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
  | 'klingO1Variant'
  | 'isKlingProVideoSelection'
  | 'isKlingO1VideoModel'
  | 'isKling26ControlVideoModel'
  | 'isKlingO1EditMode'
  | 'isKlingO1RefV2VMode'
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
};

type SelectionOptions = {
  images: CanvasImage[];
  apiProvider: ApiProviderId;
  fal: SelectionFalSettings;
  onError: (message: string) => void;
  onReferenceLimit: (maxReferenceImages: number) => void;
};

export type SelectionStateResult = {
  selectedImageIds: string[];
  selectedNoteIds: string[];
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
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>;
  setReferenceImageIds: Dispatch<SetStateAction<string[]>>;
  setReferenceVideoIds: Dispatch<SetStateAction<string[]>>;
  setReferenceAudioIds: Dispatch<SetStateAction<string[]>>;
  setSeedanceReferenceOrderIds: Dispatch<SetStateAction<string[]>>;
  setElementImageIds: Dispatch<SetStateAction<string[]>>;
  setVideoLastFrameImageId: Dispatch<SetStateAction<string | null>>;
  setSourceVideoId: Dispatch<SetStateAction<string | null>>;
  setSourceAudioId: Dispatch<SetStateAction<string | null>>;
  handleImageSelection: (imageId: string | null, options?: { multi?: boolean; reference?: boolean; lastFrame?: boolean; element?: boolean }) => void;
  handleNoteSelection: (noteId: string | null, options?: { multi?: boolean }) => void;
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

const WAN_27_REFERENCE_IMAGE_LIMIT = 20; // Wan reference accepts multiple images.
const WAN_27_REFERENCE_VIDEO_LIMIT = 20; // Wan reference accepts multiple videos.
const WAN_27_EDIT_IMAGE_LIMIT = 1; // Wan edit accepts one optional reference image.
const NO_REFERENCE_LIMIT = 0; // Non-reference modes should not keep video/audio refs.

export const useSelectionState = (options: SelectionOptions): SelectionStateResult => {
  const { images, apiProvider, fal, onError, onReferenceLimit } = options;
  const {
    falModelId,
    falModelMode,
    falVideoModelId,
    klingVariant,
    klingO1Variant,
  isKlingProVideoSelection,
  isKlingV3VideoModel = false,
  isKlingO1VideoModel,
  isKling26ControlVideoModel,
  isKlingO1EditMode,
    isKlingO1RefV2VMode,
    isLipsyncVideoModel,
    isHeygenV3LipsyncVideoModel,
    isInfinitalkVideoModel,
    isWan27VideoModel,
    wan27VideoVariant,
    isSeedance15VideoModel,
    isSeedance2VideoModel,
    seedance2Variant,
    isVeo31VideoModel,
    veo31Variant,
  } = fal;

  const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode;
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
  const isKling26ControlVideoInputMode = isKling26ControlVideoModel;
  const isSeedance2ReferenceMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isSeedance2VideoModel
    && seedance2Variant === 'reference';
  const isVideoInputMode = isKlingO1VideoInputMode
    || isWanVideoInputMode
    || isAudioInputMode
    || isKling26ControlVideoInputMode
    || isVeo31ExtendMode
    || isScailVideoModel
    || isWan27EditMode;
  const isKlingO1FflfMode = isKlingO1VideoModel && klingO1Variant === 'fflf';
  const isKlingV3SmartMode = apiProvider === 'fal' && falModelMode === 'video' && isKlingV3VideoModel;
  const isSeedance15FflfMode = isSeedance15VideoModel;
  const isSeedance2SmartMode = apiProvider === 'fal'
    && falModelMode === 'video'
    && isSeedance2VideoModel
    && seedance2Variant === 'smart';
  const isVeo31TailCapable = isVeo31VideoModel && veo31Variant === 'i2v-fflf';

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [referenceVideoIds, setReferenceVideoIds] = useState<string[]>([]);
  const [referenceAudioIds, setReferenceAudioIds] = useState<string[]>([]);
  const [seedanceReferenceOrderIds, setSeedanceReferenceOrderIds] = useState<string[]>([]);
  const [elementImageIds, setElementImageIds] = useState<string[]>([]);
  const [videoLastFrameImageId, setVideoLastFrameImageId] = useState<string | null>(null);
  const [sourceVideoId, setSourceVideoId] = useState<string | null>(null);
  const [sourceAudioId, setSourceAudioId] = useState<string | null>(null);

  const primaryImageId = useMemo(() => selectedImageIds[0] ?? null, [selectedImageIds]);
  const primaryNoteId = useMemo(() => selectedNoteIds[0] ?? null, [selectedNoteIds]);
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
    if (isSeedance2ReferenceMode) {
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
    return {
      images: getMaxReferenceImages(falModelId),
      videos: NO_REFERENCE_LIMIT,
      audios: NO_REFERENCE_LIMIT,
    };
  }, [falModelId, isSeedance2ReferenceMode, isWan27EditMode, isWan27ReferenceMode]);

  useEffect(() => {
    if (referenceVideoIds.length > referenceLimits.videos) {
      if (isSeedance2ReferenceMode) {
        onError(`Seedance 2 reference supports up to ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos.`);
      }
      setReferenceVideoIds(prevIds => prevIds.slice(0, referenceLimits.videos));
    }
    if (referenceAudioIds.length > referenceLimits.audios) {
      if (isSeedance2ReferenceMode) {
        onError(`Seedance 2 reference supports up to ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio tracks.`);
      }
      setReferenceAudioIds(prevIds => prevIds.slice(0, referenceLimits.audios));
    }
    if (isKlingO1VideoModel) {
      return;
    }
    if (referenceImageIds.length > referenceLimits.images) {
      onReferenceLimit(referenceLimits.images);
      setReferenceImageIds(prevIds => prevIds.slice(0, referenceLimits.images));
    }
  }, [isKlingO1VideoModel, isSeedance2ReferenceMode, onError, onReferenceLimit, referenceAudioIds.length, referenceImageIds.length, referenceLimits, referenceVideoIds.length]);

  useEffect(() => {
    const effectiveSeedanceReferenceIds = isSeedance2ReferenceMode
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
  }, [isSeedance2ReferenceMode, referenceAudioIds, referenceImageIds, referenceVideoIds, selectedImageIds]);

  // Clear sourceVideoId when leaving a video input mode (Kling O1 / Wan / 1-to-All / Scail / Lip Sync / HeyGen).
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
    if (!isKlingO1VideoModel) {
      if (elementImageIds.length > 0) {
        setElementImageIds([]);
      }
      return;
    }
    // Edit/refV2V variants have a 4 total limit (elements + references), refI2V has 6
    const baseMaxReferenceImages = isKlingO1VideoInputMode ? 4 : getMaxReferenceImages(falModelId);
    const maxReferences = Math.max(0, baseMaxReferenceImages - elementImageIds.length);
    setReferenceImageIds(prev => {
      if (prev.length <= maxReferences) {
        return prev;
      }
      onReferenceLimit(maxReferences);
      return prev.slice(0, maxReferences);
    });
  }, [elementImageIds.length, falModelId, isKlingO1VideoInputMode, isKlingO1VideoModel, onReferenceLimit]);

  useEffect(() => {
    if (!isKlingO1VideoModel) {
      return;
    }
    // Edit/refV2V variants have a 4 total limit (elements + references), refI2V has 6
    const baseMaxReferenceImages = isKlingO1VideoInputMode ? 4 : getMaxReferenceImages(falModelId);
    const maxElements = Math.max(0, baseMaxReferenceImages - referenceImageIds.length);
    setElementImageIds(prev => {
      if (prev.length <= maxElements) {
        return prev;
      }
      onReferenceLimit(maxElements);
      return prev.slice(0, maxElements);
    });
  }, [falModelId, isKlingO1VideoInputMode, isKlingO1VideoModel, onReferenceLimit, referenceImageIds.length]);

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
    const isKlingO1VideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && isKlingO1VideoModelId(falVideoModelId);

    if (reference && isSeedance2ReferenceMode && targetImage?.mediaType === 'video') {
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
        onError(`Seedance 2 reference supports up to ${SEEDANCE_REFERENCE_VIDEO_LIMIT} videos.`);
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

    if (reference && isSeedance2ReferenceMode && targetImage?.mediaType === 'audio') {
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
        onError(`Seedance 2 reference supports up to ${SEEDANCE_REFERENCE_AUDIO_LIMIT} audio tracks.`);
        return prevIds;
      });
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
      if (!isKlingProVideoSelection && !isKlingV3SmartMode && !isKlingO1FflfMode && !isWan27SmartMode && !isSeedance15FflfMode && !isSeedance2SmartMode && !isVeo31TailCapable) {
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
      if (!isKlingO1VideoSelection) {
        return;
      }
      if (primaryImageId && imageId === primaryImageId) {
        return;
      }
      if (!imageId) {
        setElementImageIds([]);
        return;
      }
      // Edit/refV2V variants have a 4 total limit (elements + references), refI2V has 6
      const baseMaxReferenceImages = isKlingO1VideoInputMode ? 4 : getMaxReferenceImages(falModelId);
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
      if (primaryImageId && imageId === primaryImageId && !isSeedance2ReferenceMode && !isWan27ReferenceMode) {
        return;
      }
      if (!imageId) {
        setReferenceImageIds([]);
        return;
      }
      if (isSeedance2ReferenceMode) {
        setReferenceImageIds(prevIds => {
          if (prevIds.includes(imageId)) {
            return prevIds.filter(id => id !== imageId);
          }
          if (prevIds.length < SEEDANCE_REFERENCE_IMAGE_LIMIT) {
            return [...prevIds, imageId];
          }
          onError(`Seedance 2 reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} images.`);
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
      // Edit/refV2V variants have a 4 total limit (elements + references), refI2V has 6
      const baseMaxReferenceImages = isKlingO1VideoInputMode ? 4 : getMaxReferenceImages(falModelId);
      const maxReferenceImages = isKlingO1VideoSelection
        ? Math.max(0, baseMaxReferenceImages - elementImageIds.length)
        : baseMaxReferenceImages;
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
        setSelectedNoteIds([]);
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
      if (!isSeedance2ReferenceMode && !isWan27ReferenceMode) {
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
      }
      if (isWan27ReferenceMode) {
        setReferenceAudioIds([]);
      }
      if (!isKlingO1VideoSelection) {
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
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
      if (!isSeedance2ReferenceMode && !isWan27ReferenceMode) {
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
      }
      if (isWan27ReferenceMode) {
        setReferenceAudioIds([]);
      }
      if (!isKlingO1VideoSelection) {
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
      setSelectedNoteIds([]);
      return;
    }

    // In audio-input modes, single-clicking audio sets it as the source audio
    if (isAudioInputMode && targetImage?.mediaType === 'audio') {
      setSourceAudioId(imageId);
      setSelectedImageIds([imageId]);
      setSelectedNoteIds([]);
      return;
    }

    setSelectedImageIds([imageId]);
    setSelectedNoteIds([]);
    if (isWan27VideoModel && targetImage?.mediaType !== 'audio') {
      setSourceAudioId(null);
    }
    setReferenceImageIds([]);
    if (!isSeedance2ReferenceMode && !isWan27ReferenceMode) {
      setReferenceVideoIds([]);
      setReferenceAudioIds([]);
    }
    if (isWan27ReferenceMode) {
      setReferenceAudioIds([]);
    }
    if (!isKlingO1VideoSelection) {
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
    isKlingO1FflfMode,
    isWan27EditMode,
    isWan27VideoModel,
    isWan27SmartMode,
    isSeedance15FflfMode,
    isSeedance2SmartMode,
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
	    isKlingO1VideoInputMode,
	    isVideoInputMode,
	    sourceVideoId,
      isAudioInputMode,
      sourceAudioId,
      isSeedance2ReferenceMode,
      isWan27ReferenceMode,
	  ]);

  const handleNoteSelection = useCallback((
    noteId: string | null,
    selectionOptions: { multi?: boolean } = {},
  ) => {
    const { multi = false } = selectionOptions;

    if (!noteId) {
      if (!multi) {
        setSelectedNoteIds([]);
        setSelectedImageIds([]);
        setReferenceImageIds([]);
        setReferenceVideoIds([]);
        setReferenceAudioIds([]);
        setElementImageIds([]);
        setVideoLastFrameImageId(null);
      }
      return;
    }

    if (multi) {
      setSelectedNoteIds(prevIds => {
        if (prevIds.includes(noteId)) {
          return prevIds.filter(id => id !== noteId);
        }
        return [...prevIds, noteId];
      });
      return;
    }

    if (primaryNoteId === noteId && selectedNoteIds.length === 1) {
      setSelectedImageIds([]);
      setReferenceImageIds([]);
      setReferenceVideoIds([]);
      setReferenceAudioIds([]);
      setElementImageIds([]);
      setVideoLastFrameImageId(null);
      return;
    }

    setSelectedNoteIds([noteId]);
    setSelectedImageIds([]);
    setReferenceImageIds([]);
    setElementImageIds([]);
    setVideoLastFrameImageId(null);
  }, [primaryNoteId, selectedNoteIds.length]);

  return {
    selectedImageIds,
    selectedNoteIds,
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
    setSelectedNoteIds,
    setReferenceImageIds,
    setReferenceVideoIds,
    setReferenceAudioIds,
    setSeedanceReferenceOrderIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    setSourceAudioId,
    handleImageSelection,
    handleNoteSelection,
  };
};
