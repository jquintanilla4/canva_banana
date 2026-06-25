import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DESKTOP_SETTING_KEYS,
  REQUIRED_DESKTOP_SETTING_KEYS,
  SECRET_DESKTOP_SETTING_KEYS,
  applyDesktopSettings,
  parseDotenvEntry,
  readDesktopSettingsFile,
  writeDesktopSettingsFileAtomic,
} from './settings-env.mjs';
import { resolveSecureBackendRuntime, shouldUseExternalSecureBackend } from './secure-backend-runtime.mjs';
import { getDevRendererUrl, isAllowedAudioPermissionRequest } from './security.mjs';

app.setName('The Institute');

const currentFilePath = fileURLToPath(import.meta.url);
const desktopDir = dirname(currentFilePath);
const repoRoot = resolve(desktopDir, '../..');
const webDistDir = resolve(repoRoot, 'apps/web/dist');
const preloadPath = join(desktopDir, 'preload.cjs');
const devRendererUrl = getDevRendererUrl(process.env, app.isPackaged);
const openManageKeysChannel = 'canva-banana:open-manage-keys';
const desktopAuthToken = randomBytes(32).toString('base64url'); // Per-launch secret for desktop-only backend calls.
const serviceStatus = {
  secureBackend: { state: 'stopped' },
  pythonBackend: { state: 'stopped' },
};
const managedChildren = new Set();
let managedSecureBackendServer = null;
let mainWindow = null;
let runtimeConfig = null;

const normalizeBaseUrl = (value) => value.replace(/\/+$/, ''); // Renderer URL builders expect no trailing slash.

const getUrlOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return undefined; // Invalid runtime URLs must not receive managed backend tokens.
  }
};

const setServiceStatus = (serviceName, patch) => {
  serviceStatus[serviceName] = {
    ...serviceStatus[serviceName],
    ...patch,
    updatedAt: new Date().toISOString(),
  }; // Keep diagnostics cheap to expose through preload.
};

const getServiceStatusSnapshot = () => JSON.parse(JSON.stringify(serviceStatus)); // Avoid leaking mutable main-process objects.

const getDesktopSettingsPath = () => join(app.getPath('userData'), '.env.local'); // QA-managed settings live in App Support.

const migrateLegacyDesktopSettings = async () => {
  if (!app.isPackaged) {
    return; // Dev mode reads repo env files instead.
  }
  const nextPath = getDesktopSettingsPath();
  const legacyPath = join(app.getPath('appData'), 'Canva Banana', '.env.local');
  if (!existsSync(nextPath) && existsSync(legacyPath)) {
    await mkdir(dirname(nextPath), { recursive: true });
    await copyFile(legacyPath, nextPath); // Preserve QA keys from the working-name App Support folder.
  }
};

const hasEnvValue = (key) => typeof process.env[key] === 'string' && process.env[key].trim().length > 0;

const buildSettingsStatus = () => {
  const fields = Object.fromEntries(DESKTOP_SETTING_KEYS.map(key => ([
    key,
    {
      present: hasEnvValue(key),
      required: REQUIRED_DESKTOP_SETTING_KEYS.includes(key),
      secret: SECRET_DESKTOP_SETTING_KEYS.includes(key),
    },
  ])));
  const missingKeys = REQUIRED_DESKTOP_SETTING_KEYS.filter(key => !hasEnvValue(key));
  return {
    configPath: getDesktopSettingsPath(),
    fields,
    missingKeys,
    isPackaged: app.isPackaged,
    serviceStatus: getServiceStatusSnapshot(),
  };
};

const refreshRuntimeConfig = (serviceUrls) => {
  runtimeConfig = buildRuntimeConfig(serviceUrls); // Keep preload sync reads aligned with restarted services.
  return runtimeConfig;
};

const loadEnvFile = (envPath) => {
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const parsed = parseDotenvEntry(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value; // Exported shell values should always win over dotenv files.
    }
  }
};

const loadDesktopEnv = () => {
  if (app.isPackaged) {
    loadEnvFile(join(app.getPath('userData'), '.env.local')); // Packaged builds only read user app data env.
    return;
  }
  loadEnvFile(resolve(repoRoot, '.env.local'));
  loadEnvFile(resolve(repoRoot, '.env'));
};

const getAvailablePort = (host) => new Promise((resolvePort, rejectPort) => {
  const server = createServer();
  server.unref();
  server.on('error', rejectPort);
  server.listen(0, host, () => {
    const address = server.address();
    server.close(() => {
      if (address && typeof address === 'object') {
        resolvePort(address.port);
        return;
      }
      rejectPort(new Error('Could not resolve an available local port'));
    });
  });
});

const getConfiguredOrAvailablePort = async (envKey, host) => {
  const configuredPort = Number(process.env[envKey]);
  return Number.isInteger(configuredPort) && configuredPort > 0
    ? configuredPort
    : getAvailablePort(host); // Packaged services avoid fixed localhost ports by default.
};

const waitForHealth = async (label, healthUrl, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the backend binds or the timeout expires.
    }
    await delay(350);
  }
  throw new Error(`${label} did not become healthy at ${healthUrl}`);
};

const getRendererRootDir = () => (
  app.isPackaged ? join(process.resourcesPath, 'web') : webDistDir
);

const getRendererUrl = () => {
  if (devRendererUrl) {
    return devRendererUrl; // Dev mode loads Vite for fast iteration.
  }
  const indexPath = join(getRendererRootDir(), 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error('Missing web build. Run `npm run build:web` before desktop production start.');
  }
  return pathToFileURL(indexPath).toString(); // Packaged mode can load built local assets.
};

const isAllowedNavigationUrl = (targetUrl) => {
  try {
    const parsedTargetUrl = new URL(targetUrl);
    if (devRendererUrl) {
      const parsedDevUrl = new URL(devRendererUrl);
      return parsedTargetUrl.origin === parsedDevUrl.origin; // Dev renderer trust is origin-based, not prefix-based.
    }
    const rendererRootUrl = new URL(pathToFileURL(getRendererRootDir()).toString());
    const rendererRootPath = rendererRootUrl.pathname.endsWith('/') ? rendererRootUrl.pathname : `${rendererRootUrl.pathname}/`;
    return parsedTargetUrl.protocol === 'file:' && parsedTargetUrl.pathname.startsWith(rendererRootPath);
  } catch {
    return false; // Malformed URLs should never navigate the privileged window.
  }
};

const isExternalOpenUrl = (targetUrl) => {
  try {
    const parsedUrl = new URL(targetUrl);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:'; // Only normal browser links leave Electron.
  } catch {
    return false;
  }
};

const getSecureBackendModuleUrl = () => (
  app.isPackaged
    ? pathToFileURL(join(app.getAppPath(), 'generated/secure-backend/server.mjs')).toString()
    : pathToFileURL(resolve(repoRoot, 'apps/secure-backend/src/server.mjs')).toString()
);

const startSecureBackend = async () => {
  const host = process.env.NODE_BACKEND_HOST?.trim() || '127.0.0.1';
  const port = await getConfiguredOrAvailablePort('NODE_BACKEND_PORT', host);
  const url = normalizeBaseUrl(`http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`);
  setServiceStatus('secureBackend', { state: 'starting', url, mode: 'managed', urlSource: 'managed', authTokenActive: true });
  try {
    const { createSecureBackendServer } = await import(getSecureBackendModuleUrl());
    const env = {
      ...process.env,
      NODE_BACKEND_HOST: host,
      NODE_BACKEND_PORT: String(port),
      CANVA_BANANA_DESKTOP_AUTH_TOKEN: desktopAuthToken,
    };
    managedSecureBackendServer = createSecureBackendServer({ env });
    await new Promise((resolveListen, rejectListen) => {
      managedSecureBackendServer.once('error', rejectListen);
      managedSecureBackendServer.listen(port, host, resolveListen);
    });
    await waitForHealth('secure backend', `${url}/health`, 10000);
    setServiceStatus('secureBackend', { state: 'ready', url, mode: 'managed', urlSource: 'managed', authTokenActive: true });
  } catch (error) {
    setServiceStatus('secureBackend', {
      state: 'unavailable',
      url,
      mode: 'managed',
      urlSource: 'managed',
      authTokenActive: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return url;
};

const getPackagedPythonExecutablePath = () => join(
  process.resourcesPath,
  'python-backend',
  'canva-banana-python-backend',
);

const startPythonBackend = async () => {
  const host = process.env.CANVA_BANANA_PYTHON_HOST?.trim() || '127.0.0.1';
  const port = await getConfiguredOrAvailablePort('CANVA_BANANA_PYTHON_PORT', host);
  const url = normalizeBaseUrl(`http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`);
  const userDataDir = app.getPath('userData');
  const env = {
    ...process.env,
    CANVA_BANANA_ENV_DIR: userDataDir,
    CANVA_BANANA_DESKTOP_AUTH_TOKEN: desktopAuthToken,
    CANVA_BANANA_PYTHON_HOST: host,
    CANVA_BANANA_PYTHON_PORT: String(port),
    JIMENG_WORK_DIR: process.env.JIMENG_WORK_DIR || join(userDataDir, 'jimeng-work'),
  };
  const command = app.isPackaged ? getPackagedPythonExecutablePath() : 'uv';
  const args = app.isPackaged
    ? []
    : [
        'run',
        '--project',
        resolve(repoRoot, 'apps/python-backend/backend'),
        'uvicorn',
        'uvpython_service.main:app',
        '--app-dir',
        resolve(repoRoot, 'apps/python-backend/backend/src'),
        '--host',
        host,
        '--port',
        String(port),
      ];
  setServiceStatus('pythonBackend', { state: 'starting', url });
  if (app.isPackaged && !existsSync(command)) {
    setServiceStatus('pythonBackend', { state: 'unavailable', url, error: `Missing executable at ${command}` });
    return url;
  }
  try {
    const child = spawn(command, args, {
      cwd: app.isPackaged ? userDataDir : repoRoot,
      env,
      stdio: app.isPackaged ? 'ignore' : 'inherit',
    });
    managedChildren.add(child);
    child.on('exit', code => {
      managedChildren.delete(child);
      if (serviceStatus.pythonBackend.state === 'ready') {
        setServiceStatus('pythonBackend', { state: 'unavailable', url, error: `Exited with code ${code ?? 'unknown'}` });
      }
    });
    child.on('error', error => {
      managedChildren.delete(child);
      setServiceStatus('pythonBackend', { state: 'unavailable', url, error: error.message });
    });
    await waitForHealth('python backend', `${url}/health`, app.isPackaged ? 45000 : 60000);
    setServiceStatus('pythonBackend', { state: 'ready', url });
  } catch (error) {
    setServiceStatus('pythonBackend', {
      state: 'unavailable',
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return url;
};

const startManagedServices = async () => {
  if (devRendererUrl) {
    const secureBackendRuntime = resolveSecureBackendRuntime({
      isPackaged: app.isPackaged,
      hasDevRenderer: true,
      env: process.env,
      managedUrl: 'http://localhost:8787',
      desktopAuthToken,
    });
    setServiceStatus('secureBackend', {
      state: 'external',
      url: secureBackendRuntime.url,
      mode: secureBackendRuntime.mode,
      urlSource: secureBackendRuntime.urlSource,
      authTokenActive: secureBackendRuntime.authTokenActive,
    });
    setServiceStatus('pythonBackend', { state: 'external', url: normalizeBaseUrl(process.env.VOLCENGINE_API_BASE_URL || 'http://localhost:8000') });
    return {
      secureBackendUrl: secureBackendRuntime.url,
      pythonBackendUrl: normalizeBaseUrl(process.env.VOLCENGINE_API_BASE_URL || 'http://localhost:8000'),
      pythonBackendAuthOrigin: undefined,
    };
  }
  if (shouldUseExternalSecureBackend({ isPackaged: app.isPackaged, hasDevRenderer: false, env: process.env })) {
    const secureBackendRuntime = resolveSecureBackendRuntime({
      isPackaged: app.isPackaged,
      hasDevRenderer: false,
      env: process.env,
      managedUrl: 'http://localhost:8787',
      desktopAuthToken,
    });
    const pythonBackendUrl = await startPythonBackend();
    setServiceStatus('secureBackend', {
      state: 'external',
      url: secureBackendRuntime.url,
      mode: secureBackendRuntime.mode,
      urlSource: secureBackendRuntime.urlSource,
      authTokenActive: secureBackendRuntime.authTokenActive,
    });
    return { secureBackendUrl: secureBackendRuntime.url, pythonBackendUrl, pythonBackendAuthOrigin: getUrlOrigin(pythonBackendUrl) };
  }
  const [secureBackendUrl, pythonBackendUrl] = await Promise.all([
    startSecureBackend(),
    startPythonBackend(),
  ]);
  return { secureBackendUrl, pythonBackendUrl, pythonBackendAuthOrigin: getUrlOrigin(pythonBackendUrl) };
};

const buildRuntimeConfig = ({ secureBackendUrl, pythonBackendUrl, pythonBackendAuthOrigin }) => {
  const secureBackendRuntime = resolveSecureBackendRuntime({
    isPackaged: app.isPackaged,
    hasDevRenderer: Boolean(devRendererUrl),
    env: process.env,
    managedUrl: secureBackendUrl,
    desktopAuthToken,
  });
  return {
    isDesktop: true,
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
    secureBackendApiBaseUrl: secureBackendRuntime.url,
    secureBackendMode: secureBackendRuntime.mode,
    falApiUrl: process.env.FAL_API_URL,
    falModelId: process.env.FAL_MODEL_ID,
    secureBackendAuthToken: secureBackendRuntime.authToken,
    pythonBackendAuthToken: pythonBackendAuthOrigin ? desktopAuthToken : undefined,
    pythonBackendAuthOrigin,
    volcengineApiBaseUrl: normalizeBaseUrl(process.env.VOLCENGINE_API_BASE_URL || pythonBackendUrl),
    jimengApiBaseUrl: normalizeBaseUrl(process.env.JIMENG_API_BASE_URL || pythonBackendUrl),
  };
};

const buildRuntimeConfigLaunchArgument = () => ({
  isDesktop: runtimeConfig?.isDesktop,
  secureBackendApiBaseUrl: runtimeConfig?.secureBackendApiBaseUrl,
  secureBackendMode: runtimeConfig?.secureBackendMode,
  falApiUrl: runtimeConfig?.falApiUrl,
  falModelId: runtimeConfig?.falModelId,
  volcengineApiBaseUrl: runtimeConfig?.volcengineApiBaseUrl,
  jimengApiBaseUrl: runtimeConfig?.jimengApiBaseUrl,
}); // Keep process arguments free of API keys and auth tokens.

const encodeRuntimeConfigArgument = () => {
  const encoded = Buffer.from(JSON.stringify(buildRuntimeConfigLaunchArgument()), 'utf8').toString('base64');
  return `--canva-banana-runtime-config=${encoded}`; // Preload uses this only as a non-secret fallback.
};

const waitForChildExit = (child) => new Promise(resolveExit => {
  let settled = false;
  const finish = () => {
    if (!settled) {
      settled = true;
      resolveExit();
    }
  };
  child.once('exit', finish);
  setTimeout(finish, 2500).unref();
});

const stopManagedServices = async () => {
  setServiceStatus('secureBackend', { state: 'stopping' });
  setServiceStatus('pythonBackend', { state: 'stopping' });
  const childExits = [];
  for (const child of managedChildren) {
    childExits.push(waitForChildExit(child));
    child.kill('SIGTERM'); // Give packaged child processes a normal shutdown signal.
  }
  managedChildren.clear();
  await Promise.all(childExits);
  if (managedSecureBackendServer) {
    await new Promise(resolveClose => managedSecureBackendServer.close(resolveClose));
    managedSecureBackendServer = null;
  }
  setServiceStatus('secureBackend', { state: 'stopped' });
  setServiceStatus('pythonBackend', { state: 'stopped' });
};

const restartManagedServices = async () => {
  await stopManagedServices();
  const serviceUrls = await startManagedServices();
  refreshRuntimeConfig(serviceUrls);
  return getServiceStatusSnapshot();
};

const sendOpenManageKeys = (targetWindow) => {
  const send = () => {
    if (!targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
      targetWindow.webContents.send(openManageKeysChannel); // Ask React to open the existing styled modal.
    }
  };
  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once('did-finish-load', () => setTimeout(send, 100).unref()); // Let renderer effects subscribe.
    return;
  }
  send();
};

const openManageKeysFromMenu = async () => {
  const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : await createMainWindow();
  if (targetWindow.isMinimized()) {
    targetWindow.restore(); // Bring hidden/minimized windows back before opening the modal.
  }
  targetWindow.show();
  targetWindow.focus();
  sendOpenManageKeys(targetWindow);
};

const installApplicationMenu = () => {
  if (process.platform !== 'darwin') {
    return; // Only macOS has the application menu.
  }
  const template = [
    {
      label: app.name,
      submenu: [
        { label: 'Manage Keys...', click: () => void openManageKeysFromMenu() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template)); // Replace Electron's default with the QA key entry.
};

const createMainWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: 'The Institute',
    backgroundColor: '#1f2937',
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 18, y: 18 },
    } : {}), // Hide the macOS titlebar while keeping native traffic lights.
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [encodeRuntimeConfigArgument()],
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url); // External auth/help links should leave the app sandbox.
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url)) {
      event.preventDefault(); // Prevent unexpected renderer-initiated top-level navigation.
    }
  });

  await mainWindow.loadURL(getRendererUrl());
  mainWindow.on('closed', () => {
    mainWindow = null; // Avoid sending menu events to a stale BrowserWindow.
  });
  return mainWindow;
};

app.whenReady().then(async () => {
  await migrateLegacyDesktopSettings();
  loadDesktopEnv();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(webContents === mainWindow?.webContents && isAllowedAudioPermissionRequest(permission, details)); // Trust only the app window's microphone requests.
  });

  refreshRuntimeConfig(await startManagedServices());
  installApplicationMenu();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(); // macOS reopens a window when the dock icon is clicked.
    }
  });
});

ipcMain.on('canva-banana:get-runtime-config', event => {
  event.returnValue = runtimeConfig ?? {}; // Preload needs a synchronous snapshot during renderer startup.
});

ipcMain.handle('canva-banana:get-service-status', () => getServiceStatusSnapshot());

ipcMain.handle('canva-banana:get-settings-status', () => buildSettingsStatus());

ipcMain.handle('canva-banana:restart-services', async () => {
  await restartManagedServices();
  return buildSettingsStatus();
});

ipcMain.handle('canva-banana:clear-settings', async (event, keys) => {
  const content = await readDesktopSettingsFile(getDesktopSettingsPath());
  const { content: nextContent } = applyDesktopSettings(content, { clears: Array.isArray(keys) ? keys : [] });
  await writeDesktopSettingsFileAtomic(getDesktopSettingsPath(), nextContent);
  for (const key of Array.isArray(keys) ? keys : []) {
    if (DESKTOP_SETTING_KEYS.includes(key)) {
      delete process.env[key]; // Cleared values should disappear from restarted services.
    }
  }
  await restartManagedServices();
  const status = buildSettingsStatus();
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  setTimeout(() => targetWindow?.webContents.reload(), 150).unref();
  return status;
});

ipcMain.handle('canva-banana:save-settings', async (event, payload) => {
  const updates = payload && typeof payload === 'object' ? payload : {};
  const content = await readDesktopSettingsFile(getDesktopSettingsPath());
  const { content: nextContent, values } = applyDesktopSettings(content, { updates });
  await writeDesktopSettingsFileAtomic(getDesktopSettingsPath(), nextContent);
  for (const key of DESKTOP_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && typeof updates[key] === 'string' && updates[key].trim()) {
      process.env[key] = values[key]; // Saved values should affect the restart immediately.
    }
  }
  await restartManagedServices();
  const status = buildSettingsStatus();
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  setTimeout(() => targetWindow?.webContents.reload(), 150).unref();
  return status;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit(); // Match standard non-macOS app lifecycle.
  }
});

app.on('before-quit', () => {
  void stopManagedServices(); // Stop local backends when Electron is exiting.
});
