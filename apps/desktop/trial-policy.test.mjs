import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createTrialMonitor,
  evaluateTrial,
  readTrialState,
  writeTrialStateAtomic,
} from './trial-policy.mjs';

const trialMetadata = {
  schemaVersion: 1,
  variant: 'trial',
  builtAt: '2026-08-27T12:00:00.000Z',
  expiresAt: '2026-09-30T12:00:00.000Z',
};

describe('trial policy', () => {
  it('ignores trial state for regular builds', () => {
    expect(evaluateTrial({
      metadata: { schemaVersion: 1, variant: 'regular' },
      nowMs: Date.parse('2030-01-01T00:00:00Z'),
      maxSeenAtMs: Date.parse('2040-01-01T00:00:00Z'),
    })).toEqual({ status: 'regular' });
  });

  it('accepts active trials and advances the maximum clock', () => {
    const nowMs = Date.parse('2026-09-01T12:00:00Z');
    expect(evaluateTrial({ metadata: trialMetadata, nowMs, maxSeenAtMs: nowMs - 1000 })).toMatchObject({
      status: 'active',
      maxSeenAtMs: nowMs,
    });
  });

  it.each([
    '2026-09-30T12:00:00.000Z',
    '2026-10-01T12:00:00.000Z',
  ])('blocks a trial at or after expiration: %s', timestamp => {
    expect(evaluateTrial({ metadata: trialMetadata, nowMs: Date.parse(timestamp) }).status).toBe('expired');
  });

  it('blocks rollbacks beyond five minutes but permits the tolerance window', () => {
    const maxSeenAtMs = Date.parse('2026-09-01T12:00:00Z');
    expect(evaluateTrial({ metadata: trialMetadata, nowMs: maxSeenAtMs - 5 * 60 * 1000, maxSeenAtMs }).status).toBe('active');
    expect(evaluateTrial({ metadata: trialMetadata, nowMs: maxSeenAtMs - 5 * 60 * 1000 - 1, maxSeenAtMs }).status).toBe('clockRollback');
  });

  it('uses the build time as the first-use clock floor', () => {
    const builtAtMs = Date.parse(trialMetadata.builtAt);
    expect(evaluateTrial({
      metadata: trialMetadata,
      nowMs: builtAtMs - 5 * 60 * 1000,
    })).toMatchObject({ status: 'active', maxSeenAtMs: builtAtMs });
    expect(evaluateTrial({
      metadata: trialMetadata,
      nowMs: builtAtMs - 5 * 60 * 1000 - 1,
    })).toMatchObject({ status: 'clockRollback', maxSeenAtMs: builtAtMs });
  });

  it('treats a missing state file as first use and rejects malformed state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'canva-banana-trial-'));
    const statePath = join(directory, 'trial-state.json');
    await expect(readTrialState(statePath)).resolves.toBeNull();
    await writeFile(statePath, '{broken', 'utf8');
    await expect(readTrialState(statePath)).rejects.toThrow(/valid JSON/);
  });

  it('writes and reads the maximum clock atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'canva-banana-trial-'));
    const statePath = join(directory, 'trial-state.json');
    const maxSeenAtMs = Date.parse('2026-09-01T12:00:00Z');
    await writeTrialStateAtomic(statePath, maxSeenAtMs);
    await expect(readTrialState(statePath)).resolves.toEqual({
      schemaVersion: 1,
      maxSeenAt: '2026-09-01T12:00:00.000Z',
    });
    expect(JSON.parse(await readFile(statePath, 'utf8')).maxSeenAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('notifies once when concurrent checks discover expiration', async () => {
    const onBlocked = vi.fn(async () => undefined);
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs: Date.parse('2026-09-01T12:00:00Z'),
      persistMaxSeenAt: vi.fn(async () => undefined),
      onBlocked,
      now: () => Date.parse('2026-10-01T12:00:00Z'),
    });
    await Promise.all([monitor.check(), monitor.check(), monitor.check()]);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('blocks if periodic clock persistence fails', async () => {
    const onBlocked = vi.fn(async () => undefined);
    const initialMaxSeenAtMs = Date.parse('2026-09-01T12:00:00Z');
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs,
      persistMaxSeenAt: vi.fn(async () => { throw new Error('disk full'); }),
      onBlocked,
      now: () => initialMaxSeenAtMs + 5 * 60 * 1000,
    });
    await expect(monitor.check()).resolves.toMatchObject({ status: 'stateError' });
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('does not block if persistence fails after the monitor stops', async () => {
    let rejectPersist;
    const nowMs = Date.parse('2026-09-01T12:00:00Z');
    const persistMaxSeenAt = vi.fn(() => new Promise((_resolve, reject) => { rejectPersist = reject; }));
    const onBlocked = vi.fn(async () => undefined);
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs: nowMs,
      persistMaxSeenAt,
      onBlocked,
      now: () => nowMs,
    });

    const check = monitor.check({ forcePersist: true });
    await vi.waitFor(() => expect(persistMaxSeenAt).toHaveBeenCalledTimes(1));
    monitor.stop();
    rejectPersist(new Error('shutdown write failed'));

    await expect(check).resolves.toMatchObject({ status: 'stopped' });
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('blocks immediately when expiration occurs while persistence is in flight', async () => {
    let releasePersist;
    let nowMs = Date.parse('2026-09-01T12:00:00Z');
    const persistMaxSeenAt = vi.fn(() => new Promise(resolve => { releasePersist = resolve; }));
    const onBlocked = vi.fn(async () => undefined);
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs: nowMs,
      persistMaxSeenAt,
      onBlocked,
      now: () => nowMs,
    });

    const firstCheck = monitor.check({ forcePersist: true });
    await vi.waitFor(() => expect(persistMaxSeenAt).toHaveBeenCalledTimes(1));
    nowMs = Date.parse(trialMetadata.expiresAt);
    const expiryCheck = monitor.check();

    await expect(expiryCheck).resolves.toMatchObject({ status: 'expired' });
    expect(onBlocked).toHaveBeenCalledTimes(1);
    releasePersist();
    await expect(firstCheck).resolves.toMatchObject({ status: 'active' });
  });

  it('serializes forced persistence from concurrent checks', async () => {
    let releaseFirstPersist;
    let nowMs = Date.parse('2026-09-01T12:00:00Z');
    const persistMaxSeenAt = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirstPersist = resolve; }))
      .mockResolvedValue(undefined);
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs: nowMs,
      persistMaxSeenAt,
      onBlocked: vi.fn(async () => undefined),
      now: () => nowMs,
    });

    const firstCheck = monitor.check({ forcePersist: true });
    await vi.waitFor(() => expect(persistMaxSeenAt).toHaveBeenCalledTimes(1));
    nowMs += 1;
    const secondCheck = monitor.check({ forcePersist: true });
    releaseFirstPersist();

    await Promise.all([firstCheck, secondCheck]);
    expect(persistMaxSeenAt).toHaveBeenCalledTimes(2);
    expect(persistMaxSeenAt).toHaveBeenLastCalledWith(nowMs);
  });

  it('does not reschedule an expiry check after stop during persistence', async () => {
    let expiryCallback;
    let releasePersist;
    const nowMs = Date.parse('2026-09-01T12:00:00Z');
    const setTimeoutFn = vi.fn(callback => {
      expiryCallback = callback;
      return { unref: vi.fn() };
    });
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs: nowMs,
      persistMaxSeenAt: vi.fn(() => new Promise(resolve => { releasePersist = resolve; })),
      onBlocked: vi.fn(async () => undefined),
      now: () => nowMs,
      setIntervalFn: vi.fn(() => ({ unref: vi.fn() })),
      clearIntervalFn: vi.fn(),
      setTimeoutFn,
      clearTimeoutFn: vi.fn(),
      persistIntervalMs: 0,
    });

    monitor.start();
    expiryCallback();
    await vi.waitFor(() => expect(releasePersist).toBeTypeOf('function'));
    monitor.stop();
    releasePersist();
    await expect(monitor.check()).resolves.toMatchObject({ status: 'stopped' });
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
  });

  it('contains errors from fire-and-forget scheduled checks', async () => {
    let intervalCallback;
    const nowMs = Date.parse('2026-09-01T12:00:00Z');
    const onBlocked = vi.fn(async () => { throw new Error('dialog failed'); });
    const monitor = createTrialMonitor({
      metadata: trialMetadata,
      initialMaxSeenAtMs: nowMs,
      persistMaxSeenAt: vi.fn(async () => { throw new Error('disk full'); }),
      onBlocked,
      now: () => nowMs,
      setIntervalFn: vi.fn(callback => {
        intervalCallback = callback;
        return { unref: vi.fn() };
      }),
      clearIntervalFn: vi.fn(),
      setTimeoutFn: vi.fn(() => ({ unref: vi.fn() })),
      clearTimeoutFn: vi.fn(),
      persistIntervalMs: 0,
    });

    monitor.start();
    expect(() => intervalCallback()).not.toThrow();
    await expect(monitor.check()).resolves.toMatchObject({ status: 'blocked' });
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});
