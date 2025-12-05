import { useCallback, useState } from 'react';
import type { CanvasImage, CanvasNote, Path } from '../types';

export type AppState = { images: CanvasImage[]; paths: Path[]; notes: CanvasNote[] };

const DEFAULT_MAX_HISTORY_SIZE = 30;

// Compact string signature lets us skip storing identical states while keeping undo/redo fast.
const getStateSignature = (state: AppState): string => {
  const imageSignature = state.images
    .map(img => `${img.id},${img.x.toFixed(2)},${img.y.toFixed(2)},${img.width},${img.height},${(img.rotation ?? 0).toFixed(3)}`)
    .join(';');
  const pathSignature = state.paths.map(p => `${p.points.length},${p.tool}`).join(',');
  const noteSignature = state.notes.map(n => `${n.id},${n.x.toFixed(2)},${n.y.toFixed(2)},${n.width.toFixed(0)},${n.height.toFixed(0)},${n.text.length}`).join(';');
  return `${imageSignature}|${pathSignature}|${noteSignature}`;
};

type UseCanvasHistoryOptions = {
  maxHistory?: number;
};

export const useCanvasHistory = (
  initialState: AppState = { images: [], paths: [], notes: [] },
  options: UseCanvasHistoryOptions = {},
) => {
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY_SIZE;
  const [historyState, setHistoryState] = useState<{ history: AppState[]; index: number }>(() => ({
    history: [initialState],
    index: 0,
  }));

  const [liveImages, setLiveImages] = useState<CanvasImage[] | null>(null);
  const [livePaths, setLivePaths] = useState<Path[] | null>(null);
  const [liveNotes, setLiveNotes] = useState<CanvasNote[] | null>(null);

  const currentState = historyState.history[historyState.index];
  const displayedImages = liveImages ?? currentState.images;
  const displayedPaths = livePaths ?? currentState.paths;
  const displayedNotes = liveNotes ?? currentState.notes;

  // Use functional updates so callers can mutate canvas slices without worrying about stale closures.
  const setState = useCallback((updater: (prevState: AppState) => AppState) => {
    setHistoryState(current => {
      const prevState = current.history[current.index];
      const nextState = updater(prevState);

      if (getStateSignature(nextState) === getStateSignature(prevState)) {
        return current;
      }

      const newHistory = current.history.slice(0, current.index + 1);
      newHistory.push(nextState);

      if (newHistory.length > maxHistory) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });
  }, [maxHistory]);

  // Merge any optimistic/live edits into history and clear the staging buffers.
  const commit = useCallback(() => {
    if (liveImages === null && livePaths === null && liveNotes === null) {
      return;
    }

    setHistoryState(current => {
      const prevState = current.history[current.index];
      const nextState: AppState = {
        images: liveImages ?? prevState.images,
        paths: livePaths ?? prevState.paths,
        notes: liveNotes ?? prevState.notes,
      };

      if (getStateSignature(nextState) === getStateSignature(prevState)) {
        return current;
      }

      const newHistory = current.history.slice(0, current.index + 1);
      newHistory.push(nextState);

      if (newHistory.length > maxHistory) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });

    setLiveImages(null);
    setLivePaths(null);
    setLiveNotes(null);
  }, [liveImages, livePaths, liveNotes, maxHistory]);

  const undo = useCallback(() => {
    commit();
    setHistoryState(prev => {
      if (prev.index === 0) {
        return prev;
      }
      return { ...prev, index: prev.index - 1 };
    });
  }, [commit]);

  const redo = useCallback(() => {
    commit();
    setHistoryState(prev => {
      if (prev.index >= prev.history.length - 1) {
        return prev;
      }
      return { ...prev, index: prev.index + 1 };
    });
  }, [commit]);

  const resetHistory = useCallback((nextState: AppState) => {
    setLiveImages(null);
    setLivePaths(null);
    setLiveNotes(null);
    setHistoryState({ history: [nextState], index: 0 });
  }, []);

  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.history.length - 1;

  return {
    images: currentState.images,
    paths: currentState.paths,
    notes: currentState.notes,
    displayedImages,
    displayedPaths,
    displayedNotes,
    setState,
    setLiveImages,
    setLivePaths,
    setLiveNotes,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  };
};
