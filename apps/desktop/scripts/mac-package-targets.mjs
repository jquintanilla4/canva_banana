import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { allOfficialArchsForPlatformAndVersion } from '@electron/packager';

const require = createRequire(import.meta.url);
const { version: defaultElectronVersion } = require('electron/package.json'); // Keeps all-arch resolution aligned with Forge.

export const getFlagValue = (args, names) => { // Reads --flag value and --flag=value forms.
  for (const [index, arg] of args.entries()) {
    const [name, inlineValue] = arg.split('=', 2);

    if (!names.includes(name)) {
      continue;
    }

    return inlineValue ?? args[index + 1];
  }

  return undefined;
};

export const resolveConcreteTargetArchs = (targetArch, targetPlatform, electronVersion = defaultElectronVersion) => { // Converts Forge arch input to output folders.
  if (targetArch === 'all') {
    return allOfficialArchsForPlatformAndVersion(targetPlatform, electronVersion) ?? ['x64'];
  }

  const archs = targetArch
    .split(',')
    .map(arch => arch.trim())
    .filter(Boolean);

  if (archs.length === 0) {
    throw new Error('Target architecture is empty.');
  }

  return archs;
};

export const assertSingleConcreteArch = (targetArch) => { // Keeps direct verifier calls scoped to one app.
  if (targetArch === 'all' || targetArch.includes(',')) {
    throw new Error(`verify-mac-app requires one concrete architecture, got "${targetArch}".`);
  }
};

export const getMacAppPath = (repoRoot, targetPlatform, targetArch) => (
  resolve(repoRoot, `out/The Institute-${targetPlatform}-${targetArch}/The Institute.app`)
);

export const expectedFileArchitectureForTarget = (targetArch) => { // Maps Forge arch names to file(1) output text.
  if (targetArch === 'x64') {
    return 'x86_64';
  }

  return targetArch;
};
