import { describe, expect, it } from 'vitest';
import { resolveSecureBackendRuntime, shouldUseExternalSecureBackend } from './secure-backend-runtime.mjs';

describe('secure backend runtime routing', () => {
  it('uses managed backend and token for normal packaged launches', () => {
    const runtime = resolveSecureBackendRuntime({
      isPackaged: true,
      hasDevRenderer: false,
      env: {},
      managedUrl: 'http://localhost:4567',
      desktopAuthToken: 'managed-token',
    });

    expect(runtime).toMatchObject({
      mode: 'managed',
      url: 'http://localhost:4567',
      urlSource: 'managed',
      authToken: 'managed-token',
      authTokenActive: true,
    });
  });

  it('ignores packaged secure backend URL overrides without the explicit QA flag', () => {
    const runtime = resolveSecureBackendRuntime({
      isPackaged: true,
      hasDevRenderer: false,
      env: { SECURE_BACKEND_API_BASE_URL: 'http://localhost:9876/' },
      managedUrl: 'http://localhost:4567',
      desktopAuthToken: 'managed-token',
    });

    expect(runtime).toMatchObject({
      mode: 'managed',
      url: 'http://localhost:4567',
      urlSource: 'ignoredEnv',
      authToken: 'managed-token',
    });
  });

  it('uses external packaged backend without managed auth when QA opts in', () => {
    const env = {
      SECURE_BACKEND_API_BASE_URL: 'http://localhost:9876/',
      CANVA_BANANA_ALLOW_EXTERNAL_SECURE_BACKEND: '1',
    };
    const runtime = resolveSecureBackendRuntime({
      isPackaged: true,
      hasDevRenderer: false,
      env,
      managedUrl: 'http://localhost:4567',
      desktopAuthToken: 'managed-token',
    });

    expect(shouldUseExternalSecureBackend({ isPackaged: true, hasDevRenderer: false, env })).toBe(true);
    expect(runtime).toMatchObject({
      mode: 'external',
      url: 'http://localhost:9876',
      urlSource: 'env',
      authToken: undefined,
      authTokenActive: false,
    });
  });

  it('uses explicit external packaged backend auth without leaking the managed token', () => {
    const runtime = resolveSecureBackendRuntime({
      isPackaged: true,
      hasDevRenderer: false,
      env: {
        SECURE_BACKEND_API_BASE_URL: 'http://localhost:9876',
        CANVA_BANANA_ALLOW_EXTERNAL_SECURE_BACKEND: 'true',
        CANVA_BANANA_EXTERNAL_SECURE_BACKEND_AUTH_TOKEN: 'external-token',
      },
      managedUrl: 'http://localhost:4567',
      desktopAuthToken: 'managed-token',
    });

    expect(runtime).toMatchObject({
      mode: 'external',
      url: 'http://localhost:9876',
      authToken: 'external-token',
      authTokenActive: true,
    });
  });

  it('preserves dev renderer external backend behavior without auth token', () => {
    const runtime = resolveSecureBackendRuntime({
      isPackaged: false,
      hasDevRenderer: true,
      env: { SECURE_BACKEND_API_BASE_URL: 'http://localhost:9876/' },
      managedUrl: 'http://localhost:4567',
      desktopAuthToken: 'managed-token',
    });

    expect(runtime).toMatchObject({
      mode: 'devExternal',
      url: 'http://localhost:9876',
      urlSource: 'env',
      authToken: undefined,
      authTokenActive: false,
    });
  });
});
