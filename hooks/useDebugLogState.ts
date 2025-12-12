import { useCallback, useEffect, useState } from 'react';
import { getDebugLogs, subscribeToDebugLogs } from '../services/debugLog';

type UseDebugLogStateArgs = {
  onOpen?: () => void;
};

type UseDebugLogStateResult = {
  isDebugLogOpen: boolean;
  debugLogEntries: ReturnType<typeof getDebugLogs>;
  openDebugLogPanel: () => void;
  closeDebugLogPanel: () => void;
};

export function useDebugLogState({ onOpen }: UseDebugLogStateArgs = {}): UseDebugLogStateResult {
  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false);
  const [debugLogEntries, setDebugLogEntries] = useState(() => getDebugLogs());

  useEffect(() => {
    const unsubscribe = subscribeToDebugLogs(setDebugLogEntries);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isDebugLogOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDebugLogOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isDebugLogOpen]);

  const openDebugLogPanel = useCallback(() => {
    setIsDebugLogOpen(true);
    onOpen?.();
  }, [onOpen]);

  const closeDebugLogPanel = useCallback(() => {
    setIsDebugLogOpen(false);
  }, []);

  return { isDebugLogOpen, debugLogEntries, openDebugLogPanel, closeDebugLogPanel };
}

