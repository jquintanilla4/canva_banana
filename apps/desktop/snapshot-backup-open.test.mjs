import { describe, expect, it, vi } from 'vitest';
import { createSnapshotBackupCoordinator } from './snapshot-backup-coordinator.mjs';
import { openSnapshotBackupSource } from './snapshot-backup-open.mjs';

const createCoordinator = () => createSnapshotBackupCoordinator({
  maxPending: 8,
  busyErrorMessage: 'Too many snapshot backup operations are waiting.',
});

const flushPromises = () => new Promise(resolve => setImmediate(resolve)); // Let queued coordinator work reach its lease wait.

describe('snapshot backup open', () => {
  it('waits for an active backup transaction before opening its committed version', async () => {
    const coordinator = createCoordinator();
    const releaseWrite = await coordinator.acquire();
    let visibleVersion = 'new-version'; // The data rename may happen before the metadata commit.
    const openSource = vi.fn(async () => ({ sourceId: visibleVersion }));
    const opening = openSnapshotBackupSource({ coordinator, openSource });

    await flushPromises();
    expect(openSource).not.toHaveBeenCalled();
    visibleVersion = 'old-version'; // Simulate rollback after the metadata commit fails.
    releaseWrite();
    await expect(opening).resolves.toEqual({ sourceId: 'old-version' });
    expect(openSource).toHaveBeenCalledOnce();
  });

  it('releases the lease after pinning the source so large reads stay streaming', async () => {
    const coordinator = createCoordinator();
    let finishRead;
    const readFinished = new Promise(resolve => { finishRead = resolve; });
    const source = await openSnapshotBackupSource({
      coordinator,
      openSource: async () => ({ sourceId: 'large-version', readFinished }), // The handle, not its bytes, is pinned under the lease.
    });
    const nextMutation = vi.fn(async () => 'committed');

    await expect(coordinator.runExclusive(nextMutation)).resolves.toBe('committed');
    expect(nextMutation).toHaveBeenCalledOnce();
    finishRead();
    await expect(source.readFinished).resolves.toBeUndefined();
  });

  it('releases the coordinator after an open failure', async () => {
    const coordinator = createCoordinator();
    const permissionError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const openSource = vi.fn().mockRejectedValue(permissionError);

    await expect(openSnapshotBackupSource({ coordinator, openSource })).rejects.toBe(permissionError);
    expect(openSource).toHaveBeenCalledOnce();
    await expect(coordinator.runExclusive(async () => 'ready')).resolves.toBe('ready');
  });
});
