import { describe, expect, it, vi } from 'vitest';
import type { SnapshotBinary } from '../snapshotService';
import { persistAutosaveSnapshot } from '../autosavePersistence';

const snapshotBinary = { images: [] } as unknown as SnapshotBinary;

const writeWithMediaFallbacks = async (
  writeAttempt: (binary: SnapshotBinary) => Promise<void>,
) => {
  await writeAttempt(snapshotBinary);
  return { snapshotBinary, fallbackCount: 0 };
};

describe('persistAutosaveSnapshot', () => {
  it('keeps a successful primary autosave independent from backup failure', async () => {
    const writePrimary = vi.fn(async () => {});
    const backupError = new Error('Snapshot backup is too large to store automatically.');
    const writeBackup = vi.fn(async () => { throw backupError; });
    const pruneBackups = vi.fn(async () => {});

    const result = await persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writePrimary,
      writeBackup,
      pruneBackups,
    });

    expect(writePrimary).toHaveBeenCalledWith(snapshotBinary);
    expect(writeBackup).toHaveBeenCalledWith(snapshotBinary);
    expect(pruneBackups).toHaveBeenCalledTimes(1);
    expect(result.backup).toEqual({ status: 'failed', error: backupError });
  });

  it('still requires the backup when no writable primary target exists', async () => {
    const writeBackup = vi.fn(async () => {
      throw new Error('Snapshot backup storage quota exceeded.');
    });

    await expect(persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writeBackup,
      pruneBackups: vi.fn(async () => {}),
    })).rejects.toThrow('Snapshot backup storage quota exceeded.');
  });

  it('does not let retention cleanup invalidate a persisted snapshot', async () => {
    const maintenanceError = new Error('Backup cleanup failed.');

    const result = await persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writePrimary: vi.fn(async () => {}),
      writeBackup: vi.fn(async () => {}),
      pruneBackups: vi.fn(async () => { throw maintenanceError; }),
    });

    expect(result.backup).toEqual({ status: 'saved' });
    expect(result.maintenanceError).toBe(maintenanceError);
  });

  it('does not attempt a backup after the required primary write fails', async () => {
    const writeBackup = vi.fn(async () => {});

    await expect(persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writePrimary: vi.fn(async () => { throw new Error('Primary write failed.'); }),
      writeBackup,
      pruneBackups: vi.fn(async () => {}),
    })).rejects.toThrow('Primary write failed.');
    expect(writeBackup).not.toHaveBeenCalled();
  });
});
