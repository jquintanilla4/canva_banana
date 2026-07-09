// @vitest-environment node

import { describe, expect, it } from 'vitest';
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
