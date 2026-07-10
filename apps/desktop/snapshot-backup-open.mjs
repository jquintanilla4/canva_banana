export const openSnapshotBackupSource = async ({ coordinator, openSource }) => {
  return coordinator.runExclusive(openSource); // Pin data and metadata only after the backup transaction settles.
};
