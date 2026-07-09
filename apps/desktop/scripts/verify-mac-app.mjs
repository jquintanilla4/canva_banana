import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arch as getHostArch } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSingleConcreteArch,
  expectedFileArchitectureForTarget,
  getFlagValue,
  getMacAppPath,
} from './mac-package-targets.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFilePath);
const desktopDir = resolve(scriptsDir, '..');
const repoRoot = resolve(desktopDir, '../..');
const cliArgs = process.argv.slice(2);

const targetArch = getFlagValue(cliArgs, ['--arch', '-a']) ?? process.env.npm_config_arch ?? getHostArch();
const targetPlatform = getFlagValue(cliArgs, ['--platform', '-p']) ?? process.env.npm_config_platform ?? process.platform;

const run = (label, command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
};

const runElectronLoaderCheck = () => {
  const result = spawnSync(executablePath, ['-e', ''], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  if (result.status !== 0) {
    throw new Error(`Electron loader check failed:\n${result.stderr || result.stdout}`);
  }
};

if (process.platform !== 'darwin' || targetPlatform !== 'darwin') {
  console.log('Skipping macOS app verification for non-macOS host or target.');
  process.exit(0);
}

assertSingleConcreteArch(targetArch);

const appPath = getMacAppPath(repoRoot, targetPlatform, targetArch);
const executablePath = resolve(appPath, 'Contents/MacOS/TheInstitute');
const infoPlistPath = resolve(appPath, 'Contents/Info.plist');
const pythonBackendExecutablePath = resolve(appPath, 'Contents/Resources/python-backend/canva-banana-python-backend');
const expectedFileArchitecture = expectedFileArchitectureForTarget(targetArch);

if (!existsSync(appPath)) {
  throw new Error(`Packaged macOS app is missing: ${appPath}`);
}

run('codesign verification', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);

const executableFile = run('executable architecture check', 'file', [executablePath]);
const pythonBackendFile = run('python backend architecture check', 'file', [pythonBackendExecutablePath]);

if (!executableFile.includes(expectedFileArchitecture)) {
  throw new Error(`Packaged executable architecture mismatch. Expected ${expectedFileArchitecture}, got:\n${executableFile}`);
}
if (!pythonBackendFile.includes(expectedFileArchitecture)) {
  throw new Error(`Packaged Python backend architecture mismatch. Expected ${expectedFileArchitecture}, got:\n${pythonBackendFile}`);
}

const minimumSystemVersion = run('minimum macOS version check', '/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', infoPlistPath]);

if (!minimumSystemVersion) {
  throw new Error('Packaged app is missing LSMinimumSystemVersion.');
}

runElectronLoaderCheck();

console.log(`Verified ${appPath}`);
console.log(executableFile);
console.log(pythonBackendFile);
console.log(`LSMinimumSystemVersion ${minimumSystemVersion}`);
