import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferredCloseLease } from './deferred-close-lease.mjs';
import { createSnapshotDownloadCoordinator } from './snapshot-download-coordinator.mjs';

class FakeDownloadItem extends EventEmitter {
  cancel = vi.fn();
}

const buildCoordinator = (options = {}) => {
  let sequence = 0;
  return createSnapshotDownloadCoordinator({
    createToken: () => `download-${++sequence}`,
    ...options,
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe('snapshot download coordinator', () => {
  it('binds one exact range to its renderer until the DownloadItem finishes', () => {
    const coordinator = buildCoordinator();
    const releaseSource = vi.fn();
    const reservation = coordinator.reserve({
      requestUrl: 'canva-banana-snapshot://media/source-1/10/12/media.png?download=1',
      sourceId: 'source-1',
      offset: 10,
      length: 12,
      webContentsId: 7,
      releaseSource,
    });
    const item = new FakeDownloadItem();

    expect(coordinator.isAuthorized({ token: reservation.token, sourceId: 'source-1', offset: 10, length: 12 })).toBe(true);
    expect(coordinator.isAuthorized({ token: reservation.token, sourceId: 'source-1', offset: 10, length: 13 })).toBe(false);
    expect(coordinator.claim({ url: reservation.url, webContentsId: 8, item })).toBe(false);
    expect(coordinator.claim({ url: reservation.url, webContentsId: 7, item })).toBe(true);
    expect(releaseSource).not.toHaveBeenCalled();

    item.emit('done', {}, 'completed');
    item.emit('done', {}, 'interrupted'); // Duplicate terminal signals stay idempotent.
    expect(releaseSource).toHaveBeenCalledOnce();
    expect(coordinator.getUsage()).toEqual({ active: 0 });
  });

  it('keeps concurrent downloads independent and cancels all of them for shutdown', () => {
    const coordinator = buildCoordinator();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const first = coordinator.reserve({
      requestUrl: 'canva-banana-snapshot://media/source-1/0/4/a.png?download=1',
      sourceId: 'source-1',
      offset: 0,
      length: 4,
      webContentsId: 7,
      releaseSource: firstRelease,
    });
    coordinator.reserve({
      requestUrl: 'canva-banana-snapshot://media/source-1/4/4/b.png?download=1',
      sourceId: 'source-1',
      offset: 4,
      length: 4,
      webContentsId: 7,
      releaseSource: secondRelease,
    });
    const firstItem = new FakeDownloadItem();
    coordinator.claim({ url: first.url, webContentsId: 7, item: firstItem });

    coordinator.cancelAll();

    expect(firstItem.cancel).toHaveBeenCalledOnce();
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(secondRelease).toHaveBeenCalledOnce();
    expect(coordinator.getUsage()).toEqual({ active: 0 });
  });

  it('lets a source close request drain behind an active download', async () => {
    const physicalClose = vi.fn(async () => {});
    const sourceLifecycle = createDeferredCloseLease({ close: physicalClose });
    const coordinator = buildCoordinator();
    const reservation = coordinator.reserve({
      requestUrl: 'canva-banana-snapshot://media/source-1/0/4/a.png?download=1',
      sourceId: 'source-1',
      offset: 0,
      length: 4,
      webContentsId: 7,
      releaseSource: sourceLifecycle.acquire(),
    });
    const item = new FakeDownloadItem();
    coordinator.claim({ url: reservation.url, webContentsId: 7, item });

    const closePromise = sourceLifecycle.requestClose(); // Snapshot replacement blocks new work but preserves this download.
    expect(physicalClose).not.toHaveBeenCalled();
    expect(sourceLifecycle.isClosing()).toBe(true);

    item.emit('done', {}, 'completed');

    await expect(closePromise).resolves.toBeUndefined();
    expect(physicalClose).toHaveBeenCalledOnce();
  });

  it('releases an unclaimed reservation after the startup timeout', async () => {
    vi.useFakeTimers();
    const coordinator = buildCoordinator({ startTimeoutMs: 1_000 });
    const releaseSource = vi.fn();
    coordinator.reserve({
      requestUrl: 'canva-banana-snapshot://media/source-1/0/4/a.png?download=1',
      sourceId: 'source-1',
      offset: 0,
      length: 4,
      webContentsId: 7,
      releaseSource,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(releaseSource).toHaveBeenCalledOnce();
    expect(coordinator.getUsage()).toEqual({ active: 0 });
  });
});
