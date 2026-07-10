import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasImage, CanvasNote } from '../types';
import { loadAudioFromBlob } from '../services/audioService';
import { loadMediaFromBlob } from '../services/mediaService';
import { ensureRealSnapshotFile } from '../services/snapshotService';
import type { AppState } from './useCanvasHistory';

type DuplicateArgs = {
  displayedImages: CanvasImage[];
  displayedNotes: CanvasNote[];
  setState: Dispatch<SetStateAction<AppState>>;
  setSelectedImageIds: (ids: string[]) => void;
  setSelectedNoteIds: (ids: string[]) => void;
  setReferenceImageIds: (ids: string[]) => void;
  setVideoLastFrameImageId: (id: string | null) => void;
};

export function useDuplicateCanvasMedia({
  displayedImages,
  displayedNotes,
  setState,
  setSelectedImageIds,
  setSelectedNoteIds,
  setReferenceImageIds,
  setVideoLastFrameImageId,
}: DuplicateArgs) {
  const focusSelection = useCallback((next: { imageId?: string | null; noteId?: string | null }) => {
    const { imageId = null, noteId = null } = next;
    setSelectedImageIds(imageId ? [imageId] : []);
    setSelectedNoteIds(noteId ? [noteId] : []);
    setReferenceImageIds([]);
    setVideoLastFrameImageId(null);
  }, [setReferenceImageIds, setSelectedImageIds, setSelectedNoteIds, setVideoLastFrameImageId]);

  const duplicateNote = useCallback((noteId: string) => {
    const sourceNote = displayedNotes.find(n => n.id === noteId);
    if (!sourceNote) {
      return;
    }

    const offsetY = sourceNote.height + 20;
    const duplicatedNote: CanvasNote = {
      ...sourceNote,
      id: crypto.randomUUID(),
      y: sourceNote.y + offsetY,
    };

    setState(prev => ({
      ...prev,
      notes: [...prev.notes, duplicatedNote],
    }));
    focusSelection({ noteId: duplicatedNote.id });
  }, [displayedNotes, focusSelection, setState]);

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

  return { duplicateNote, duplicateImage };
}
