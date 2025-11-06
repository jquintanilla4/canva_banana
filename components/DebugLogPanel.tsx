import React from 'react';
import type { DebugLogEntry } from '../services/debugLog';

interface DebugLogPanelProps {
  entries: DebugLogEntry[];
  onClose: () => void;
  onClear: () => void;
}

const directionStyles: Record<DebugLogEntry['direction'], string> = {
  outbound: 'text-blue-300',
  inbound: 'text-green-300',
  info: 'text-gray-300',
  error: 'text-red-300',
};

const directionLabels: Record<DebugLogEntry['direction'], string> = {
  outbound: 'Outbound',
  inbound: 'Inbound',
  info: 'Info',
  error: 'Error',
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

const renderData = (data: Record<string, unknown> | undefined): string | null => {
  if (!data) {
    return null;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return '[unserializable data]';
  }
};

export const DebugLogPanel: React.FC<DebugLogPanelProps> = ({ entries, onClose, onClear }) => {
  const sortedEntries = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <aside className="absolute top-0 right-0 h-full w-[36rem] max-w-full bg-gray-900/95 border-l border-gray-700 shadow-2xl z-40 flex flex-col">
      <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-200">Debug Log</h2>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onClear}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {sortedEntries.length === 0 ? (
          <p className="text-sm text-gray-400">No debug events logged yet.</p>
        ) : (
          sortedEntries.map(entry => {
            const dataString = renderData(entry.data);
            return (
              <div key={entry.id} className="bg-gray-800/70 border border-gray-700/60 rounded-md p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{entry.title}</p>
                    <p className="text-xs text-gray-400">{formatTimestamp(entry.timestamp)}</p>
                  </div>
                  <span className={`text-xs font-medium ${directionStyles[entry.direction]}`}>
                    {directionLabels[entry.direction]}
                  </span>
                </div>
                {entry.message && (
                  <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{entry.message}</p>
                )}
                {dataString && (
                  <pre className="text-xs text-gray-300 bg-gray-900/80 border border-gray-700/70 rounded p-2 overflow-x-auto whitespace-pre-wrap">
{dataString}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
