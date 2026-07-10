import { basename, extname, posix, win32 } from 'node:path';

export const DEFAULT_SNAPSHOT_FILE_NAME = 'banana-canvas-snapshot.bcsnap';
export const MAX_SNAPSHOT_CHUNK_BYTES = 16 * 1024 * 1024;
export const MAX_SNAPSHOT_IMPORT_BYTES = 512 * 1024 * 1024;
export const MAX_SNAPSHOT_WRITE_BYTES = 64 * 1024 * 1024 * 1024; // Allows large sessions while bounding runaway writes.
export const MAX_SNAPSHOT_BINARY_IMPORT_BYTES = MAX_SNAPSHOT_WRITE_BYTES; // Matches streamed export capacity for large .bcsnap files.
export const MAX_SNAPSHOT_BACKUP_BYTES = 16 * 1024 * 1024 * 1024; // Allows larger automatic backups without capping user exports.
export const MAX_SNAPSHOT_BACKUP_COUNT = 3; // Matches the visible recent-backup retention policy.
export const MAX_SNAPSHOT_BACKUP_STORE_BYTES = MAX_SNAPSHOT_BACKUP_BYTES * MAX_SNAPSHOT_BACKUP_COUNT; // Bounds total desktop backup disk use.
const SNAPSHOT_IMPORT_EXTENSIONS = new Set(['.bcsnap', '.json']);
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get; // Requires a real ArrayBuffer receiver.
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')?.get; // Requires a real typed-array receiver.
const dataViewByteLengthGetter = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength')?.get; // Requires a real DataView receiver.

export const sanitizeSnapshotFileName = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.includes('\0') || trimmed === '.' || trimmed === '..') {
    return DEFAULT_SNAPSHOT_FILE_NAME;
  }
  const posixName = posix.basename(trimmed);
  const winName = win32.basename(posixName);
  if (winName !== trimmed || winName === '.' || winName === '..') {
    return DEFAULT_SNAPSHOT_FILE_NAME; // Path segments are not valid save-dialog suggestions.
  }
  return basename(winName) || DEFAULT_SNAPSHOT_FILE_NAME;
};

export const isSupportedSnapshotFileName = (value) => (
  typeof value === 'string' && SNAPSHOT_IMPORT_EXTENSIONS.has(extname(value).toLowerCase())
);

export const assertSnapshotFileCanBeOpened = ({
  fileName,
  size,
  maxBytes = MAX_SNAPSHOT_IMPORT_BYTES,
  binaryMaxBytes = MAX_SNAPSHOT_BINARY_IMPORT_BYTES,
}) => {
  const extension = extname(fileName).toLowerCase();
  if (!SNAPSHOT_IMPORT_EXTENSIONS.has(extension)) {
    throw new Error('Snapshot files must use a .bcsnap or .json extension.');
  }
  if (!Number.isFinite(size) || size < 0) {
    throw new Error('Snapshot file size is invalid.');
  }
  const sizeLimit = extension === '.json' ? maxBytes : binaryMaxBytes;
  if (size > sizeLimit) {
    throw new Error('Snapshot file is too large to import safely.');
  }
};

export const getSnapshotBinaryByteLength = (data) => {
  if (ArrayBuffer.isView(data)) {
    try {
      return typedArrayByteLengthGetter?.call(data) ?? null;
    } catch {
      try {
        return dataViewByteLengthGetter?.call(data) ?? null;
      } catch {
        return null;
      }
    }
  }
  try {
    return arrayBufferByteLengthGetter?.call(data) ?? null;
  } catch {
    return null;
  }
};

export const assertSnapshotDataCanBeWritten = (data, { maxBytes = MAX_SNAPSHOT_CHUNK_BYTES } = {}) => {
  const byteLength = getSnapshotBinaryByteLength(data);
  if (byteLength === null) {
    throw new Error('Snapshot data must be binary.');
  }
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error('Snapshot data size is invalid.');
  }
  if (byteLength > maxBytes) {
    throw new Error('Snapshot data chunk is too large to write safely.');
  }
};

export const assertSnapshotBackupSizeCanBeWritten = ({
  size,
  currentBytes = 0,
  reservedBytes = 0,
  maxBytes = MAX_SNAPSHOT_BACKUP_BYTES,
  maxStoreBytes = MAX_SNAPSHOT_BACKUP_STORE_BYTES,
}) => {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('Snapshot backup size is invalid.');
  }
  if (!Number.isSafeInteger(currentBytes) || currentBytes < 0 || !Number.isSafeInteger(reservedBytes) || reservedBytes < 0) {
    throw new Error('Snapshot backup storage size is invalid.');
  }
  if (size > maxBytes) {
    throw new Error('Snapshot backup is too large to store automatically.');
  }
  if (currentBytes + reservedBytes + size > maxStoreBytes) {
    throw new Error('Snapshot backup storage quota exceeded.');
  }
};

export const getSnapshotBackupTransactionBaseBytes = ({
  summaries,
  summary,
  maxCount = MAX_SNAPSHOT_BACKUP_COUNT,
}) => {
  const normalizedSummaries = Array.isArray(summaries) ? summaries : [];
  const replacingExisting = normalizedSummaries.some(item => item.id === summary.id);
  const projectedSummaries = replacingExisting
    ? normalizedSummaries.map(item => (item.id === summary.id ? summary : item))
    : [...normalizedSummaries, summary];
  const retainedSummaries = [...projectedSummaries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, maxCount);
  if (!retainedSummaries.some(item => item.id === summary.id)) {
    throw new Error('Snapshot backup would be pruned immediately.');
  }
  return normalizedSummaries.reduce((sum, item) => sum + item.size, 0); // Existing files remain until the new backup commits.
};
