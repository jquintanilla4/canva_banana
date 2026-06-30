import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAPSHOT_FILE_NAME,
  MAX_SNAPSHOT_IMPORT_BYTES,
  MAX_SNAPSHOT_WRITE_BYTES,
  assertSnapshotDataCanBeWritten,
  assertSnapshotFileCanBeOpened,
  isSupportedSnapshotFileName,
  readSnapshotFileCapped,
  sanitizeSnapshotFileName,
} from './file-menu-utils.mjs';

let tempDirs = [];

const createTempFile = async (fileName, data) => {
  const dir = await mkdtemp(join(tmpdir(), 'canva-banana-snapshot-'));
  tempDirs.push(dir);
  const filePath = join(dir, fileName);
  await writeFile(filePath, data);
  return filePath;
};

afterEach(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('file-menu-utils', () => {
  it('keeps plain snapshot filenames', () => {
    expect(sanitizeSnapshotFileName('scene.bcsnap')).toBe('scene.bcsnap');
  });

  it('falls back when a suggested name contains path segments', () => {
    expect(sanitizeSnapshotFileName('../../Library/LaunchAgents/foo.bcsnap')).toBe(DEFAULT_SNAPSHOT_FILE_NAME);
    expect(sanitizeSnapshotFileName('..\\LaunchAgents\\foo.bcsnap')).toBe(DEFAULT_SNAPSHOT_FILE_NAME);
  });

  it('falls back for empty and sentinel names', () => {
    expect(sanitizeSnapshotFileName('')).toBe(DEFAULT_SNAPSHOT_FILE_NAME);
    expect(sanitizeSnapshotFileName('..')).toBe(DEFAULT_SNAPSHOT_FILE_NAME);
  });

  it('accepts only snapshot import extensions', () => {
    expect(isSupportedSnapshotFileName('scene.bcsnap')).toBe(true);
    expect(isSupportedSnapshotFileName('legacy.JSON')).toBe(true);
    expect(isSupportedSnapshotFileName('movie.mp4')).toBe(false);
  });

  it('rejects unsupported or oversized snapshot imports before reading', () => {
    const oversizedReadData = Object.create(ArrayBuffer.prototype);
    Object.defineProperty(oversizedReadData, 'byteLength', { value: MAX_SNAPSHOT_IMPORT_BYTES + 1 }); // Avoid allocating a huge test buffer.

    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'movie.mp4', size: 10 })).toThrow(/\.bcsnap or \.json/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'scene.bcsnap', size: MAX_SNAPSHOT_IMPORT_BYTES + 1 })).toThrow(/too large/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'scene.bcsnap', size: oversizedReadData.byteLength })).toThrow(/too large/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'scene.bcsnap', size: MAX_SNAPSHOT_IMPORT_BYTES })).not.toThrow();
  });

  it('rejects non-binary or oversized snapshot writes before saving', () => {
    const fakeArrayBuffer = Object.create(ArrayBuffer.prototype);
    Object.defineProperty(fakeArrayBuffer, 'byteLength', { value: 1 }); // Prototype spoof should still fail binary validation.

    expect(() => assertSnapshotDataCanBeWritten('not binary')).toThrow(/must be binary/);
    expect(() => assertSnapshotDataCanBeWritten(fakeArrayBuffer)).toThrow(/must be binary/);
    expect(() => assertSnapshotDataCanBeWritten(new ArrayBuffer(2), { maxBytes: 1 })).toThrow(/too large/);
    expect(() => assertSnapshotDataCanBeWritten(new ArrayBuffer(0))).not.toThrow();
  });

  it('rejects snapshot imports once a capped read crosses the byte limit', async () => {
    const filePath = await createTempFile('scene.bcsnap', Buffer.alloc(12));

    await expect(readSnapshotFileCapped(filePath, { chunkBytes: 4, maxBytes: 10 })).rejects.toThrow(/too large/);
  });

  it('reads snapshot imports when the capped read stays within the byte limit', async () => {
    const filePath = await createTempFile('scene.bcsnap', Buffer.from('snapshot'));

    await expect(readSnapshotFileCapped(filePath, { chunkBytes: 3, maxBytes: 8 })).resolves.toEqual(Buffer.from('snapshot'));
  });
});
