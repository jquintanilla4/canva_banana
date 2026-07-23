import { Readable } from 'node:stream';

const defaultChunkBytes = 64 * 1024; // Keep each positional read small and cancelable.

export const createFileHandleRangeStream = ({ handle, start, end, chunkBytes = defaultChunkBytes }) => {
  if (typeof handle?.read !== 'function') throw new Error('Snapshot file handle is invalid.');
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start) {
    throw new Error('Snapshot file range is invalid.');
  }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error('Snapshot stream chunk size is invalid.');

  const readRange = async function* () {
    let position = start;
    while (position <= end) {
      const requestedBytes = Math.min(chunkBytes, end - position + 1);
      const buffer = Buffer.allocUnsafe(requestedBytes);
      const { bytesRead } = await handle.read(buffer, 0, requestedBytes, position); // Positional reads never transfer ownership of the pinned handle.
      if (bytesRead <= 0) return;
      position += bytesRead;
      yield bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
    }
  };

  return Readable.from(readRange()); // Destroying this stream cancels only its generator.
};
