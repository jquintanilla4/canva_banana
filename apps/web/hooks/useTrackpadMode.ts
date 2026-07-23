import { useCallback, useState } from 'react';

const TRACKPAD_MODE_STORAGE_KEY = 'trackpad-zoom-mode-v1'; // Version the local preference independently from snapshots.

const readStoredTrackpadMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(TRACKPAD_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false; // Restricted storage keeps the opt-in mode disabled by default.
  }
};

const storeTrackpadMode = (isEnabled: boolean): void => {
  try {
    window.localStorage.setItem(TRACKPAD_MODE_STORAGE_KEY, String(isEnabled));
  } catch {
    return; // The in-memory preference still works when storage is unavailable.
  }
};

export const useTrackpadMode = () => {
  const [trackpadMode, setTrackpadMode] = useState(readStoredTrackpadMode);
  const toggleTrackpadMode = useCallback(() => {
    setTrackpadMode(currentValue => {
      const nextValue = !currentValue;
      storeTrackpadMode(nextValue);
      return nextValue;
    });
  }, []);

  return { trackpadMode, toggleTrackpadMode };
};
