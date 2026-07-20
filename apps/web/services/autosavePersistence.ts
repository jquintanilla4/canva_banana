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
  let recoveryBackupSaved = false; // Tracks recovery data that needs retention cleanup if the required write still fails.
  const writeRequiredDestination = writePrimary
    ? async (snapshotBinary: SnapshotBinary) => {
        try {
          await writePrimary(snapshotBinary);
        } catch (primaryError) {
          try {
            await writeBackup(snapshotBinary); // Preserve recovery data when a remembered target becomes unavailable.
            recoveryBackupSaved = true;
          } catch { /* The primary error remains the clearest action for the user. */ }
          throw primaryError;
        }
      }
    : writeBackup;
  let writeResult: TWriteResult;
  try {
    writeResult = await writeWithMediaFallbacks(writeRequiredDestination); // The required destination still controls autosave success.
  } catch (requiredWriteError) {
    if (recoveryBackupSaved) {
      await pruneBackups().catch(() => undefined); // Enforce retention without replacing the actionable primary error.
    }
    throw requiredWriteError;
  }
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
