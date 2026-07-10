import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteBackupSession,
  getBackupSession,
  listBackupSessions,
  pruneBackupSessions,
  saveBackupSessionBinary,
} from '../backupService';
import { SnapshotMediaReadError, type SnapshotBinary, type SnapshotImageManifest } from '../snapshotService';

afterEach(() => {
  vi.restoreAllMocks();
  window.canvaBananaDesktop = undefined;
});

describe('backupService', () => {
  const installDesktopBackupBridge = (summaries: Array<{
    id: string;
    createdAt: number;
    updatedAt: number;
    fileName: string;
    size: number;
  }>) => {
    const deleteBackupSnapshot = vi.fn(async ({ id }: { id: string }) => {
      const index = summaries.findIndex(summary => summary.id === id);
      if (index >= 0) summaries.splice(index, 1);
      return { deleted: true };
    });
    const openBackupSnapshot = vi.fn(async ({ id }: { id: string }) => {
      const summary = summaries.find(item => item.id === id);
      if (!summary) throw new Error('Backup not found.');
      return {
        sourceId: `source-${id}`,
        fileName: summary.fileName,
        size: summary.size,
        type: 'application/octet-stream',
      };
    });
    window.canvaBananaDesktop = {
      fileMenu: {
        beginBackupSnapshot: vi.fn(async () => ({ writeId: 'backup-write-1', fileName: 'scene.bcsnap' })),
        writeSnapshotChunk: vi.fn(async ({ data }: { data: ArrayBuffer }) => ({ written: data.byteLength })),
        finishSnapshotWrite: vi.fn(async () => ({ saved: true })),
        abortSnapshotWrite: vi.fn(async () => ({ aborted: true })),
        listSnapshotBackups: vi.fn(async () => [...summaries]),
        openBackupSnapshot,
        deleteBackupSnapshot,
      },
    };
    return { deleteBackupSnapshot, openBackupSnapshot };
  };

  it('lists native backups when legacy IndexedDB is unavailable', async () => {
    const summaries = [{
      id: 'native-1',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'large-scene.bcsnap',
      size: 700 * 1024 * 1024,
    }];
    installDesktopBackupBridge(summaries);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(listBackupSessions()).resolves.toEqual(summaries);
  });

  it('opens and deletes native backups without requiring legacy IndexedDB', async () => {
    const summaries = [{
      id: 'native-1',
      createdAt: 1,
      updatedAt: 2,
      fileName: 'large-scene.bcsnap',
      size: 700 * 1024 * 1024,
    }];
    const { deleteBackupSnapshot, openBackupSnapshot } = installDesktopBackupBridge(summaries);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(getBackupSession('native-1')).resolves.toEqual(expect.objectContaining({
      id: 'native-1',
      source: expect.objectContaining({ sourceId: 'source-native-1' }),
    }));
    await expect(deleteBackupSession('native-1')).resolves.toBeUndefined();

    expect(openBackupSnapshot).toHaveBeenCalledWith({ id: 'native-1' });
    expect(deleteBackupSnapshot).toHaveBeenCalledWith({ id: 'native-1' });
  });

  it('prunes native backups when legacy IndexedDB is unavailable', async () => {
    const summaries = [
      { id: 'native-3', createdAt: 3, updatedAt: 3, fileName: 'three.bcsnap', size: 3 },
      { id: 'native-2', createdAt: 2, updatedAt: 2, fileName: 'two.bcsnap', size: 2 },
      { id: 'native-1', createdAt: 1, updatedAt: 1, fileName: 'one.bcsnap', size: 1 },
    ];
    const { deleteBackupSnapshot } = installDesktopBackupBridge(summaries);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(pruneBackupSessions(2)).resolves.toBeUndefined();

    expect(deleteBackupSnapshot).toHaveBeenCalledWith({ id: 'native-1' });
  });

  it('preserves media read errors while writing desktop backup snapshots', async () => {
    const manifest: SnapshotImageManifest = {
      id: 'missing-image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'missing.png',
      fileType: 'image/png',
      fileSize: 1,
      mediaType: 'image',
    };
    const missingBlob = new Blob(['missing'], { type: 'image/png' });
    vi.spyOn(missingBlob, 'slice').mockReturnValue({
      size: 1,
      arrayBuffer: () => Promise.reject(new DOMException('File missing.', 'NotFoundError')),
    } as Blob); // Simulates a deleted source file during lazy blob reads.
    const binary: SnapshotBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-09T00:00:00.000Z',
        state: {
          images: [manifest],
          notes: [],
          paths: [],
        },
      },
      images: [{ manifest, blob: missingBlob }],
    };
    const abortSnapshotWrite = vi.fn(async () => ({ aborted: true }));
    window.canvaBananaDesktop = {
      fileMenu: {
        beginBackupSnapshot: vi.fn(async () => ({ writeId: 'backup-write-1', fileName: 'scene.bcsnap' })),
        writeSnapshotChunk: vi.fn(async () => ({ written: 1 })),
        finishSnapshotWrite: vi.fn(async () => ({ saved: true })),
        abortSnapshotWrite,
        listSnapshotBackups: vi.fn(async () => []),
        openBackupSnapshot: vi.fn(),
        deleteBackupSnapshot: vi.fn(),
      },
    };

    await expect(saveBackupSessionBinary({
      id: 'backup-1',
      createdAt: 1,
      updatedAt: 1,
      fileName: 'scene.bcsnap',
      size: 1,
    }, binary)).rejects.toBeInstanceOf(SnapshotMediaReadError);

    expect(abortSnapshotWrite).toHaveBeenCalledWith({ writeId: 'backup-write-1' });
  });

  it('composes real media Blobs zero-copy when materializing web backups', async () => {
    const manifest: SnapshotImageManifest = {
      id: 'image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'image.png',
      fileType: 'image/png',
      fileSize: 7,
      mediaType: 'image',
    };
    const mediaBlob = new Blob(['payload'], { type: 'image/png' });
    const slice = vi.spyOn(mediaBlob, 'slice');
    const binary: SnapshotBinary = {
      manifest: {
        version: 2,
        createdAt: '2026-07-09T00:00:00.000Z',
        state: {
          images: [manifest],
          notes: [],
          paths: [],
        },
      },
      images: [{ manifest, blob: mediaBlob }],
    };

    // No desktop bridge: the web path materializes a Blob before IndexedDB (unavailable in jsdom)
    // rejects the save. Materialization must not chunk-read real Blobs into ArrayBuffers.
    await expect(saveBackupSessionBinary({
      id: 'backup-web-1',
      createdAt: 1,
      updatedAt: 1,
      fileName: 'scene.bcsnap',
      size: 7,
    }, binary)).rejects.toThrow('IndexedDB is not available');

    expect(slice).not.toHaveBeenCalled();
  });
});
