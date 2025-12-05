import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CanvasImage } from '../types';
import type { AppState } from './useCanvasHistory';
import { getNaturalSize, loadMediaFromBlob } from '../services/mediaService';

type UseImageResizeArgs = {
  images: CanvasImage[];
  selectedImageIds: string[];
  setState: (updater: (prevState: AppState) => AppState) => void;
  handleCommit: () => void;
  setToastMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
};

type UseImageResizeResult = {
  isOpen: boolean;
  width: string;
  height: string;
  keepAspect: boolean;
  isProcessing: boolean;
  canResize: boolean;
  open: () => void;
  cancel: () => void;
  setWidth: (value: string) => void;
  setHeight: (value: string) => void;
  setKeepAspect: (value: boolean) => void;
  confirm: () => Promise<void>;
};

export function useImageResize({
  images,
  selectedImageIds,
  setState,
  handleCommit,
  setToastMessage,
  setError,
}: UseImageResizeArgs): UseImageResizeResult {
  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [keepAspect, setKeepAspect] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedImages = useMemo(
    () => images.filter(img => selectedImageIds.includes(img.id)),
    [images, selectedImageIds],
  );
  const resizableImages = useMemo(
    () => selectedImages.filter(img => img.mediaType === 'image'),
    [selectedImages],
  );
  const canResize = resizableImages.length > 0 && resizableImages.length === selectedImages.length;
  const aspectRatio = useMemo(() => {
    const reference = resizableImages[0];
    if (!reference || reference.height === 0) {
      return 1;
    }
    return reference.width / reference.height;
  }, [resizableImages]);

  useEffect(() => {
    if (isOpen && !canResize) {
      setIsOpen(false);
    }
  }, [canResize, isOpen]);

  useEffect(() => {
    if (!keepAspect || !isOpen) return;
    const parsed = Number.parseInt(width, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isFinite(aspectRatio) || aspectRatio === 0) {
      return;
    }
    const nextHeight = Math.max(1, Math.round(parsed / aspectRatio));
    setHeight(nextHeight.toString());
  }, [aspectRatio, isOpen, keepAspect, width]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2000);
  }, [setToastMessage]);

  const open = useCallback(() => {
    if (!resizableImages.length) {
      setError('Select an image to resize.');
      return;
    }
    if (resizableImages.length !== selectedImages.length) {
      setError('Resize is available for images only. Deselect videos to continue.');
      return;
    }
    const referenceImage = resizableImages[0];
    setWidth(Math.round(referenceImage.width).toString());
    setHeight(Math.round(referenceImage.height).toString());
    setIsOpen(true);
  }, [resizableImages, selectedImages.length, setError]);

  const cancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const updateWidth = useCallback((value: string) => {
    setWidth(value);
    if (!keepAspect) return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isFinite(aspectRatio) || aspectRatio === 0) {
      return;
    }
    const nextHeight = Math.max(1, Math.round(parsed / aspectRatio));
    setHeight(nextHeight.toString());
  }, [aspectRatio, keepAspect]);

  const updateHeight = useCallback((value: string) => {
    setHeight(value);
    if (!keepAspect) return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isFinite(aspectRatio) || aspectRatio === 0) {
      return;
    }
    const nextWidth = Math.max(1, Math.round(parsed * aspectRatio));
    setWidth(nextWidth.toString());
  }, [aspectRatio, keepAspect]);

  const confirm = useCallback(async () => {
    const nextWidth = Number.parseInt(width, 10);
    const nextHeight = Number.parseInt(height, 10);
    const hasValidWidth = Number.isFinite(nextWidth) && nextWidth > 0;
    const hasValidHeight = Number.isFinite(nextHeight) && nextHeight > 0;
    if (!hasValidWidth || !hasValidHeight) {
      setError('Enter width and height in pixels greater than zero.');
      return;
    }
    if (!resizableImages.length) {
      setIsOpen(false);
      setError('Select an image to resize.');
      return;
    }

    setIsProcessing(true);
    try {
      handleCommit();
      const resizeIds = new Set(resizableImages.map(img => img.id));
      const resized = await Promise.all(resizableImages.map(async (img) => {
        const canvas = document.createElement('canvas');
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Unable to resize image.');
        }
        ctx.drawImage(img.element, 0, 0, nextWidth, nextHeight);

        const targetType = img.file?.type || 'image/png';
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(result => {
            if (result) {
              resolve(result);
            } else {
              reject(new Error('Failed to create resized image.'));
            }
          }, targetType);
        });
        const element = await loadMediaFromBlob(blob, 'image');
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        const baseName = img.file?.name?.replace(/\.[^.]+$/, '') || 'image';
        const extension = targetType.includes('png')
          ? '.png'
          : targetType.includes('jpeg') || targetType.includes('jpg')
            ? '.jpg'
            : '.png';
        const resizedFile = new File([blob], `${baseName}-resized${extension}`, { type: targetType });
        const centerX = img.x + img.width / 2;
        const centerY = img.y + img.height / 2;

        return {
          ...img,
          element,
          width: nextWidth,
          height: nextHeight,
          naturalWidth,
          naturalHeight,
          file: resizedFile,
          x: centerX - nextWidth / 2,
          y: centerY - nextHeight / 2,
          metadata: { ...img.metadata, source: img.metadata?.source ?? 'derived' },
        };
      }));

      setState(prevState => ({
        ...prevState,
        images: prevState.images.map(img => {
          const updated = resized.find(r => r.id === img.id);
          return updated ?? img;
        }),
      }));

      setIsOpen(false);
      showToast(resized.length > 1 ? 'Resized selected images' : 'Resized image');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resize image.';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [handleCommit, height, resizableImages, setError, setState, showToast, width]);

  return {
    isOpen,
    width,
    height,
    keepAspect,
    isProcessing,
    canResize,
    open,
    cancel,
    setWidth: updateWidth,
    setHeight: updateHeight,
    setKeepAspect,
    confirm,
  };
}
