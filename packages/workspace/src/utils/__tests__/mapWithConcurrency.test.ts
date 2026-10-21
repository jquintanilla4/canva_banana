import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../mapWithConcurrency';

describe('mapWithConcurrency', () => {
  it('preserves result order while bounding simultaneous work', async () => {
    let active = 0;
    let peakActive = 0;
    const started: number[] = [];
    const releaseWorkers = new Map<number, () => void>();
    const mapped = mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async value => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      started.push(value);
      await new Promise<void>(resolve => releaseWorkers.set(value, resolve));
      active -= 1;
      return value * 2;
    });

    await viWaitFor(() => started.length === 2);
    releaseWorkers.get(0)?.();
    releaseWorkers.get(1)?.();
    await viWaitFor(() => started.length === 4);
    releaseWorkers.get(2)?.();
    releaseWorkers.get(3)?.();
    await viWaitFor(() => started.length === 6);
    releaseWorkers.get(4)?.();
    releaseWorkers.get(5)?.();

    await expect(mapped).resolves.toEqual([0, 2, 4, 6, 8, 10]);
    expect(peakActive).toBe(2);
  });

  it('rejects invalid concurrency without starting work', async () => {
    let called = false;

    await expect(mapWithConcurrency([1], 0, async () => {
      called = true;
      return 1;
    })).rejects.toThrow('positive integer');
    expect(called).toBe(false);
  });
});

const viWaitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) {
    await Promise.resolve();
  }
  if (!condition()) throw new Error('Condition was not reached.');
}; // Keeps this utility test independent from DOM polling helpers.
