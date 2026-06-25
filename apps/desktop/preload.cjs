const { contextBridge, ipcRenderer } = require('electron');

const openManageKeysChannel = 'canva-banana:open-manage-keys';

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
  onOpenManageKeys: callback => {
    if (typeof callback !== 'function') {
      return () => {}; // Ignore invalid renderer subscriptions.
    }
    const handler = () => callback();
    ipcRenderer.on(openManageKeysChannel, handler);
    return () => ipcRenderer.removeListener(openManageKeysChannel, handler); // Let React clean up the listener.
  },
});
