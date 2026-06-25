import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import electronPath from 'electron';

const processes = new Set();
const WEB_URL = 'http://localhost:3000';
const SECURE_BACKEND_HEALTH_URL = 'http://localhost:8787/health';
const PYTHON_BACKEND_HEALTH_URL = 'http://localhost:8000/health';
const desktopDir = fileURLToPath(new URL('..', import.meta.url));

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

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
  spawnManaged('secure backend', 'npm', ['-w', '@canva-banana/secure-backend', 'run', 'dev']);
  spawnManaged('python backend', 'npm', ['-w', '@canva-banana/python-backend', 'run', 'dev']);
  spawnManaged('web renderer', 'npm', ['-w', '@canva-banana/web', 'run', 'dev']);

  await waitForHttp('secure backend', SECURE_BACKEND_HEALTH_URL);
  await waitForHttp('python backend', PYTHON_BACKEND_HEALTH_URL);
  await waitForHttp('web renderer', WEB_URL);

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
