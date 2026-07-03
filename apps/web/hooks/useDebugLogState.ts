import { useCallback, useEffect, useState } from 'react';
import { getDebugLogs, subscribeToDebugLogs } from '../services/debugLog';
import { writeClipboardText } from '../services/clipboardService';

type UseDebugLogStateArgs = {
  onOpen?: () => void;
};

type UseDebugLogStateResult = {
  isDebugLogOpen: boolean;
  debugLogEntries: ReturnType<typeof getDebugLogs>;
  openDebugLogPanel: () => void;
  closeDebugLogPanel: () => void;
  copyLastEntry: () => void;
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

  const copyLastEntry = useCallback(() => {
    if (debugLogEntries.length === 0) {
      return;
    }
    // Get the most recent entry with a requestId
    const sorted = [...debugLogEntries].sort((a, b) => b.timestamp - a.timestamp);
    const lastWithRequestId = sorted.find(
      entry => entry.data && typeof entry.data === 'object' && 'requestId' in entry.data
    );

    if (!lastWithRequestId) {
      // No requestId found, just copy the most recent entry
      const json = JSON.stringify(sorted[0], null, 2);
      writeClipboardText(json).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
      return;
    }

    const requestId = (lastWithRequestId.data as Record<string, unknown>).requestId;

    // Find all entries with this requestId, plus any outbound entries that started the generation
    // (outbound entries may not have requestId yet but are part of the same flow)
    const firstMatchTimestamp = sorted
      .filter(e => e.data && (e.data as Record<string, unknown>).requestId === requestId)
      .reduce((min, e) => Math.min(min, e.timestamp), Infinity);

    // Include outbound entries that happened just before the first matching entry (within 1 second)
    const generationEntries = debugLogEntries.filter(entry => {
      const hasMatchingRequestId = entry.data && (entry.data as Record<string, unknown>).requestId === requestId;
      const isRecentOutbound = entry.direction === 'outbound' &&
        entry.timestamp >= firstMatchTimestamp - 1000 &&
        entry.timestamp <= firstMatchTimestamp;
      return hasMatchingRequestId || isRecentOutbound;
    });

    // Sort by timestamp (oldest first) for readable output
    generationEntries.sort((a, b) => a.timestamp - b.timestamp);

    const json = JSON.stringify(generationEntries, null, 2);
    writeClipboardText(json).catch(err => {
      console.error('Failed to copy to clipboard:', err);
    });
  }, [debugLogEntries]);

  return { isDebugLogOpen, debugLogEntries, openDebugLogPanel, closeDebugLogPanel, copyLastEntry };
}
