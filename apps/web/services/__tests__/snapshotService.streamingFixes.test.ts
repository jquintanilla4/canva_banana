import { describe, expect, it, vi } from 'vitest';
import {
  SnapshotMediaReadError,
  ensureRealSnapshotFile,
  parseBinarySnapshotFile,
  restoreSnapshotFromFile,
  snapshotBinaryToBlob,
  withSnapshotMediaLeases,
  writeSnapshotBinaryStreaming,
  type SnapshotBinary,
} from '../snapshotService';
import { createDesktopSnapshotSource } from '../desktopSnapshotSource';

const cloneArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}; // Returns an exact ArrayBuffer slice.

const readFileBytes = (file: File): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(file);
}); // jsdom Files do not implement arrayBuffer().

type LazySnapshotFile = File & { slice: ReturnType<typeof vi.fn> };

const buildLazySnapshotFile = (payload: Uint8Array, options: { failReads?: { current: boolean } } = {}): LazySnapshotFile => {
  const slice = vi.fn((start: number, end: number) => ({
    size: end - start,
    type: 'video/mp4',
    slice,
    arrayBuffer: async () => {
      if (options.failReads?.current) {
        throw new Error('Snapshot read source is no longer available.');
      }
      return cloneArrayBuffer(payload.subarray(start, end));
    },
  }));
  // Mirrors createRestoredSnapshotFile's cast: a SnapshotRangeBlob-shaped object pretending to be a File.
  return {
    size: payload.byteLength,
    type: 'video/mp4',
    name: 'lazy-video.mp4',
    lastModified: 1234567890,
    webkitRelativePath: '',
    slice,
  } as unknown as LazySnapshotFile;
};

describe('ensureRealSnapshotFile', () => {
  it('returns real Files unchanged', async () => {
    const realFile = new File(['abc'], 'real.png', { type: 'image/png' });

    await expect(ensureRealSnapshotFile(realFile)).resolves.toBe(realFile);
  });

  it('materializes lazy snapshot-backed files into real Files with identical bytes', async () => {
    const payload = new TextEncoder().encode('lazy-video-bytes');
    const lazyFile = buildLazySnapshotFile(payload);

    const materialized = await ensureRealSnapshotFile(lazyFile);

    expect(materialized).toBeInstanceOf(File);
    expect(materialized.name).toBe('lazy-video.mp4');
    expect(materialized.type).toBe('video/mp4');
    expect(Array.from(await readFileBytes(materialized))).toEqual(Array.from(payload));
  });

  it('caches the materialized File per lazy source', async () => {
    const payload = new TextEncoder().encode('cache-me');
    const lazyFile = buildLazySnapshotFile(payload);

    const first = await ensureRealSnapshotFile(lazyFile);
    const second = await ensureRealSnapshotFile(lazyFile);

    expect(second).toBe(first);
    expect(lazyFile.slice).toHaveBeenCalledTimes(1); // Under one chunk; a second call must not re-read.
  });

  it('retries materialization after a failed read', async () => {
    const payload = new TextEncoder().encode('retry-me');
    const failReads = { current: true };
    const lazyFile = buildLazySnapshotFile(payload, { failReads });

    await expect(ensureRealSnapshotFile(lazyFile)).rejects.toThrow('Snapshot read source is no longer available.');

    failReads.current = false;
    const materialized = await ensureRealSnapshotFile(lazyFile);

    expect(Array.from(await readFileBytes(materialized))).toEqual(Array.from(payload));
  });

  it('holds one source lease across every materialization chunk', async () => {
    const payload = new Uint8Array(8 * 1024 * 1024 + 1);
    let leaseActive = false;
    const lazyFile = buildLazySnapshotFile(payload) as LazySnapshotFile & {
      withSourceLease: <T>(operation: () => Promise<T>) => Promise<T>;
    };
    const originalSlice = lazyFile.slice;
    lazyFile.slice = vi.fn((start: number, end: number) => {
      const part = originalSlice(start, end) as { arrayBuffer: () => Promise<ArrayBuffer> };
      const read = part.arrayBuffer;
      part.arrayBuffer = async () => {
        expect(leaseActive).toBe(true);
        return read();
      };
      return part;
    }) as typeof lazyFile.slice;
    lazyFile.withSourceLease = vi.fn(async operation => {
      leaseActive = true;
      try {
        return await operation();
      } finally {
        leaseActive = false;
      }
    });

    await ensureRealSnapshotFile(lazyFile);

    expect(lazyFile.withSourceLease).toHaveBeenCalledTimes(1);
    expect(lazyFile.slice).toHaveBeenCalledTimes(2);
  });
});

describe('snapshot metadata write-time caps', () => {
  const buildOversizedBinary = (): SnapshotBinary => ({
    manifest: {
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [],
        notes: [],
        paths: [],
        padding: 'x'.repeat(64 * 1024 * 1024),
      },
    },
    images: [],
  } as unknown as SnapshotBinary);

  it('rejects oversized manifests before writing any snapshot bytes', async () => {
    const write = vi.fn(async () => {});

    await expect(writeSnapshotBinaryStreaming(buildOversizedBinary(), { write })).rejects.toThrow('too large to export and re-import');

    expect(write).not.toHaveBeenCalled();
  });

  it('rejects oversized manifests in the browser download fallback path', () => {
    expect(() => snapshotBinaryToBlob(buildOversizedBinary())).toThrow('too large to export and re-import');
  });
});

describe('streaming snapshot metadata read-ahead', () => {
  const buildImageManifest = (index: number): SnapshotBinary['images'][number]['manifest'] => ({
    id: `video-${index}`,
    x: index,
    y: index,
    width: 1920,
    height: 1080,
    fileName: `video-${index}.mp4`,
    fileType: 'video/mp4',
    fileSize: 1,
    mediaType: 'video',
  });

  it('parses many compact entries with bounded range reads and no media URL IPC', async () => {
    const manifests = Array.from({ length: 120 }, (_, index) => buildImageManifest(index));
    const binary: SnapshotBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-10T00:00:00.000Z',
        state: { images: manifests, notes: [], paths: [] },
      },
      images: manifests.map(manifest => ({ manifest, blob: new Blob([new Uint8Array([1])], { type: 'video/mp4' }) })),
    };
    const snapshotFile = new File([snapshotBinaryToBlob(binary)], 'many-videos.bcsnap', { type: 'application/octet-stream' });
    const snapshotBytes = await readFileBytes(snapshotFile);
    const readSnapshotRange = vi.fn(async ({ offset, length }: { offset: number; length: number }) => (
      cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length))
    ));
    const getSnapshotMediaUrl = vi.fn(async () => 'unused');
    window.canvaBananaDesktop = { fileMenu: { readSnapshotRange, getSnapshotMediaUrl } };
    const source = createDesktopSnapshotSource({
      sourceId: 'source-many',
      fileName: 'many-videos.bcsnap',
      size: snapshotBytes.byteLength,
      type: 'application/octet-stream',
      mediaUrlBase: 'canva-banana-snapshot://media/source-many/',
    });

    const parsed = await parseBinarySnapshotFile(source);

    expect(parsed.images).toHaveLength(120);
    expect(readSnapshotRange.mock.calls.length).toBeLessThanOrEqual(6); // Header, manifest, first record fields, and one compact-record window.
    expect(getSnapshotMediaUrl).not.toHaveBeenCalled();
    expect(parsed.images[119]?.blob.snapshotObjectUrl).toContain('/snapshot-media?type=video%2Fmp4');
  });

  it('rejects an image count that cannot fit in the remaining file bytes', async () => {
    const manifests = [buildImageManifest(1), buildImageManifest(2)];
    const mismatchedBinary: SnapshotBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-10T00:00:00.000Z',
        state: { images: manifests, notes: [], paths: [] },
      },
      images: [],
    };
    const file = new File([snapshotBinaryToBlob(mismatchedBinary)], 'impossible-count.bcsnap', { type: 'application/octet-stream' });

    await expect(parseBinarySnapshotFile(file)).rejects.toThrow('cannot fit in the file');
  });

  it('rejects manifests whose image collection is not an array', async () => {
    const invalidBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-10T00:00:00.000Z',
        state: { images: {}, notes: [], paths: [] },
      },
      images: [],
    } as unknown as SnapshotBinary;
    const file = new File([snapshotBinaryToBlob(invalidBinary)], 'invalid-images.bcsnap', { type: 'application/octet-stream' });

    await expect(parseBinarySnapshotFile(file)).rejects.toThrow('manifest images are invalid');
  });
});

describe('streaming snapshot source leases', () => {
  it('uses one lease for every media entry backed by the same large snapshot source', async () => {
    const release = vi.fn(async () => {});
    const snapshotLeaseSource = { acquireLease: vi.fn(async () => release) };
    const blobs = ['video-1', 'video-2'].map(name => ({
      size: 1,
      type: 'video/mp4',
      name,
      slice: vi.fn(),
      arrayBuffer: vi.fn(),
      stream: vi.fn(),
      text: vi.fn(),
      snapshotLeaseSource,
    }));

    await withSnapshotMediaLeases(blobs, async () => {
      expect(snapshotLeaseSource.acquireLease).toHaveBeenCalledTimes(1);
      expect(release).not.toHaveBeenCalled();
    });

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('holds every lazy media lease across the complete multi-entry write', async () => {
    let activeLeases = 0;
    const recordLease = vi.fn();
    const withSourceLease = async <T>(operation: () => Promise<T>): Promise<T> => {
      recordLease();
      activeLeases += 1;
      try {
        return await operation();
      } finally {
        activeLeases -= 1;
      }
    };
    const buildEntry = (id: string): SnapshotBinary['images'][number] => ({
      manifest: {
        id,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fileName: `${id}.mp4`,
        fileType: 'video/mp4',
        fileSize: 1,
        mediaType: 'video',
      },
      blob: {
        size: 1,
        type: 'video/mp4',
        name: `${id}.mp4`,
        slice: vi.fn(),
        arrayBuffer: vi.fn(),
        stream: vi.fn(),
        text: vi.fn(),
        withSourceLease,
      },
    });
    const binary: SnapshotBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-09T00:00:00.000Z',
        state: { images: [], notes: [], paths: [] },
      },
      images: [buildEntry('video-1'), buildEntry('video-2')],
    };

    await writeSnapshotBinaryStreaming(binary, {
      write: async data => {
        if (typeof data !== 'string' && 'withSourceLease' in data) {
          expect(activeLeases).toBe(2);
        }
      },
    });

    expect(recordLease).toHaveBeenCalledTimes(2);
  });

  it('finishes chunked media reads after source replacement begins', async () => {
    const payload = new Uint8Array(8 * 1024 * 1024 + 1);
    payload[0] = 1;
    payload[payload.length - 1] = 2; // Crosses the chunk boundary without representing the full supported snapshot size in memory.
    const imageManifest: SnapshotBinary['images'][number]['manifest'] = {
      id: 'video-1',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      fileName: 'large-video.mp4',
      fileType: 'video/mp4',
      fileSize: payload.byteLength,
      mediaType: 'video',
    };
    const originalBinary: SnapshotBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-10T00:00:00.000Z',
        state: { images: [imageManifest], notes: [], paths: [] },
      },
      images: [{ manifest: imageManifest, blob: new Blob([payload], { type: 'video/mp4' }) }],
    };
    const snapshotBytes = await readFileBytes(new File([snapshotBinaryToBlob(originalBinary)], 'large.bcsnap'));
    const closeSnapshotRead = vi.fn(async () => ({ closed: true }));
    const readSnapshotRange = vi.fn(async ({ offset, length }: { offset: number; length: number }) => (
      cloneArrayBuffer(snapshotBytes.subarray(offset, offset + length))
    ));
    window.canvaBananaDesktop = { fileMenu: { closeSnapshotRead, readSnapshotRange } };
    const source = createDesktopSnapshotSource({
      sourceId: 'source-draining',
      fileName: 'large.bcsnap',
      size: snapshotBytes.byteLength,
      type: 'application/octet-stream',
      mediaUrlBase: 'canva-banana-snapshot://media/source-draining/',
    });
    const parsed = await parseBinarySnapshotFile(source);
    readSnapshotRange.mockClear();
    let closePromise: Promise<void> | undefined;

    await writeSnapshotBinaryStreaming(parsed, {
      write: async data => {
        if (typeof data === 'string' || !('arrayBuffer' in data)) return;
        closePromise ??= source.close?.(); // Replacement starts after the write already owns its outer source lease.
        await data.arrayBuffer(); // The media read takes a nested lease and remains chunked for large payloads.
      },
    });
    await closePromise;

    expect(closeSnapshotRead).toHaveBeenCalledTimes(1);
    expect(readSnapshotRange).toHaveBeenCalledTimes(2);
    expect(readSnapshotRange.mock.calls.map(([request]) => request.length)).toEqual([8 * 1024 * 1024, 1]);
  });
});

describe('legacy JSON import size cap', () => {
  it('keeps very large user-selected legacy snapshots supported by product requirement', async () => {
    const snapshotJson = JSON.stringify({
      version: 1,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [], notes: [], paths: [] },
    });
    const file = new File([snapshotJson], 'canvas.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    file.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().
    Object.defineProperty(file, 'size', { value: 512 * 1024 * 1024 + 1, configurable: true }); // This accepted memory cost preserves large legacy imports.

    const restored = await restoreSnapshotFromFile(file, {
      brushSize: 8,
      eraserSize: 8,
      brushColor: '#ff0000',
    });

    expect(restored.images).toEqual([]);
    expect(restored.sourceRetention).toBe('not-required');
  });
});

describe('closed snapshot read source classification', () => {
  it('converts closed-read-source write failures into media read errors', async () => {
    const imageManifest = {
      id: 'video-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'clip.mp4',
      fileType: 'video/mp4',
      fileSize: 4,
      mediaType: 'video',
    };
    const binary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-09T00:00:00.000Z',
        state: { images: [imageManifest], notes: [], paths: [] },
      },
      images: [{
        manifest: imageManifest,
        blob: {
          size: 4,
          type: 'video/mp4',
          slice: () => { throw new Error('unused'); },
          arrayBuffer: async () => { throw new Error('unused'); },
          stream: () => { throw new Error('unused'); },
          text: async () => { throw new Error('unused'); },
        },
      }],
    } as unknown as SnapshotBinary;
    const write = vi.fn(async (data: unknown) => {
      if (typeof data !== 'string' && data && 'size' in (data as object)) {
        // Electron IPC wraps the main-process message when a read source has been closed.
        throw new Error("Error invoking remote method 'file-menu-read-snapshot-range': Error: Snapshot read source is no longer available.");
      }
    });

    await expect(writeSnapshotBinaryStreaming(binary, { write })).rejects.toBeInstanceOf(SnapshotMediaReadError);
  });
});
