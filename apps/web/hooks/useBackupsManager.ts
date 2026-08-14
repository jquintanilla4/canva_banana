import { useCallback, useEffect, useState } from 'react';
import { getBackupSession, listBackupSessions, type BackupSessionSummary } from '../services/backupService';
import { createDesktopSnapshotSource } from '../services/desktopSnapshotSource';
import type { SnapshotByteSource } from '../services/snapshotService';

type UseBackupsManagerArgs = {
  isBackupsOpen: boolean;
  setIsBackupsOpen: (open: boolean) => void;
  importSnapshotFromFile: (file: SnapshotByteSource) => Promise<void>;
  setError: (message: string | null) => void;
};

// Backup session listing and restore flow behind the backups modal.
export function useBackupsManager({
  isBackupsOpen,
  setIsBackupsOpen,
  importSnapshotFromFile,
  setError,
}: UseBackupsManagerArgs) {
  const [backupSessions, setBackupSessions] = useState<BackupSessionSummary[]>([]);
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);

  const closeBackupsModal = useCallback(() => {
    setIsBackupsOpen(false);
  }, [setIsBackupsOpen]);

  const refreshBackups = useCallback(async () => {
    setIsBackupsLoading(true);
    try {
      const sessions = await listBackupSessions();
      setBackupSessions(sessions);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to load backups.';
      setError(message);
    } finally {
      setIsBackupsLoading(false);
    }
  }, [setError]);

  const handleRestoreBackup = useCallback(async (sessionId: string) => {
    try {
      const session = await getBackupSession(sessionId);
      if (!session) {
        setError('Backup not found.');
        return;
      }
      if (session.source) {
        await importSnapshotFromFile(createDesktopSnapshotSource(session.source));
      } else if (session.blob) {
        const backupFile = new File([session.blob], session.fileName, {
          type: session.blob.type || 'application/octet-stream',
        });
        await importSnapshotFromFile(backupFile);
      }
      setIsBackupsOpen(false);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to restore backup.';
      setError(message);
    }
  }, [importSnapshotFromFile, setError, setIsBackupsOpen]);

  useEffect(() => {
    if (!isBackupsOpen) {
      return;
    }
    refreshBackups();
  }, [isBackupsOpen, refreshBackups]);

  return {
    backupSessions,
    isBackupsLoading,
    closeBackupsModal,
    handleRestoreBackup,
  };
}
