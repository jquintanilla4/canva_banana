import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import electronPath from 'electron';
import {
  DEV_SERVICE_HEALTH_PROBE_HEADER,
  DEV_SERVICE_HEALTH_PROBE_VALUE,
  DEV_SERVICE_HEALTH_TOKEN_ENV,
  DEV_SERVICE_HEALTH_TOKEN_HEADER,
  SECURE_BACKEND_REQUIRED_CAPABILITIES,
  SECURE_BACKEND_REQUIRED_READINESS_KEYS,
  buildSecureBackendConfigState,
  canonicalWorkspaceRoot,
  resolveDevServiceHealthToken,
  validateReusableServiceHealth,
} from './dev-service-health.mjs';

const processes = new Set();
const WEB_URL = 'http://localhost:3000';
const SECURE_BACKEND_HEALTH_URL = 'http://localhost:8787/health';
const PYTHON_BACKEND_HEALTH_URL = 'http://localhost:8000/health';
const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = canonicalWorkspaceRoot(fileURLToPath(new URL('../../..', import.meta.url)));
const pythonBackendUvCacheDir = join(repoRoot, 'apps/python-backend/backend/.uv-cache'); // Keep uv dev cache inside the repo.
const devServiceHealthToken = resolveDevServiceHealthToken(repoRoot, process.env); // Stable per-workspace token for dev reuse.

const spawnManaged = (label, command, args, options = {}) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });
  processes.add(child);
  child.on('exit', code => {
    processes.delete(child);
    if (code !== 0 && !shuttingDown) {
      console.error(`${label} exited with code ${code ?? 'unknown'}`);
      shutdown(code ?? 1);
    }
  });
  child.on('error', error => {
    processes.delete(child);
    if (!shuttingDown) {
      console.error(`${label} failed to start: ${error.message}`);
      shutdown(1);
    }
  });
  return child;
};

let shuttingDown = false;

const shutdown = code => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of processes) {
    child.kill('SIGTERM'); // Give every dev service a normal shutdown signal.
  }
  process.exitCode = code;
};

const waitForHttp = async (label, url, timeoutMs = 60000) => {
  const startedAt = Date.now();
  while (!shuttingDown && Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the service has bound its port.
    }
    await delay(500);
  }
  if (shuttingDown) {
    throw new Error(`${label} startup stopped before it became healthy`);
  }
  throw new Error(`${label} did not become healthy at ${url}`);
};

const isHttpHealthy = async url => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000); // Keep probes from delaying startup.
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const probeReusableServiceHealth = async (url, token) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000); // Keep occupied-port checks quick.
  try {
    const response = await fetch(url, {
      headers: {
        [DEV_SERVICE_HEALTH_PROBE_HEADER]: DEV_SERVICE_HEALTH_PROBE_VALUE,
        [DEV_SERVICE_HEALTH_TOKEN_HEADER]: token,
      },
      signal: controller.signal,
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildSecureBackendReuseExpectation = () => {
  const configState = buildSecureBackendConfigState(repoRoot, process.env);
  return {
    service: 'canva-banana-secure-backend',
    workspaceRoot: repoRoot,
    requiredCapabilities: SECURE_BACKEND_REQUIRED_CAPABILITIES,
    requiredReadiness: Object.fromEntries(SECURE_BACKEND_REQUIRED_READINESS_KEYS.map(key => [key, configState.readiness[key]])),
    auth: { desktopTokenRequired: false },
    configState,
  };
};

const tryReuseSecureBackend = async () => {
  const payload = await probeReusableServiceHealth(SECURE_BACKEND_HEALTH_URL, devServiceHealthToken);
  const validation = validateReusableServiceHealth(payload, buildSecureBackendReuseExpectation());
  if (validation.ok) {
    console.log(`Reusing secure backend at ${SECURE_BACKEND_HEALTH_URL}`);
    return true;
  }
  throw new Error(`secure backend is already running at ${SECURE_BACKEND_HEALTH_URL}, but it is not safely reusable: ${validation.reason}. Stop that process before running npm run dev:desktop.`);
};

const startOwnedService = async (label, url, command, args, options = {}) => {
  if (await isHttpHealthy(url)) {
    if (options.reuseIfSafe) {
      return options.reuseIfSafe();
    }
    throw new Error(`${label} is already running at ${url}. Stop that process before running npm run dev:desktop so Electron uses services started by this launcher.`);
  }
  spawnManaged(label, command, args, options.spawnOptions);
  return false;
};

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
  await startOwnedService('web renderer', WEB_URL, 'npm', ['-w', '@canva-banana/web', 'run', 'dev']);
  await startOwnedService('secure backend', SECURE_BACKEND_HEALTH_URL, 'npm', ['-w', '@canva-banana/secure-backend', 'run', 'dev'], {
    reuseIfSafe: tryReuseSecureBackend,
    spawnOptions: {
      env: {
        [DEV_SERVICE_HEALTH_TOKEN_ENV]: devServiceHealthToken,
      },
    },
  });
  await startOwnedService('python backend', PYTHON_BACKEND_HEALTH_URL, 'npm', ['-w', '@canva-banana/python-backend', 'run', 'dev'], {
    spawnOptions: {
      env: {
        UV_CACHE_DIR: process.env.UV_CACHE_DIR || pythonBackendUvCacheDir,
      },
    },
  });

  await waitForHttp('web renderer', WEB_URL);
  await waitForHttp('secure backend', SECURE_BACKEND_HEALTH_URL);
  await waitForHttp('python backend', PYTHON_BACKEND_HEALTH_URL);

  const electron = spawnManaged('electron', electronPath, ['.'], {
    cwd: desktopDir,
    env: {
      ELECTRON_RENDERER_URL: WEB_URL,
      SECURE_BACKEND_API_BASE_URL: 'http://localhost:8787',
      VOLCENGINE_API_BASE_URL: 'http://localhost:8000',
      JIMENG_API_BASE_URL: 'http://localhost:8000',
    },
  });

  electron.on('exit', code => shutdown(code ?? 0));
} catch (error) {
  if (!shuttingDown) {
    console.error(error instanceof Error ? error.message : String(error));
    shutdown(1);
  }
}
