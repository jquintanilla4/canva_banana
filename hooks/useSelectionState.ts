import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  getMaxReferenceImages,
  KLING_VIDEO_MODEL_ID,
  KLING_IMAGE_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  isKlingO1VideoModelId,
} from '../services/modelConfig';
import type { ApiProviderId, CanvasImage, CanvasNote } from '../types';
import type { UseFalSettingsResult } from './useFalSettings';

type SelectionFalSettings = Pick<
  UseFalSettingsResult,
  | 'falModelId'
  | 'falModelMode'
  | 'falVideoModelId'
  | 'klingVariant'
  | 'klingO1Variant'
  | 'isVideoMode'
  | 'isKlingProVideoSelection'
  | 'isKlingO1VideoModel'
  | 'isKlingO1EditMode'
  | 'isKlingO1RefV2VMode'
>;

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
  elementImageIds: string[];
  videoLastFrameImageId: string | null;
  sourceVideoId: string | null;
  primaryImageId: string | null;
  primaryImage: CanvasImage | null;
  primarySelectionMediaType: CanvasImage['mediaType'] | null;
  activePrimaryImage: (CanvasImage & { element: HTMLImageElement }) | null;
  hasSingleImageSelected: boolean;
  setSelectedImageIds: Dispatch<SetStateAction<string[]>>;
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>;
  setReferenceImageIds: Dispatch<SetStateAction<string[]>>;
  setElementImageIds: Dispatch<SetStateAction<string[]>>;
  setVideoLastFrameImageId: Dispatch<SetStateAction<string | null>>;
  setSourceVideoId: Dispatch<SetStateAction<string | null>>;
  handleImageSelection: (imageId: string | null, multi?: boolean) => void;
  handleNoteSelection: (noteId: string | null, multi?: boolean) => void;
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

export const useSelectionState = (options: SelectionOptions): SelectionStateResult => {
  const { images, apiProvider, fal, onError, onReferenceLimit } = options;
  const {
    falModelId,
    falModelMode,
    falVideoModelId,
    klingVariant,
    klingO1Variant,
    isVideoMode,
    isKlingProVideoSelection,
    isKlingO1VideoModel,
    isKlingO1EditMode,
    isKlingO1RefV2VMode,
  } = fal;

  const isKlingImageModel = !isVideoMode && falModelId === KLING_IMAGE_MODEL_ID;
  const isKlingO1VideoInputMode = isKlingO1EditMode || isKlingO1RefV2VMode;
  const isWanVideoInputMode =
    apiProvider === 'fal'
    && falModelMode === 'video'
    && (falVideoModelId === WAN_VISION_ENHANCER_MODEL_ID || falVideoModelId === WAN_ANIMATE_MODEL_ID);
  const isVideoInputMode = isKlingO1VideoInputMode || isWanVideoInputMode;
  const isKlingO1FflfMode = isKlingO1VideoModel && klingO1Variant === 'fflf';

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [elementImageIds, setElementImageIds] = useState<string[]>([]);
  const [videoLastFrameImageId, setVideoLastFrameImageId] = useState<string | null>(null);
  const [sourceVideoId, setSourceVideoId] = useState<string | null>(null);

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
    if (imageIdSet.size === images.length && selectedImageIds.length === 0 && referenceImageIds.length === 0 && elementImageIds.length === 0 && !videoLastFrameImageId && !sourceVideoId) {
      return;
    }

    setSelectedImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setReferenceImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setElementImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setVideoLastFrameImageId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
    setSourceVideoId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
  }, [elementImageIds.length, images, referenceImageIds.length, selectedImageIds.length, videoLastFrameImageId, sourceVideoId]);

  // Clear sourceVideoId when leaving a video input mode (Kling O1 or Wan enhancer)
  useEffect(() => {
    if (!isVideoInputMode && sourceVideoId) {
      setSourceVideoId(null);
    }
  }, [isVideoInputMode, sourceVideoId]);

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

  // For non-Kling O1 models, keep references within per-model limits.
  useEffect(() => {
    if (isKlingO1VideoModel) {
      return;
    }
    const maxReferenceImages = getMaxReferenceImages(falModelId);
    setReferenceImageIds(prev => {
      if (prev.length <= maxReferenceImages) {
        return prev;
      }
      onReferenceLimit(maxReferenceImages);
      return prev.slice(0, maxReferenceImages);
    });
  }, [falModelId, isKlingO1VideoModel, onReferenceLimit, setReferenceImageIds]);

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
    const isKlingO1VideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && isKlingO1VideoModelId(falVideoModelId);

    if (reference && targetImage?.mediaType === 'video') {
      onError('Reference images must be still images.');
      return;
    }
    if (element && targetImage?.mediaType === 'video') {
      onError('Element images must be still images.');
      return;
    }

    if (lastFrame) {
      if (!isKlingProVideoSelection && !isKlingO1FflfMode) {
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
      if (primaryImageId && imageId === primaryImageId) {
        return;
      }
      if (!imageId) {
        setReferenceImageIds([]);
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

    const applyKlingReferences = (nextSelectedIds: string[]) => {
      if (!isKlingImageModel) {
        return;
      }
      const maxReferenceImages = getMaxReferenceImages(falModelId);
      if (nextSelectedIds.length > maxReferenceImages) {
        onReferenceLimit(maxReferenceImages);
      }
      setReferenceImageIds(nextSelectedIds.slice(0, maxReferenceImages));
    };

    if (!imageId) {
      if (!multi) {
        setSelectedImageIds([]);
        setSelectedNoteIds([]);
        setReferenceImageIds([]);
        setElementImageIds([]);
        setVideoLastFrameImageId(null);
        setSourceVideoId(null);
      }
      return;
    }

    if (multi) {
      if (!isKlingImageModel) {
        setReferenceImageIds([]);
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
        applyKlingReferences(nextSelectedIds);
        return nextSelectedIds;
      });
      return;
    }

    if (primaryImageId === imageId && selectedImageIds.length === 1) {
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
      if (!isKlingO1VideoSelection) {
        setElementImageIds([]);
      }
      setVideoLastFrameImageId(null);
      // Clicking the same item again in video input mode clears sourceVideoId
      if (isVideoInputMode && targetImage?.mediaType === 'video' && sourceVideoId === imageId) {
        setSourceVideoId(null);
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

    setSelectedImageIds([imageId]);
    setSelectedNoteIds([]);
    applyKlingReferences([imageId]);
    if (!isKlingImageModel) {
      setReferenceImageIds([]);
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
    isKlingO1FflfMode,
    klingVariant,
    onError,
    onReferenceLimit,
    primaryImageId,
    isKlingImageModel,
    falModelId,
    referenceImageIds.length,
    elementImageIds.length,
	    selectedImageIds.length,
	    videoLastFrameImageId,
	    isKlingO1VideoInputMode,
	    isVideoInputMode,
	    sourceVideoId,
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
    elementImageIds,
    videoLastFrameImageId,
    sourceVideoId,
    primaryImageId,
    primaryImage,
    primarySelectionMediaType,
    activePrimaryImage,
    hasSingleImageSelected,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setElementImageIds,
    setVideoLastFrameImageId,
    setSourceVideoId,
    handleImageSelection,
    handleNoteSelection,
  };
};
