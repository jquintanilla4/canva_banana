import React from 'react';
import { BackupsModal } from '../BackupsModal';
import { DesktopSettingsModal } from '../DesktopSettingsModal';
import { DesktopAppIconModal } from '../DesktopAppIconModal';
import { DebugLogPanel } from '../DebugLogPanel';
import { clearDebugLogs, type getDebugLogs } from '../../services/debugLog';
import { useBackupsManager } from '../../hooks/useBackupsManager';
import type { SnapshotByteSource } from '../../services/snapshotService';
import type { DesktopSettingsStatus } from '../../services/runtimeConfig';

type AppModalsProps = {
  isBackupsOpen: boolean;
  setIsBackupsOpen: (open: boolean) => void;
  importSnapshotFromFile: (file: SnapshotByteSource) => Promise<void>;
  setError: (message: string | null) => void;
  isDesktopSettingsOpen: boolean;
  setIsDesktopSettingsOpen: (open: boolean) => void;
  desktopSettingsStatus: DesktopSettingsStatus | null;
  setDesktopSettingsStatus: (status: DesktopSettingsStatus | null) => void;
  desktopSettingsMode: 'onboarding' | 'manage';
  hasDesktopAppIconBridge: boolean;
  isDesktopAppIconOpen: boolean;
  setIsDesktopAppIconOpen: (open: boolean) => void;
  isDebugLogOpen: boolean;
  debugLogEntries: ReturnType<typeof getDebugLogs>;
  closeDebugLogPanel: () => void;
  copyLastEntry: () => void;
};

// Blocking dialogs that only render while open. The backups list state lives here:
// nothing outside the modal reads it, and it only refreshes while the modal is open.
export function AppModals({
  isBackupsOpen,
  setIsBackupsOpen,
  importSnapshotFromFile,
  setError,
  isDesktopSettingsOpen,
  setIsDesktopSettingsOpen,
  desktopSettingsStatus,
  setDesktopSettingsStatus,
  desktopSettingsMode,
  hasDesktopAppIconBridge,
  isDesktopAppIconOpen,
  setIsDesktopAppIconOpen,
  isDebugLogOpen,
  debugLogEntries,
  closeDebugLogPanel,
  copyLastEntry,
}: AppModalsProps) {
  const {
    backupSessions,
    isBackupsLoading,
    closeBackupsModal,
    handleRestoreBackup,
  } = useBackupsManager({
    isBackupsOpen,
    setIsBackupsOpen,
    importSnapshotFromFile,
    setError,
  });

  return (
    <>
      <BackupsModal
        isOpen={isBackupsOpen}
        isLoading={isBackupsLoading}
        sessions={backupSessions}
        onClose={closeBackupsModal}
        onRestore={handleRestoreBackup}
      />
      <DesktopSettingsModal
        isOpen={isDesktopSettingsOpen}
        onClose={() => setIsDesktopSettingsOpen(false)}
        initialStatus={desktopSettingsStatus}
        onStatusChange={setDesktopSettingsStatus}
        mode={desktopSettingsMode}
      />
      {hasDesktopAppIconBridge && (
        <DesktopAppIconModal
          isOpen={isDesktopAppIconOpen}
          onClose={() => setIsDesktopAppIconOpen(false)}
        />
      )}
      {isDebugLogOpen && (
        <DebugLogPanel
          entries={debugLogEntries}
          onClose={closeDebugLogPanel}
          onClear={clearDebugLogs}
          onCopy={copyLastEntry}
        />
      )}
    </>
  );
}
