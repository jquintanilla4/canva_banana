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

  it('preserves a backup when the required primary write fails', async () => {
    const writeBackup = vi.fn(async () => {});
    const pruneBackups = vi.fn(async () => {});

    await expect(persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writePrimary: vi.fn(async () => { throw new Error('Primary write failed.'); }),
      writeBackup,
      pruneBackups,
    })).rejects.toThrow('Primary write failed.');
    expect(writeBackup).toHaveBeenCalledWith(snapshotBinary);
    expect(pruneBackups).toHaveBeenCalledTimes(1);
  });

  it('keeps the primary failure when recovery backup cleanup fails', async () => {
    const primaryError = new Error('Primary write failed.');
    const pruneBackups = vi.fn(async () => { throw new Error('Backup cleanup failed.'); });

    await expect(persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writePrimary: vi.fn(async () => { throw primaryError; }),
      writeBackup: vi.fn(async () => {}),
      pruneBackups,
    })).rejects.toBe(primaryError);
    expect(pruneBackups).toHaveBeenCalledTimes(1);
  });

  it('keeps the primary failure when both destinations fail', async () => {
    const primaryError = new Error('Primary write failed.');
    const writeBackup = vi.fn(async () => { throw new Error('Backup write failed.'); });
    const pruneBackups = vi.fn(async () => {});

    await expect(persistAutosaveSnapshot({
      writeWithMediaFallbacks,
      writePrimary: vi.fn(async () => { throw primaryError; }),
      writeBackup,
      pruneBackups,
    })).rejects.toBe(primaryError);
    expect(writeBackup).toHaveBeenCalledWith(snapshotBinary);
    expect(pruneBackups).not.toHaveBeenCalled();
  });

  it('refreshes the backup after a recoverable primary attempt fails', async () => {
    const recoveredSnapshotBinary = { images: ['fallback'] } as unknown as SnapshotBinary;
    const writePrimary = vi.fn()
      .mockRejectedValueOnce(new Error('Lazy media read failed.'))
      .mockResolvedValueOnce(undefined);
    const writeBackup = vi.fn(async () => {});
    const pruneBackups = vi.fn(async () => {});
    const retryWithMediaFallback = async (writeAttempt: (binary: SnapshotBinary) => Promise<void>) => {
      await writeAttempt(snapshotBinary).catch(() => {}); // The snapshot builder retries with fallback media.
      await writeAttempt(recoveredSnapshotBinary);
      return { snapshotBinary: recoveredSnapshotBinary, fallbackCount: 1 };
    };

    await persistAutosaveSnapshot({
      writeWithMediaFallbacks: retryWithMediaFallback,
      writePrimary,
      writeBackup,
      pruneBackups,
    });

    expect(writeBackup).toHaveBeenNthCalledWith(1, snapshotBinary);
    expect(writeBackup).toHaveBeenNthCalledWith(2, recoveredSnapshotBinary);
    expect(pruneBackups).toHaveBeenCalledTimes(1);
  });
});
