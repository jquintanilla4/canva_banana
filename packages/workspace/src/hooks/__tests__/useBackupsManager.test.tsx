import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBackupsManager } from '../useBackupsManager';
import type { BackupSessionRecord } from '../../services/backupService';
import type { SnapshotByteSource } from '../../services/snapshotService';

const service = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/backupService', () => ({ getBackupSession: service.get, listBackupSessions: vi.fn(async () => []) }));
afterEach(() => { delete window.canvaBananaDesktop; service.get.mockReset(); });

it('releases a backup source through its original bridge after a pending restore unmounts', async () => {
  const originalClose = vi.fn(async () => ({ closed: true }));
  window.canvaBananaDesktop = { fileMenu: { closeSnapshotRead: originalClose } };
  let resume!: (session: BackupSessionRecord) => void;
  service.get.mockReturnValue(new Promise<BackupSessionRecord>(resolve => { resume = resolve; }));
  const importSnapshotFromFile = vi.fn(async (source: SnapshotByteSource) => {
    if ('close' in source) await source.close?.(); // A stale import releases the unactivated source.
  });
  const { result, unmount } = renderHook(() => useBackupsManager({
    isBackupsOpen: false, setIsBackupsOpen: vi.fn(), importSnapshotFromFile, setError: vi.fn(),
  }));
  const restoring = result.current.handleRestoreBackup('backup-a');
  unmount();
  const otherClose = vi.fn(async () => ({ closed: true }));
  window.canvaBananaDesktop = { fileMenu: { closeSnapshotRead: otherClose } };
  resume({ id: 'backup-a', createdAt: 1, updatedAt: 1, fileName: 'a.bcsnap', size: 1,
    source: { sourceId: 'source-a', fileName: 'a.bcsnap', size: 1, type: 'application/octet-stream' } });
  await restoring;
  expect(originalClose).toHaveBeenCalledWith({ sourceId: 'source-a' });
  expect(otherClose).not.toHaveBeenCalled();
});
