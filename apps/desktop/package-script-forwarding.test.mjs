import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('mac package script forwarding', () => {
  it.each([
    ['package:mac', 'package'],
    ['make:mac', 'make'],
  ])('forwards --help through %s to the desktop wrapper', (scriptName, mode) => {
    const result = spawnSync('npm', ['run', scriptName, '--', '--help'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`node scripts/package-mac-app.mjs ${mode} --help`);
    expect(result.stdout).toContain(`Usage: electron-forge-${mode}`);
    expect(result.stdout).not.toContain('Run arbitrary package scripts');
  });
});
