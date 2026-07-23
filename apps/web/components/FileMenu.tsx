import React, { useEffect, useRef } from 'react';
import { HamburgerIcon } from './Icons';

type FileMenuProps = {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onImportSnapshot: () => void;
  onExportSnapshot: () => void;
  onOpenBackups: () => void;
  autosaveEnabled: boolean;
  onToggleAutosave: () => void;
  showZoomLevelBadge: boolean;
  onToggleZoomLevelBadge: () => void;
  trackpadMode: boolean; // Enables continuous trackpad zoom.
  onToggleTrackpadMode: () => void; // Flips the persisted trackpad preference.
  onOpenDebugLog: () => void;
  onOpenDesktopSettings?: () => void;
  onClearJimengCache: () => void;
  isClearingJimengCache: boolean;
};

export const FileMenu: React.FC<FileMenuProps> = ({
  isOpen,
  onToggle,
  onClose,
  onImportSnapshot,
  onExportSnapshot,
  onOpenBackups,
  autosaveEnabled,
  onToggleAutosave,
  showZoomLevelBadge,
  onToggleZoomLevelBadge,
  trackpadMode,
  onToggleTrackpadMode,
  onOpenDebugLog,
  onOpenDesktopSettings,
  onClearJimengCache,
  isClearingJimengCache,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Close the menu on outside click or Escape to mirror native dropdown behavior.
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative z-30 pointer-events-auto">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Snapshot menu"
        className="p-2 text-white bg-transparent hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-md transition-colors"
      >
        <HamburgerIcon className="w-6 h-6" />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 inline-flex max-w-[calc(100vw-2rem)] flex-col items-stretch overflow-hidden rounded-md border border-gray-700 bg-gray-900/95 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onImportSnapshot}
            className="px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            Import Snapshot
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onExportSnapshot}
            className="px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            Export Snapshot
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onOpenBackups}
            className="px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            Backups...
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={autosaveEnabled}
            onClick={onToggleAutosave}
            className="flex items-center justify-between gap-[18px] px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            {/* Toggle to opt out of autosave (default is enabled). */}
            <span>Autosave</span>
            <span className="shrink-0 text-xs uppercase text-gray-400">{autosaveEnabled ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showZoomLevelBadge}
            onClick={onToggleZoomLevelBadge}
            className="flex items-center justify-between gap-[18px] px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            <span>{showZoomLevelBadge ? 'Hide Zoom Level' : 'Display Zoom Level'}</span>
            <span className="shrink-0 text-xs uppercase text-gray-400">{showZoomLevelBadge ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={trackpadMode}
            onClick={onToggleTrackpadMode}
            className="flex items-center justify-between gap-[18px] px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            <span>Trackpad Mode</span>
            <span className="shrink-0 text-xs uppercase text-gray-400">{trackpadMode ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onOpenDebugLog}
            className="px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
          >
            Debug Log
          </button>
          {onOpenDesktopSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={onOpenDesktopSettings}
              className="px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 transition-colors"
            >
              Manage Keys
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={onClearJimengCache}
            disabled={isClearingJimengCache}
            className="px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-gray-700 disabled:cursor-wait disabled:text-gray-500 disabled:hover:bg-transparent transition-colors"
          >
            {isClearingJimengCache ? 'Clearing Jimeng Cache...' : 'Clear Jimeng Cache'}
          </button>
        </div>
      )}
    </div>
  );
};
