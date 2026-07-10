import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSnapshotSource } from '../desktopSnapshotSource';

afterEach(() => {
  delete window.canvaBananaDesktop;
});

describe('createDesktopSnapshotSource', () => {
  it('builds lazy media URLs from the source capability without per-item IPC', async () => {
    const getSnapshotMediaUrl = vi.fn(async () => 'unused');
    window.canvaBananaDesktop = { fileMenu: { getSnapshotMediaUrl } };
    const source = createDesktopSnapshotSource({
      sourceId: 'source-capability',
      fileName: 'large-session.bcsnap',
      size: 64 * 1024 * 1024 * 1024,
      type: 'application/octet-stream',
      mediaUrlBase: 'canva-banana-snapshot://media/source-capability/',
    });

    const mediaUrl = await source.getMediaUrl?.(128, 8 * 1024 * 1024 * 1024, 'video/mp4', 'large-video.mp4');

    expect(mediaUrl).toBe('canva-banana-snapshot://media/source-capability/128/8589934592/snapshot-media?type=video%2Fmp4');
    expect(getSnapshotMediaUrl).not.toHaveBeenCalled();
  });

  it('fails retention when the desktop bridge cannot confirm the source lease', async () => {
    const source = createDesktopSnapshotSource({
      sourceId: 'source-retain-missing',
      fileName: 'large-session.bcsnap',
      size: 8 * 1024 * 1024 * 1024,
      type: 'application/octet-stream',
    });

    await expect(source.retain?.()).rejects.toThrow('retention is unavailable');

    window.canvaBananaDesktop = {
      fileMenu: {
        retainSnapshotRead: vi.fn(async () => ({ retained: false })),
      },
    };
    const unconfirmedSource = createDesktopSnapshotSource({
      sourceId: 'source-retain-false',
      fileName: 'large-session.bcsnap',
      size: 8 * 1024 * 1024 * 1024,
      type: 'application/octet-stream',
    });

    await expect(unconfirmedSource.retain?.()).rejects.toThrow('could not be retained');
  });

  it('lets nested reads finish while draining and closes after the final lease', async () => {
    const closeSnapshotRead = vi.fn(async () => ({ closed: true }));
    window.canvaBananaDesktop = { fileMenu: { closeSnapshotRead } };
    const source = createDesktopSnapshotSource({
      sourceId: 'source-1',
      fileName: 'large-session.bcsnap',
      size: 8 * 1024 * 1024 * 1024,
      type: 'application/octet-stream',
    });
    const releaseFirst = await source.acquireLease?.();
    const releaseSecond = await source.acquireLease?.();

    const closePromise = source.close?.();
    await Promise.resolve();
    expect(closeSnapshotRead).not.toHaveBeenCalled();
    const releaseNestedRead = await source.acquireLease?.(); // A streaming save may start another chunk read inside its outer lease.

    await releaseFirst?.();
    expect(closeSnapshotRead).not.toHaveBeenCalled();

    await releaseSecond?.();
    expect(closeSnapshotRead).not.toHaveBeenCalled();

    await releaseNestedRead?.();
    await closePromise;
    expect(closeSnapshotRead).toHaveBeenCalledTimes(1);
    await expect(source.acquireLease?.()).rejects.toThrow('no longer available');
  });

  it('closes the remote source only once across repeated cleanup requests', async () => {
    const closeSnapshotRead = vi.fn(async () => ({ closed: true }));
    window.canvaBananaDesktop = { fileMenu: { closeSnapshotRead } };
    const source = createDesktopSnapshotSource({
      sourceId: 'source-2',
      fileName: 'large-session.bcsnap',
      size: 1,
      type: 'application/octet-stream',
    });

    await Promise.all([source.close?.(), source.close?.()]);

    expect(closeSnapshotRead).toHaveBeenCalledTimes(1);
  });
});
