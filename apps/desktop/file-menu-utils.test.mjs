import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAPSHOT_FILE_NAME,
  MAX_SNAPSHOT_BACKUP_BYTES,
  MAX_SNAPSHOT_BACKUP_STORE_BYTES,
  MAX_SNAPSHOT_BINARY_IMPORT_BYTES,
  MAX_SNAPSHOT_CHUNK_BYTES,
  MAX_SNAPSHOT_IMPORT_BYTES,
  MAX_SNAPSHOT_WRITE_BYTES,
  assertSnapshotBackupSizeCanBeWritten,
  assertSnapshotDataCanBeWritten,
  assertSnapshotFileCanBeOpened,
  getAttachmentContentDisposition,
  getSnapshotBackupTransactionBaseBytes,
  isAutosaveEligibleSnapshotFileName,
  isSupportedSnapshotFileName,
  sanitizeSnapshotFileName,
} from './file-menu-utils.mjs';

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

  it('builds safe Unicode attachment filenames', () => {
    expect(getAttachmentContentDisposition('café image.png')).toBe(
      'attachment; filename="caf_ image.png"; filename*=UTF-8\'\'caf%C3%A9%20image.png',
    );
    expect(getAttachmentContentDisposition('image"\r\nX-Test: yes.png')).not.toMatch(/[\r\n]/);
  });

  it('accepts only snapshot import extensions', () => {
    expect(isSupportedSnapshotFileName('scene.bcsnap')).toBe(true);
    expect(isSupportedSnapshotFileName('legacy.JSON')).toBe(true);
    expect(isSupportedSnapshotFileName('movie.mp4')).toBe(false);
  });

  it('allows autosave only for current binary snapshot names', () => {
    expect(isAutosaveEligibleSnapshotFileName('scene.bcsnap')).toBe(true);
    expect(isAutosaveEligibleSnapshotFileName('scene.BCSNAP')).toBe(true);
    expect(isAutosaveEligibleSnapshotFileName('legacy.json')).toBe(false);
  });

  it('rejects unsupported or invalid snapshot imports before reading', () => {
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'movie.mp4', size: 10 })).toThrow(/\.bcsnap or \.json/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'scene.bcsnap', size: -1 })).toThrow(/invalid/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'scene.bcsnap', size: MAX_SNAPSHOT_IMPORT_BYTES + 1 })).not.toThrow();
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'scene.bcsnap', size: MAX_SNAPSHOT_BINARY_IMPORT_BYTES + 1 })).toThrow(/too large/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'legacy.json', size: MAX_SNAPSHOT_IMPORT_BYTES + 1 })).toThrow(/too large/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'legacy.json', size: MAX_SNAPSHOT_IMPORT_BYTES })).not.toThrow();
    expect(MAX_SNAPSHOT_BINARY_IMPORT_BYTES).toBe(MAX_SNAPSHOT_WRITE_BYTES);
  });

  it('rejects non-binary or oversized snapshot chunks before saving', () => {
    const fakeArrayBuffer = Object.create(ArrayBuffer.prototype);
    Object.defineProperty(fakeArrayBuffer, 'byteLength', { value: 1 }); // Prototype spoof should still fail binary validation.

    expect(() => assertSnapshotDataCanBeWritten('not binary')).toThrow(/must be binary/);
    expect(() => assertSnapshotDataCanBeWritten(fakeArrayBuffer)).toThrow(/must be binary/);
    expect(() => assertSnapshotDataCanBeWritten(new ArrayBuffer(2), { maxBytes: 1 })).toThrow(/too large/);
    expect(() => assertSnapshotDataCanBeWritten(new ArrayBuffer(MAX_SNAPSHOT_CHUNK_BYTES))).not.toThrow();
    expect(() => assertSnapshotDataCanBeWritten(new ArrayBuffer(0))).not.toThrow();
    expect(MAX_SNAPSHOT_WRITE_BYTES).toBeGreaterThan(MAX_SNAPSHOT_IMPORT_BYTES);
  });

  it('bounds automatic desktop backups separately from large user exports', () => {
    const largeSnapshotSize = MAX_SNAPSHOT_BACKUP_BYTES + 1;

    expect(MAX_SNAPSHOT_BACKUP_BYTES).toBe(16 * 1024 * 1024 * 1024);
    expect(MAX_SNAPSHOT_BACKUP_STORE_BYTES).toBe(48 * 1024 * 1024 * 1024);
    expect(() => assertSnapshotBackupSizeCanBeWritten({ size: 0 })).toThrow(/invalid/);
    expect(() => assertSnapshotBackupSizeCanBeWritten({ size: largeSnapshotSize })).toThrow(/too large/);
    expect(() => assertSnapshotFileCanBeOpened({ fileName: 'large.bcsnap', size: largeSnapshotSize })).not.toThrow();
    expect(() => assertSnapshotBackupSizeCanBeWritten({
      size: 1,
      currentBytes: MAX_SNAPSHOT_BACKUP_STORE_BYTES,
    })).toThrow(/quota/);
    expect(() => assertSnapshotBackupSizeCanBeWritten({
      size: MAX_SNAPSHOT_BACKUP_BYTES,
      currentBytes: MAX_SNAPSHOT_BACKUP_STORE_BYTES - MAX_SNAPSHOT_BACKUP_BYTES,
    })).not.toThrow();
    expect(MAX_SNAPSHOT_WRITE_BYTES).toBeGreaterThan(MAX_SNAPSHOT_BACKUP_BYTES);
    expect(MAX_SNAPSHOT_BINARY_IMPORT_BYTES).toBe(MAX_SNAPSHOT_WRITE_BYTES);
  });

  it('counts every committed backup during replacement and pre-prune transactions', () => {
    const summaries = [
      { id: 'backup-3', createdAt: 3, updatedAt: 3, fileName: 'three.bcsnap', size: MAX_SNAPSHOT_BACKUP_BYTES },
      { id: 'backup-2', createdAt: 2, updatedAt: 2, fileName: 'two.bcsnap', size: MAX_SNAPSHOT_BACKUP_BYTES },
      { id: 'backup-1', createdAt: 1, updatedAt: 1, fileName: 'one.bcsnap', size: MAX_SNAPSHOT_BACKUP_BYTES },
    ];
    const replacementBytes = getSnapshotBackupTransactionBaseBytes({
      summaries,
      summary: { ...summaries[1], updatedAt: 4 },
    });
    const newBackupBytes = getSnapshotBackupTransactionBaseBytes({
      summaries,
      summary: { id: 'backup-4', createdAt: 4, updatedAt: 4, fileName: 'four.bcsnap', size: MAX_SNAPSHOT_BACKUP_BYTES },
    });

    expect(replacementBytes).toBe(MAX_SNAPSHOT_BACKUP_BYTES * 3);
    expect(newBackupBytes).toBe(MAX_SNAPSHOT_BACKUP_BYTES * 3);
    expect(() => assertSnapshotBackupSizeCanBeWritten({
      size: MAX_SNAPSHOT_BACKUP_BYTES,
      currentBytes: replacementBytes,
    })).toThrow(/quota/);
    expect(() => assertSnapshotBackupSizeCanBeWritten({
      size: MAX_SNAPSHOT_BACKUP_BYTES,
      currentBytes: newBackupBytes,
    })).toThrow(/quota/);
  });

  it('keeps the old target size in the replacement peak when sizes differ', () => {
    const summaries = [
      { id: 'backup-2', createdAt: 2, updatedAt: 2, fileName: 'two.bcsnap', size: 7 },
      { id: 'backup-1', createdAt: 1, updatedAt: 1, fileName: 'one.bcsnap', size: 5 },
    ];

    expect(getSnapshotBackupTransactionBaseBytes({
      summaries,
      summary: { ...summaries[0], updatedAt: 3, size: 3 },
    })).toBe(12); // The old 7-byte target remains beside the incoming 3-byte temp file.
  });

  it('rejects backup reservations that would be pruned immediately', () => {
    const summaries = [
      { id: 'backup-3', createdAt: 3, updatedAt: 3, fileName: 'three.bcsnap', size: 1 },
      { id: 'backup-2', createdAt: 2, updatedAt: 2, fileName: 'two.bcsnap', size: 1 },
      { id: 'backup-1', createdAt: 1, updatedAt: 1, fileName: 'one.bcsnap', size: 1 },
    ];

    expect(() => getSnapshotBackupTransactionBaseBytes({
      summaries,
      summary: { id: 'backup-0', createdAt: 0, updatedAt: 0, fileName: 'zero.bcsnap', size: 1 },
    })).toThrow(/pruned/);
  });
});
