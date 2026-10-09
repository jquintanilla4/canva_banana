import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMacDmg } from './scripts/create-mac-dmg.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

describe('native macOS DMG creation', () => {
  let fixtureDir;
  let appPath;
  let stagingDir;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'canva-banana-dmg-test-'));
    appPath = join(fixtureDir, 'The Institute.app');
    await mkdir(appPath);
    await writeFile(join(appPath, 'binary'), 'signed app contents');
    await symlink('binary', join(appPath, 'Current'));
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('includes the app and Applications link while preserving framework links', async () => {
    let copiedContents;
    let frameworkLink;
    let applicationsLink;
    vi.mocked(spawnSync).mockImplementation((_command, args) => {
      stagingDir = args[args.indexOf('-srcfolder') + 1];
      copiedContents = readFileSync(join(stagingDir, 'The Institute.app/binary'), 'utf8');
      frameworkLink = readlinkSync(join(stagingDir, 'The Institute.app/Current'));
      applicationsLink = readlinkSync(join(stagingDir, 'Applications'));
      return { status: 0 };
    });

    await createMacDmg(appPath, join(fixtureDir, 'output/The Institute.dmg'));

    expect(copiedContents).toBe('signed app contents');
    expect(frameworkLink).toBe('binary');
    expect(applicationsLink).toBe('/Applications');
    expect(existsSync(stagingDir)).toBe(false);
  });

  it('reports native tool failures and removes temporary app copies', async () => {
    vi.mocked(spawnSync).mockImplementation((_command, args) => {
      stagingDir = args[args.indexOf('-srcfolder') + 1];
      return { status: 1, stderr: 'disk image creation failed' };
    });
    await expect(createMacDmg(appPath, join(fixtureDir, 'output.dmg'))).rejects.toThrow('disk image creation failed');
    expect(existsSync(stagingDir)).toBe(false);
    expect(await readFile(join(appPath, 'binary'), 'utf8')).toBe('signed app contents');
    expect(await readlink(join(appPath, 'Current'))).toBe('binary');
  });
});
