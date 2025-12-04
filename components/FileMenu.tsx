import React, { useEffect, useRef } from 'react';
import { HamburgerIcon } from './Icons';

type FileMenuProps = {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onImportSnapshot: () => void;
  onExportSnapshot: () => void;
  onOpenDebugLog: () => void;
};

export const FileMenu: React.FC<FileMenuProps> = ({
  isOpen,
  onToggle,
  onClose,
  onImportSnapshot,
  onExportSnapshot,
  onOpenDebugLog,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
    <div ref={menuRef} className="absolute top-4 left-4 z-30">
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
          className="mt-2 w-40 rounded-md border border-gray-700 bg-gray-900/95 shadow-lg overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onImportSnapshot}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
          >
            Import Snapshot
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onExportSnapshot}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
          >
            Export Snapshot
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onOpenDebugLog}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
          >
            Debug Log
          </button>
        </div>
      )}
    </div>
  );
};
