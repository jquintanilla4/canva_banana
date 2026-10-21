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

    const output = `${result.stdout}\n${result.stderr}`; // npm versions write script notices to different streams.

    expect(result.status, output).toBe(0);
    expect(output).toContain(`node scripts/package-mac-app.mjs ${mode} --help`);
    expect(output).toContain(`Usage: electron-forge-${mode}`);
    expect(output).not.toContain('Run arbitrary package scripts');
  });
});
