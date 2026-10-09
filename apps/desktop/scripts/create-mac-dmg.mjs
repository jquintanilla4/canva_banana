import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const createMacDmg = async (appPath, outputPath) => {
  const stagingDir = await mkdtemp(join(tmpdir(), 'canva-banana-dmg-'));
  try {
    await cp(appPath, join(stagingDir, basename(appPath)), { recursive: true, verbatimSymlinks: true }); // Keep signed framework links relative.
    await symlink('/Applications', join(stagingDir, 'Applications'));
    await mkdir(dirname(outputPath), { recursive: true });
    const result = spawnSync('hdiutil', [
      'create', '-volname', 'The Institute', '-srcfolder', stagingDir,
      '-format', 'ULFO', '-ov', outputPath,
    ], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      throw new Error(`DMG creation failed: ${result.error?.message || result.stderr || result.stdout || result.status}`);
    }
    console.log(`Created ${outputPath}`);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
};
