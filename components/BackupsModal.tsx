import React, { useEffect } from 'react';
import type { BackupSessionSummary } from '../services/backupService';

type BackupsModalProps = {
  isOpen: boolean;
  isLoading: boolean;
  sessions: BackupSessionSummary[];
  onClose: () => void;
  onRestore: (sessionId: string) => void;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const formatTimestamp = (value: number): string => new Date(value).toLocaleString();

export const BackupsModal: React.FC<BackupsModalProps> = ({
  isOpen,
  isLoading,
  sessions,
  onClose,
  onRestore,
}) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
      // Close when clicking outside the modal panel.
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 text-white shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h2 className="text-base font-semibold">Autosave Backups</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-300 hover:text-white"
            aria-label="Close backups"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-3">
          {isLoading && (
            <p className="text-sm text-gray-400">Loading backups...</p>
          )}
          {!isLoading && sessions.length === 0 && (
            <p className="text-sm text-gray-400">
              No backups yet. Export a snapshot to start autosaving.
            </p>
          )}
          {!isLoading && sessions.length > 0 && (
            <div className="flex flex-col gap-3">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="rounded-md border border-gray-700 bg-gray-800/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{session.fileName}</p>
                      <p className="text-xs text-gray-400">
                        Updated {formatTimestamp(session.updatedAt)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Size {formatBytes(session.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestore(session.id)}
                      className="rounded-md border border-gray-600 px-3 py-1 text-xs font-semibold uppercase text-gray-200 hover:border-gray-400 hover:text-white"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
