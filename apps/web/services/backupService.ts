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
const SUMMARY_STORE_NAME = 'sessionSummaries';
const DB_VERSION = 2;

const toBackupSummary = ({ blob: _blob, ...summary }: BackupSessionRecord): BackupSessionSummary => summary;

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
): Promise<T> => {
  const db = await openBackupDb();
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
): Promise<void> => {
  const db = await openBackupDb();
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

export const saveBackupSession = async (record: BackupSessionRecord): Promise<void> => {
  await withBackupStores('readwrite', ({ sessions, summaries }) => {
    sessions.put(record);
    summaries.put(toBackupSummary(record));
  });
};

export const listBackupSessions = async (): Promise<BackupSessionSummary[]> => {
  const sessions = await withStore(SUMMARY_STORE_NAME, 'readonly', store => store.getAll());
  return (sessions as BackupSessionSummary[])
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getBackupSession = async (id: string): Promise<BackupSessionRecord | null> => {
  const record = await withStore(STORE_NAME, 'readonly', store => store.get(id));
  return (record as BackupSessionRecord | undefined) ?? null;
};

export const deleteBackupSession = async (id: string): Promise<void> => {
  await withBackupStores('readwrite', ({ sessions, summaries }) => {
    sessions.delete(id);
    summaries.delete(id);
  });
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
