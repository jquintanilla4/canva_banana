import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasImage, CanvasNote } from '../types';
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

    const clonedElement = sourceImage.element.cloneNode(true) as typeof sourceImage.element;
    if (clonedElement instanceof HTMLVideoElement) {
      clonedElement.currentTime = 0;
      clonedElement.pause();
    }

    const offsetY = sourceImage.height + 20;
    const duplicatedImage: CanvasImage = {
      ...sourceImage,
      id: crypto.randomUUID(),
      element: clonedElement,
      y: sourceImage.y + offsetY,
    };

    setState(prev => ({
      ...prev,
      images: [...prev.images, duplicatedImage],
    }));
    focusSelection({ imageId: duplicatedImage.id });
  }, [displayedImages, focusSelection, setState]);

  return { duplicateNote, duplicateImage };
}
