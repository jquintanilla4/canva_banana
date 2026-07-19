import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasImage } from '../types';
import { loadAudioFromBlob } from '../services/audioService';
import { loadMediaFromBlob } from '../services/mediaService';
import { ensureRealSnapshotFile } from '../services/snapshotService';
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

    // Rehydrate elements from the file to avoid cloning revoked blob URLs.
    void (async () => {
      try {
        const realFile = await ensureRealSnapshotFile(sourceImage.file);
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

          const audioElement = await loadAudioFromBlob(realFile);
          commitDuplicate({
            element: waveformElement,
            audioElement,
            isPlaying: false,
            currentPlaybackTime: 0,
            file: realFile, // The duplicate must not depend on the snapshot read source staying open.
          });
          return;
        }

        const element = await loadMediaFromBlob(
          realFile,
          sourceImage.mediaType === 'video' ? 'video' : 'image',
        );
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
