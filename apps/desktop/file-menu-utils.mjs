import { open } from 'node:fs/promises';
import { basename, extname, posix, win32 } from 'node:path';

export const DEFAULT_SNAPSHOT_FILE_NAME = 'banana-canvas-snapshot.bcsnap';
export const MAX_SNAPSHOT_IMPORT_BYTES = 512 * 1024 * 1024;
export const MAX_SNAPSHOT_WRITE_BYTES = MAX_SNAPSHOT_IMPORT_BYTES;
const DEFAULT_SNAPSHOT_READ_CHUNK_BYTES = 1024 * 1024;
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

export const assertSnapshotFileCanBeOpened = ({ fileName, size, maxBytes = MAX_SNAPSHOT_IMPORT_BYTES }) => {
  if (!isSupportedSnapshotFileName(fileName)) {
    throw new Error('Snapshot files must use a .bcsnap or .json extension.');
  }
  if (!Number.isFinite(size) || size < 0) {
    throw new Error('Snapshot file size is invalid.');
  }
  if (size > maxBytes) {
    throw new Error('Snapshot file is too large to import safely.');
  }
};

export const readSnapshotFileCapped = async (filePath, {
  chunkBytes = DEFAULT_SNAPSHOT_READ_CHUNK_BYTES,
  maxBytes = MAX_SNAPSHOT_IMPORT_BYTES,
} = {}) => {
  const fileName = basename(filePath);
  const handle = await open(filePath, 'r');
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) {
      throw new Error('Snapshot import requires a regular file.');
    }
    assertSnapshotFileCanBeOpened({ fileName, size: fileStats.size, maxBytes });
    const chunks = [];
    const boundedChunkBytes = Math.max(1, Math.min(chunkBytes, maxBytes + 1)); // Keep each read small and allow a one-byte overflow probe.
    let totalBytes = 0;
    while (true) {
      const readSize = Math.min(boundedChunkBytes, maxBytes + 1 - totalBytes); // One extra byte proves oversize without reading the rest.
      const buffer = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await handle.read(buffer, 0, readSize, null);
      if (bytesRead === 0) {
        break;
      }
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        throw new Error('Snapshot file is too large to import safely.');
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
    assertSnapshotFileCanBeOpened({ fileName, size: totalBytes, maxBytes });
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
};

const getSnapshotBinaryByteLength = (data) => {
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

export const assertSnapshotDataCanBeWritten = (data, { maxBytes = MAX_SNAPSHOT_WRITE_BYTES } = {}) => {
  const byteLength = getSnapshotBinaryByteLength(data);
  if (byteLength === null) {
    throw new Error('Snapshot data must be binary.');
  }
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error('Snapshot data size is invalid.');
  }
  if (byteLength > maxBytes) {
    throw new Error('Snapshot data is too large to write safely.');
  }
};
