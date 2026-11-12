// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createServer, normalizePath } from 'vite';
import type { ConfigEnv, UserConfig } from 'vite';
import viteConfig from '../vite.config';

describe('vite env defines', () => {
  it('uses relative asset paths for packaged Electron file URLs', async () => {
    const env: ConfigEnv = { command: 'build', mode: 'test' };
    const config = typeof viteConfig === 'function' ? await viteConfig(env) : viteConfig;

    expect((config as UserConfig).base).toBe('./'); // Packaged file:// pages cannot resolve /assets from disk root.
  });

  it('defines the Jimeng API base URL for browser bundles', async () => {
    const previousBaseUrl = process.env.JIMENG_API_BASE_URL;
    process.env.JIMENG_API_BASE_URL = 'http://jimeng.test';
    const env: ConfigEnv = { command: 'build', mode: 'test' };

    try {
      const config = typeof viteConfig === 'function' ? await viteConfig(env) : viteConfig;
      const define = (config as UserConfig).define ?? {};

      expect(define['process.env.JIMENG_API_BASE_URL']).toBe(JSON.stringify('http://jimeng.test')); // Prevent raw process.env access in browsers.
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.JIMENG_API_BASE_URL;
      } else {
        process.env.JIMENG_API_BASE_URL = previousBaseUrl;
      }
    }
  });

  it('removes Gemini secrets from desktop package builds', async () => {
    const previousDesktopPackage = process.env.CANVA_BANANA_DESKTOP_PACKAGE;
    const previousGeminiKey = process.env.GEMINI_API_KEY;
    process.env.CANVA_BANANA_DESKTOP_PACKAGE = '1';
    process.env.GEMINI_API_KEY = 'gemini-secret';
    const env: ConfigEnv = { command: 'build', mode: 'test' };

    try {
      const config = typeof viteConfig === 'function' ? await viteConfig(env) : viteConfig;
      const define = (config as UserConfig).define ?? {};

      expect(define['process.env.API_KEY']).toBe('undefined'); // Desktop keys come from main-process IPC.
      expect(define['process.env.GEMINI_API_KEY']).toBe('undefined'); // Avoid baking local secrets into app assets.
    } finally {
      if (previousDesktopPackage === undefined) {
        delete process.env.CANVA_BANANA_DESKTOP_PACKAGE;
      } else {
        process.env.CANVA_BANANA_DESKTOP_PACKAGE = previousDesktopPackage;
      }
      if (previousGeminiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousGeminiKey;
      }
    }
  });
});

describe('workspace development rebuilds', () => {
  it.each(['workspace.js', 'chunks/export-image.js'])('fully reloads after %s changes', async (filename) => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'canva-banana-vite-test-'));
    let server: Awaited<ReturnType<typeof createServer>> | undefined;

    try {
      server = await createServer({
        configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
        root: fileURLToPath(new URL('..', import.meta.url)),
        cacheDir,
        server: { middlewareMode: true, watch: null, ws: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      const send = vi.spyOn(server.environments.client.hot, 'send');
      server.watcher.emit('change', normalizePath(fileURLToPath(new URL(`../../../packages/workspace/dist/${filename}`, import.meta.url))));

      await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'full-reload' }));
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await server?.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
