import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasImage, CanvasNote, Path } from '../types';
import { getVideoObjectUrl } from '../services/mediaService';

export type AppState = { images: CanvasImage[]; paths: Path[]; notes: CanvasNote[] };
// CommitOverrides let callers provide already-updated slices (e.g., when state is staged elsewhere)
// so the history snapshot captures that exact data instead of the last committed baseline.
export type CommitOverrides = Partial<Pick<AppState, 'images' | 'paths' | 'notes'>>;

const DEFAULT_MAX_HISTORY_SIZE = 30;

// Compact string signature lets us skip storing identical states while keeping undo/redo fast.
const getStateSignature = (state: AppState): string => {
  const getFileSignature = (file?: File) => (
    file
      ? `${file.name},${file.size},${file.lastModified}`
      : 'nofile'
  );
  const imageSignature = state.images
    .map(img => `${img.id},${img.mediaType},${img.isPlaying ? 1 : 0},${img.x.toFixed(2)},${img.y.toFixed(2)},${img.width},${img.height},${(img.rotation ?? 0).toFixed(3)},${getFileSignature(img.file)}`)
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

  const prevVideoObjectUrlsRef = useRef<Set<string>>(new Set());

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
  // Optional overrides are used when a caller already has the next slice handy (e.g., video play toggles)
  // and wants to snapshot that immediately without waiting for live state to sync.
  const commit = useCallback((overrides?: CommitOverrides) => {
    const hasOverrides = Boolean(overrides && (overrides.images || overrides.paths || overrides.notes));
    if (!hasOverrides && liveImages === null && livePaths === null && liveNotes === null) {
      return;
    }

    setHistoryState(current => {
      const prevState = current.history[current.index];
      const nextState: AppState = {
        images: overrides?.images ?? liveImages ?? prevState.images,
        paths: overrides?.paths ?? livePaths ?? prevState.paths,
        notes: overrides?.notes ?? liveNotes ?? prevState.notes,
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

  // Revoke video object URLs once they are no longer referenced anywhere in history.
  useEffect(() => {
    const nextUrls = new Set<string>();
    historyState.history.forEach(state => {
      state.images.forEach(img => {
        if (img.mediaType !== 'video') {
          return;
        }
        const element = img.element;
        if (!(element instanceof HTMLVideoElement)) {
          return;
        }
        const url = getVideoObjectUrl(element);
        if (url) {
          nextUrls.add(url);
        }
      });
    });

    const prevUrls = prevVideoObjectUrlsRef.current;
    prevUrls.forEach(url => {
      if (!nextUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    });
    prevVideoObjectUrlsRef.current = nextUrls;
  }, [historyState.history]);

  // Best-effort cleanup on tab close without breaking StrictMode remounts.
  useEffect(() => {
    const handleBeforeUnload = () => {
      prevVideoObjectUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      prevVideoObjectUrlsRef.current.clear();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

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
