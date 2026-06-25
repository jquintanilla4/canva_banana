import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEV_SERVICE_HEALTH_PROTOCOL_VERSION,
  DEV_SERVICE_HEALTH_TOKEN_ENV,
  SECURE_BACKEND_REQUIRED_CAPABILITIES,
  buildSecureBackendConfigState,
  resolveDevServiceHealthToken,
  validateReusableServiceHealth,
} from './scripts/dev-service-health.mjs';

const baseConfigState = {
  verifiable: true,
  shellProvidedKeys: [],
  shellProvidedUnverifiableKeys: [],
  envFiles: [
    { fileName: '.env.local', exists: false },
    { fileName: '.env', exists: false },
  ],
  readiness: {
    falProxy: true,
    falAssetFetch: true,
    moonshotIntent: true,
    openrouterChat: true,
  },
  allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'null'],
  auth: { desktopTokenRequired: false },
};

const baseReuseContract = {
  version: 1,
  workspaceRoot: '/repo/canva_banana',
  capabilities: {
    falProxy: true,
    falAssetFetch: true,
    moonshotIntent: true,
    openrouterChat: true,
  },
  readiness: baseConfigState.readiness,
  config: {
    FAL_API_KEY: { present: true },
    MOONSHOT_API_KEY: { present: true },
    OPENROUTER_API_KEY: { present: true },
    SECURE_BACKEND_ALLOWED_ORIGINS: baseConfigState.allowedOrigins,
    CANVA_BANANA_DESKTOP_AUTH_TOKEN: { present: false },
  },
  envFiles: baseConfigState.envFiles,
};

baseConfigState.reuseContract = baseReuseContract;

const expectation = {
  service: 'canva-banana-secure-backend',
  workspaceRoot: '/repo/canva_banana',
  requiredCapabilities: SECURE_BACKEND_REQUIRED_CAPABILITIES,
  requiredReadiness: baseConfigState.readiness,
  auth: { desktopTokenRequired: false },
  configState: baseConfigState,
};

const buildPayload = (overrides = {}) => ({
  protocolVersion: DEV_SERVICE_HEALTH_PROTOCOL_VERSION,
  service: 'canva-banana-secure-backend',
  workspaceRoot: '/repo/canva_banana',
  capabilities: {
    falProxy: true,
    falAssetFetch: true,
    moonshotIntent: true,
    openrouterChat: true,
  },
  readiness: baseConfigState.readiness,
  auth: { desktopTokenRequired: false },
  configState: baseConfigState,
  reuseContract: baseReuseContract,
  ...overrides,
});

let tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('dev service health validation', () => {
  it('accepts matching service identity, capabilities, readiness, auth, and config', () => {
    expect(validateReusableServiceHealth(buildPayload(), expectation)).toEqual({ ok: true });
  });

  it('rejects stale or unrelated services before reuse', () => {
    expect(validateReusableServiceHealth(buildPayload({ service: 'other-service' }), expectation)).toMatchObject({ ok: false });
    expect(validateReusableServiceHealth(buildPayload({ workspaceRoot: '/repo/old-checkout' }), expectation)).toMatchObject({ ok: false });
    expect(validateReusableServiceHealth(buildPayload({ workspaceRoot: undefined }), expectation)).toMatchObject({ ok: false });
    expect(validateReusableServiceHealth(buildPayload({ protocolVersion: 0 }), expectation)).toMatchObject({ ok: false });
  });

  it('accepts equivalent workspace roots with normalized path text', () => {
    expect(validateReusableServiceHealth(buildPayload(), {
      ...expectation,
      workspaceRoot: '/repo/canva_banana/',
    })).toEqual({ ok: true });
    expect(validateReusableServiceHealth(buildPayload({ workspaceRoot: '/repo/other/../canva_banana' }), expectation)).toEqual({ ok: true });
  });

  it('rejects services missing any required route capability', () => {
    expect(validateReusableServiceHealth(buildPayload({
      capabilities: { falProxy: true, moonshotIntent: true, openrouterChat: true },
    }), expectation)).toMatchObject({
      ok: false,
      reason: 'missing capabilities: falAssetFetch',
    });
  });

  it('rejects services with stale configured readiness', () => {
    expect(validateReusableServiceHealth(buildPayload({
      readiness: { ...baseConfigState.readiness, openrouterChat: false },
    }), expectation)).toMatchObject({
      ok: false,
      reason: 'readiness changed for: openrouterChat',
    });
  });

  it('rejects tokened desktop auth backends in dev reuse', () => {
    expect(validateReusableServiceHealth(buildPayload({
      auth: { desktopTokenRequired: true },
    }), expectation)).toMatchObject({
      ok: false,
      reason: 'desktop auth mode changed',
    });
  });

  it('rejects changed env file metadata before reuse', () => {
    const changedEnvFiles = [
      { fileName: '.env.local', exists: true, size: 10, mtimeNs: '1', ctimeNs: '1' },
      { fileName: '.env', exists: false },
    ];
    expect(validateReusableServiceHealth(buildPayload({
      configState: {
        ...baseConfigState,
        envFiles: changedEnvFiles,
        reuseContract: { ...baseReuseContract, envFiles: changedEnvFiles },
      },
      reuseContract: { ...baseReuseContract, envFiles: changedEnvFiles },
    }), expectation)).toMatchObject({
      ok: false,
      reason: 'secure backend env files changed',
    });
  });

  it('rejects reuse when the backend compatibility contract changed', () => {
    expect(validateReusableServiceHealth(buildPayload({
      reuseContract: {
        ...baseReuseContract,
        config: {
          ...baseReuseContract.config,
          SECURE_BACKEND_ALLOWED_ORIGINS: ['http://127.0.0.1:3000'],
        },
      },
    }), expectation)).toMatchObject({
      ok: false,
      reason: 'secure backend reuse contract changed',
    });
  });

  it('rejects reuse when current launch depends on shell-provided secrets', () => {
    expect(validateReusableServiceHealth(buildPayload(), {
      ...expectation,
      configState: { ...baseConfigState, verifiable: false, shellProvidedKeys: ['OPENROUTER_API_KEY'] },
    })).toMatchObject({
      ok: false,
      reason: 'current launch uses shell-provided secure backend config',
    });
  });

  it('builds readiness from dotenv files without exposing secret values', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-'));
    tempDirs.push(rootDir);
    writeFileSync(join(rootDir, '.env'), 'FAL_API_KEY="fal"\nOPENROUTER_API_KEY="openrouter"\n');

    const configState = buildSecureBackendConfigState(rootDir, {}, {});

    expect(configState.verifiable).toBe(true);
    expect(configState.shellProvidedKeys).toEqual([]);
    expect(configState.shellProvidedUnverifiableKeys).toEqual([]);
    expect(configState.readiness).toEqual({
      falProxy: true,
      falAssetFetch: true,
      moonshotIntent: false,
      openrouterChat: true,
    });
    expect(configState.allowedOrigins).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'null']);
    expect(configState.reuseContract.config.SECURE_BACKEND_ALLOWED_ORIGINS).toEqual(configState.allowedOrigins);
    expect(JSON.stringify(configState)).not.toContain('"openrouter"');
    expect(configState.envFiles).toContainEqual(expect.objectContaining({ fileName: '.env', exists: true }));
  });

  it('includes normalized allowed origins in the reusable backend contract', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-'));
    tempDirs.push(rootDir);
    writeFileSync(join(rootDir, '.env.local'), 'SECURE_BACKEND_ALLOWED_ORIGINS="http://localhost:3000, null"\n');

    const configState = buildSecureBackendConfigState(rootDir, {}, {});

    expect(configState.allowedOrigins).toEqual(['http://localhost:3000', 'null']);
    expect(configState.reuseContract.config.SECURE_BACKEND_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'null']);
  });

  it('uses explicit dev health tokens before the persisted workspace token', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-root-'));
    const tokenStoreDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-token-store-'));
    tempDirs.push(rootDir, tokenStoreDir);

    expect(resolveDevServiceHealthToken(rootDir, { [DEV_SERVICE_HEALTH_TOKEN_ENV]: ' explicit-token ' }, tokenStoreDir)).toBe('explicit-token');
    expect(readdirSync(tokenStoreDir)).toEqual([]);
  });

  it('persists generated dev health tokens per workspace', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-root-'));
    const tokenStoreDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-token-store-'));
    tempDirs.push(rootDir, tokenStoreDir);

    const firstToken = resolveDevServiceHealthToken(rootDir, {}, tokenStoreDir);
    const secondToken = resolveDevServiceHealthToken(`${rootDir}/.`, {}, tokenStoreDir);

    expect(firstToken).toHaveLength(43);
    expect(secondToken).toBe(firstToken);
    expect(readdirSync(tokenStoreDir)).toHaveLength(1);
  });

  it('keeps the token store and token file private', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-root-'));
    const tokenStoreDir = mkdtempSync(join(tmpdir(), 'canva-banana-health-token-store-'));
    tempDirs.push(rootDir, tokenStoreDir);

    resolveDevServiceHealthToken(rootDir, {}, tokenStoreDir);
    const [tokenFileName] = readdirSync(tokenStoreDir);

    expect(statSync(tokenStoreDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(tokenStoreDir, tokenFileName)).mode & 0o777).toBe(0o600);
  });
});
