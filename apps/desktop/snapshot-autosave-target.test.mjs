import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canReplaceSnapshotAutosaveTarget } from './snapshot-autosave-target.mjs';

const withTemporarySnapshot = async (run) => {
  const directory = await mkdtemp(join(tmpdir(), 'bcsnap-autosave-target-'));
  const filePath = join(directory, 'scene.bcsnap');
  await writeFile(filePath, 'snapshot');
  try {
    await run({ directory, filePath });
  } finally {
    await chmod(directory, 0o700).catch(() => {}); // Restore cleanup access after read-only directory tests.
    await chmod(filePath, 0o600).catch(() => {}); // Restore cleanup access after read-only file tests.
    await rm(directory, { recursive: true, force: true });
  }
};

describe('snapshot-autosave-target', () => {
  it('accepts a writable snapshot in a replaceable directory', async () => {
    await withTemporarySnapshot(async ({ filePath }) => {
      await expect(canReplaceSnapshotAutosaveTarget(filePath)).resolves.toBe(true);
    });
  });

  it('rejects a read-only snapshot', async () => {
    await withTemporarySnapshot(async ({ filePath }) => {
      await chmod(filePath, 0o400);
      await expect(canReplaceSnapshotAutosaveTarget(filePath)).resolves.toBe(false);
    });
  });

  it('rejects a snapshot whose directory cannot stage an atomic replacement', async () => {
    await withTemporarySnapshot(async ({ directory, filePath }) => {
      await chmod(directory, 0o500);
      await expect(canReplaceSnapshotAutosaveTarget(filePath)).resolves.toBe(false);
    });
  });
});
