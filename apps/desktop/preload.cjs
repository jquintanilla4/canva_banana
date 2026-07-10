const { contextBridge, ipcRenderer } = require('electron');
const { createSnapshotOperationBudget } = require('./snapshot-operation-budget.cjs');

const openManageKeysChannel = 'canva-banana:open-manage-keys';
const fileMenuCommandChannel = 'canva-banana:file-menu-command';
const chatHistoryClearedChannel = 'canva-banana:chat-history-cleared';
const maxSnapshotChunkBytes = 16 * 1024 * 1024; // Keep each snapshot IPC message bounded.
const maxSnapshotChunkOperations = 4; // Normal streams await one chunk while hostile bursts are rejected.
const maxSnapshotChunkOperationBytes = maxSnapshotChunkBytes * 2; // Total snapshot size remains independent of concurrent IPC memory.
const maxClipboardTextChars = 1_000_000; // Keep native clipboard IPC bounded to app-sized text.
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get; // Requires a real ArrayBuffer receiver.
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')?.get; // Requires a real typed-array receiver.
const dataViewByteLengthGetter = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength')?.get; // Requires a real DataView receiver.
const snapshotWriteOperationBudget = createSnapshotOperationBudget({
  maxOperations: maxSnapshotChunkOperations,
  maxBytes: maxSnapshotChunkOperationBytes,
  errorMessage: 'Too many snapshot write chunks are already in progress.',
});
const snapshotReadOperationBudget = createSnapshotOperationBudget({
  maxOperations: maxSnapshotChunkOperations,
  maxBytes: maxSnapshotChunkOperationBytes,
  errorMessage: 'Too many snapshot read ranges are already in progress.',
});

const normalizeBaseUrl = (value, fallback) => {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return raw.replace(/\/+$/, ''); // Renderer URL builders expect no trailing slash.
};

const parseRuntimeConfigArgument = () => {
  const prefix = '--canva-banana-runtime-config=';
  const argument = process.argv.find(value => value.startsWith(prefix));
  if (!argument) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(argument.slice(prefix.length), 'base64').toString('utf8'));
  } catch {
    return {}; // Fall back to process env if the main-process argument is malformed.
  }
};

const subscribeToMainChannel = (channel, callback) => {
  if (typeof callback !== 'function') {
    return () => {}; // Ignore invalid renderer subscriptions.
  }
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler); // Let React clean up the listener.
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

const assertNonEmptyString = (value, message) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
};

const assertSnapshotChunkPayload = (payload) => {
  assertNonEmptyString(payload?.writeId, 'Snapshot write session is invalid.');
  const data = payload?.data;
  const byteLength = getSnapshotBinaryByteLength(data);
  if (byteLength === null) {
    throw new Error('Snapshot data must be binary.');
  }
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error('Snapshot data size is invalid.');
  }
  if (byteLength > maxSnapshotChunkBytes) {
    throw new Error('Snapshot data chunk is too large to write safely.');
  }
  return payload;
};

const assertSnapshotWriteIdPayload = (payload) => {
  assertNonEmptyString(payload?.writeId, 'Snapshot write session is invalid.');
  return payload;
};

const assertSnapshotReadRangePayload = (payload) => {
  assertNonEmptyString(payload?.sourceId, 'Snapshot read source is invalid.');
  if (!Number.isFinite(payload?.offset) || payload.offset < 0 || !Number.isFinite(payload?.length) || payload.length < 0) {
    throw new Error('Snapshot byte range is invalid.');
  }
  if (payload.length > maxSnapshotChunkBytes) {
    throw new Error('Snapshot read range is too large.');
  }
  return payload;
};

const assertSnapshotMediaUrlPayload = (payload) => {
  assertNonEmptyString(payload?.sourceId, 'Snapshot read source is invalid.');
  if (!Number.isSafeInteger(payload?.offset) || payload.offset < 0 || !Number.isSafeInteger(payload?.length) || payload.length <= 0) {
    throw new Error('Snapshot media range is invalid.');
  }
  return payload;
};

const assertSnapshotReadSourcePayload = (payload) => {
  assertNonEmptyString(payload?.sourceId, 'Snapshot read source is invalid.');
  return payload;
};

const invokeWithSnapshotBudget = async (budget, bytes, channel, payload) => {
  const releaseOperation = budget.reserve(bytes); // Context isolation stops renderer code from bypassing this IPC gate.
  try {
    return await ipcRenderer.invoke(channel, payload);
  } finally {
    releaseOperation();
  }
};

const assertClipboardText = (text) => {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text must be a string.');
  }
  if (!globalThis.navigator?.userActivation?.isActive) {
    throw new Error('Clipboard writes require an active user action.');
  }
  if (text.length > maxClipboardTextChars) {
    throw new Error('Clipboard text is too large to write safely.');
  }
  return text;
};

const mainRuntimeConfig = parseRuntimeConfigArgument();

const runtimeConfig = {
  isDesktop: true,
  apiKey: undefined, // Secrets come from sync IPC, not launch arguments.
  geminiApiKey: undefined, // Secrets come from sync IPC, not launch arguments.
  secureBackendApiBaseUrl: normalizeBaseUrl(mainRuntimeConfig.secureBackendApiBaseUrl || process.env.SECURE_BACKEND_API_BASE_URL, 'http://localhost:8787'),
  secureBackendMode: mainRuntimeConfig.secureBackendMode,
  secureBackendAuthToken: undefined, // Backend token must not live in process arguments.
  pythonBackendAuthToken: undefined, // Python backend token must not live in process arguments.
  pythonBackendAuthOrigin: undefined, // Auth scoping comes only from sync IPC with main.
  falApiUrl: mainRuntimeConfig.falApiUrl || process.env.FAL_API_URL,
  falModelId: mainRuntimeConfig.falModelId || process.env.FAL_MODEL_ID,
  volcengineApiBaseUrl: normalizeBaseUrl(mainRuntimeConfig.volcengineApiBaseUrl || process.env.VOLCENGINE_API_BASE_URL, 'http://localhost:8000'),
  jimengApiBaseUrl: normalizeBaseUrl(mainRuntimeConfig.jimengApiBaseUrl || process.env.JIMENG_API_BASE_URL, 'http://localhost:8000'),
};

contextBridge.exposeInMainWorld('canvaBananaDesktop', {
  getRuntimeConfig: () => ipcRenderer.sendSync('canva-banana:get-runtime-config') || runtimeConfig, // Keep reloads on fresh main config.
  getServiceStatus: () => ipcRenderer.invoke('canva-banana:get-service-status'), // Let diagnostics read backend startup state.
  getSettingsStatus: () => ipcRenderer.invoke('canva-banana:get-settings-status'), // Expose presence-only saved settings.
  saveSettings: payload => ipcRenderer.invoke('canva-banana:save-settings', payload), // Main process owns secret writes.
  clearSettings: keys => ipcRenderer.invoke('canva-banana:clear-settings', keys), // Remove selected managed keys.
  restartServices: () => ipcRenderer.invoke('canva-banana:restart-services'), // QA can retry local services after edits.
  onOpenManageKeys: callback => subscribeToMainChannel(openManageKeysChannel, callback),
  clipboard: {
    writeText: text => ipcRenderer.invoke('canva-banana:clipboard-write-text', assertClipboardText(text)), // Native writes require a user gesture.
  },
  appIcon: {
    getState: () => ipcRenderer.invoke('canva-banana:app-icon-get-state'), // Main owns icon registry paths.
    setSelected: iconId => ipcRenderer.invoke('canva-banana:app-icon-set-selected', iconId), // Main validates and persists ids.
  },
  fileMenu: {
    onCommand: callback => subscribeToMainChannel(fileMenuCommandChannel, callback),
    setState: state => ipcRenderer.invoke('canva-banana:file-menu-set-state', state), // Sync checked/disabled native items.
    openSnapshotFile: () => ipcRenderer.invoke('canva-banana:file-menu-open-snapshot'), // Native picker keeps macOS menu commands reliable.
    beginSaveSnapshot: payload => ipcRenderer.invoke('canva-banana:file-menu-begin-save-snapshot', payload), // Main owns the save dialog and temp file.
    beginAutosaveSnapshot: payload => ipcRenderer.invoke('canva-banana:file-menu-begin-autosave-snapshot', payload), // Main writes only remembered export paths.
    beginBackupSnapshot: payload => ipcRenderer.invoke('canva-banana:file-menu-begin-backup-snapshot', payload), // Main stores desktop backups on disk.
    writeSnapshotChunk: payload => {
      const safePayload = assertSnapshotChunkPayload(payload);
      return invokeWithSnapshotBudget(snapshotWriteOperationBudget, getSnapshotBinaryByteLength(safePayload.data), 'canva-banana:file-menu-write-snapshot-chunk', safePayload);
    }, // Renderer streams bounded chunks with concurrent backpressure.
    finishSnapshotWrite: payload => ipcRenderer.invoke('canva-banana:file-menu-finish-snapshot-write', assertSnapshotWriteIdPayload(payload)), // Atomic rename happens in main.
    abortSnapshotWrite: payload => ipcRenderer.invoke('canva-banana:file-menu-abort-snapshot-write', assertSnapshotWriteIdPayload(payload)), // Failed exports clean temp files.
    readSnapshotRange: payload => {
      const safePayload = assertSnapshotReadRangePayload(payload);
      return invokeWithSnapshotBudget(snapshotReadOperationBudget, safePayload.length, 'canva-banana:file-menu-read-snapshot-range', safePayload);
    }, // Imports read bounded ranges with concurrent backpressure.
    getSnapshotMediaUrl: payload => ipcRenderer.invoke('canva-banana:file-menu-get-snapshot-media-url', assertSnapshotMediaUrlPayload(payload)), // Media elements stream through a scoped URL.
    retainSnapshotRead: payload => ipcRenderer.invoke('canva-banana:file-menu-retain-snapshot-read', assertSnapshotReadSourcePayload(payload)), // Imported media keeps its read source.
    closeSnapshotRead: payload => ipcRenderer.invoke('canva-banana:file-menu-close-snapshot-read', assertSnapshotReadSourcePayload(payload)), // Release main-side read metadata.
    listSnapshotBackups: () => ipcRenderer.invoke('canva-banana:file-menu-list-snapshot-backups'), // Desktop backups live outside IndexedDB.
    openBackupSnapshot: payload => ipcRenderer.invoke('canva-banana:file-menu-open-backup-snapshot', payload), // Restore a saved backup as a read source.
    deleteBackupSnapshot: payload => ipcRenderer.invoke('canva-banana:file-menu-delete-backup-snapshot', payload), // Remove desktop backup files from disk.
  },
  chatHistory: {
    load: () => ipcRenderer.invoke('canva-banana:load-chat-history'), // App-level prompt chat history persists in main.
    save: snapshot => ipcRenderer.invoke('canva-banana:save-chat-history', snapshot), // Main owns the on-disk cache ({ conversations, folders }).
    onCleared: callback => subscribeToMainChannel(chatHistoryClearedChannel, callback),
  },
});
