import type { SnapshotRangeSource, SnapshotSourceLease } from './snapshotService';

const BROWSER_SNAPSHOT_CHUNK_BYTES = 8 * 1024 * 1024;
const BROWSER_SNAPSHOT_WORKING_DIRECTORY = 'snapshot-working-sources';
const BROWSER_SNAPSHOT_WORKING_ENTRY_PREFIX = 'snapshot-v2-';
const BROWSER_SNAPSHOT_WORKING_ENTRY_SUFFIX = '.bcsnap';
const BROWSER_SNAPSHOT_LEGACY_STALE_MS = 24 * 60 * 60 * 1000;

type BrowserSnapshotWritable = {
  write: (data: Uint8Array<ArrayBuffer>) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type BrowserSnapshotFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<BrowserSnapshotWritable>;
};

type BrowserSnapshotDirectoryHandle = {
  entries: () => AsyncIterableIterator<[string, BrowserSnapshotFileHandle]>;
  getDirectoryHandle: (name: string, options: { create: boolean }) => Promise<BrowserSnapshotDirectoryHandle>;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<BrowserSnapshotFileHandle>;
  removeEntry: (name: string) => Promise<void>;
};

type BrowserStorageManager = Omit<StorageManager, 'getDirectory'> & {
  getDirectory?: () => Promise<BrowserSnapshotDirectoryHandle>;
};

type BrowserSnapshotLock = {
  name?: string;
};

type BrowserSnapshotLockManager = {
  request: <T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: BrowserSnapshotLock | null) => T | Promise<T>,
  ) => Promise<T>;
};

type BrowserSnapshotNavigator = Navigator & {
  locks?: BrowserSnapshotLockManager;
};

const runBestEffortWorkingSourceCleanup = async (
  action: () => void | Promise<void>,
  warning: string,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    console.warn(warning, error); // Cleanup failures stay diagnostic because reconciliation can retry abandoned entries.
  }
};

const readBlobAsArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Snapshot working copy could not be read.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
};

const assertSnapshotRange = (size: number, offset: number, length: number): void => {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || offset + length > size) {
    throw new Error('Snapshot working-copy range is invalid.');
  }
};

const getWorkingEntryLockName = (entryName: string): string => (
  `canva-banana:snapshot-working-source:${entryName}`
); // Browser-wide locks distinguish live entries from crash leftovers.

const isVersionedWorkingEntry = (entryName: string): boolean => (
  entryName.startsWith(BROWSER_SNAPSHOT_WORKING_ENTRY_PREFIX)
  && entryName.endsWith(BROWSER_SNAPSHOT_WORKING_ENTRY_SUFFIX)
);

const isLegacyWorkingEntry = (entryName: string): boolean => (
  entryName.startsWith('snapshot-')
  && entryName.endsWith(BROWSER_SNAPSHOT_WORKING_ENTRY_SUFFIX)
  && !isVersionedWorkingEntry(entryName)
);

const retainWorkingEntryLock = async (
  lockManager: BrowserSnapshotLockManager,
  entryName: string,
): Promise<() => Promise<void>> => {
  let resolveReady: () => void = () => {};
  let rejectReady: (error: unknown) => void = () => {};
  let resolveRelease: () => void = () => {};
  let readySettled = false;
  let released = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const releaseSignal = new Promise<void>(resolve => { resolveRelease = resolve; });
  const lockRequest = lockManager.request(
    getWorkingEntryLockName(entryName),
    { mode: 'exclusive' },
    async lock => {
      if (!lock) throw new Error('Browser snapshot working storage lock is unavailable.');
      readySettled = true;
      resolveReady();
      await releaseSignal; // Keep the entry owned until every lazy reader is done.
    },
  ).catch(error => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
  });
  await ready;
  return async () => {
    if (released) return;
    released = true;
    resolveRelease();
    await lockRequest;
  };
};

const reconcileWorkingDirectory = async (
  directory: BrowserSnapshotDirectoryHandle,
  lockManager: BrowserSnapshotLockManager,
): Promise<void> => {
  const legacyCutoff = Date.now() - BROWSER_SNAPSHOT_LEGACY_STALE_MS;
  for await (const [entryName, fileHandle] of directory.entries()) {
    let canRemove = isVersionedWorkingEntry(entryName); // Versioned entries are safe to remove whenever their lock is free.
    if (!canRemove && isLegacyWorkingEntry(entryName)) {
      try {
        const file = await fileHandle.getFile();
        canRemove = Number.isFinite(file.lastModified) && file.lastModified <= legacyCutoff;
      } catch { /* Unreadable legacy entries stay untouched. */ }
    }
    if (!canRemove) continue;
    await lockManager.request(
      getWorkingEntryLockName(entryName),
      { mode: 'exclusive', ifAvailable: true },
      async lock => {
        if (!lock) return; // Another tab still owns this working source.
        await directory.removeEntry(entryName);
      },
    ).catch(() => undefined); // Cleanup failures must not block a new import attempt.
  }
};

const copySnapshotToWorkingFile = async (source: File, target: BrowserSnapshotFileHandle): Promise<File> => {
  const writable = await target.createWritable();
  try {
    for (let offset = 0; offset < source.size; offset += BROWSER_SNAPSHOT_CHUNK_BYTES) {
      const end = Math.min(source.size, offset + BROWSER_SNAPSHOT_CHUNK_BYTES);
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(source.slice(offset, end)));
      await writable.write(bytes); // Bounded chunks keep large imports off the JS heap.
    }
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
  const stagedFile = await target.getFile();
  if (stagedFile.size !== source.size) {
    throw new Error('Snapshot working copy was not written completely.');
  }
  return stagedFile;
};

export const createBrowserSnapshotWorkingSource = async (source: File): Promise<SnapshotRangeSource> => {
  const storage = navigator.storage as unknown as BrowserStorageManager | undefined;
  const lockManager = (navigator as BrowserSnapshotNavigator).locks;
  if (typeof storage?.getDirectory !== 'function' || typeof lockManager?.request !== 'function') {
    throw new Error('Browser snapshot working storage is unavailable.');
  }

  const root = await storage.getDirectory();
  const directory = await root.getDirectoryHandle(BROWSER_SNAPSHOT_WORKING_DIRECTORY, { create: true });
  if (typeof directory.entries !== 'function') {
    throw new Error('Browser snapshot working storage cleanup is unavailable.');
  }
  await reconcileWorkingDirectory(directory, lockManager); // Reclaim crash leftovers before reserving more quota.
  const entryName = `${BROWSER_SNAPSHOT_WORKING_ENTRY_PREFIX}${crypto.randomUUID()}${BROWSER_SNAPSHOT_WORKING_ENTRY_SUFFIX}`;
  const releaseEntryLock = await retainWorkingEntryLock(lockManager, entryName);
  let stagedFile: File;
  try {
    const fileHandle = await directory.getFileHandle(entryName, { create: true });
    stagedFile = await copySnapshotToWorkingFile(source, fileHandle);
  } catch (error) {
    await directory.removeEntry(entryName).catch(() => undefined);
    await releaseEntryLock();
    throw error;
  }

  let activeLeases = 0;
  let closeRequested = false;
  let cleanupPromise: Promise<void> | null = null;
  let cleanupCompletion: Promise<void> | null = null;
  let resolveCleanupCompletion: (() => void) | null = null;
  const objectUrls = new Set<string>();
  const getCleanupCompletion = (): Promise<void> => {
    cleanupCompletion ??= new Promise<void>(resolve => { resolveCleanupCompletion = resolve; });
    return cleanupCompletion;
  }; // Close waits for the final active lease to finish cleanup.
  const cleanupIfIdle = (): Promise<void> | null => {
    if (!closeRequested || activeLeases > 0) return null;
    getCleanupCompletion();
    cleanupPromise ??= (async () => {
      try {
        for (const url of objectUrls) {
          await runBestEffortWorkingSourceCleanup(
            () => URL.revokeObjectURL(url),
            'Browser snapshot working-source URL could not be revoked.',
          );
        }
        objectUrls.clear();
        await runBestEffortWorkingSourceCleanup(
          () => directory.removeEntry(entryName),
          'Browser snapshot working copy could not be removed.',
        ); // Failed deletion is retried by the next reconciliation pass.
      } finally {
        await runBestEffortWorkingSourceCleanup(
          releaseEntryLock,
          'Browser snapshot working-source lock could not be released.',
        );
        resolveCleanupCompletion?.(); // Cleanup completion never rejects successful media operations.
      }
    })();
    return cleanupPromise;
  };
  const acquireLease = async (): Promise<SnapshotSourceLease> => {
    if (closeRequested && activeLeases === 0) {
      throw new Error('Snapshot read source is no longer available.');
    }
    activeLeases += 1;
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      activeLeases -= 1;
      await cleanupIfIdle();
    };
  };

  return {
    fileName: source.name,
    size: stagedFile.size,
    type: source.type || 'application/octet-stream',
    maxMediaBytes: Number.MAX_SAFE_INTEGER, // OPFS keeps large media disk-backed instead of materializing it.
    getMediaUrl: async (offset, length, type) => {
      assertSnapshotRange(stagedFile.size, offset, length);
      const url = URL.createObjectURL(stagedFile.slice(offset, offset + length, type));
      objectUrls.add(url);
      return url;
    },
    readRange: async (offset, length) => {
      assertSnapshotRange(stagedFile.size, offset, length);
      return readBlobAsArrayBuffer(stagedFile.slice(offset, offset + length));
    },
    retain: async () => {
      if (closeRequested) throw new Error('Snapshot read source is no longer available.');
    },
    acquireLease,
    close: async () => {
      closeRequested = true;
      const activeCleanup = cleanupIfIdle();
      await (activeCleanup ?? getCleanupCompletion());
    },
  };
};
