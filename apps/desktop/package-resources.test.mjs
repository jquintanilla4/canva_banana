import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getRequiredPackageResources,
  verifyPackageResources,
} from './scripts/verify-package-resources.mjs';

const stageRequiredResources = async desktopDir => {
  const resources = getRequiredPackageResources(desktopDir);
  await Promise.all(resources.map(async resourcePath => {
    await mkdir(dirname(resourcePath), { recursive: true });
    await writeFile(resourcePath, 'resource', 'utf8');
  }));
  return resources;
};

describe('package resources verifier', () => {
  it('requires staged app icon resources', () => {
    const desktopDir = '/repo/apps/desktop';
    const resources = getRequiredPackageResources(desktopDir);

    expect(resources).toContain(join(desktopDir, 'resources/app-icons/institute-preview.png'));
    expect(resources).toContain(join(desktopDir, 'resources/app-icons/institute-dock.png'));
    expect(resources).toContain(join(desktopDir, 'resources/app-icons/monalisa-bionic-preview.png'));
    expect(resources).toContain(join(desktopDir, 'resources/app-icons/monalisa-bionic-dock.png'));
  });

  it('accepts valid generated build metadata', async () => {
    const desktopDir = await mkdtemp(join(tmpdir(), 'canva-banana-package-'));
    await stageRequiredResources(desktopDir);
    await writeFile(join(desktopDir, 'generated/build-variant.json'), JSON.stringify({
      schemaVersion: 1,
      variant: 'regular',
    }));
    expect(() => verifyPackageResources(desktopDir)).not.toThrow();
  });

  it('rejects malformed generated build metadata', async () => {
    const desktopDir = await mkdtemp(join(tmpdir(), 'canva-banana-package-'));
    await stageRequiredResources(desktopDir);
    await writeFile(join(desktopDir, 'generated/build-variant.json'), '{broken', 'utf8');
    expect(() => verifyPackageResources(desktopDir)).toThrow(/metadata is invalid/);
  });
});
