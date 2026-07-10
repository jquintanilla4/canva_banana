import { describe, expect, it, vi } from 'vitest';
import { createAppQuitBarrier } from './app-quit-barrier.mjs';

describe('createAppQuitBarrier', () => {
  it('prevents repeated quit attempts until one cleanup finishes', async () => {
    let releaseCleanup = () => {};
    const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
    const cleanup = vi.fn(async () => cleanupGate);
    const quit = vi.fn();
    const handler = createAppQuitBarrier({ cleanup, quit });
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    handler(firstEvent);
    handler(secondEvent);
    await Promise.resolve();

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    releaseCleanup();
    await cleanupGate;
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));

    const resumedEvent = { preventDefault: vi.fn() };
    handler(resumedEvent);
    expect(resumedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('resumes quitting after failed cleanup is reported', async () => {
    const error = new Error('cleanup failed');
    const quit = vi.fn();
    const onCleanupError = vi.fn();
    const handler = createAppQuitBarrier({
      cleanup: async () => { throw error; },
      quit,
      onCleanupError,
    });

    handler({ preventDefault: vi.fn() });
    await vi.waitFor(() => {
      expect(onCleanupError).toHaveBeenCalledWith('App shutdown cleanup failed.', error);
      expect(quit).toHaveBeenCalledTimes(1);
    });
  });
});
