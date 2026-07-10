import type { SnapshotBinary } from './snapshotService';

type SnapshotWriteResult = {
  snapshotBinary: SnapshotBinary;
};

export type AutosaveBackupOutcome =
  | { status: 'saved' }
  | { status: 'failed'; error: unknown };

export type AutosavePersistenceResult<TWriteResult extends SnapshotWriteResult> = {
  writeResult: TWriteResult;
  backup: AutosaveBackupOutcome;
  maintenanceError?: unknown;
};

type PersistAutosaveSnapshotOptions<TWriteResult extends SnapshotWriteResult> = {
  writeWithMediaFallbacks: (
    writeAttempt: (snapshotBinary: SnapshotBinary) => Promise<void>,
  ) => Promise<TWriteResult>;
  writePrimary?: (snapshotBinary: SnapshotBinary) => Promise<void>;
  writeBackup: (snapshotBinary: SnapshotBinary) => Promise<void>;
  pruneBackups: () => Promise<void>;
};

export const persistAutosaveSnapshot = async <TWriteResult extends SnapshotWriteResult>({
  writeWithMediaFallbacks,
  writePrimary,
  writeBackup,
  pruneBackups,
}: PersistAutosaveSnapshotOptions<TWriteResult>): Promise<AutosavePersistenceResult<TWriteResult>> => {
  const writeResult = await writeWithMediaFallbacks(writePrimary ?? writeBackup); // Only the required destination controls autosave success.
  let backup: AutosaveBackupOutcome = { status: 'saved' };

  if (writePrimary) {
    try {
      await writeBackup(writeResult.snapshotBinary);
    } catch (error) {
      backup = { status: 'failed', error }; // A completed primary save stays successful when the optional backup fails.
    }
  }

  try {
    await pruneBackups();
    return { writeResult, backup };
  } catch (maintenanceError) {
    return { writeResult, backup, maintenanceError }; // Retention cleanup cannot invalidate an already persisted snapshot.
  }
};
