import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ICON_RESOURCE_DIR_NAME, getAppIconResourceSpecs } from '../app-icon-store.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFilePath);
const desktopDir = resolve(scriptsDir, '..');
const repoRoot = resolve(desktopDir, '../..');
const webDistDir = resolve(repoRoot, 'apps/web/dist');
const pythonDistDir = resolve(repoRoot, 'apps/python-backend/dist/canva-banana-python-backend');
const secureBackendSourcePath = resolve(repoRoot, 'apps/secure-backend/src/server.mjs');
const webResourceDir = resolve(desktopDir, 'resources/web');
const pythonResourceDir = resolve(desktopDir, 'resources/python-backend');
const appIconResourceDir = resolve(desktopDir, 'resources', APP_ICON_RESOURCE_DIR_NAME);
const generatedSecureBackendPath = resolve(desktopDir, 'generated/secure-backend/server.mjs');

const run = (label, command, args, extraEnv = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  child.on('error', rejectRun);
  child.on('exit', code => {
    if (code === 0) {
      resolveRun();
      return;
    }
    rejectRun(new Error(`${label} exited with code ${code ?? 'unknown'}`));
  });
});

const resetDir = async (dir) => {
  await rm(dir, { recursive: true, force: true }); // Remove stale files before staging resources.
  await mkdir(dir, { recursive: true }); // Recreate the resource root for recursive copies.
};

await run('web build', 'npm', ['-w', '@canva-banana/web', 'run', 'build'], { CANVA_BANANA_DESKTOP_PACKAGE: '1' });
await run('python backend build', 'npm', ['-w', '@canva-banana/python-backend', 'run', 'build:packaged-backend']);

if (!existsSync(resolve(webDistDir, 'index.html'))) {
  throw new Error('Web build did not produce apps/web/dist/index.html');
}
if (!existsSync(resolve(pythonDistDir, 'canva-banana-python-backend'))) {
  throw new Error('PyInstaller did not produce the packaged Python backend executable');
}

await resetDir(webResourceDir);
await resetDir(pythonResourceDir);
await resetDir(appIconResourceDir);
await mkdir(dirname(generatedSecureBackendPath), { recursive: true });
await cp(webDistDir, webResourceDir, { recursive: true });
await cp(pythonDistDir, pythonResourceDir, { recursive: true });
await cp(secureBackendSourcePath, generatedSecureBackendPath);
for (const spec of getAppIconResourceSpecs(desktopDir)) {
  await cp(spec.sourcePath, resolve(appIconResourceDir, spec.resourceFileName)); // Keep packaged icon names stable for the registry.
}
