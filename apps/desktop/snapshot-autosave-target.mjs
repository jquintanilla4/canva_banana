import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const canReplaceSnapshotAutosaveTarget = async (filePath) => {
  const probeId = randomBytes(12).toString('hex');
  const probeSourcePath = join(dirname(filePath), `.bcsnap-autosave-${probeId}.source.tmp`); // Probe the exact destination directory.
  const probeTargetPath = join(dirname(filePath), `.bcsnap-autosave-${probeId}.target.tmp`);
  let probeHandle = null;

  try {
    await access(filePath, constants.W_OK); // Respect read-only files before advertising autosave.
    probeHandle = await open(probeSourcePath, 'wx', 0o600);
    await probeHandle.close();
    probeHandle = null;
    probeHandle = await open(probeTargetPath, 'wx', 0o600);
    await probeHandle.close();
    probeHandle = null;
    await rename(probeSourcePath, probeTargetPath); // Match the atomic replacement used by real snapshot writes.
    await rm(probeTargetPath);
    return true;
  } catch {
    return false;
  } finally {
    await probeHandle?.close().catch(() => {});
    await rm(probeSourcePath, { force: true }).catch(() => {});
    await rm(probeTargetPath, { force: true }).catch(() => {}); // Never leave capability probes beside user snapshots.
  }
};
