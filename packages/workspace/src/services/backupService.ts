import { workspaceStorageKey } from '../services/runtimeConfig';
import { getDesktopBridge } from './runtimeConfig';
import type { DesktopSnapshotReadSource } from './runtimeConfig';
import {
  readSnapshotBlobPartAsArrayBuffer,
  isSnapshotMediaBlob,
  writeSnapshotBinary,
  writeSnapshotBinaryStreaming,
  type SnapshotBinary,
  type SnapshotMediaBlob,
  type SnapshotStreamingWritableData,
} from './snapshotService';

export type BackupSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  fileName: string;
  size: number;
  blob?: Blob;
  source?: DesktopSnapshotReadSource;
};

export type BackupSessionSummary = Omit<BackupSessionRecord, 'blob' | 'source'>;

const DB_NAME = 'banana-canvas-backups';
const STORE_NAME = 'sessions';
const SUMMARY_STORE_NAME = 'sessionSummaries';
const DB_VERSION = 2;

const toBackupSummary = ({ blob: _blob, source: _source, ...summary }: BackupSessionRecord): BackupSessionSummary => summary;

const DESKTOP_BACKUP_CHUNK_BYTES = 8 * 1024 * 1024;
const backupTextEncoder = new TextEncoder();

const getDesktopFileMenu = () => (
  typeof window === 'undefined' ? undefined : getDesktopBridge()?.fileMenu
);

const hasDesktopBackupBridge = (fileMenu: ReturnType<typeof getDesktopFileMenu>) => {
  return typeof fileMenu?.beginBackupSnapshot === 'function'
    && typeof fileMenu.writeSnapshotChunk === 'function'
    && typeof fileMenu.finishSnapshotWrite === 'function'
    && typeof fileMenu.abortSnapshotWrite === 'function'
    && typeof fileMenu.listSnapshotBackups === 'function'
    && typeof fileMenu.openBackupSnapshot === 'function'
    && typeof fileMenu.deleteBackupSnapshot === 'function';
};

const readBlobPartAsArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read backup data.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
};

const writeDesktopBackupBlob = async (record: BackupSessionRecord, fileMenu: ReturnType<typeof getDesktopFileMenu>): Promise<void> => {
  if (!fileMenu?.beginBackupSnapshot || !fileMenu.writeSnapshotChunk || !fileMenu.finishSnapshotWrite || !fileMenu.abortSnapshotWrite) {
    throw new Error('Desktop backup storage is unavailable.');
  }
  if (!record.blob) {
    throw new Error('Backup blob is missing.');
  }
  const session = await fileMenu.beginBackupSnapshot({
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fileName: record.fileName,
    size: record.size,
  });
  try {
    for (let offset = 0; offset < record.blob.size; offset += DESKTOP_BACKUP_CHUNK_BYTES) {
      const chunk = record.blob.slice(offset, offset + DESKTOP_BACKUP_CHUNK_BYTES);
      await fileMenu.writeSnapshotChunk({ writeId: session.writeId, data: await readBlobPartAsArrayBuffer(chunk) }); // Stream bounded backup chunks through IPC.
    }
    await fileMenu.finishSnapshotWrite({ writeId: session.writeId });
  } catch (error) {
    await fileMenu.abortSnapshotWrite({ writeId: session.writeId }).catch(() => undefined);
    throw error;
  }
};

const writeDesktopSnapshotData = async (
  fileMenu: NonNullable<ReturnType<typeof getDesktopFileMenu>>,
  writeId: string,
  data: SnapshotStreamingWritableData,
): Promise<void> => {
  if (typeof data === 'string') {
    await writeDesktopSnapshotData(fileMenu, writeId, backupTextEncoder.encode(data));
    return;
  }
  if (isSnapshotMediaBlob(data)) {
    for (let offset = 0; offset < data.size; offset += DESKTOP_BACKUP_CHUNK_BYTES) {
      const chunk = data.slice(offset, offset + DESKTOP_BACKUP_CHUNK_BYTES);
      await fileMenu.writeSnapshotChunk!({ writeId, data: await readSnapshotBlobPartAsArrayBuffer(chunk, 0, chunk.size) }); // Keeps desktop backup IPC chunks bounded.
    }
    return;
  }
  for (let offset = 0; offset < data.byteLength; offset += DESKTOP_BACKUP_CHUNK_BYTES) {
    const chunk = data.subarray(offset, offset + DESKTOP_BACKUP_CHUNK_BYTES);
    await fileMenu.writeSnapshotChunk!({ writeId, data: chunk.slice().buffer }); // Sends only the selected typed-array bytes.
  }
};

const writeDesktopBackupBinary = async (record: BackupSessionRecord, binary: SnapshotBinary, fileMenu: ReturnType<typeof getDesktopFileMenu>): Promise<void> => {
  if (!fileMenu?.beginBackupSnapshot || !fileMenu.writeSnapshotChunk || !fileMenu.finishSnapshotWrite || !fileMenu.abortSnapshotWrite) {
    throw new Error('Desktop backup storage is unavailable.');
  }
  const session = await fileMenu.beginBackupSnapshot({
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fileName: record.fileName,
    size: record.size,
  });
  try {
    await writeSnapshotBinaryStreaming(binary, {
      write: data => writeDesktopSnapshotData(fileMenu, session.writeId, data),
    });
    await fileMenu.finishSnapshotWrite({ writeId: session.writeId });
  } catch (error) {
    await fileMenu.abortSnapshotWrite({ writeId: session.writeId }).catch(() => undefined);
    throw error;
  }
};

const materializeSnapshotBinaryBlob = async (binary: SnapshotBinary): Promise<Blob> => {
  const parts: BlobPart[] = [];
  await writeSnapshotBinary(binary, {
    write: async data => {
      if (typeof data === 'string') {
        parts.push(data);
        return;
      }
      if (data instanceof Blob) {
        parts.push(data); // Real Blobs compose zero-copy; writeSnapshotBinary rejects lazy media on this path.
        return;
      }
      parts.push(data.slice());
    },
  });
  return new Blob(parts, { type: 'application/octet-stream' });
};

// Open (or create) the local backup database used for autosave sessions.
const openBackupDb = (databaseName: string): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is not available in this browser.'));
    return;
  }

  const request = indexedDB.open(databaseName, DB_VERSION);
  request.onerror = () => reject(request.error ?? new Error('Failed to open backup database.'));
  request.onupgradeneeded = () => {
    const db = request.result;
    const tx = request.transaction;
    let summaryStore: IDBObjectStore | null = null;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
    if (!db.objectStoreNames.contains(SUMMARY_STORE_NAME)) {
      summaryStore = db.createObjectStore(SUMMARY_STORE_NAME, { keyPath: 'id' });
      summaryStore.createIndex('updatedAt', 'updatedAt');
    }
    if (summaryStore && tx && tx.objectStoreNames.contains(STORE_NAME)) {
      const sessionStore = tx.objectStore(STORE_NAME);
      const cursorRequest = sessionStore.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          return;
        }
        summaryStore?.put(toBackupSummary(cursor.value as BackupSessionRecord));
        cursor.continue();
      };
    }
  };
  request.onsuccess = () => resolve(request.result);
});

// Wrap common IndexedDB transaction boilerplate so callers can focus on the request.
const withStore = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
  databaseName: string,
): Promise<T> => {
  const db = await openBackupDb(databaseName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = handler(store);
    let settled = false;

    request.onsuccess = () => {
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error('Backup request failed.'));
    };

    tx.oncomplete = () => {
      db.close();
    };
    tx.onerror = () => {
      db.close();
      if (!settled) {
        reject(tx.error ?? new Error('Backup transaction failed.'));
      }
    };
    tx.onabort = () => {
      db.close();
      if (!settled) {
        reject(tx.error ?? new Error('Backup transaction aborted.'));
      }
    };
  });
};

const withBackupStores = async (
  mode: IDBTransactionMode,
  handler: (stores: { sessions: IDBObjectStore; summaries: IDBObjectStore }) => void,
  databaseName: string,
): Promise<void> => {
  const db = await openBackupDb(databaseName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, SUMMARY_STORE_NAME], mode);
    const stores = {
      sessions: tx.objectStore(STORE_NAME),
      summaries: tx.objectStore(SUMMARY_STORE_NAME),
    };
    let settled = false;
    handler(stores);

    tx.oncomplete = () => {
      db.close();
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    tx.onerror = () => {
      db.close();
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error('Backup transaction failed.'));
      }
    };
    tx.onabort = () => {
      db.close();
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error('Backup transaction aborted.'));
      }
    };
  });
};

const listLegacyBackupSessionsBestEffort = async (databaseName: string): Promise<BackupSessionSummary[]> => {
  try {
    return (await withStore(SUMMARY_STORE_NAME, 'readonly', store => store.getAll(), databaseName)) as BackupSessionSummary[];
  } catch (error) {
    console.warn('Legacy IndexedDB backup summaries are unavailable.', error); // Native disk backups remain authoritative.
    return [];
  }
};

const getLegacyBackupSessionBestEffort = async (id: string, databaseName: string): Promise<BackupSessionRecord | null> => {
  try {
    const record = await withStore(STORE_NAME, 'readonly', store => store.get(id), databaseName);
    return (record as BackupSessionRecord | undefined) ?? null;
  } catch (error) {
    console.warn('Legacy IndexedDB backup data is unavailable.', error); // A corrupt migration source must not hide native backups.
    return null;
  }
};

const deleteLegacyBackupSessionBestEffort = async (id: string, databaseName: string): Promise<void> => {
  try {
    await withBackupStores('readwrite', ({ sessions, summaries }) => {
      sessions.delete(id);
      summaries.delete(id);
    }, databaseName);
  } catch (error) {
    console.warn('Legacy IndexedDB backup cleanup failed.', error); // Native deletion has already completed independently.
  }
};

interface BackupStorage {
  fileMenu: ReturnType<typeof getDesktopFileMenu>;
  databaseName: string;
}

const captureBackupStorage = (): BackupStorage => ({
  fileMenu: getDesktopFileMenu(), databaseName: workspaceStorageKey(DB_NAME),
}); // A logical operation keeps its original project even when a workspace is remounted during an await.

const saveBackupSessionInStorage = async (record: BackupSessionRecord, storage: BackupStorage): Promise<void> => {
  if (hasDesktopBackupBridge(storage.fileMenu)) {
    await writeDesktopBackupBlob(record, storage.fileMenu);
    return;
  }
  if (!record.blob) throw new Error('Backup blob is missing.');
  await withBackupStores('readwrite', ({ sessions, summaries }) => {
    sessions.put(record);
    summaries.put(toBackupSummary(record));
  }, storage.databaseName);
};

export const saveBackupSession = (record: BackupSessionRecord): Promise<void> =>
  saveBackupSessionInStorage(record, captureBackupStorage());

export const saveBackupSessionBinary = async (record: BackupSessionRecord, binary: SnapshotBinary): Promise<void> => {
  const storage = captureBackupStorage();
  if (hasDesktopBackupBridge(storage.fileMenu)) {
    await writeDesktopBackupBinary(record, binary, storage.fileMenu);
    return;
  }
  const blob = record.blob ?? await materializeSnapshotBinaryBlob(binary);
  await saveBackupSessionInStorage({ ...record, size: blob.size, blob }, storage);
};

const listBackupSessionsInStorage = async (storage: BackupStorage): Promise<BackupSessionSummary[]> => {
  if (hasDesktopBackupBridge(storage.fileMenu)) {
    const desktopSessions = await storage.fileMenu!.listSnapshotBackups!();
    const indexedDbSessions = await listLegacyBackupSessionsBestEffort(storage.databaseName);
    const merged = new Map(indexedDbSessions.map(session => [session.id, session]));
    desktopSessions.forEach(session => merged.set(session.id, session)); // Prefer desktop copies when both stores know the id.
    return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const sessions = await withStore(SUMMARY_STORE_NAME, 'readonly', store => store.getAll(), storage.databaseName);
  return (sessions as BackupSessionSummary[]).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const listBackupSessions = (): Promise<BackupSessionSummary[]> => listBackupSessionsInStorage(captureBackupStorage());

export const getBackupSession = async (id: string): Promise<BackupSessionRecord | null> => {
  const storage = captureBackupStorage();
  if (hasDesktopBackupBridge(storage.fileMenu)) {
    const desktopSummary = (await storage.fileMenu!.listSnapshotBackups!()).find(item => item.id === id);
    if (!desktopSummary) return getLegacyBackupSessionBestEffort(id, storage.databaseName);
    const source = await storage.fileMenu!.openBackupSnapshot!({ id });
    return { id, createdAt: desktopSummary.createdAt, updatedAt: desktopSummary.updatedAt,
      fileName: source.fileName, size: source.size, source };
  }
  const record = await withStore(STORE_NAME, 'readonly', store => store.get(id), storage.databaseName);
  return (record as BackupSessionRecord | undefined) ?? null;
};

const deleteBackupSessionInStorage = async (id: string, storage: BackupStorage): Promise<void> => {
  if (hasDesktopBackupBridge(storage.fileMenu)) {
    await storage.fileMenu!.deleteBackupSnapshot!({ id }); // Main uses force deletion, so legacy-only ids are safe.
    await deleteLegacyBackupSessionBestEffort(id, storage.databaseName);
    return;
  }
  await withBackupStores('readwrite', ({ sessions, summaries }) => {
    sessions.delete(id);
    summaries.delete(id);
  }, storage.databaseName);
};

export const deleteBackupSession = (id: string): Promise<void> => deleteBackupSessionInStorage(id, captureBackupStorage());

export const pruneBackupSessions = async (limit: number): Promise<void> => {
  const storage = captureBackupStorage();
  const sessions = await listBackupSessionsInStorage(storage);
  if (sessions.length <= limit) return;
  await Promise.all(sessions.slice(limit).map(session => deleteBackupSessionInStorage(session.id, storage)));
}; // Keep only recent backups, deleting from the same project that supplied the list.
