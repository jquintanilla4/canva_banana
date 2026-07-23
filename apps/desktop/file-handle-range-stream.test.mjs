import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileHandleRangeStream } from './file-handle-range-stream.mjs';

const collectStream = async stream => Buffer.concat(await Array.fromAsync(stream));

const withSparseFile = async (run) => {
  const directory = await mkdtemp(join(tmpdir(), 'snapshot-range-stream-'));
  const filePath = join(directory, 'large-snapshot.bcsnap');
  const handle = await open(filePath, 'w+');
  try {
    await run(handle);
  } finally {
    await handle.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
};

describe('file handle range stream', () => {
  it('streams exact bytes from a sparse position beyond two gigabytes', async () => {
    await withSparseFile(async (handle) => {
      const position = (2 ** 31) + 57;
      const marker = Buffer.from('late-video-bytes');
      await handle.write(marker, 0, marker.length, position);

      const stream = createFileHandleRangeStream({
        handle,
        start: position,
        end: position + marker.length - 1,
        chunkBytes: 4,
      });

      await expect(collectStream(stream)).resolves.toEqual(marker);
    });
  });

  it('keeps the shared file handle open when a media stream is destroyed', async () => {
    await withSparseFile(async (handle) => {
      const marker = Buffer.from('shared-handle-stays-open');
      await handle.write(marker, 0, marker.length, 0);
      const stream = createFileHandleRangeStream({ handle, start: 0, end: marker.length - 1, chunkBytes: 4 });

      const closed = new Promise(resolve => stream.once('close', resolve));
      stream.on('error', () => {}); // The controller consumes cancellation errors in production.
      stream.once('data', () => stream.destroy(new Error('renderer canceled request')));
      stream.resume();
      await closed;

      const verification = Buffer.alloc(marker.length);
      const { bytesRead } = await handle.read(verification, 0, verification.length, 0);
      expect(bytesRead).toBe(marker.length);
      expect(verification).toEqual(marker);
    });
  });

  it('rejects invalid ranges before constructing a stream', () => {
    const handle = { read: async () => ({ bytesRead: 0 }) };

    expect(() => createFileHandleRangeStream({ handle, start: -1, end: 0 })).toThrow('range is invalid');
    expect(() => createFileHandleRangeStream({ handle, start: 2, end: 1 })).toThrow('range is invalid');
    expect(() => createFileHandleRangeStream({ handle, start: 0, end: 1, chunkBytes: 0 })).toThrow('chunk size is invalid');
  });
});
