import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSnapshotWorkingSource } from '../browserSnapshotWorkingSource';
import {
  isSnapshotMediaBlob,
  parseBinarySnapshotFile,
  readSnapshotBlobPartAsArrayBuffer,
  writeSnapshotBinaryStreaming,
  type SnapshotBinary,
  type SnapshotStreamingWritableData,
} from '../snapshotService';

const uint32Bytes = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
};

const uint64Bytes = (value: number): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false);
  return bytes;
};

const buildSnapshotFile = (media: Uint8Array): File => {
  const image = {
    id: 'image-1',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    fileName: 'source.png',
    fileType: 'image/png',
    fileSize: media.byteLength,
    mediaType: 'image' as const,
  };
  const manifest = {
    version: 2 as const,
    createdAt: '2026-07-19T00:00:00.000Z',
    state: { images: [image], notes: [], paths: [] },
  };
  const encoder = new TextEncoder();
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const imageBytes = encoder.encode(JSON.stringify(image));
  return new File([
    encoder.encode('BANANA_SNAPSHOT_V2\n'),
    uint32Bytes(manifestBytes.byteLength),
    manifestBytes,
    uint32Bytes(imageBytes.byteLength),
    imageBytes,
    uint64Bytes(media.byteLength),
    media,
  ], 'scene.bcsnap', { type: 'application/octet-stream' });
};

const writeSnapshotToFile = async (binary: SnapshotBinary, fileName: string): Promise<File> => {
  const chunks: BlobPart[] = [];
  await writeSnapshotBinaryStreaming(binary, {
    write: async (data: SnapshotStreamingWritableData) => {
      if (typeof data === 'string') {
        chunks.push(data);
      } else if (isSnapshotMediaBlob(data)) {
        chunks.push(await readSnapshotBlobPartAsArrayBuffer(data, 0, data.size));
      } else {
        chunks.push(data);
      }
    },
  });
  return new File(chunks, fileName, { type: 'application/octet-stream' });
};

type ExistingWorkingEntry = {
  file: File;
  name: string;
};

const getWorkingEntryLockName = (entryName: string): string => (
  `canva-banana:snapshot-working-source:${entryName}`
);

const installWorkingLocks = (initiallyHeld: ReadonlySet<string> = new Set()) => {
  const heldLocks = new Set(initiallyHeld);
  const request = vi.fn(async <T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => T | Promise<T>,
  ): Promise<T> => {
    if (options.ifAvailable && heldLocks.has(name)) return callback(null); // Active sources keep reconciliation out.
    if (heldLocks.has(name)) throw new Error(`Test lock ${name} is already held.`);
    heldLocks.add(name);
    try {
      return await callback({ name });
    } finally {
      heldLocks.delete(name);
    }
  });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request },
  });
  return { heldLocks, request };
};

const installWorkingStorage = (options: {
  existingEntries?: ExistingWorkingEntry[];
  failRemove?: boolean;
  failWrite?: boolean;
  lockedEntryNames?: string[];
} = {}) => {
  let stagedBytes = new Uint8Array();
  const writes: Uint8Array[] = [];
  const removeEntry = vi.fn(async () => {
    if (options.failRemove) throw new Error('Working copy removal failed.');
  });
  const writable = {
    write: vi.fn(async (data: Uint8Array<ArrayBuffer>) => {
      if (options.failWrite) throw new Error('Working storage is full.');
      writes.push(new Uint8Array(data));
    }),
    close: vi.fn(async () => {
      const size = writes.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      stagedBytes = new Uint8Array(size);
      let offset = 0;
      writes.forEach(chunk => {
        stagedBytes.set(chunk, offset);
        offset += chunk.byteLength;
      });
    }),
    abort: vi.fn(async () => {}),
  };
  const fileHandle = {
    createWritable: vi.fn(async () => writable),
    getFile: vi.fn(async () => new File([stagedBytes], 'working.bcsnap', { type: 'application/octet-stream' })),
  };
  const directory = {
    entries: vi.fn(() => (async function* () {
      for (const entry of options.existingEntries ?? []) {
        yield [entry.name, {
          createWritable: vi.fn(),
          getFile: vi.fn(async () => entry.file),
        }] as const;
      }
    })()),
    getFileHandle: vi.fn(async () => fileHandle),
    removeEntry,
  };
  const root = {
    getDirectoryHandle: vi.fn(async () => directory),
  };
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: vi.fn(async () => root) },
  });
  const lockedNames = new Set((options.lockedEntryNames ?? []).map(getWorkingEntryLockName));
  const locks = installWorkingLocks(lockedNames);
  return { directory, locks, removeEntry, writable };
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks');
  Reflect.deleteProperty(navigator, 'storage');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createBrowserSnapshotWorkingSource', () => {
  it('reclaims abandoned entries without deleting live or recent legacy working copies', async () => {
    const abandonedEntry = 'snapshot-v2-abandoned.bcsnap';
    const activeEntry = 'snapshot-v2-active.bcsnap';
    const staleLegacyEntry = 'snapshot-stale-legacy.bcsnap';
    const recentLegacyEntry = 'snapshot-recent-legacy.bcsnap';
    const oldFile = new File(['old'], 'old.bcsnap', { lastModified: Date.now() - 25 * 60 * 60 * 1000 });
    const recentFile = new File(['recent'], 'recent.bcsnap', { lastModified: Date.now() });
    const { removeEntry } = installWorkingStorage({
      existingEntries: [
        { name: abandonedEntry, file: recentFile },
        { name: activeEntry, file: recentFile },
        { name: staleLegacyEntry, file: oldFile },
        { name: recentLegacyEntry, file: recentFile },
      ],
      lockedEntryNames: [activeEntry],
    });

    await createBrowserSnapshotWorkingSource(new File(['snapshot'], 'scene.bcsnap'));

    expect(removeEntry).toHaveBeenCalledWith(abandonedEntry);
    expect(removeEntry).toHaveBeenCalledWith(staleLegacyEntry);
    expect(removeEntry).not.toHaveBeenCalledWith(activeEntry);
    expect(removeEntry).not.toHaveBeenCalledWith(recentLegacyEntry);
  });

  it('refuses persistent working copies when browser-wide locking is unavailable', async () => {
    installWorkingStorage();
    Reflect.deleteProperty(navigator, 'locks');

    await expect(createBrowserSnapshotWorkingSource(new File(['snapshot'], 'scene.bcsnap'))).rejects.toThrow('working storage is unavailable');
  });

  it('keeps ranges readable after the selected file becomes stale', async () => {
    installWorkingStorage();
    const original = new File([new Uint8Array([1, 2, 3, 4, 5])], 'scene.bcsnap', { type: 'application/octet-stream' });
    const originalSlice = original.slice.bind(original);
    let stale = false;
    original.slice = ((start?: number, end?: number, type?: string) => {
      if (stale) throw new DOMException('The selected file changed.', 'NotReadableError');
      return originalSlice(start, end, type);
    }) as typeof original.slice;

    const source = await createBrowserSnapshotWorkingSource(original);
    stale = true;

    await expect(source.readRange(1, 3).then(buffer => Array.from(new Uint8Array(buffer)))).resolves.toEqual([2, 3, 4]);
  });

  it('preserves original media across backup and repeated writes with shifted metadata', async () => {
    installWorkingStorage();
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:working-media'), revokeObjectURL: vi.fn() });
    const originalMedia = new Uint8Array([11, 22, 33, 44, 55]);
    const original = buildSnapshotFile(originalMedia);
    const originalSlice = original.slice.bind(original);
    let stale = false;
    original.slice = ((start?: number, end?: number, type?: string) => {
      if (stale) throw new DOMException('The selected file changed.', 'NotReadableError');
      return originalSlice(start, end, type);
    }) as typeof original.slice;
    const source = await createBrowserSnapshotWorkingSource(original);
    const parsed = await parseBinarySnapshotFile(source);

    stale = true; // The first primary save would invalidate the picker File.
    const firstBinary: SnapshotBinary = {
      ...parsed,
      manifest: {
        ...parsed.manifest,
        state: { ...parsed.manifest.state, notes: [{ id: 'note-1', text: 'first' }] },
      },
    };
    const firstPrimary = await writeSnapshotToFile(firstBinary, 'first-primary.bcsnap');
    const firstBackup = await writeSnapshotToFile(firstBinary, 'first-backup.bcsnap');
    const secondBinary: SnapshotBinary = {
      ...parsed,
      manifest: {
        ...parsed.manifest,
        state: { ...parsed.manifest.state, notes: [{ id: 'note-1', text: 'metadata that changes every later media offset' }] },
      },
    };
    const secondPrimary = await writeSnapshotToFile(secondBinary, 'second-primary.bcsnap');

    for (const written of [firstPrimary, firstBackup, secondPrimary]) {
      const reparsed = await parseBinarySnapshotFile(written);
      const media = await readSnapshotBlobPartAsArrayBuffer(reparsed.images[0].blob, 0, reparsed.images[0].blob.size);
      expect(new Uint8Array(media)).toEqual(originalMedia);
      expect(reparsed.images[0].manifest).not.toHaveProperty('fallbackReason');
    }
  });

  it('streams large working copies in bounded chunks', async () => {
    const { writable } = installWorkingStorage();
    const original = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.bcsnap', { type: 'application/octet-stream' });

    await createBrowserSnapshotWorkingSource(original);

    expect(writable.write).toHaveBeenCalledTimes(2);
    expect(writable.write.mock.calls[0][0]).toHaveLength(8 * 1024 * 1024);
    expect(writable.write.mock.calls[1][0]).toHaveLength(1);
  });

  it('waits for active media leases before deleting the working copy', async () => {
    const { locks, removeEntry } = installWorkingStorage();
    const source = await createBrowserSnapshotWorkingSource(new File(['snapshot'], 'scene.bcsnap'));
    const release = await source.acquireLease?.();

    const closePromise = source.close?.();
    let closeSettled = false;
    void closePromise?.then(() => { closeSettled = true; });
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    expect(removeEntry).not.toHaveBeenCalled();

    await release?.();
    await closePromise;
    expect(closeSettled).toBe(true);
    expect(removeEntry).toHaveBeenCalledTimes(1);
    expect(locks.heldLocks.size).toBe(0);
    await expect(source.acquireLease?.()).rejects.toThrow('no longer available');
  });

  it('does not reject a final media lease when working-copy removal fails', async () => {
    const cleanupWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { locks, removeEntry } = installWorkingStorage({ failRemove: true });
    const source = await createBrowserSnapshotWorkingSource(new File(['snapshot'], 'scene.bcsnap'));
    const release = await source.acquireLease?.();

    const closePromise = source.close?.();
    await expect(release?.()).resolves.toBeUndefined();
    await expect(closePromise).resolves.toBeUndefined();

    expect(removeEntry).toHaveBeenCalledTimes(1);
    expect(locks.heldLocks.size).toBe(0);
    expect(cleanupWarning).toHaveBeenCalledWith(
      'Browser snapshot working copy could not be removed.',
      expect.objectContaining({ message: 'Working copy removal failed.' }),
    );
  });

  it('removes a partial working entry when staging fails', async () => {
    const { locks, removeEntry, writable } = installWorkingStorage({ failWrite: true });

    await expect(createBrowserSnapshotWorkingSource(new File(['snapshot'], 'scene.bcsnap'))).rejects.toThrow('storage is full');
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(removeEntry).toHaveBeenCalledTimes(1);
    expect(locks.heldLocks.size).toBe(0);
  });

  it('creates source-scoped media URLs and revokes them during cleanup', async () => {
    const { removeEntry } = installWorkingStorage();
    const createObjectURL = vi.fn(() => 'blob:working-media');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const source = await createBrowserSnapshotWorkingSource(new File(['snapshot'], 'scene.bcsnap'));

    await expect(source.getMediaUrl?.(0, 4, 'image/png', 'image.png')).resolves.toBe('blob:working-media');
    await source.close?.();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:working-media');
    expect(removeEntry).toHaveBeenCalledTimes(1);
  });
});
