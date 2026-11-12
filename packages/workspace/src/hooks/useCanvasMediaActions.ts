import { type SvgDownloadFormat, cropCanvasImage } from '../services/imageOperations';
import { isGifFile, isGifImage } from '../services/gifMedia';
import { confirmRasterCopies, preservesOriginalImage } from '../services/stillImagePolicy';
import { isSvgFile, isSvgImage, normalizeImageFile } from '../services/svgMedia';
import { getWorkspaceSize } from '../services/runtimeConfig';
import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type React from 'react';
import {
  type CanvasImage,
  type CanvasNote,
  type Path,
  type Point,
  Tool,
} from '../types';
import { getNaturalSize, loadMediaFromBlob, revokeVideoObjectUrl } from '../services/mediaService';
import { loadAudioFromBlob, generateWaveformImage, revokeAudioObjectUrl } from '../services/audioService';
import { removeBackground as removeFalBackground } from '../services/falService';
import {
  CanvasMediaDownloadCancelledError,
  downloadCanvasMediaSelection,
  type CanvasMediaDownloadProgress,
} from '../services/canvasMediaDownloadService';
import type { AppState, CommitOverrides } from './useCanvasHistory';

type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };
type TransformModeState = { imageId: string; };

type UseCanvasMediaActionsArgs = {
  requestSvgExportFormat?: () => Promise<SvgDownloadFormat | null>;
  cancelSvgExportFormat?: () => void;
  images: CanvasImage[];
  displayedImages: CanvasImage[];
  hasSingleImageSelected: boolean;
  primaryImageId: string | null;
  selectedImageIds: string[];
  setState: Dispatch<SetStateAction<AppState>>;
  setSelectedImageIds: (ids: string[]) => void;
  setReferenceImageIds: (ids: string[]) => void;
  setTool: (tool: Tool) => void;
  setError: (message: string | null) => void;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setLiveImages: (images: CanvasImage[] | null) => void;
  // handleCommit can take overrides when a caller already has the next slices computed.
  handleCommit: (overrides?: CommitOverrides) => void;
};

type UseCanvasMediaActionsResult = {
  cropMode: CropModeState | null;
  transformMode: TransformModeState | null;
  isRemovingBackground: boolean;
  downloadProgress: CanvasMediaDownloadProgress | null;
  handleFilesDrop: (files: FileList, point: Point) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownload: () => void;
  handleBackgroundRemoval: () => Promise<void>;
  handleStartCrop: (imageId: string) => void;
  handleCropRectChange: (rect: { x: number; y: number; width: number; height: number; }) => void;
  handleConfirmCrop: () => Promise<void>;
  handleCancelCrop: () => void;
  handleStartTransform: (imageId: string) => void;
  handleExitTransform: () => void;
};

const isImageCanvasMedia = (img: CanvasImage | null | undefined): img is CanvasImage & { element: HTMLImageElement } =>
  !!img && img.mediaType === 'image';

export function useCanvasMediaActions({
  requestSvgExportFormat, cancelSvgExportFormat,
  images,
  displayedImages,
  hasSingleImageSelected,
  primaryImageId,
  selectedImageIds,
  setState,
  setSelectedImageIds,
  setReferenceImageIds,
  setTool,
  setError,
  setToastMessage,
  setLiveImages,
  handleCommit,
}: UseCanvasMediaActionsArgs): UseCanvasMediaActionsResult {
  const [cropMode, setCropMode] = useState<CropModeState | null>(null);
  const [transformMode, setTransformMode] = useState<TransformModeState | null>(null);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<CanvasMediaDownloadProgress | null>(null);
  const backgroundPendingRef = useRef(false);
  const cropPendingRef = useRef(false);
  const isDownloadingRef = useRef(false); // A ref blocks a second click before React commits the busy state.
  const downloadToastIdRef = useRef(0); // Only the latest download may expire its toast.

  const committedImagesRef = useRef(images);
  useLayoutEffect(() => {
    committedImagesRef.current = images;
    cancelSvgExportFormat?.();
  }, [images, cancelSvgExportFormat]);

  const uploadLifetimeRef = useRef<AbortController | null>(null);
  const pendingUploadsRef = useRef(new Set<HTMLVideoElement | HTMLAudioElement>());
  useLayoutEffect(() => {
    const lifetime = new AbortController();
    uploadLifetimeRef.current = lifetime;
    const pendingUploads = pendingUploadsRef.current;
    return () => {
      lifetime.abort();
      pendingUploads.forEach(element => {
        element.pause();
        if (element instanceof HTMLVideoElement) revokeVideoObjectUrl(element);
        else revokeAudioObjectUrl(element);
      });
      pendingUploads.clear();
    };
  }, []);
  useLayoutEffect(() => {
    images.forEach(image => {
      if (image.element instanceof HTMLVideoElement) pendingUploadsRef.current.delete(image.element);
      if (image.audioElement) pendingUploadsRef.current.delete(image.audioElement);
    }); // Canvas history owns URLs only after the upload has reached committed state.
  }, [images]);

  // Adds dropped/uploaded images, videos, and audio to the canvas and selects the last one placed.
  const handleFilesDrop = useCallback((files: FileList, point: Point) => {
    const lifetime = uploadLifetimeRef.current;
    if (!lifetime || lifetime.signal.aborted) return;
    const mediaFiles = Array.from(files).filter(file =>
      isSvgFile(file) || isGifFile(file) || file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
    );
    if (mediaFiles.length === 0) return;

    let lastAddedMediaId: string | null = null;
    const newMedia: CanvasImage[] = [];
    let mediaProcessed = 0;

    const processFile = async (file: File, index: number) => {
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      let pendingMedia: HTMLVideoElement | HTMLAudioElement | undefined;
      const discardFailedMedia = () => {
        if (!pendingMedia) return;
        pendingUploadsRef.current.delete(pendingMedia);
        pendingMedia.pause();
        if (pendingMedia instanceof HTMLVideoElement) revokeVideoObjectUrl(pendingMedia);
        else revokeAudioObjectUrl(pendingMedia);
      };

      if (isVideo) {
        // Handle video file
        try {
          const videoElement = await loadMediaFromBlob(file, 'video') as HTMLVideoElement;
          pendingMedia = videoElement;
          videoElement.pause();
          if (lifetime.signal.aborted) { revokeVideoObjectUrl(videoElement); return; }
          pendingUploadsRef.current.add(videoElement);
          videoElement.currentTime = 0;
          videoElement.loop = true;
          videoElement.muted = true;
          videoElement.playsInline = true;

          const { naturalWidth, naturalHeight } = getNaturalSize(videoElement);
          const displayWidth = naturalWidth || 640;
          const displayHeight = naturalHeight || 360;

          // Try to detect audio
          const audioTrackInfo = (videoElement as unknown as { audioTracks?: { length?: number } }).audioTracks;
          const audioTrackCount = typeof audioTrackInfo?.length === 'number' ? audioTrackInfo.length : 0;
          const webkitAudioDecodedByteCount = (videoElement as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
          const hasAudio = Boolean(
            (videoElement as unknown as { mozHasAudio?: boolean }).mozHasAudio ||
            audioTrackCount > 0 ||
            (typeof webkitAudioDecodedByteCount === 'number' && webkitAudioDecodedByteCount > 0)
          );

          const newCanvasVideo: CanvasImage = {
            id: crypto.randomUUID(),
            element: videoElement,
            mediaType: 'video',
            x: point.x - (displayWidth / 2) + (index * 20),
            y: point.y - (displayHeight / 2) + (index * 20),
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth,
            naturalHeight,
            file: file,
            isPlaying: false,
            hasAudio,
            metadata: { source: 'imported' },
          };
          newMedia.push(newCanvasVideo);
          lastAddedMediaId = newCanvasVideo.id;
        } catch (err) {
          discardFailedMedia();
          console.error('Failed to load video:', err);
        }
      } else if (isAudio) {
        // Handle audio file
        try {
          const audioElement = await loadAudioFromBlob(file);
          pendingMedia = audioElement;
          if (lifetime.signal.aborted) { audioElement.pause(); revokeAudioObjectUrl(audioElement); return; }
          pendingUploadsRef.current.add(audioElement);
          const duration = audioElement.duration;

          // Generate waveform image
          const displayWidth = 400;
          const displayHeight = 80;
          const { dataUrl: waveformImageData } = await generateWaveformImage(
            file,
            displayWidth,
            displayHeight
          );

          if (lifetime.signal.aborted) return;
          // Create waveform image element for canvas rendering
          const waveformImg = new Image();
          await new Promise<void>((resolve, reject) => {
            waveformImg.onload = () => resolve();
            waveformImg.onerror = () => reject(new Error('Failed to load waveform image'));
            waveformImg.src = waveformImageData;
          });

          if (lifetime.signal.aborted) return;
          const newCanvasAudio: CanvasImage = {
            id: crypto.randomUUID(),
            element: waveformImg,
            mediaType: 'audio',
            x: point.x - (displayWidth / 2) + (index * 20),
            y: point.y - (displayHeight / 2) + (index * 20),
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth: displayWidth,
            naturalHeight: displayHeight,
            file: file,
            isPlaying: false,
            hasAudio: true,
            audioElement,
            waveformImageData,
            audioDuration: duration,
            currentPlaybackTime: 0,
            metadata: { source: 'imported' },
          };
          newMedia.push(newCanvasAudio);
          lastAddedMediaId = newCanvasAudio.id;
        } catch (err) {
          discardFailedMedia();
          console.error('Failed to load audio:', err);
        }
      } else {
        // Handle image file
        try {
          file = await normalizeImageFile(file);
          const reader = new FileReader();
          await new Promise<void>((resolve) => {
            reader.onload = (event) => {
              if (lifetime.signal.aborted) { resolve(); return; }
              const img = new Image();
              img.onload = () => {
                if (lifetime.signal.aborted) { resolve(); return; }
                const { naturalWidth, naturalHeight } = getNaturalSize(img);
                const displayWidth = img.width || naturalWidth;
                const displayHeight = img.height || naturalHeight;
                const newCanvasImage: CanvasImage = {
                  id: crypto.randomUUID(),
                  element: img,
                  mediaType: 'image',
                  x: point.x - (displayWidth / 2) + (index * 20),
                  y: point.y - (displayHeight / 2) + (index * 20),
                  width: displayWidth,
                  height: displayHeight,
                  rotation: 0,
                  naturalWidth,
                  naturalHeight,
                  file: file,
                  isPlaying: false,
                  hasAudio: false,
                  metadata: { source: 'imported' },
                };
                newMedia.push(newCanvasImage);
                lastAddedMediaId = newCanvasImage.id;
                resolve();
              };
              img.onerror = () => resolve();
              img.src = event.target?.result as string;
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
          });
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Failed to import SVG.');
        }
      }

      if (lifetime.signal.aborted) return;
      mediaProcessed++;
      if (mediaProcessed === mediaFiles.length) {
        if (newMedia.length === 0 && mediaFiles.some(isSvgFile)) return;
        setState(prevState => ({
          ...prevState,
          images: [...prevState.images, ...newMedia],
          paths: [],
        }));
        setSelectedImageIds(lastAddedMediaId ? [lastAddedMediaId] : []);
        setReferenceImageIds([]);
        setTool(Tool.SELECTION);
      }
    };

    mediaFiles.forEach((file, index) => {
      processFile(file, index);
    });
  }, [setError, setReferenceImageIds, setSelectedImageIds, setState, setTool]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const centerPoint: Point = { x: getWorkspaceSize().width / 2, y: getWorkspaceSize().height / 2 };
      handleFilesDrop(files, centerPoint);
    }
    e.target.value = '';
  }, [handleFilesDrop]);

  const handleDownload = useCallback(async () => {
    if (selectedImageIds.length === 0 || isDownloadingRef.current) return;
    const imageById = new Map(images.map(image => [image.id, image]));
    const selectedMedia = selectedImageIds.flatMap(id => {
      const image = imageById.get(id);
      return image ? [image] : [];
    });
    if (selectedMedia.length === 0) return;
    isDownloadingRef.current = true;
    try {
      setError(null);
      const svgFormat = selectedMedia.some(isSvgImage) && requestSvgExportFormat ? await requestSvgExportFormat() : undefined;
      if (svgFormat === null) return;
      const result = await downloadCanvasMediaSelection(selectedMedia, setDownloadProgress, { svgFormat });
      const skippedNames = result.skipped.slice(0, 3).map(item => item.fileName).join(', ');
      const skippedSuffix = result.skipped.length > 3 ? `, +${result.skipped.length - 3} more` : '';
      const successMessage = selectedMedia.length === 1
        ? 'Download started'
        : result.downloadedCount === 1
          ? 'Downloaded 1 selected item'
          : `Downloaded ${result.downloadedCount} selected items as ZIP`;
      const toastMessage = result.skipped.length > 0
        ? `${successMessage}; skipped ${result.skipped.length}: ${skippedNames}${skippedSuffix}`
        : successMessage;
      const downloadToastId = ++downloadToastIdRef.current;
      setToastMessage(toastMessage);
      setTimeout(() => {
        if (downloadToastId !== downloadToastIdRef.current) return;
        setToastMessage(currentMessage => currentMessage === toastMessage ? null : currentMessage);
      }, 3000);
    } catch (error) {
      if (error instanceof CanvasMediaDownloadCancelledError) return;
      setError(error instanceof Error ? error.message : 'No downloadable source found for this item.');
    } finally {
      isDownloadingRef.current = false;
      setDownloadProgress(null);
    }
  }, [images, requestSvgExportFormat, selectedImageIds, setError, setToastMessage]);

  const handleBackgroundRemoval = useCallback(async () => {
    if (backgroundPendingRef.current) return;
    if (!hasSingleImageSelected || !primaryImageId) {
      setError('Select an image to remove its background.');
      return;
    }
    const targetImage = displayedImages.find(img => img.id === primaryImageId);
    if (!targetImage || !isImageCanvasMedia(targetImage)) {
      setError('Background removal is only available for images.');
      return;
    }

    const lifetime = uploadLifetimeRef.current;
    if (!lifetime || lifetime.signal.aborted || !confirmRasterCopies([targetImage], 'Remove background')) return;
    handleCommit();
    backgroundPendingRef.current = true;
    try {
      setIsRemovingBackground(true);
      const { imageBase64 } = await removeFalBackground(targetImage.element);
      const dataUrl = `data:image/png;base64,${imageBase64}`;
      const blob = await (await fetch(dataUrl)).blob();
      const element = await loadMediaFromBlob(blob, 'image');
      const { naturalWidth, naturalHeight } = getNaturalSize(element);
      const fileNameBase = targetImage.file?.name?.replace(/\.[^.]+$/, '') || 'image';
      const updatedFile = new File([blob], `${fileNameBase}-nobg.png`, { type: blob.type || targetImage.file.type || 'image/png' });
      const width = element.width || naturalWidth;
      const height = element.height || naturalHeight;

      if (lifetime.signal.aborted || !committedImagesRef.current.some(image => image.id === targetImage.id && image.file === targetImage.file)) return;
      const derived = { ...targetImage, element, width, height, naturalWidth, naturalHeight, file: updatedFile,
        metadata: { ...targetImage.metadata, source: 'derived' as const } };
      if (preservesOriginalImage(targetImage)) {
        const result = { ...derived, id: crypto.randomUUID(), x: targetImage.x + targetImage.width + 32, y: targetImage.y };
        setState(prev => prev.images.some(image => image.id === targetImage.id && image.file === targetImage.file)
          ? { ...prev, images: [...prev.images, result] } : prev);
      } else {
        setState(prev => ({ ...prev, images: prev.images.map(image => image.id === targetImage.id ? derived : image) }));
      }
      setLiveImages(null);
      setError(null);
      setToastMessage('Background removed');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to remove background.';
      setError(message);
    } finally {
      backgroundPendingRef.current = false;
      setIsRemovingBackground(false);
    }
  }, [displayedImages, handleCommit, hasSingleImageSelected, primaryImageId, setError, setLiveImages, setState, setToastMessage]);

  const handleStartCrop = useCallback((imageId: string) => {
    const targetImage = displayedImages.find(img => img.id === imageId);
    if (!targetImage) {
      return;
    }
    if (!isImageCanvasMedia(targetImage)) {
      setError('Cropping is only available for images.');
      return;
    }
    if (!isGifImage(targetImage)) handleCommit();
    setTransformMode(null);
    setCropMode({
      imageId,
      rect: { x: 0, y: 0, width: targetImage.width, height: targetImage.height },
    });
    setSelectedImageIds([imageId]);
  }, [displayedImages, handleCommit, setError, setSelectedImageIds]);

  const handleCropRectChange = useCallback((rect: { x: number; y: number; width: number; height: number; }) => {
    setCropMode(prev => (prev ? { ...prev, rect } : prev));
  }, []);

  const handleConfirmCrop = useCallback(async () => {
    if (!cropMode || cropPendingRef.current) return;
    const targetImage = images.find(img => img.id === cropMode.imageId);
    if (!targetImage || !isImageCanvasMedia(targetImage)) {
      setCropMode(null);
      return;
    }

    const lifetime = uploadLifetimeRef.current;
    if (!lifetime || lifetime.signal.aborted) return;
    const retainOriginal = isGifImage(targetImage);
    if (retainOriginal && !confirmRasterCopies([targetImage], 'Crop image')) return;
    if (retainOriginal) handleCommit();
    cropPendingRef.current = true;
    try {
      const cropped = await cropCanvasImage(targetImage, cropMode.rect);
      if (lifetime.signal.aborted || !committedImagesRef.current.some(image => image.id === targetImage.id && image.file === targetImage.file)) return;
      const result = retainOriginal ? { ...cropped, id: crypto.randomUUID(), x: targetImage.x + targetImage.width + 32, y: targetImage.y } : cropped;
      setState(prev => !prev.images.some(image => image.id === targetImage.id && image.file === targetImage.file) ? prev : { ...prev, images: retainOriginal
        ? [...prev.images, result] : prev.images.map(image => image.id === targetImage.id ? result : image) });
      if (!retainOriginal) setSelectedImageIds([targetImage.id]);
      setToastMessage('Cropped image saved');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to crop image.';
      setError(message);
    } finally {
      cropPendingRef.current = false;
      setCropMode(null);
      setLiveImages(null);
    }
  }, [cropMode, images, handleCommit, setError, setLiveImages, setSelectedImageIds, setState, setToastMessage]);

  const handleCancelCrop = useCallback(() => {
    setCropMode(null);
  }, []);

  const handleStartTransform = useCallback((imageId: string) => {
    handleCommit();
    setCropMode(null);
    setTransformMode({ imageId });
    setSelectedImageIds([imageId]);
  }, [handleCommit, setSelectedImageIds]);

  const handleExitTransform = useCallback(() => {
    handleCommit();
    setTransformMode(null);
  }, [handleCommit]);

  return {
    cropMode,
    transformMode,
    isRemovingBackground,
    downloadProgress,
    handleFilesDrop,
    handleFileChange,
    handleDownload,
    handleBackgroundRemoval,
    handleStartCrop,
    handleCropRectChange,
    handleConfirmCrop,
    handleCancelCrop,
    handleStartTransform,
    handleExitTransform,
  };
}
