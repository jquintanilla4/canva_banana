import { useCallback, useState } from 'react';
import { useDebugLogState } from './useDebugLogState';

export type AppBlockingOverlay = 'backups' | 'desktopSettings' | 'desktopAppIcon';

// Coordinates the app-owned blocking overlays (file menu, backups, desktop settings,
// app icon, debug log) so only one dialog owns focus and pointer input at a time.
// The debug log panel lives here too because opening it must close the others and
// opening any other overlay must close it.
export function useBlockingOverlays() {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isBackupsOpen, setIsBackupsOpen] = useState(false);
  const [isDesktopSettingsOpen, setIsDesktopSettingsOpen] = useState(false);
  const [isDesktopAppIconOpen, setIsDesktopAppIconOpen] = useState(false);
  const [desktopSettingsMode, setDesktopSettingsMode] = useState<'onboarding' | 'manage'>('manage'); // Auto-open hides advanced setup fields.

  const closeAppOwnedBlockingOverlays = useCallback(() => {
    setIsFileMenuOpen(false);
    setIsBackupsOpen(false);
    setIsDesktopSettingsOpen(false);
    setIsDesktopAppIconOpen(false);
  }, []); // Keep native menu modal switches single-dialog.

  const {
    isDebugLogOpen,
    debugLogEntries,
    openDebugLogPanel,
    closeDebugLogPanel,
    copyLastEntry,
  } = useDebugLogState({
    onOpen: closeAppOwnedBlockingOverlays,
  });

  const openAppOwnedBlockingOverlay = useCallback((overlay: AppBlockingOverlay) => {
    closeDebugLogPanel();
    closeAppOwnedBlockingOverlays();
    if (overlay === 'backups') {
      setIsBackupsOpen(true);
    } else if (overlay === 'desktopSettings') {
      setIsDesktopSettingsOpen(true);
    } else {
      setIsDesktopAppIconOpen(true);
    }
  }, [closeAppOwnedBlockingOverlays, closeDebugLogPanel]); // Open one blocking modal at a time.

  const hasBlockingOverlay = isFileMenuOpen || isBackupsOpen || isDesktopSettingsOpen || isDesktopAppIconOpen || isDebugLogOpen; // Overlays own focus and pointer input.

  const closeFileMenu = useCallback(() => {
    setIsFileMenuOpen(false);
  }, []);

  const toggleFileMenu = useCallback(() => {
    setIsFileMenuOpen(prev => !prev);
  }, []);

  return {
    isFileMenuOpen,
    closeFileMenu,
    toggleFileMenu,
    setIsFileMenuOpen,
    isBackupsOpen,
    setIsBackupsOpen,
    isDesktopSettingsOpen,
    setIsDesktopSettingsOpen,
    isDesktopAppIconOpen,
    setIsDesktopAppIconOpen,
    desktopSettingsMode,
    setDesktopSettingsMode,
    closeAppOwnedBlockingOverlays,
    openAppOwnedBlockingOverlay,
    hasBlockingOverlay,
    isDebugLogOpen,
    debugLogEntries,
    openDebugLogPanel,
    closeDebugLogPanel,
    copyLastEntry,
  };
}
