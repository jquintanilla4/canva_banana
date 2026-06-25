import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDesktopSettings,
  parseDotenvEntry,
  writeDesktopSettingsFileAtomic,
} from './settings-env.mjs';

let tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('settings-env', () => {
  it('parses quoted and blank dotenv values', () => {
    expect(parseDotenvEntry('FAL_API_KEY="fal secret"')).toEqual({ key: 'FAL_API_KEY', value: 'fal secret' });
    expect(parseDotenvEntry("TOS_REGION='cn-beijing'")).toEqual({ key: 'TOS_REGION', value: 'cn-beijing' });
    expect(parseDotenvEntry('MOONSHOT_API_KEY=')).toEqual({ key: 'MOONSHOT_API_KEY', value: '' });
  });

  it('preserves unmanaged lines while updating managed settings', () => {
    const existing = [
      '# local notes',
      'UNMANAGED=value',
      'FAL_API_KEY="old"',
      '',
    ].join('\n');

    const { content } = applyDesktopSettings(existing, {
      updates: {
        FAL_API_KEY: 'new value',
        GEMINI_API_KEY: '',
      },
    });

    expect(content).toContain('# local notes\nUNMANAGED=value');
    expect(content).toContain('FAL_API_KEY="new value"');
    expect(content).not.toContain('GEMINI_API_KEY=');
    expect(content).not.toContain('FAL_API_KEY="old"');
  });

  it('clears managed keys without touching unmanaged values', () => {
    const existing = [
      'UNMANAGED=value',
      'GEMINI_API_KEY="gemini"',
      'FAL_API_KEY="fal"',
    ].join('\n');

    const { content, values } = applyDesktopSettings(existing, { clears: ['GEMINI_API_KEY'] });

    expect(values.GEMINI_API_KEY).toBeUndefined();
    expect(values.FAL_API_KEY).toBe('fal');
    expect(content).toContain('UNMANAGED=value');
    expect(content).toContain('FAL_API_KEY="fal"');
    expect(content).not.toContain('GEMINI_API_KEY');
  });

  it('writes the final dotenv content through a temp-file rename', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'canva-banana-settings-'));
    tempDirs.push(dir);
    const envPath = join(dir, '.env.local');

    await writeDesktopSettingsFileAtomic(envPath, 'FAL_API_KEY="fal"\n');

    expect(await readFile(envPath, 'utf8')).toBe('FAL_API_KEY="fal"\n');
    expect((await readdir(dir)).filter(name => name.includes('.tmp'))).toEqual([]);
  });
});
