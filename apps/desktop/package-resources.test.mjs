import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stageSecureBackend } from './scripts/secure-backend-resources.mjs';
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
    expect(resources).toContain(join(desktopDir, 'generated/secure-backend/tokenhub.mjs'));
    expect(resources).toContain(join(desktopDir, 'generated/secure-backend/tokenhub-google.mjs'));
    expect(resources).toContain(join(desktopDir, 'generated/secure-backend/node_modules/openai/index.mjs'));
    expect(resources).toContain(join(desktopDir, 'generated/secure-backend/node_modules/@google/genai/dist/node/index.mjs'));
    expect(resources).toContain(join(desktopDir, 'generated/secure-backend/node_modules/protobufjs/package.json'));
  });

  it('imports the staged secure backend and both SDKs outside the workspace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'canva-banana-staged-backend-'));
    try {
      await stageSecureBackend(directory);
      execFileSync(process.execPath, ['--input-type=module', '-e', [
        "import { createSecureBackendServer } from './server.mjs';",
        "import { createTokenHubNanoBananaClient } from './tokenhub-google.mjs';",
        "const server = createSecureBackendServer({ env: {} });",
        "const client = createTokenHubNanoBananaClient({ apiKey: 'package-smoke-test' });",
        "if (!server || typeof client.interactions.create !== 'function') process.exit(1);",
      ].join('\n')], { cwd: directory, timeout: 10_000 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

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
