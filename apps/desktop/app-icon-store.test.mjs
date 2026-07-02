import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_ICON_RESOURCE_DIR_NAME,
  DEFAULT_APP_ICON_ID,
  assertKnownAppIconId,
  getAppIconPreferencePath,
  getAppIconResourceSpecs,
  getRequiredAppIconResourcePaths,
  normalizeAppIconId,
  readSelectedAppIconId,
  writeSelectedAppIconId,
} from './app-icon-store.mjs';

const tempDirs = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canva-banana-app-icon-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('app icon store', () => {
  it('normalizes unknown icon ids to the default', () => {
    expect(DEFAULT_APP_ICON_ID).toBe('monalisa-bionic');
    expect(normalizeAppIconId('missing-icon')).toBe(DEFAULT_APP_ICON_ID);
    expect(normalizeAppIconId(DEFAULT_APP_ICON_ID)).toBe(DEFAULT_APP_ICON_ID);
    expect(normalizeAppIconId('monalisa-bionic')).toBe('monalisa-bionic');
    expect(normalizeAppIconId('institute')).toBe('institute');
    expect(() => assertKnownAppIconId('missing-icon')).toThrow('Unknown app icon.');
  });

  it('reads the selected icon and falls back when the preference file is invalid', async () => {
    const userDataDir = await makeTempDir();
    const preferencePath = getAppIconPreferencePath(userDataDir);

    expect(await readSelectedAppIconId(preferencePath)).toBe(DEFAULT_APP_ICON_ID);

    await writeFile(preferencePath, JSON.stringify({ selectedIconId: 'missing-icon' }));
    expect(await readSelectedAppIconId(preferencePath)).toBe(DEFAULT_APP_ICON_ID);

    await writeFile(preferencePath, '{bad json');
    expect(await readSelectedAppIconId(preferencePath)).toBe(DEFAULT_APP_ICON_ID);
  });

  it('writes selected icon ids atomically', async () => {
    const userDataDir = await makeTempDir();
    const preferencePath = getAppIconPreferencePath(join(userDataDir, 'nested'));

    await mkdir(join(userDataDir, 'nested'), { recursive: true });
    await writeSelectedAppIconId(preferencePath, DEFAULT_APP_ICON_ID);

    expect(await readSelectedAppIconId(preferencePath)).toBe(DEFAULT_APP_ICON_ID);
  });

  it('describes staged package icon resources', () => {
    const desktopDir = '/repo/apps/desktop';
    const specs = getAppIconResourceSpecs(desktopDir);
    const resourcePaths = getRequiredAppIconResourcePaths(desktopDir);

    expect(specs.map(spec => spec.resourceFileName)).toEqual([
      'monalisa-bionic-preview.png',
      'monalisa-bionic-dock.png',
      'institute-preview.png',
      'institute-dock.png',
    ]);
    expect(resourcePaths).toEqual([
      join(desktopDir, 'resources', APP_ICON_RESOURCE_DIR_NAME, 'monalisa-bionic-preview.png'),
      join(desktopDir, 'resources', APP_ICON_RESOURCE_DIR_NAME, 'monalisa-bionic-dock.png'),
      join(desktopDir, 'resources', APP_ICON_RESOURCE_DIR_NAME, 'institute-preview.png'),
      join(desktopDir, 'resources', APP_ICON_RESOURCE_DIR_NAME, 'institute-dock.png'),
    ]);
  });
});
