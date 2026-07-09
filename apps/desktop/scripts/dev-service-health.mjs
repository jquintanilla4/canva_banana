import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DEV_SERVICE_HEALTH_PROTOCOL_VERSION,
  SECURE_BACKEND_REQUIRED_CAPABILITIES,
  SECURE_BACKEND_REQUIRED_READINESS_KEYS,
  buildSecureBackendConfigState,
  canonicalWorkspaceRoot,
} from '../../secure-backend/src/server.mjs';

export const DEV_SERVICE_HEALTH_PROBE_HEADER = 'x-canva-banana-dev-service-probe'; // Dev-only health identity header.
export const DEV_SERVICE_HEALTH_PROBE_VALUE = 'canva-banana-dev-service-health'; // Shared probe value for local fetches.
export const DEV_SERVICE_HEALTH_TOKEN_ENV = 'CANVA_BANANA_DEV_SERVICE_HEALTH_TOKEN'; // Explicit override for dev health auth.
export const DEV_SERVICE_HEALTH_TOKEN_HEADER = 'x-canva-banana-dev-service-token'; // Header carrying the local dev auth token.

export {
  DEV_SERVICE_HEALTH_PROTOCOL_VERSION,
  SECURE_BACKEND_REQUIRED_CAPABILITIES,
  SECURE_BACKEND_REQUIRED_READINESS_KEYS,
  buildSecureBackendConfigState,
  canonicalWorkspaceRoot,
};

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value); // JSON object guard.
const DEV_SERVICE_HEALTH_TOKEN_BYTES = 32; // Keep generated tokens high entropy.
const DEV_SERVICE_HEALTH_TOKEN_DIR_MODE = 0o700; // Allow only this user into the token store.
const DEV_SERVICE_HEALTH_TOKEN_FILE_MODE = 0o600; // Allow only this user to read the token.
const DEV_SERVICE_HEALTH_TOKEN_STORE_DIR = join(homedir(), 'Library', 'Application Support', 'Canva Banana', 'dev-service-health'); // Per-user app state.

const getWorkspaceTokenFilePath = (rootDir, tokenStoreDir) => {
  const workspaceHash = createHash('sha256').update(canonicalWorkspaceRoot(rootDir)).digest('hex'); // Avoid raw paths in temp filenames.
  return join(tokenStoreDir, `${workspaceHash}.token`);
};

const ensurePrivateMode = (path, stats, expectedMode) => {
  const currentMode = stats.mode & 0o777; // Compare only permission bits.
  if (currentMode === expectedMode) {
    return; // Avoid no-op chmod failures on restricted macOS locations.
  }
  chmodSync(path, expectedMode); // Tighten permissions when they drift.
};

const ensurePrivateTokenStoreDir = (tokenStoreDir) => {
  mkdirSync(tokenStoreDir, { recursive: true, mode: DEV_SERVICE_HEALTH_TOKEN_DIR_MODE });
  const stats = lstatSync(tokenStoreDir);
  if (!stats.isDirectory()) {
    throw new Error(`Dev health token store is not a directory: ${tokenStoreDir}`);
  }
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error(`Dev health token store is owned by another user: ${tokenStoreDir}`);
  }
  ensurePrivateMode(tokenStoreDir, stats, DEV_SERVICE_HEALTH_TOKEN_DIR_MODE);
};

const readStoredToken = (tokenPath) => {
  if (!existsSync(tokenPath)) {
    return null;
  }
  const stats = lstatSync(tokenPath);
  if (!stats.isFile()) {
    throw new Error(`Dev health token path is not a regular file: ${tokenPath}`);
  }
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error(`Dev health token file is owned by another user: ${tokenPath}`);
  }
  ensurePrivateMode(tokenPath, stats, DEV_SERVICE_HEALTH_TOKEN_FILE_MODE);
  const cachedToken = readFileSync(tokenPath, 'utf8').trim();
  return cachedToken || null;
};

const writeStoredTokenAtomic = (tokenPath, token) => {
  let fileDescriptor;
  try {
    fileDescriptor = openSync(tokenPath, 'wx', DEV_SERVICE_HEALTH_TOKEN_FILE_MODE);
    writeFileSync(fileDescriptor, `${token}\n`);
    return token;
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
};

export const resolveDevServiceHealthToken = (rootDir, env = process.env, tokenStoreDir = DEV_SERVICE_HEALTH_TOKEN_STORE_DIR) => {
  const configuredToken = env[DEV_SERVICE_HEALTH_TOKEN_ENV]?.trim();
  if (configuredToken) {
    return configuredToken; // Respect caller-provided token for explicit dev setups.
  }
  ensurePrivateTokenStoreDir(tokenStoreDir);
  const tokenPath = getWorkspaceTokenFilePath(rootDir, tokenStoreDir);
  const cachedToken = readStoredToken(tokenPath);
  if (cachedToken) {
    return cachedToken; // Reuse prior launcher's token for occupied-port probing.
  }
  const generatedToken = randomBytes(DEV_SERVICE_HEALTH_TOKEN_BYTES).toString('base64url');
  try {
    return writeStoredTokenAtomic(tokenPath, generatedToken);
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
    const racedToken = readStoredToken(tokenPath);
    if (racedToken) {
      return racedToken; // Another launcher created the token first.
    }
    throw new Error(`Dev health token file exists but is empty: ${tokenPath}`);
  }
};

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const normalizeReuseContract = (contract) => ({
  ...contract,
  workspaceRoot: typeof contract.workspaceRoot === 'string'
    ? canonicalWorkspaceRoot(contract.workspaceRoot)
    : contract.workspaceRoot,
}); // Compare workspace identity, not path spelling.

export const validateReusableServiceHealth = (payload, expectation) => {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'health response is not a JSON object' };
  }
  if (payload.protocolVersion !== DEV_SERVICE_HEALTH_PROTOCOL_VERSION) {
    return { ok: false, reason: `expected dev health protocol ${DEV_SERVICE_HEALTH_PROTOCOL_VERSION}` };
  }
  if (payload.service !== expectation.service) {
    return { ok: false, reason: `expected service ${expectation.service}` };
  }
  if (
    typeof payload.workspaceRoot !== 'string' ||
    typeof expectation.workspaceRoot !== 'string' ||
    canonicalWorkspaceRoot(payload.workspaceRoot) !== canonicalWorkspaceRoot(expectation.workspaceRoot)
  ) {
    return { ok: false, reason: `expected workspace ${expectation.workspaceRoot}` };
  }
  const capabilities = isRecord(payload.capabilities) ? payload.capabilities : {}; // Missing capabilities fail below.
  const missingCapabilities = expectation.requiredCapabilities.filter(capability => capabilities[capability] !== true);
  if (missingCapabilities.length > 0) {
    return { ok: false, reason: `missing capabilities: ${missingCapabilities.join(', ')}` };
  }
  const readiness = isRecord(payload.readiness) ? payload.readiness : {}; // Missing readiness fails below.
  const mismatchedReadiness = Object.entries(expectation.requiredReadiness ?? {})
    .filter(([key, expected]) => readiness[key] !== expected)
    .map(([key]) => key);
  if (mismatchedReadiness.length > 0) {
    return { ok: false, reason: `readiness changed for: ${mismatchedReadiness.join(', ')}` };
  }
  const auth = isRecord(payload.auth) ? payload.auth : {};
  if (auth.desktopTokenRequired !== expectation.auth?.desktopTokenRequired) {
    return { ok: false, reason: 'desktop auth mode changed' };
  }
  if (expectation.configState?.verifiable !== true) {
    return { ok: false, reason: 'current launch uses shell-provided secure backend config' };
  }
  if (!isRecord(payload.configState) || payload.configState.verifiable !== true) {
    return { ok: false, reason: 'running backend config is not safely reusable' };
  }
  if (stableStringify(payload.configState.envFiles) !== stableStringify(expectation.configState.envFiles)) {
    return { ok: false, reason: 'secure backend env files changed' };
  }
  const runningContract = isRecord(payload.reuseContract) ? payload.reuseContract : null;
  const expectedContract = isRecord(expectation.configState.reuseContract) ? expectation.configState.reuseContract : null;
  if (!runningContract || !expectedContract) {
    return { ok: false, reason: 'secure backend reuse contract is missing' };
  }
  if (stableStringify(normalizeReuseContract(runningContract)) !== stableStringify(normalizeReuseContract(expectedContract))) {
    return { ok: false, reason: 'secure backend reuse contract changed' };
  }
  return { ok: true };
};
