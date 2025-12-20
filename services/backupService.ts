export type BackupSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  fileName: string;
  size: number;
  blob: Blob;
};

export type BackupSessionSummary = Omit<BackupSessionRecord, 'blob'>;

const DB_NAME = 'banana-canvas-backups';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

// Open (or create) the local backup database used for autosave sessions.
const openBackupDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is not available in this browser.'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => reject(request.error ?? new Error('Failed to open backup database.'));
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
  };
  request.onsuccess = () => resolve(request.result);
});

// Wrap common IndexedDB transaction boilerplate so callers can focus on the request.
const withStore = async <T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openBackupDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
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

export const saveBackupSession = async (record: BackupSessionRecord): Promise<void> => {
  await withStore('readwrite', store => store.put(record));
};

export const listBackupSessions = async (): Promise<BackupSessionSummary[]> => {
  const sessions = await withStore('readonly', store => store.getAll());
  return (sessions as BackupSessionRecord[])
    .map(({ blob, ...summary }) => summary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getBackupSession = async (id: string): Promise<BackupSessionRecord | null> => {
  const record = await withStore('readonly', store => store.get(id));
  return (record as BackupSessionRecord | undefined) ?? null;
};

export const deleteBackupSession = async (id: string): Promise<void> => {
  await withStore('readwrite', store => store.delete(id));
};

// Keep only the most recent backup sessions to avoid unbounded storage growth.
export const pruneBackupSessions = async (limit: number): Promise<void> => {
  const sessions = await listBackupSessions();
  if (sessions.length <= limit) {
    return;
  }
  const staleSessions = sessions.slice(limit);
  await Promise.all(staleSessions.map(session => deleteBackupSession(session.id)));
};
