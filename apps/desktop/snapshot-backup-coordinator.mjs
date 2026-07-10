const busyErrorCode = 'SNAPSHOT_BACKUP_BUSY';

export const createSnapshotBackupCoordinator = ({ maxPending, busyErrorMessage }) => {
  if (!Number.isSafeInteger(maxPending) || maxPending < 0) {
    throw new Error('Snapshot backup pending limit is invalid.');
  }
  let active = false;
  const pending = [];
  const createBusyError = () => Object.assign(new Error(busyErrorMessage), { code: busyErrorCode });

  const createRelease = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = pending.shift();
      if (next) {
        next(createRelease()); // Transfer the active lease without letting later callers overtake.
        return;
      }
      active = false;
    };
  };

  const acquire = () => {
    if (!active) {
      active = true;
      return Promise.resolve(createRelease());
    }
    if (pending.length >= maxPending) return Promise.reject(createBusyError()); // Large active backups continue while excess callers fail fast.
    return new Promise(resolve => pending.push(resolve));
  };

  const runExclusive = async operation => {
    const release = await acquire();
    try {
      return await operation();
    } finally {
      release(); // Failed filesystem operations must not block later backup work.
    }
  };

  return {
    acquire,
    runExclusive,
    getUsage: () => ({ active, pending: pending.length }), // Queue diagnostics stay independent from snapshot byte length.
  };
};
