import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, posix, win32 } from 'node:path';

export const MAX_MEDIA_ARCHIVE_CHUNK_BYTES = 4 * 1024 * 1024; // Bound each renderer-to-main message without limiting archive size.

const getBinaryByteLength = (data) => {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return null;
};

const toBuffer = (data) => {
  const byteLength = getBinaryByteLength(data);
  if (byteLength === null) throw new Error('Media archive data must be binary.');
  if (byteLength > MAX_MEDIA_ARCHIVE_CHUNK_BYTES) throw new Error('Media archive data chunk is too large.');
  return data instanceof ArrayBuffer
    ? Buffer.from(data)
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
};

export const sanitizeMediaArchiveFileName = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const posixName = posix.basename(trimmed);
  const fileName = win32.basename(posixName);
  if (!fileName || fileName !== trimmed || fileName === '.' || fileName === '..' || fileName.includes('\0')) {
    return 'canvas-media.zip';
  }
  return fileName.toLowerCase().endsWith('.zip') ? fileName : `${fileName}.zip`;
};

export const createMediaArchiveWriteController = ({
  isOwnerCurrent,
  isSameOwner,
  maxSessions = 4,
  maxPendingWrites = 4,
  maxPendingBytes = MAX_MEDIA_ARCHIVE_CHUNK_BYTES * 2,
} = {}) => {
  if (typeof isOwnerCurrent !== 'function' || typeof isSameOwner !== 'function') {
    throw new Error('Media archive owner validation is required.');
  }
  const sessions = new Map();
  const operations = new Set();
  let pendingBegins = 0;
  let settlingSessions = 0; // Keep closing file handles inside the session limit.
  let shuttingDown = false;

  const track = (operation) => {
    operations.add(operation);
    operation.finally(() => operations.delete(operation)).catch(() => {});
    return operation;
  };

  const getSession = (writeId, owner) => {
    if (typeof writeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(writeId)) {
      throw new Error('Media archive write session is invalid.');
    }
    const session = sessions.get(writeId);
    if (!session) throw new Error('Media archive write session is no longer available.');
    if (owner && !isSameOwner(session.owner, owner)) throw new Error('Media archive write session belongs to another renderer.');
    return session;
  };


  const begin = ({ targetPath, owner }) => track((async () => {
    if (shuttingDown) throw new Error('Media archive writes are unavailable while the app is quitting.');
    if (!isOwnerCurrent(owner)) throw new Error('Media archive owner is no longer available.');
    if (sessions.size + pendingBegins + settlingSessions >= maxSessions) throw new Error('Too many media archives are already being saved.');
    pendingBegins += 1;
    try {
      await mkdir(dirname(targetPath), { recursive: true });
      const writeId = randomBytes(18).toString('base64url');
      const tempPath = join(dirname(targetPath), `.media-archive.${writeId}.tmp`);
      const handle = await open(tempPath, 'wx', 0o600);
      if (shuttingDown || !isOwnerCurrent(owner)) {
        await handle.close().catch(() => {});
        await rm(tempPath, { force: true }).catch(() => {});
        throw new Error('Media archive owner is no longer available.');
      }
      const session = {
        owner,
        targetPath,
        tempPath,
        handle,
        closing: false,
        writeChain: Promise.resolve(),
        writeError: null,
        pendingWrites: 0,
        pendingBytes: 0,
      };
      sessions.set(writeId, session);
      return { writeId, fileName: basename(targetPath) };
    } finally {
      pendingBegins -= 1;
    }
  })());

  const write = async ({ writeId, data, owner }) => {
    const session = getSession(writeId, owner);
    const chunk = toBuffer(data);
    if (session.closing) throw new Error('Media archive write session is closing.');
    if (session.pendingWrites >= maxPendingWrites || chunk.byteLength > maxPendingBytes - session.pendingBytes) {
      throw new Error('Too many media archive chunks are already in progress.');
    }
    session.pendingWrites += 1;
    session.pendingBytes += chunk.byteLength;
    const writeChunk = async () => {
      try {
        if (session.writeError) throw session.writeError;
        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await session.handle.write(chunk, offset, chunk.byteLength - offset);
          if (result.bytesWritten <= 0) throw new Error('Media archive data could not be written safely.');
          offset += result.bytesWritten;
        }
        return { written: chunk.byteLength };
      } catch (error) {
        session.writeError ??= error;
        throw error;
      } finally {
        session.pendingWrites -= 1;
        session.pendingBytes -= chunk.byteLength;
      }
    };
    const result = session.writeChain.then(writeChunk, writeChunk);
    session.writeChain = result.catch(() => {});
    return result;
  };

  const finish = (writeId, owner) => {
    const session = getSession(writeId, owner);
    session.closing = true;
    sessions.delete(writeId);
    settlingSessions += 1;
    return track((async () => {
      let renamed = false;
      try {
        await session.writeChain;
        if (session.writeError) throw session.writeError;
        if (!isOwnerCurrent(session.owner)) throw new Error('Media archive owner is no longer available.');
        await session.handle.sync();
        await session.handle.close();
        if (!isOwnerCurrent(session.owner)) throw new Error('Media archive owner is no longer available.');
        await rename(session.tempPath, session.targetPath);
        renamed = true;
        return { saved: true };
      } catch (error) {
        await session.handle.close().catch(() => {});
        if (!renamed) await rm(session.tempPath, { force: true }).catch(() => {});
        throw error;
      } finally {
        settlingSessions -= 1;
      }
    })());
  };

  const abort = (writeId, owner) => {
    const session = sessions.get(writeId);
    if (!session) return Promise.resolve({ aborted: true });
    if (owner && !isSameOwner(session.owner, owner)) throw new Error('Media archive write session belongs to another renderer.');
    session.closing = true;
    sessions.delete(writeId);
    settlingSessions += 1;
    return track((async () => {
      try {
        await session.writeChain.catch(() => {});
        await session.handle.close().catch(() => {});
        await rm(session.tempPath, { force: true }).catch(() => {});
        return { aborted: true };
      } finally {
        settlingSessions -= 1;
      }
    })());
  };

  const abortWhere = async (predicate) => {
    const matchingIds = [...sessions.entries()].filter(([, session]) => predicate(session.owner)).map(([id]) => id);
    await Promise.allSettled(matchingIds.map(id => abort(id)));
  };

  const shutdown = async () => {
    shuttingDown = true;
    do {
      await Promise.allSettled([...sessions.keys()].map(id => abort(id)));
      await Promise.allSettled([...operations]);
    } while (sessions.size > 0 || operations.size > 0);
  };

  return {
    begin,
    write,
    finish,
    abort,
    abortWhere,
    shutdown,
    getUsage: () => ({ sessions: sessions.size, operations: operations.size, shuttingDown }),
  };
};
