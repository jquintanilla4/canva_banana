import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reconcileSnapshotBackupDirectory } from './snapshot-backup-recovery.mjs';

const testDirs = [];

const createBackupDir = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'snapshot-backup-recovery-'));
  testDirs.push(directory);
  return directory;
};

const expectMissing = async filePath => expect(access(filePath)).rejects.toThrow();

afterEach(async () => {
  await Promise.all(testDirs.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('snapshot backup recovery', () => {
  it('restores an interrupted replacement and removes stale temp files', async () => {
    const backupDir = await createBackupDir();
    await writeFile(join(backupDir, 'backup-1.json'), JSON.stringify({
      id: 'backup-1',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'scene.bcsnap',
      size: 3,
    }));
    await writeFile(join(backupDir, 'backup-1.bcsnap.write-1.rollback'), 'old');
    await writeFile(join(backupDir, '.backup-1.bcsnap.write-2.tmp'), 'partial');
    await writeFile(join(backupDir, 'backup-1.json.deadbeef.tmp'), 'partial');

    await reconcileSnapshotBackupDirectory(backupDir);

    await expect(readFile(join(backupDir, 'backup-1.bcsnap'), 'utf8')).resolves.toBe('old');
    await expectMissing(join(backupDir, 'backup-1.bcsnap.write-1.rollback'));
    await expectMissing(join(backupDir, '.backup-1.bcsnap.write-2.tmp'));
    await expectMissing(join(backupDir, 'backup-1.json.deadbeef.tmp'));
  });

  it('restores the rollback when replacement data still has the old sidecar', async () => {
    const backupDir = await createBackupDir();
    const oldSummary = {
      id: 'backup-2',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'old-scene.bcsnap',
      size: 3,
    };
    await writeFile(join(backupDir, 'backup-2.json'), JSON.stringify(oldSummary));
    await writeFile(join(backupDir, 'backup-2.bcsnap'), 'new');
    await writeFile(join(backupDir, 'backup-2.bcsnap.write-1.rollback'), 'old');

    await reconcileSnapshotBackupDirectory(backupDir);

    await expect(readFile(join(backupDir, 'backup-2.bcsnap'), 'utf8')).resolves.toBe('old');
    await expect(readFile(join(backupDir, 'backup-2.json'), 'utf8').then(JSON.parse)).resolves.toEqual(oldSummary);
    await expectMissing(join(backupDir, 'backup-2.bcsnap.write-1.rollback'));
  });

  it('commits staged metadata after replacement data was renamed into place', async () => {
    const backupDir = await createBackupDir();
    const nextSummary = {
      id: 'backup-2b',
      createdAt: 1,
      updatedAt: 20,
      fileName: 'new-scene.bcsnap',
      size: 8,
      commitId: 'write-2',
      replacesExisting: true,
    };
    await writeFile(join(backupDir, 'backup-2b.json'), JSON.stringify({
      id: 'backup-2b',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'old-scene.bcsnap',
      size: 3,
    }));
    await writeFile(join(backupDir, 'backup-2b.bcsnap'), 'new-data');
    await writeFile(join(backupDir, 'backup-2b.bcsnap.write-2.rollback'), 'old');
    await writeFile(join(backupDir, 'backup-2b.json.write-2.pending'), JSON.stringify(nextSummary));

    await reconcileSnapshotBackupDirectory(backupDir);

    await expect(readFile(join(backupDir, 'backup-2b.bcsnap'), 'utf8')).resolves.toBe('new-data');
    await expect(readFile(join(backupDir, 'backup-2b.json'), 'utf8').then(JSON.parse)).resolves.toEqual(nextSummary);
    await expectMissing(join(backupDir, 'backup-2b.bcsnap.write-2.rollback'));
    await expectMissing(join(backupDir, 'backup-2b.json.write-2.pending'));
  });

  it('keeps committed replacement data when only rollback cleanup was interrupted', async () => {
    const backupDir = await createBackupDir();
    const committedSummary = {
      id: 'backup-2c',
      createdAt: 1,
      updatedAt: 20,
      fileName: 'new-scene.bcsnap',
      size: 8,
      commitId: 'write-3',
    };
    await writeFile(join(backupDir, 'backup-2c.json'), JSON.stringify(committedSummary));
    await writeFile(join(backupDir, 'backup-2c.bcsnap'), 'new-data');
    await writeFile(join(backupDir, 'backup-2c.bcsnap.write-3.rollback'), 'old');

    await reconcileSnapshotBackupDirectory(backupDir);

    await expect(readFile(join(backupDir, 'backup-2c.bcsnap'), 'utf8')).resolves.toBe('new-data');
    await expect(readFile(join(backupDir, 'backup-2c.json'), 'utf8').then(JSON.parse)).resolves.toEqual(committedSummary);
    await expectMissing(join(backupDir, 'backup-2c.bcsnap.write-3.rollback'));
  });

  it('commits staged metadata for a newly created backup', async () => {
    const backupDir = await createBackupDir();
    const pendingSummary = {
      id: 'backup-2d',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'new-scene.bcsnap',
      size: 8,
      commitId: 'write-4',
      replacesExisting: false,
    };
    await writeFile(join(backupDir, 'backup-2d.bcsnap'), 'new-data');
    await writeFile(join(backupDir, 'backup-2d.json.write-4.pending'), JSON.stringify(pendingSummary));

    await reconcileSnapshotBackupDirectory(backupDir);

    await expect(readFile(join(backupDir, 'backup-2d.json'), 'utf8').then(JSON.parse)).resolves.toEqual(pendingSummary);
    await expectMissing(join(backupDir, 'backup-2d.json.write-4.pending'));
  });

  it('discards staged replacement metadata when the old data was never moved', async () => {
    const backupDir = await createBackupDir();
    const oldSummary = {
      id: 'backup-2e',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'old-scene.bcsnap',
      size: 4,
    };
    const pendingSummary = {
      id: 'backup-2e',
      createdAt: 1,
      updatedAt: 20,
      fileName: 'new-scene.bcsnap',
      size: 4,
      commitId: 'write-5',
      replacesExisting: true,
    };
    await writeFile(join(backupDir, 'backup-2e.json'), JSON.stringify(oldSummary));
    await writeFile(join(backupDir, 'backup-2e.bcsnap'), 'old!');
    await writeFile(join(backupDir, 'backup-2e.json.write-5.pending'), JSON.stringify(pendingSummary));

    await reconcileSnapshotBackupDirectory(backupDir);

    await expect(readFile(join(backupDir, 'backup-2e.bcsnap'), 'utf8')).resolves.toBe('old!');
    await expect(readFile(join(backupDir, 'backup-2e.json'), 'utf8').then(JSON.parse)).resolves.toEqual(oldSummary);
    await expectMissing(join(backupDir, 'backup-2e.json.write-5.pending'));
  });

  it('creates metadata for committed data whose sidecar was never written', async () => {
    const backupDir = await createBackupDir();
    await writeFile(join(backupDir, 'backup-3.bcsnap'), 'snapshot');

    await reconcileSnapshotBackupDirectory(backupDir);

    const summary = JSON.parse(await readFile(join(backupDir, 'backup-3.json'), 'utf8'));
    expect(summary).toMatchObject({
      id: 'backup-3',
      fileName: 'backup-3.bcsnap',
      size: 8,
    });
  });

  it('removes sidecars that have no recoverable data', async () => {
    const backupDir = await createBackupDir();
    await writeFile(join(backupDir, 'backup-4.json'), JSON.stringify({ id: 'backup-4' }));

    await reconcileSnapshotBackupDirectory(backupDir);

    await expectMissing(join(backupDir, 'backup-4.json'));
  });
});
