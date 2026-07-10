import { describe, expect, it, vi } from 'vitest';
import { createManagedServiceLifecycle } from './managed-service-lifecycle.mjs';

const createGate = () => {
  let release = () => {};
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
};

describe('createManagedServiceLifecycle', () => {
  it('blocks a restart start when shutdown begins during its stop', async () => {
    const stopGate = createGate();
    const start = vi.fn(async () => ({ url: 'http://localhost' }));
    const stop = vi.fn(async () => stopGate.promise);
    const lifecycle = createManagedServiceLifecycle({ start, stop });

    const restartPromise = lifecycle.restart();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    const shutdownPromise = lifecycle.shutdown();
    stopGate.release();

    await expect(restartPromise).resolves.toBeUndefined();
    await expect(shutdownPromise).resolves.toBeUndefined();
    expect(start).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight service start without waiting for its health timeout', async () => {
    const events = [];
    const start = vi.fn(async (signal) => {
      events.push('start');
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const stop = vi.fn(async () => { events.push('stop'); });
    const lifecycle = createManagedServiceLifecycle({ start, stop });

    const startPromise = lifecycle.start();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
    await expect(startPromise).resolves.toBeUndefined();
    expect(events).toEqual(['start', 'stop']);
    expect(start.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(start.mock.calls[0][0].aborted).toBe(true);
  });

  it('finishes shutdown before a non-cooperative start and cleans up again when it settles', async () => {
    const startGate = createGate();
    const events = [];
    const start = vi.fn(async () => {
      events.push('start');
      await startGate.promise;
      events.push('started');
      return { url: 'http://localhost' };
    });
    const stop = vi.fn(async () => { events.push('stop'); });
    const lifecycle = createManagedServiceLifecycle({ start, stop });

    const startPromise = lifecycle.start();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    await expect(lifecycle.shutdown()).resolves.toBeUndefined();
    expect(events).toEqual(['start', 'stop']);

    startGate.release();
    await expect(startPromise).resolves.toBeUndefined();
    expect(events).toEqual(['start', 'stop', 'started', 'stop']);
  });

  it('serializes concurrent restarts so service instances cannot overlap', async () => {
    const firstStopGate = createGate();
    const events = [];
    const stop = vi.fn(async () => {
      events.push('stop');
      if (stop.mock.calls.length === 1) await firstStopGate.promise;
    });
    const start = vi.fn(async () => { events.push('start'); });
    const lifecycle = createManagedServiceLifecycle({ start, stop });

    const firstRestart = lifecycle.restart();
    const secondRestart = lifecycle.restart();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(start).not.toHaveBeenCalled();
    firstStopGate.release();

    await Promise.all([firstRestart, secondRestart]);
    expect(events).toEqual(['stop', 'start', 'stop', 'start']);
  });

  it('keeps shutdown terminal for later start and restart requests', async () => {
    const start = vi.fn();
    const stop = vi.fn(async () => {});
    const lifecycle = createManagedServiceLifecycle({ start, stop });

    await lifecycle.shutdown();

    await expect(lifecycle.start()).resolves.toBeUndefined();
    await expect(lifecycle.restart()).resolves.toBeUndefined();
    expect(lifecycle.isShutdownRequested()).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
