// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ConfigEnv, UserConfig } from 'vite';
import viteConfig from '../vite.config';

describe('vite env defines', () => {
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
});
