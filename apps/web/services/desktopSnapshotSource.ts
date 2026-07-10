import type { DesktopSnapshotReadSource } from './runtimeConfig';
import type { SnapshotRangeSource, SnapshotSourceLease } from './snapshotService';

const DESKTOP_SNAPSHOT_CHUNK_BYTES = 8 * 1024 * 1024;

const buildSnapshotMediaUrl = (baseUrl: string, offset: number, length: number, type: string): string => {
  const separator = baseUrl.endsWith('/') ? '' : '/';
  const url = new URL(`${baseUrl}${separator}${offset}/${length}/snapshot-media`);
  url.searchParams.set('type', type || 'application/octet-stream');
  return url.toString();
};

export const createDesktopSnapshotSource = (source: DesktopSnapshotReadSource): SnapshotRangeSource => {
  let activeLeases = 0;
  let closeRequested = false;
  let remoteClosePromise: Promise<void> | null = null;
  let closeCompletion: Promise<void> | null = null;
  let resolveCloseCompletion: (() => void) | null = null;
  let rejectCloseCompletion: ((error: unknown) => void) | null = null;
  const getCloseCompletion = (): Promise<void> => {
    if (!closeCompletion) {
      closeCompletion = new Promise<void>((resolve, reject) => {
        resolveCloseCompletion = resolve;
        rejectCloseCompletion = reject;
      });
    }
    return closeCompletion;
  };
  const closeRemoteSource = (): Promise<void> => {
    if (!remoteClosePromise) {
      remoteClosePromise = window.canvaBananaDesktop?.fileMenu?.closeSnapshotRead?.({ sourceId: source.sourceId }).then(() => {})
        ?? Promise.resolve();
      remoteClosePromise.then(
        () => resolveCloseCompletion?.(),
        error => rejectCloseCompletion?.(error),
      );
    }
    return remoteClosePromise;
  };
  const closeRemoteSourceIfIdle = (): Promise<void> | null => (
    closeRequested && activeLeases === 0 ? closeRemoteSource() : null
  ); // The last consumer owns final handle cleanup after replacement.
  const acquireLease = async (): Promise<SnapshotSourceLease> => {
    if (closeRequested && activeLeases === 0) {
      throw new Error('Snapshot read source is no longer available.');
    } // Nested chunk reads may join an active drain, but no read can restart a fully drained source.
    activeLeases += 1;
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      activeLeases -= 1;
      await closeRemoteSourceIfIdle();
    };
  };

  return {
    fileName: source.fileName,
    size: source.size,
    type: source.type,
    getMediaUrl: (offset, length, type, fileName) => {
      if (source.mediaUrlBase) {
        return Promise.resolve(buildSnapshotMediaUrl(source.mediaUrlBase, offset, length, type)); // Main already issued this source-scoped capability.
      }
      const getSnapshotMediaUrl = window.canvaBananaDesktop?.fileMenu?.getSnapshotMediaUrl;
      if (!getSnapshotMediaUrl) {
        throw new Error('Desktop snapshot media restore is unavailable.');
      }
      return getSnapshotMediaUrl({ sourceId: source.sourceId, offset, length, type, fileName }); // Main validates the scoped media URL.
    },
    readRange: async (offset, length) => {
      const readSnapshotRange = window.canvaBananaDesktop?.fileMenu?.readSnapshotRange;
      if (!readSnapshotRange) {
        throw new Error('Desktop snapshot import is unavailable.');
      }
      if (length <= DESKTOP_SNAPSHOT_CHUNK_BYTES) {
        return readSnapshotRange({ sourceId: source.sourceId, offset, length });
      }
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      for (let cursor = 0; cursor < length; cursor += DESKTOP_SNAPSHOT_CHUNK_BYTES) {
        const chunkLength = Math.min(DESKTOP_SNAPSHOT_CHUNK_BYTES, length - cursor);
        const chunk = await readSnapshotRange({ sourceId: source.sourceId, offset: offset + cursor, length: chunkLength });
        chunks.push(new Uint8Array(chunk));
        totalBytes += chunk.byteLength;
      }
      const merged = new Uint8Array(totalBytes);
      let mergeOffset = 0;
      chunks.forEach(chunk => {
        merged.set(chunk, mergeOffset);
        mergeOffset += chunk.byteLength;
      });
      return merged.buffer;
    },
    retain: async () => {
      if (closeRequested) {
        throw new Error('Snapshot read source is no longer available.');
      }
      const retainSnapshotRead = window.canvaBananaDesktop?.fileMenu?.retainSnapshotRead;
      if (!retainSnapshotRead) {
        throw new Error('Desktop snapshot source retention is unavailable.');
      }
      const result = await retainSnapshotRead({ sourceId: source.sourceId });
      if (result.retained !== true) {
        throw new Error('Desktop snapshot source could not be retained.');
      }
    },
    acquireLease,
    close: async () => {
      closeRequested = true;
      const completion = getCloseCompletion();
      void closeRemoteSourceIfIdle();
      await completion;
    },
  };
};
