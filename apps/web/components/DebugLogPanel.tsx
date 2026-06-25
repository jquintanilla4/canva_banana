import React, { useEffect, useRef, useState } from 'react';
import type { DebugLogEntry } from '../services/debugLog';

interface DebugLogPanelProps {
  entries: DebugLogEntry[];
  onClose: () => void;
  onClear: () => void;
  onCopy: () => void;
}

const directionColors: Record<DebugLogEntry['direction'], string> = {
  outbound: 'text-blue-400',
  inbound: 'text-green-400',
  info: 'text-gray-400',
  error: 'text-red-400',
};

const formatTimestamp = (timestamp: number): string => {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return `${timestamp}`;
  }
};

export const DebugLogPanel: React.FC<DebugLogPanelProps> = ({
  entries,
  onClose,
  onClear,
  onCopy,
}) => {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sort entries oldest first for terminal-style (newest at bottom)
  const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [entries]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleCopy = () => {
    onCopy();
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
    >
      <button
        type="button"
        aria-label="Close debug log"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-log-title"
        className="relative z-10 w-full max-w-3xl max-h-[70vh] rounded-lg border border-gray-700 bg-gray-950 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2
            id="debug-log-title"
            className="text-sm font-mono font-semibold text-green-400"
          >
            $ debug_log
          </h2>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1 text-xs font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-600"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1 text-xs font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-600"
            >
              {copyFeedback ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-xs font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors border border-gray-600"
            >
              Close
            </button>
          </div>
        </header>

        {/* Terminal Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-black"
        >
          {sortedEntries.length === 0 ? (
            <p className="text-gray-500">No debug events logged yet.</p>
          ) : (
            sortedEntries.map(entry => {
              const entryJson = JSON.stringify(entry, null, 2);
              return (
                <div key={entry.id} className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500">[{formatTimestamp(entry.timestamp)}]</span>
                    <span className={directionColors[entry.direction]}>
                      [{entry.direction.toUpperCase()}]
                    </span>
                    <span className="text-white">{entry.title}</span>
                  </div>
                  <pre className="text-gray-300 whitespace-pre-wrap break-all pl-2 border-l-2 border-gray-700">
{entryJson}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
