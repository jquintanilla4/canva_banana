import { describe, expect, it, vi } from 'vitest';
import { createDeferredCloseLease } from './deferred-close-lease.mjs';

describe('createDeferredCloseLease', () => {
  it('defers one physical close until every active lease releases', async () => {
    const close = vi.fn(async () => {});
    const lifecycle = createDeferredCloseLease({ close });
    const releaseFirst = lifecycle.acquire();
    const releaseSecond = lifecycle.acquire();

    const firstClose = lifecycle.requestClose();
    const repeatedClose = lifecycle.requestClose();
    expect(firstClose).toBe(repeatedClose);
    expect(close).not.toHaveBeenCalled();
    expect(() => lifecycle.acquire()).toThrow('already closing');

    releaseFirst();
    releaseFirst(); // Duplicate releases cannot drain another consumer's lease.
    expect(close).not.toHaveBeenCalled();
    releaseSecond();

    await expect(firstClose).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    expect(lifecycle.getUsage()).toEqual({ activeLeases: 0, closeRequested: true, closeStarted: true });
  });

  it('closes immediately without leases and preserves close failures', async () => {
    const failure = new Error('close failed');
    const lifecycle = createDeferredCloseLease({ close: async () => { throw failure; } });

    await expect(lifecycle.requestClose()).rejects.toBe(failure);
  });
});
