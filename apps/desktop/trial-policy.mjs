import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { normalizeTimestamp } from './build-variant.mjs';

export const TRIAL_STATE_SCHEMA_VERSION = 1;
export const TRIAL_CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
export const TRIAL_MONITOR_INTERVAL_MS = 60 * 1000;
export const TRIAL_STATE_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

export const parseTrialState = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== TRIAL_STATE_SCHEMA_VERSION) {
    throw new Error('Trial clock state is invalid.');
  }
  const maxSeenAt = normalizeTimestamp(value.maxSeenAt, 'Trial clock state');
  return { schemaVersion: TRIAL_STATE_SCHEMA_VERSION, maxSeenAt };
};

export const readTrialState = async statePath => {
  let content;
  try {
    content = await readFile(statePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null; // A missing file is the first valid trial launch.
    throw error;
  }
  try {
    return parseTrialState(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Trial clock state is not valid JSON.');
    throw error;
  }
};

export const writeTrialStateAtomic = async (statePath, maxSeenAtMs) => {
  const state = {
    schemaVersion: TRIAL_STATE_SCHEMA_VERSION,
    maxSeenAt: new Date(maxSeenAtMs).toISOString(),
  };
  const tempPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(statePath), { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(tempPath, statePath); // Rename keeps readers from observing a partial clock record.
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
};

export const evaluateTrial = ({
  metadata,
  nowMs,
  maxSeenAtMs = null,
  rollbackToleranceMs = TRIAL_CLOCK_ROLLBACK_TOLERANCE_MS,
}) => {
  if (metadata.variant === 'regular') return { status: 'regular' };

  const expiresAtMs = Date.parse(metadata.expiresAt);
  const builtAtMs = Date.parse(metadata.builtAt);
  const effectiveMaxSeenAtMs = Math.max(builtAtMs, maxSeenAtMs ?? builtAtMs);
  if (nowMs >= expiresAtMs) {
    return { status: 'expired', expiresAtMs };
  }
  if (nowMs < effectiveMaxSeenAtMs - rollbackToleranceMs) {
    return { status: 'clockRollback', expiresAtMs, maxSeenAtMs: effectiveMaxSeenAtMs };
  }
  return {
    status: 'active',
    expiresAtMs,
    maxSeenAtMs: Math.max(nowMs, effectiveMaxSeenAtMs),
  };
};

export const createTrialMonitor = ({
  metadata,
  initialMaxSeenAtMs,
  persistMaxSeenAt,
  onBlocked,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  monitorIntervalMs = TRIAL_MONITOR_INTERVAL_MS,
  persistIntervalMs = TRIAL_STATE_PERSIST_INTERVAL_MS,
}) => {
  let maxSeenAtMs = initialMaxSeenAtMs;
  let lastPersistedMaxSeenAtMs = initialMaxSeenAtMs;
  let intervalHandle = null;
  let expiryHandle = null;
  let persistPromise = Promise.resolve();
  let blocked = false;
  let stopped = false;

  const clearTimers = () => {
    if (intervalHandle !== null) clearIntervalFn(intervalHandle);
    if (expiryHandle !== null) clearTimeoutFn(expiryHandle);
    intervalHandle = null;
    expiryHandle = null;
  };

  const queuePersist = value => {
    persistPromise = persistPromise
      .catch(() => undefined)
      .then(() => persistMaxSeenAt(value))
      .then(() => { lastPersistedMaxSeenAtMs = value; });
    return persistPromise;
  };

  const block = async result => {
    if (blocked) return { status: 'blocked' };
    blocked = true;
    clearTimers();
    await onBlocked(result);
    return result;
  };

  const runCheck = async ({ forcePersist = false } = {}) => {
    if (blocked) return { status: 'blocked' };
    if (stopped) return { status: 'stopped' };
    const result = evaluateTrial({ metadata, nowMs: now(), maxSeenAtMs });
    if (result.status !== 'active') return block(result);

    maxSeenAtMs = result.maxSeenAtMs;
    const shouldPersist = forcePersist || maxSeenAtMs - lastPersistedMaxSeenAtMs >= persistIntervalMs;
    if (shouldPersist) {
      try {
        await queuePersist(maxSeenAtMs);
      } catch (error) {
        if (stopped) return { status: 'stopped' };
        return block({ status: 'stateError', error });
      }
    }
    return result;
  };

  const check = options => runCheck(options);

  const handleScheduledError = error => block({ status: 'stateError', error }).catch(() => undefined);

  const scheduleExpiryCheck = () => {
    if (blocked || stopped || expiryHandle !== null) return;
    const remainingMs = Date.parse(metadata.expiresAt) - now();
    const delayMs = Math.min(Math.max(remainingMs, 0), MAX_TIMER_DELAY_MS);
    expiryHandle = setTimeoutFn(() => {
      expiryHandle = null;
      void check().catch(handleScheduledError).then(scheduleExpiryCheck).catch(handleScheduledError);
    }, delayMs);
    expiryHandle?.unref?.();
  };

  return {
    start: () => {
      if (blocked || stopped || intervalHandle !== null) return;
      intervalHandle = setIntervalFn(() => {
        void check().catch(handleScheduledError);
      }, monitorIntervalMs);
      intervalHandle?.unref?.();
      scheduleExpiryCheck();
    },
    check,
    stop: () => {
      stopped = true;
      clearTimers();
    },
    flush: () => (
      maxSeenAtMs > lastPersistedMaxSeenAtMs ? queuePersist(maxSeenAtMs) : persistPromise
    ),
    getMaxSeenAtMs: () => maxSeenAtMs,
  };
};
