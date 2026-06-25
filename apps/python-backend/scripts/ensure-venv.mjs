// Self-heals the uv-managed backend virtualenv before dev/test commands.
//
// uv venvs are NOT relocatable: console-script shebangs (e.g. bin/uvicorn) and
// internal paths hard-code the venv's absolute location. When the repo or the
// `apps/python-backend` package is moved/cloned to a new path, the old `.venv`
// becomes poisoned — the interpreter symlink may still resolve, so `uv sync`
// considers the env "in sync" and never rewrites the stale shebangs, yet
// `uv run uvicorn` fails with "Failed to spawn: No such file or directory".
//
// This script detects that mismatch (plus a missing/broken venv) and recreates
// the venv from scratch, then runs `uv sync` so deps match the lockfile.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = join(pkgDir, 'backend');
const venvDir = join(projectDir, '.venv');
const venvPython = join(venvDir, 'bin', 'python'); // POSIX layout (macOS/Linux dev).
// A representative console script whose shebang reveals the path the venv was built for.
const sentinelScript = join(venvDir, 'bin', 'uvicorn');

const venvIsHealthy = () => {
  if (!existsSync(venvPython) || !existsSync(sentinelScript)) {
    return false;
  }
  try {
    const shebang = readFileSync(sentinelScript, 'utf8').split('\n', 1)[0] ?? '';
    // Stale shebangs point the interpreter at the venv's old absolute location.
    return shebang.includes(venvPython);
  } catch {
    return false;
  }
};

if (!venvIsHealthy()) {
  console.log('[ensure-venv] backend venv missing or relocated — recreating.');
  rmSync(venvDir, { recursive: true, force: true });
}

const result = spawnSync('uv', ['sync', '--project', projectDir], {
  stdio: 'inherit',
  cwd: pkgDir,
});

if (result.error) {
  console.error('[ensure-venv] failed to run `uv sync`:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
