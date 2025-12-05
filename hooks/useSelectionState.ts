import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMaxReferenceImages, KLING_VIDEO_MODEL_ID, type FalModelId, type FalModelMode, type FalVideoModelId, type KlingVariant } from '../services/modelConfig';
import type { ApiProviderId, CanvasImage, CanvasNote } from '../types';

type SelectionOptions = {
  images: CanvasImage[];
  apiProvider: ApiProviderId;
  falModelId: FalModelId;
  falModelMode: FalModelMode;
  falVideoModelId: FalVideoModelId;
  klingVariant: KlingVariant;
  isKlingProVideoSelection: boolean;
  onError: (message: string) => void;
  onReferenceLimit: (maxReferenceImages: number) => void;
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

export const useSelectionState = (options: SelectionOptions) => {
  const {
    images,
    apiProvider,
    falModelId,
    falModelMode,
    falVideoModelId,
    klingVariant,
    isKlingProVideoSelection,
    onError,
    onReferenceLimit,
  } = options;

  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
  const [videoLastFrameImageId, setVideoLastFrameImageId] = useState<string | null>(null);

  const primaryImageId = useMemo(() => selectedImageIds[0] ?? null, [selectedImageIds]);
  const primaryNoteId = useMemo(() => selectedNoteIds[0] ?? null, [selectedNoteIds]);
  const hasSingleImageSelected = selectedImageIds.length === 1;

  // Ensure selections stay valid when images are deleted or imported.
  useEffect(() => {
    const imageIdSet = new Set(images.map(img => img.id));
    if (imageIdSet.size === images.length && selectedImageIds.length === 0 && referenceImageIds.length === 0 && !videoLastFrameImageId) {
      return;
    }

    setSelectedImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setReferenceImageIds(prevIds => prevIds.filter(id => imageIdSet.has(id)));
    setVideoLastFrameImageId(prevId => (prevId && imageIdSet.has(prevId) ? prevId : null));
  }, [images, referenceImageIds.length, selectedImageIds.length, videoLastFrameImageId]);

  const handleImageSelection = useCallback((
    imageId: string | null,
    selectionOptions: { multi?: boolean; reference?: boolean; lastFrame?: boolean } = {},
  ) => {
    const { multi = false, reference = false, lastFrame = false } = selectionOptions;
    const targetImage = imageId ? images.find(img => img.id === imageId) : null;
    const isKlingVideoSelection = apiProvider === 'fal'
      && falModelMode === 'video'
      && falVideoModelId === KLING_VIDEO_MODEL_ID;

    if (reference && targetImage?.mediaType === 'video') {
      onError('Reference images must be still images.');
      return;
    }

    if (lastFrame) {
      if (!isKlingProVideoSelection) {
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

    if (reference) {
      if (primaryImageId && imageId === primaryImageId) {
        return;
      }
      if (!imageId) {
        setReferenceImageIds([]);
        return;
      }
      // Reference images power Kling prompts; enforce per-model limits.
      const maxReferenceImages = getMaxReferenceImages(falModelId);
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
        setVideoLastFrameImageId(null);
      }
      return;
    }

    if (multi) {
      setReferenceImageIds([]);
      setVideoLastFrameImageId(null);
      setSelectedImageIds(prevIds => {
        if (prevIds.includes(imageId)) {
          return prevIds.filter(id => id !== imageId);
        }
        return [...prevIds, imageId];
      });
      return;
    }

    if (primaryImageId === imageId && selectedImageIds.length === 1) {
      setSelectedNoteIds([]);
      setReferenceImageIds([]);
      setVideoLastFrameImageId(null);
      return;
    }

    setSelectedImageIds([imageId]);
    setSelectedNoteIds([]);
    setReferenceImageIds([]);
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
    klingVariant,
    onError,
    onReferenceLimit,
    primaryImageId,
    selectedImageIds.length,
    videoLastFrameImageId,
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
      setVideoLastFrameImageId(null);
      return;
    }

    setSelectedNoteIds([noteId]);
    setSelectedImageIds([]);
    setReferenceImageIds([]);
    setVideoLastFrameImageId(null);
  }, [primaryNoteId, selectedNoteIds.length]);

  return {
    selectedImageIds,
    selectedNoteIds,
    referenceImageIds,
    videoLastFrameImageId,
    primaryImageId,
    primaryNoteId,
    hasSingleImageSelected,
    setSelectedImageIds,
    setSelectedNoteIds,
    setReferenceImageIds,
    setVideoLastFrameImageId,
    handleImageSelection,
    handleNoteSelection,
  };
};
