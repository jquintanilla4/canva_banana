import {
  withSnapshotMediaLeases,
  type SnapshotMediaBlob,
} from './snapshotService';

export const enqueueSnapshotAutosave = (
  previousAutosave: Promise<void>,
  media: readonly SnapshotMediaBlob[],
  writeSnapshot: () => Promise<void>,
): Promise<void> => {
  const waitForTurn = previousAutosave.catch(() => {}); // A failed older save must still finish before this write starts.
  const currentAttempt = withSnapshotMediaLeases(media, async () => {
    await waitForTurn;
    await writeSnapshot();
  }); // Acquire leases now so queued lazy media remains readable without materializing it.

  return Promise.allSettled([waitForTurn, currentAttempt]).then(([, currentResult]) => {
    if (currentResult.status === 'rejected') throw currentResult.reason;
  }); // Lease failures stay queued behind any older write while preserving their own error.
};
