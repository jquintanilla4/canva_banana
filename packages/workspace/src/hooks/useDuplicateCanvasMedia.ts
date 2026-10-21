import { useCallback, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { CanvasImage } from '../types';
import { loadAudioFromBlob, loadAudioFromUrl, revokeAudioObjectUrl } from '../services/audioService';
import { loadMediaFromBlob, loadMediaFromUrl, revokeVideoObjectUrl } from '../services/mediaService';
import { ensureRealSnapshotFile, getSnapshotMediaObjectUrl } from '../services/snapshotService';
import type { AppState } from './useCanvasHistory';

type DuplicateArgs = {
  displayedImages: CanvasImage[];
  setState: Dispatch<SetStateAction<AppState>>;
  setSelectedImageIds: (ids: string[]) => void;
  setReferenceImageIds: (ids: string[]) => void;
  setVideoLastFrameImageId: (id: string | null) => void;
};

export function useDuplicateCanvasMedia({
  displayedImages,
  setState,
  setSelectedImageIds,
  setReferenceImageIds,
  setVideoLastFrameImageId,
}: DuplicateArgs) {
  const lifetimeRef = useRef<AbortController | null>(null);
  const pendingMediaRef = useRef(new Set<HTMLVideoElement | HTMLAudioElement>());
  useLayoutEffect(() => {
    const lifetime = new AbortController();
    lifetimeRef.current = lifetime;
    const pendingMedia = pendingMediaRef.current;
    return () => {
      lifetime.abort();
      pendingMedia.forEach(element => {
        element.pause();
        if (element instanceof HTMLVideoElement) revokeVideoObjectUrl(element);
        else revokeAudioObjectUrl(element);
      });
      pendingMedia.clear();
    };
  }, []);
  useLayoutEffect(() => {
    displayedImages.forEach(image => {
      if (image.element instanceof HTMLVideoElement) pendingMediaRef.current.delete(image.element);
      if (image.audioElement) pendingMediaRef.current.delete(image.audioElement);
    }); // Committed duplicates transfer URL ownership to canvas history.
  }, [displayedImages]);

  const focusSelection = useCallback((next: { imageId?: string | null }) => {
    const { imageId = null } = next;
    setSelectedImageIds(imageId ? [imageId] : []);
    setReferenceImageIds([]);
    setVideoLastFrameImageId(null);
  }, [setReferenceImageIds, setSelectedImageIds, setVideoLastFrameImageId]);

  const duplicateImage = useCallback((imageId: string) => {
    const lifetime = lifetimeRef.current;
    if (!lifetime || lifetime.signal.aborted) return;
    const sourceImage = displayedImages.find(img => img.id === imageId);
    if (!sourceImage) {
      return;
    }

    const offsetY = sourceImage.height + 20;
    const duplicatedId = crypto.randomUUID();
    const commitDuplicate = (overrides: Partial<CanvasImage>) => {
      if (lifetime.signal.aborted) return;
      const duplicatedImage: CanvasImage = {
        ...sourceImage,
        ...overrides,
        id: duplicatedId,
        y: sourceImage.y + offsetY,
      };

      setState(prev => ({
        ...prev,
        images: [...prev.images, duplicatedImage],
      }));
      focusSelection({ imageId: duplicatedImage.id });
    };

    // Rehydrate elements without cloning revoked blob URLs or eagerly reading large snapshots.
    void (async () => {
      try {
        const snapshotObjectUrl = getSnapshotMediaObjectUrl(sourceImage.file); // Restored desktop media already has a retained lazy URL.
        if (sourceImage.mediaType === 'audio') {
          let waveformElement = sourceImage.element;
          if (sourceImage.waveformImageData) {
            const waveformImg = new Image();
            await new Promise<void>((resolve, reject) => {
              waveformImg.onload = () => resolve();
              waveformImg.onerror = () => reject(new Error('Failed to load waveform image.'));
              waveformImg.src = sourceImage.waveformImageData;
            });
            waveformElement = waveformImg;
          }

          if (lifetime.signal.aborted) return;
          const duplicateFile = snapshotObjectUrl ? sourceImage.file : await ensureRealSnapshotFile(sourceImage.file);
          if (lifetime.signal.aborted) return;
          const audioElement = snapshotObjectUrl
            ? await loadAudioFromUrl(snapshotObjectUrl)
            : await loadAudioFromBlob(duplicateFile);
          if (lifetime.signal.aborted) {
            audioElement.pause();
            if (!snapshotObjectUrl) revokeAudioObjectUrl(audioElement);
            return;
          }
          if (!snapshotObjectUrl) pendingMediaRef.current.add(audioElement);
          commitDuplicate({
            element: waveformElement,
            audioElement,
            isPlaying: false,
            currentPlaybackTime: 0,
            file: duplicateFile, // Lazy duplicates reuse the active document's retained snapshot source.
          });
          return;
        }

        const mediaType = sourceImage.mediaType === 'video' ? 'video' : 'image';
        const realFile = snapshotObjectUrl ? sourceImage.file : await ensureRealSnapshotFile(sourceImage.file);
        if (lifetime.signal.aborted) return;
        const element = snapshotObjectUrl
          ? await loadMediaFromUrl(snapshotObjectUrl, mediaType)
          : await loadMediaFromBlob(realFile, mediaType);
        if (element instanceof HTMLVideoElement) {
          element.currentTime = 0;
          element.pause();
          if (lifetime.signal.aborted) {
            if (!snapshotObjectUrl) revokeVideoObjectUrl(element);
            return;
          }
          if (!snapshotObjectUrl) pendingMediaRef.current.add(element);
          element.loop = true;
          element.muted = true;
          element.playsInline = true;
        }

        commitDuplicate({ element, isPlaying: false, file: realFile });
      } catch (err) {
        console.error('Failed to duplicate media:', err);
      }
    })();
  }, [displayedImages, focusSelection, setState]);

  return { duplicateImage };
}
