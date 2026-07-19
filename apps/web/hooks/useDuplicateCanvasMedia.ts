import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasImage } from '../types';
import { loadAudioFromBlob, loadAudioFromUrl } from '../services/audioService';
import { loadMediaFromBlob, loadMediaFromUrl } from '../services/mediaService';
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
  const focusSelection = useCallback((next: { imageId?: string | null }) => {
    const { imageId = null } = next;
    setSelectedImageIds(imageId ? [imageId] : []);
    setReferenceImageIds([]);
    setVideoLastFrameImageId(null);
  }, [setReferenceImageIds, setSelectedImageIds, setVideoLastFrameImageId]);

  const duplicateImage = useCallback((imageId: string) => {
    const sourceImage = displayedImages.find(img => img.id === imageId);
    if (!sourceImage) {
      return;
    }

    const offsetY = sourceImage.height + 20;
    const duplicatedId = crypto.randomUUID();
    const commitDuplicate = (overrides: Partial<CanvasImage>) => {
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

          const duplicateFile = snapshotObjectUrl ? sourceImage.file : await ensureRealSnapshotFile(sourceImage.file);
          const audioElement = snapshotObjectUrl
            ? await loadAudioFromUrl(snapshotObjectUrl)
            : await loadAudioFromBlob(duplicateFile);
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
        const element = snapshotObjectUrl
          ? await loadMediaFromUrl(snapshotObjectUrl, mediaType)
          : await loadMediaFromBlob(realFile, mediaType);
        if (element instanceof HTMLVideoElement) {
          element.currentTime = 0;
          element.pause();
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
