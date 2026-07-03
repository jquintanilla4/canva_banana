const { contextBridge, ipcRenderer } = require('electron');

const openManageKeysChannel = 'canva-banana:open-manage-keys';
const fileMenuCommandChannel = 'canva-banana:file-menu-command';
const chatHistoryClearedChannel = 'canva-banana:chat-history-cleared';
const maxSnapshotWriteBytes = 512 * 1024 * 1024; // Mirror main's snapshot write safety cap.
const maxClipboardTextChars = 1_000_000; // Keep native clipboard IPC bounded to app-sized text.
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get; // Requires a real ArrayBuffer receiver.
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')?.get; // Requires a real typed-array receiver.
const dataViewByteLengthGetter = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength')?.get; // Requires a real DataView receiver.

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

const assertSnapshotWritePayload = (payload) => {
  const data = payload?.data;
  const byteLength = getSnapshotBinaryByteLength(data);
  if (byteLength === null) {
    throw new Error('Snapshot data must be binary.');
  }
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error('Snapshot data size is invalid.');
  }
  if (byteLength > maxSnapshotWriteBytes) {
    throw new Error('Snapshot data is too large to write safely.');
  }
  return payload;
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
    saveSnapshotFile: payload => ipcRenderer.invoke('canva-banana:file-menu-save-snapshot', assertSnapshotWritePayload(payload)), // Main owns filesystem writes.
    writeSnapshotFile: payload => ipcRenderer.invoke('canva-banana:file-menu-write-snapshot', assertSnapshotWritePayload(payload)), // Main writes only previously exported paths.
  },
  chatHistory: {
    load: () => ipcRenderer.invoke('canva-banana:load-chat-history'), // App-level prompt chat history persists in main.
    save: snapshot => ipcRenderer.invoke('canva-banana:save-chat-history', snapshot), // Main owns the on-disk cache ({ conversations, folders }).
    onCleared: callback => subscribeToMainChannel(chatHistoryClearedChannel, callback),
  },
});
