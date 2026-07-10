import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshotBackupCoordinator } from './snapshot-backup-coordinator.mjs';

const flushPromises = () => new Promise(resolve => setImmediate(resolve)); // Let queued lease continuations run without timer delays.
const createCoordinator = (maxPending = 8) => createSnapshotBackupCoordinator({
  maxPending,
  busyErrorMessage: 'Too many snapshot backup operations are waiting.',
});

describe('snapshot backup coordinator', () => {
  it('keeps deletion queued until a long streamed write releases its lease', async () => {
    const coordinator = createCoordinator();
    const releaseWrite = await coordinator.acquire();
    let committedBackup = 'old';
    const removeFiles = vi.fn(async () => {
      committedBackup = null; // A queued user deletion must be the final state after the write commits.
      return 'deleted';
    });

    const deletion = coordinator.runExclusive(removeFiles);
    await flushPromises();
    expect(removeFiles).not.toHaveBeenCalled();

    committedBackup = 'new'; // Simulate the active streamed write exposing its completed backup.
    releaseWrite();
    await expect(deletion).resolves.toBe('deleted');
    expect(removeFiles).toHaveBeenCalledOnce();
    expect(committedBackup).toBeNull();
  });

  it('runs backup mutations in request order', async () => {
    const coordinator = createCoordinator();
    const order = [];
    const releaseFirst = await coordinator.acquire();
    const second = coordinator.runExclusive(async () => order.push('second'));
    const third = coordinator.runExclusive(async () => order.push('third'));

    releaseFirst();
    await Promise.all([second, third]);
    expect(order).toEqual(['second', 'third']);
  });

  it('keeps backup listing queued until an active replacement settles', async () => {
    const coordinator = createCoordinator();
    const releaseReplacement = await coordinator.acquire();
    const listCommittedBackups = vi.fn(async () => ['committed']);
    const listing = coordinator.runExclusive(listCommittedBackups);

    await flushPromises();
    expect(listCommittedBackups).not.toHaveBeenCalled();
    releaseReplacement();
    await expect(listing).resolves.toEqual(['committed']);
    expect(listCommittedBackups).toHaveBeenCalledOnce();
  });

  it('releases the queue after a failed mutation', async () => {
    const coordinator = createCoordinator();
    const failure = coordinator.runExclusive(async () => {
      throw new Error('disk failure');
    });
    const next = coordinator.runExclusive(async () => 'continued');

    await expect(failure).rejects.toThrow('disk failure');
    await expect(next).resolves.toBe('continued');
  });

  it('allows cleanup to release a write lease more than once', async () => {
    const coordinator = createCoordinator();
    const releaseWrite = await coordinator.acquire();
    releaseWrite();
    releaseWrite();

    await expect(coordinator.runExclusive(async () => 'ready')).resolves.toBe('ready');
  });

  it('pins the opened backup version before allowing an atomic replacement', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'snapshot-backup-open-'));
    const targetPath = join(directory, 'backup.bcsnap');
    const replacementPath = join(directory, 'replacement.tmp');
    const rollbackPath = join(directory, 'backup.rollback');
    await writeFile(targetPath, 'old snapshot');
    await writeFile(replacementPath, 'new snapshot');
    const coordinator = createCoordinator();

    try {
      const openedHandlePromise = coordinator.runExclusive(() => open(targetPath, 'r')); // Match the short lease used by native backup open.
      const replacement = coordinator.runExclusive(async () => {
        await rename(targetPath, rollbackPath);
        await rename(replacementPath, targetPath);
      });
      const openedHandle = await openedHandlePromise;
      await replacement;

      await expect(openedHandle.readFile('utf8')).resolves.toBe('old snapshot');
      await openedHandle.close();
      await expect(open(targetPath, 'r').then(async handle => {
        const contents = await handle.readFile('utf8');
        await handle.close();
        return contents;
      })).resolves.toBe('new snapshot');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('bounds waiting operations without interrupting an admitted large backup', async () => {
    const coordinator = createCoordinator(2);
    const logicalBackupBytes = 16 * 1024 * 1024 * 1024;
    let finishActive = () => {};
    const activeBackup = coordinator.runExclusive(() => new Promise(resolve => {
      finishActive = () => resolve(logicalBackupBytes); // Simulate a large streamed backup without allocating its bytes.
    }));
    await flushPromises();
    const second = coordinator.runExclusive(async () => 'second');
    const third = coordinator.runExclusive(async () => 'third');

    await expect(coordinator.runExclusive(async () => 'rejected')).rejects.toMatchObject({
      code: 'SNAPSHOT_BACKUP_BUSY',
    });
    expect(coordinator.getUsage()).toEqual({ active: true, pending: 2 });

    finishActive();
    await expect(Promise.all([activeBackup, second, third])).resolves.toEqual([logicalBackupBytes, 'second', 'third']);
    expect(coordinator.getUsage()).toEqual({ active: false, pending: 0 });
  });
});
