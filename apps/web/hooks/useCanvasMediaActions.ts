import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type React from 'react';
import {
  type CanvasImage,
  type CanvasNote,
  type Path,
  type Point,
  Tool,
} from '../types';
import { getNaturalSize, loadMediaFromBlob } from '../services/mediaService';
import { loadAudioFromBlob, generateWaveformImage } from '../services/audioService';
import { removeBackground as removeFalBackground } from '../services/falService';
import { downloadCanvasMedia } from '../services/canvasMediaDownloadService';
import type { AppState, CommitOverrides } from './useCanvasHistory';

type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };
type TransformModeState = { imageId: string; };

type UseCanvasMediaActionsArgs = {
  images: CanvasImage[];
  displayedImages: CanvasImage[];
  hasSingleImageSelected: boolean;
  primaryImageId: string | null;
  setState: Dispatch<SetStateAction<AppState>>;
  setSelectedImageIds: (ids: string[]) => void;
  setReferenceImageIds: (ids: string[]) => void;
  setTool: (tool: Tool) => void;
  setError: (message: string | null) => void;
  setToastMessage: (message: string | null) => void;
  setLiveImages: (images: CanvasImage[] | null) => void;
  // handleCommit can take overrides when a caller already has the next slices computed.
  handleCommit: (overrides?: CommitOverrides) => void;
};

type UseCanvasMediaActionsResult = {
  cropMode: CropModeState | null;
  transformMode: TransformModeState | null;
  isRemovingBackground: boolean;
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
  images,
  displayedImages,
  hasSingleImageSelected,
  primaryImageId,
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

  // Adds dropped/uploaded images, videos, and audio to the canvas and selects the last one placed.
  const handleFilesDrop = useCallback((files: FileList, point: Point) => {
    const mediaFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
    );
    if (mediaFiles.length === 0) return;

    let lastAddedMediaId: string | null = null;
    const newMedia: CanvasImage[] = [];
    let mediaProcessed = 0;

    const processFile = async (file: File, index: number) => {
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');

      if (isVideo) {
        // Handle video file
        try {
          const videoElement = await loadMediaFromBlob(file, 'video') as HTMLVideoElement;
          videoElement.pause();
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
          console.error('Failed to load video:', err);
        }
      } else if (isAudio) {
        // Handle audio file
        try {
          const audioElement = await loadAudioFromBlob(file);
          const duration = audioElement.duration;

          // Generate waveform image
          const displayWidth = 400;
          const displayHeight = 80;
          const { dataUrl: waveformImageData } = await generateWaveformImage(
            file,
            displayWidth,
            displayHeight
          );

          // Create waveform image element for canvas rendering
          const waveformImg = new Image();
          await new Promise<void>((resolve, reject) => {
            waveformImg.onload = () => resolve();
            waveformImg.onerror = () => reject(new Error('Failed to load waveform image'));
            waveformImg.src = waveformImageData;
          });

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
          console.error('Failed to load audio:', err);
        }
      } else {
        // Handle image file
        const reader = new FileReader();
        await new Promise<void>((resolve) => {
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
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
      }

      mediaProcessed++;
      if (mediaProcessed === mediaFiles.length) {
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
  }, [setReferenceImageIds, setSelectedImageIds, setState, setTool]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const centerPoint: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      handleFilesDrop(files, centerPoint);
    }
    e.target.value = '';
  }, [handleFilesDrop]);

  const handleDownload = useCallback(async () => {
    if (!hasSingleImageSelected || !primaryImageId) return;
    const imageToDownload = images.find(img => img.id === primaryImageId);
    if (!imageToDownload) return;
    try {
      await downloadCanvasMedia(imageToDownload);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No downloadable source found for this item.');
    }
  }, [hasSingleImageSelected, images, primaryImageId, setError]);

  const handleBackgroundRemoval = useCallback(async () => {
    if (!hasSingleImageSelected || !primaryImageId) {
      setError('Select an image to remove its background.');
      return;
    }
    const targetImage = displayedImages.find(img => img.id === primaryImageId);
    if (!targetImage || !isImageCanvasMedia(targetImage)) {
      setError('Background removal is only available for images.');
      return;
    }

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

      setState(prev => ({
        ...prev,
        images: prev.images.map(img => img.id === targetImage.id
          ? {
              ...img,
              element,
              width,
              height,
              naturalWidth,
              naturalHeight,
              file: updatedFile,
              metadata: { ...img.metadata, source: img.metadata?.source ?? 'derived' },
            }
          : img),
      }));
      setLiveImages(null);
      setError(null);
      setToastMessage('Background removed');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to remove background.';
      setError(message);
    } finally {
      setIsRemovingBackground(false);
    }
  }, [displayedImages, hasSingleImageSelected, primaryImageId, setError, setLiveImages, setState, setToastMessage]);

  const handleStartCrop = useCallback((imageId: string) => {
    handleCommit();
    const targetImage = displayedImages.find(img => img.id === imageId);
    if (!targetImage) {
      return;
    }
    if (!isImageCanvasMedia(targetImage)) {
      setError('Cropping is only available for images.');
      return;
    }
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

  // Renders the selected crop into a new image/file and replaces the original.
  const handleConfirmCrop = useCallback(async () => {
    if (!cropMode) return;
    const targetImage = images.find(img => img.id === cropMode.imageId);
    if (!targetImage || !isImageCanvasMedia(targetImage)) {
      setCropMode(null);
      return;
    }

    try {
      const { x, y, width, height } = cropMode.rect;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to crop image.');
      }

      ctx.drawImage(targetImage.element, x, y, width, height, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Failed to create cropped image.'));
          }
        }, targetImage.file.type || 'image/png');
      });

      const element = await loadMediaFromBlob(blob, 'image');
      const { naturalWidth, naturalHeight } = getNaturalSize(element);
      const fileNameBase = targetImage.file?.name?.replace(/\.[^.]+$/, '') || 'image';
      const croppedFile = new File([blob], `${fileNameBase}-cropped.png`, { type: blob.type || targetImage.file.type || 'image/png' });
      const displayWidth = element.width || naturalWidth;
      const displayHeight = element.height || naturalHeight;

      setState(prev => ({
        ...prev,
        images: prev.images.map(img => img.id === targetImage.id
          ? {
              ...img,
              element,
              x: img.x + x,
              y: img.y + y,
              width: displayWidth,
              height: displayHeight,
              naturalWidth,
              naturalHeight,
              rotation: 0,
              file: croppedFile,
              metadata: { ...img.metadata, source: img.metadata?.source ?? 'derived' },
            }
          : img),
      }));
      setSelectedImageIds([targetImage.id]);
      setToastMessage('Cropped image saved');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to crop image.';
      setError(message);
    } finally {
      setCropMode(null);
      setLiveImages(null);
    }
  }, [cropMode, images, setError, setLiveImages, setSelectedImageIds, setState, setToastMessage]);

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
