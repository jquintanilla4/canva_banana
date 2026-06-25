import { spawnSync } from 'node:child_process';
import { arch as getHostArch } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notarize } from '@electron/notarize';
import {
  getFlagValue,
  getMacAppPath,
  resolveConcreteTargetArchs,
} from './mac-package-targets.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFilePath);
const desktopDir = resolve(scriptsDir, '..'); // Runs Forge from the Electron app root.
const repoRoot = resolve(desktopDir, '../..'); // Locates the shared Forge output directory.
const [mode = 'package', ...cliArgs] = process.argv.slice(2);
const packageFlagNames = new Set(['--arch', '-a', '--platform', '-p']); // Flags shared by package and make.
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();
const notarizeKeychainProfile = process.env.APPLE_NOTARIZE_KEYCHAIN_PROFILE?.trim();
const notarizeKeychain = process.env.APPLE_NOTARIZE_KEYCHAIN?.trim();
const notarizeAppleId = process.env.APPLE_ID?.trim();
const notarizePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim();
const notarizeTeamId = process.env.APPLE_TEAM_ID?.trim();

const notarizeConfig = notarizeKeychainProfile
  ? {
      keychainProfile: notarizeKeychainProfile,
      ...(notarizeKeychain ? { keychain: notarizeKeychain } : {}),
    }
  : notarizeAppleId && notarizePassword && notarizeTeamId
    ? {
        appleId: notarizeAppleId,
        appleIdPassword: notarizePassword,
        teamId: notarizeTeamId,
      }
    : undefined;

const hasFlag = (args, names) => args.some(arg => names.includes(arg.split('=', 1)[0])); // Checks short and long flags.

const collectPackageArgs = (args) => { // Keeps maker-only flags away from electron-forge package.
  const packageArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [name] = arg.split('=', 1);

    if (!packageFlagNames.has(name)) {
      continue;
    }

    packageArgs.push(arg);

    if (!arg.includes('=') && args[index + 1] && !args[index + 1].startsWith('-')) {
      packageArgs.push(args[index + 1]);
      index += 1;
    }
  }

  return packageArgs;
};

const withTargetArgs = (args, targetArch, targetPlatform) => { // Ensures Forge receives env-derived targets.
  const targetArgs = [...args];

  if (!hasFlag(targetArgs, ['--arch', '-a'])) {
    targetArgs.push('--arch', targetArch);
  }

  if (!hasFlag(targetArgs, ['--platform', '-p'])) {
    targetArgs.push('--platform', targetPlatform);
  }

  return targetArgs;
};

const run = (label, command, args, env = {}) => { // Runs each packaging step synchronously.
  const result = spawnSync(command, args, {
    cwd: desktopDir,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status ?? 'unknown'}`);
  }
};

const validateNotarizationConfig = (targetPlatform) => { // Fails release signing before expensive packaging starts.
  if (process.platform === 'darwin' && targetPlatform === 'darwin' && signingIdentity && !notarizeConfig) {
    throw new Error('APPLE_SIGNING_IDENTITY requires Apple notarization credentials. Set APPLE_NOTARIZE_KEYCHAIN_PROFILE or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID.');
  }
};

const notarizeMacApp = async (targetArch, targetPlatform) => { // Notarizes the signed app before makers package it.
  if (process.platform !== 'darwin' || targetPlatform !== 'darwin' || !signingIdentity) {
    return;
  }

  const appPath = getMacAppPath(repoRoot, targetPlatform, targetArch);
  await notarize({ appPath, ...notarizeConfig });
};

if (!['package', 'make'].includes(mode)) {
  throw new Error(`Unknown packaging mode "${mode}". Use "package" or "make".`);
}

if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  run('electron forge help', 'electron-forge', [mode, '--help']);
  process.exit(0);
}

const targetArch = getFlagValue(cliArgs, ['--arch', '-a']) ?? process.env.npm_config_arch ?? getHostArch();
const targetPlatform = getFlagValue(cliArgs, ['--platform', '-p']) ?? process.env.npm_config_platform ?? process.platform;
const packageArgs = withTargetArgs(collectPackageArgs(cliArgs), targetArch, targetPlatform);
const makeArgs = withTargetArgs(cliArgs, targetArch, targetPlatform);
const concreteTargetArchs = targetPlatform === 'darwin' ? resolveConcreteTargetArchs(targetArch, targetPlatform) : [targetArch];

validateNotarizationConfig(targetPlatform);
run('desktop build', 'npm', ['run', 'build']);
run('electron forge package', 'electron-forge', ['package', ...packageArgs]);

for (const concreteTargetArch of concreteTargetArchs) {
  await notarizeMacApp(concreteTargetArch, targetPlatform);
  run('mac app verification', 'node', [
    'scripts/verify-mac-app.mjs',
    '--arch',
    concreteTargetArch,
    '--platform',
    targetPlatform,
  ]);
}

if (mode === 'make') {
  run('electron forge make', 'electron-forge', ['make', '--skip-package', ...makeArgs]);
}
