import { useCallback, useState } from 'react';

const FILE_NAME_VISIBILITY_STORAGE_KEY = 'show-snapshot-file-name-v1'; // A versioned key keeps future preference migrations isolated.

const readStoredFileNameVisibility = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    return window.localStorage.getItem(FILE_NAME_VISIBILITY_STORAGE_KEY) !== 'false';
  } catch {
    return true; // Restricted storage should not hide the filename unexpectedly.
  }
};

const storeFileNameVisibility = (isVisible: boolean): void => {
  try {
    window.localStorage.setItem(FILE_NAME_VISIBILITY_STORAGE_KEY, String(isVisible));
  } catch {
    return; // The in-memory preference still works when persistent storage is unavailable.
  }
};

export const useFileNameVisibility = () => {
  const [showFileName, setShowFileName] = useState(readStoredFileNameVisibility);
  const toggleFileName = useCallback(() => {
    setShowFileName(currentValue => {
      const nextValue = !currentValue;
      storeFileNameVisibility(nextValue);
      return nextValue;
    });
  }, []);

  return { showFileName, toggleFileName };
};
