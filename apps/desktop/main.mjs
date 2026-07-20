import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, protocol, session, shell } from 'electron';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DESKTOP_SETTING_KEYS,
  REQUIRED_DESKTOP_SETTING_KEYS,
  SECRET_DESKTOP_SETTING_KEYS,
  applyDesktopSettings,
  parseDotenvEntry,
  readDesktopSettingsFile,
  writeDesktopSettingsFileAtomic,
} from './settings-env.mjs';
import { APPLICATION_MENU_ITEM_IDS, FILE_MENU_COMMANDS, buildApplicationMenuTemplate } from './application-menu.mjs';
import { createAppQuitBarrier } from './app-quit-barrier.mjs';
import { createBoundedHttpServerShutdown } from './bounded-http-server-shutdown.mjs';
import { createManagedServiceLifecycle } from './managed-service-lifecycle.mjs';
import {
  assertKnownAppIconId,
  buildAppIconState,
  getAppIconPreferencePath,
  getRuntimeAppIconOptions,
  readSelectedAppIconId,
  writeSelectedAppIconId,
} from './app-icon-store.mjs';
import { createChatHistoryStore } from './chat-history-store.mjs';
import { createSnapshotBackupCoordinator } from './snapshot-backup-coordinator.mjs';
import { openSnapshotBackupSource } from './snapshot-backup-open.mjs';
import { reconcileSnapshotBackupDirectory } from './snapshot-backup-recovery.mjs';
import { createSnapshotMediaStreamController, isSnapshotMediaStreamBusyError } from './snapshot-media-stream-controller.mjs';
import { createDeferredCloseLease } from './deferred-close-lease.mjs';
import { SNAPSHOT_DOWNLOAD_TOKEN_PARAM, createSnapshotDownloadCoordinator } from './snapshot-download-coordinator.mjs';
import { canReplaceSnapshotAutosaveTarget } from './snapshot-autosave-target.mjs';
import { createRendererResourceEpochs } from './renderer-resource-epochs.mjs';
import snapshotOperationBudget from './snapshot-operation-budget.cjs';
import {
  MAX_SNAPSHOT_BACKUP_COUNT,
  MAX_SNAPSHOT_CHUNK_BYTES,
  MAX_SNAPSHOT_WRITE_BYTES,
  assertSnapshotBackupSizeCanBeWritten,
  assertSnapshotDataCanBeWritten,
  assertSnapshotFileCanBeOpened,
  getAttachmentContentDisposition,
  getSnapshotBackupTransactionBaseBytes,
  isAutosaveEligibleSnapshotFileName,
  sanitizeSnapshotFileName,
} from './file-menu-utils.mjs';
import { resolveSecureBackendRuntime, shouldUseExternalSecureBackend } from './secure-backend-runtime.mjs';
import {
  SNAPSHOT_MEDIA_PROTOCOL,
  SNAPSHOT_MEDIA_PROTOCOL_PRIVILEGES,
  getDevRendererUrl,
  isAllowedAudioPermissionRequest,
} from './security.mjs';

const { createSnapshotOperationBudget } = snapshotOperationBudget;

app.setName('The Institute');
protocol.registerSchemesAsPrivileged([{
  scheme: SNAPSHOT_MEDIA_PROTOCOL,
  privileges: SNAPSHOT_MEDIA_PROTOCOL_PRIVILEGES,
}]);

const hasSingleInstanceLock = app.requestSingleInstanceLock(); // One main process owns userData files and managed services.
if (!hasSingleInstanceLock) {
  app.quit(); // A running instance already owns the chat history file.
}

const currentFilePath = fileURLToPath(import.meta.url);
const desktopDir = dirname(currentFilePath);
const repoRoot = resolve(desktopDir, '../..');
const webDistDir = resolve(repoRoot, 'apps/web/dist');
const preloadPath = join(desktopDir, 'preload.cjs');
const devRendererUrl = getDevRendererUrl(process.env, app.isPackaged);
const fileMenuCommandChannel = 'canva-banana:file-menu-command';
const chatHistoryClearedChannel = 'canva-banana:chat-history-cleared';
const desktopAuthToken = randomBytes(32).toString('base64url'); // Per-launch secret for desktop-only backend calls.
const maxClipboardTextChars = 1_000_000; // Match preload's native clipboard IPC cap.
const serviceStatus = {
  secureBackend: { state: 'stopped' },
  pythonBackend: { state: 'stopped' },
};
const managedChildren = new Set();
let managedSecureBackendServer = null;
let managedSecureBackendShutdown = null; // Owns the socket tracker and bounded server close.
let managedServicesStopPromise = null; // Makes concurrent restart and quit cleanup share one stop.
let mainWindow = null;
let mainWindowPromise = null;
let runtimeConfig = null;
let startupPromise = null;
let fileMenuState = {
  autosaveEnabled: true,
  showZoomLevelBadge: true,
  showFileName: true,
  isClearingJimengCache: false,
};

const normalizeBaseUrl = (value) => value.replace(/\/+$/, ''); // Renderer URL builders expect no trailing slash.

const getUrlOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return undefined; // Invalid runtime URLs must not receive managed backend tokens.
  }
};

const setServiceStatus = (serviceName, patch) => {
  serviceStatus[serviceName] = {
    ...serviceStatus[serviceName],
    ...patch,
    updatedAt: new Date().toISOString(),
  }; // Keep diagnostics cheap to expose through preload.
};

const getServiceStatusSnapshot = () => JSON.parse(JSON.stringify(serviceStatus)); // Avoid leaking mutable main-process objects.

const getDesktopSettingsPath = () => join(app.getPath('userData'), '.env.local'); // QA-managed settings live in App Support.

const getChatHistoryPath = () => join(app.getPath('userData'), 'chat-history.json'); // App-level prompt chat history lives in App Support.

const getAppIconRuntimeContext = () => ({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  desktopDir,
}); // Runtime paths differ between dev assets and packaged resources.

const getAppIconPath = () => getAppIconPreferencePath(app.getPath('userData')); // Persist only the selected registry id.

const supportsDockIcon = () => process.platform === 'darwin' && typeof app.dock?.setIcon === 'function'; // Electron exposes Dock icons only on macOS.

const getSelectedAppIconId = () => readSelectedAppIconId(getAppIconPath());

const chatHistoryStore = createChatHistoryStore({ getHistoryPath: getChatHistoryPath });
const snapshotAutosaveTargets = new Map();
const snapshotWriteSessions = new Map();
const snapshotWriteOperations = new Set();
const snapshotReadSources = new Map();
const rendererResourceEpochs = createRendererResourceEpochs();
let pendingSnapshotWriteSessions = 0;
let pendingSnapshotReadSources = 0;
let reservedSnapshotBackupBytes = 0; // Tracks active backup temp-file reservations.
let snapshotWriteShutdownStarted = false; // Prevents new temp files once quit cleanup begins.
const maxSnapshotAutosaveTargets = 20;
const maxSnapshotWriteSessions = 4; // Limit concurrent renderer-owned temp files.
const maxSnapshotReadSources = 8; // Limit concurrent open snapshot import handles.
const maxSnapshotChunkOperations = 4; // Normal writers use one operation; bursts stay bounded.
const maxSnapshotChunkOperationBytes = MAX_SNAPSHOT_CHUNK_BYTES * 2; // Preserve large streams while bounding concurrent memory.
const maxSnapshotMediaStreams = 32; // Large media stays unlimited while simultaneous streams stay bounded.
const maxSnapshotPendingMediaStreams = maxSnapshotMediaStreams * 2; // Renderer scheduling keeps normal restores below this main-process backstop.
const maxSnapshotPendingBackupOperations = 8; // Normal autosave and backup UI flows stay below this count-only backstop.
const snapshotWriteSessionTimeoutMs = 5 * 60 * 1000; // Abandon stale snapshot writes after five minutes.
const snapshotReadSourceTimeoutMs = 5 * 60 * 1000; // Release stale snapshot import handles after five minutes.
const snapshotBackupDirName = 'snapshot-backups';
const snapshotBackupCoordinator = createSnapshotBackupCoordinator({
  maxPending: maxSnapshotPendingBackupOperations,
  busyErrorMessage: 'Too many snapshot backup operations are waiting.',
}); // Serializes backup state changes without buffering snapshot bytes.
const snapshotDownloadCoordinator = createSnapshotDownloadCoordinator({
  createToken: () => randomBytes(18).toString('base64url'),
}); // Download tokens keep exact retained ranges alive beyond their renderer document.

const toBinaryBuffer = (data) => {
  assertSnapshotDataCanBeWritten(data);
  return data instanceof ArrayBuffer
    ? Buffer.from(data)
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
};

const assertNonEmptyString = (value, message) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
};

const assertSnapshotSessionId = (value, message) => {
  const id = assertNonEmptyString(value, message);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(message);
  }
  return id;
};

const getSnapshotBackupDir = () => join(app.getPath('userData'), snapshotBackupDirName);

const getSnapshotBackupDataPath = id => join(getSnapshotBackupDir(), `${id}.bcsnap`);

const getSnapshotBackupMetaPath = id => join(getSnapshotBackupDir(), `${id}.json`);

const getSnapshotMediaProtocolBaseUrl = (sourceId) => {
  const id = assertSnapshotSessionId(sourceId, 'Snapshot read source is invalid.');
  return `${SNAPSHOT_MEDIA_PROTOCOL}://media/${encodeURIComponent(id)}/`; // One source capability replaces per-media URL IPC.
};

const getSnapshotMediaProtocolUrl = ({ sourceId, offset, length, type, fileName }) => {
  const id = assertSnapshotSessionId(sourceId, 'Snapshot read source is invalid.');
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0) {
    throw new Error('Snapshot media range is invalid.');
  }
  const url = new URL(`${SNAPSHOT_MEDIA_PROTOCOL}://media/${encodeURIComponent(id)}/${offset}/${length}/${encodeURIComponent(sanitizeSnapshotFileName(fileName))}`);
  url.searchParams.set('type', typeof type === 'string' && type.trim() ? type.trim() : 'application/octet-stream');
  return url.toString();
};

const parseSnapshotMediaProtocolUrl = (requestUrl) => {
  const parsedUrl = new URL(requestUrl);
  if (parsedUrl.protocol !== `${SNAPSHOT_MEDIA_PROTOCOL}:` || parsedUrl.hostname !== 'media') {
    throw new Error('Snapshot media URL is invalid.');
  }
  const [, rawSourceId, rawOffset, rawLength] = parsedUrl.pathname.split('/');
  const sourceId = assertSnapshotSessionId(decodeURIComponent(rawSourceId ?? ''), 'Snapshot read source is invalid.');
  const offset = Number(rawOffset);
  const length = Number(rawLength);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0) {
    throw new Error('Snapshot media range is invalid.');
  }
  return {
    sourceId,
    offset,
    length,
    type: parsedUrl.searchParams.get('type') || 'application/octet-stream',
    downloadFileName: parsedUrl.searchParams.get('download') === '1'
      ? parsedUrl.searchParams.get('fileName')
      : null,
    downloadToken: parsedUrl.searchParams.get(SNAPSHOT_DOWNLOAD_TOKEN_PARAM),
  };
};

const parseHttpRangeHeader = (value, size) => {
  if (typeof value !== 'string' || !value.startsWith('bytes=')) {
    return { start: 0, end: size - 1, partial: false };
  }
  const [startText, endText] = value.slice('bytes='.length).split('-', 2);
  const start = startText === '' ? Math.max(0, size - Number(endText)) : Number(startText);
  const end = endText === '' || startText === '' ? size - 1 : Number(endText);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1), partial: true };
};

const handleSnapshotMediaProtocolRequest = async (request) => {
  const media = parseSnapshotMediaProtocolUrl(request.url);
  const source = getSnapshotReadSourceForProtocol(media);
  if (media.offset + media.length > source.size) {
    return new Response('Snapshot media range is invalid.', { status: 416 });
  }
  const byteRange = parseHttpRangeHeader(request.headers.get('range'), media.length);
  if (!byteRange) {
    return new Response('Snapshot media range is invalid.', { status: 416 });
  }
  const fileStart = media.offset + byteRange.start;
  const fileEnd = media.offset + byteRange.end;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    // The renderer origin (file:// packaged, http://localhost in dev) is cross-origin to this
    // scheme; without CORS, restored media taints every canvas it is drawn into.
    'Access-Control-Allow-Origin': '*',
    'Content-Length': String(fileEnd - fileStart + 1),
    'Content-Type': media.type,
  });
  if (byteRange.partial) {
    headers.set('Content-Range', `bytes ${byteRange.start}-${byteRange.end}/${media.length}`);
  }
  if (media.downloadFileName) {
    headers.set('Content-Disposition', getAttachmentContentDisposition(media.downloadFileName));
  }
  let body;
  try {
    body = await source.mediaStreamController.open({
      signal: request.signal,
      createStream: () => source.handle.createReadStream({ start: fileStart, end: fileEnd, autoClose: false }),
    }); // Excess range requests wait without limiting the media byte length.
  } catch (error) {
    if (isSnapshotMediaStreamBusyError(error)) {
      return new Response('Snapshot media streams are busy.', {
        status: 503,
        headers: { 'Access-Control-Allow-Origin': '*', 'Retry-After': '1' },
      }); // Scheduled restores should not reach this hostile-request backstop.
    }
    throw error;
  }
  refreshSnapshotReadSourceTimeout(media.sourceId, source);
  try {
    return new Response(body, {
      status: byteRange.partial ? 206 : 200,
      headers,
    });
  } catch (error) {
    await body.cancel(error).catch(() => {});
    throw error;
  }
};

const normalizeBackupSummary = (payload, size = payload?.size) => {
  const id = assertSnapshotSessionId(payload?.id, 'Backup id is invalid.');
  const createdAt = Number.isFinite(payload?.createdAt) ? payload.createdAt : Date.now();
  const updatedAt = Number.isFinite(payload?.updatedAt) ? payload.updatedAt : Date.now();
  return {
    id,
    createdAt,
    updatedAt,
    fileName: sanitizeSnapshotFileName(payload?.fileName),
    size: Number.isSafeInteger(size) && size >= 0 ? size : 0,
  };
};

const listSnapshotBackupSummariesUnlocked = async () => {
  await mkdir(getSnapshotBackupDir(), { recursive: true });
  const entries = await readdir(getSnapshotBackupDir(), { withFileTypes: true });
  const summaries = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    try {
      const metaPath = join(getSnapshotBackupDir(), entry.name);
      const raw = await readFile(metaPath, 'utf8');
      const summary = JSON.parse(raw);
      const id = assertSnapshotSessionId(summary?.id, 'Backup id is invalid.');
      const dataStats = await stat(getSnapshotBackupDataPath(id));
      if (!dataStats.isFile()) {
        continue;
      }
      summaries.push(normalizeBackupSummary(summary, dataStats.size));
    } catch {
      continue;
    }
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
};

const listSnapshotBackupSummaries = () => snapshotBackupCoordinator.runExclusive(listSnapshotBackupSummariesUnlocked); // UI reads see one stable committed backup state.

const deleteSnapshotBackupFiles = async (id) => {
  const backupId = assertSnapshotSessionId(id, 'Backup id is invalid.');
  await Promise.all([
    rm(getSnapshotBackupDataPath(backupId), { force: true }),
    rm(getSnapshotBackupMetaPath(backupId), { force: true }),
  ]);
};

const deleteSnapshotBackup = id => snapshotBackupCoordinator.runExclusive(() => deleteSnapshotBackupFiles(id)); // A requested delete runs after any active streamed backup commits or aborts.

const pruneSnapshotBackupsUnlocked = async (limit = MAX_SNAPSHOT_BACKUP_COUNT) => {
  const summaries = await listSnapshotBackupSummariesUnlocked();
  await Promise.all(summaries.slice(limit).map(summary => deleteSnapshotBackupFiles(summary.id)));
};

const pruneSnapshotBackups = limit => snapshotBackupCoordinator.runExclusive(() => pruneSnapshotBackupsUnlocked(limit)); // Retention reads and deletes one stable committed backup state.

const stageSnapshotBackupMeta = async (summary, writeId, replacesExisting) => {
  await mkdir(getSnapshotBackupDir(), { recursive: true });
  const metaPath = getSnapshotBackupMetaPath(summary.id);
  const pendingPath = `${metaPath}.${writeId}.pending`;
  let handle;
  try {
    handle = await open(pendingPath, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ ...summary, commitId: writeId, replacesExisting }), 'utf8');
    await handle.sync(); // Persist transaction metadata before replacing the committed data file.
    await handle.close();
    return pendingPath;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(pendingPath, { force: true }).catch(() => {});
    throw error;
  }
};

const reserveSnapshotBackupBytes = async (summary) => {
  const summaries = await listSnapshotBackupSummariesUnlocked();
  const currentBytes = getSnapshotBackupTransactionBaseBytes({ summaries, summary });
  const replacingExisting = summaries.some(item => item.id === summary.id);
  assertSnapshotBackupSizeCanBeWritten({ size: summary.size, currentBytes, reservedBytes: reservedSnapshotBackupBytes });
  reservedSnapshotBackupBytes += summary.size;
  return { replacingExisting };
};

const releaseSnapshotBackupBytes = (bytes) => {
  if (bytes > 0) {
    reservedSnapshotBackupBytes = Math.max(0, reservedSnapshotBackupBytes - bytes);
  }
};

const refreshSnapshotWriteSessionTimeout = (writeId, session) => {
  if (session.closing) return;
  if (session.timeout) {
    clearTimeout(session.timeout);
  }
  session.timeout = setTimeout(() => {
    void abortSnapshotWriteSession(writeId);
  }, snapshotWriteSessionTimeoutMs);
  session.timeout.unref?.();
};

const trackSnapshotWriteOperation = (operation) => {
  snapshotWriteOperations.add(operation);
  operation.then(
    () => snapshotWriteOperations.delete(operation),
    () => snapshotWriteOperations.delete(operation),
  ); // Shutdown can await sessions already finishing outside the session map.
  return operation;
};

const beginSnapshotWriteSession = ({
  targetPath,
  owner,
  backupSummary,
  maxBytes = MAX_SNAPSHOT_WRITE_BYTES,
  backupReservedBytes = 0,
  backupReplacingExisting = false,
  releaseBackupLease = null,
}) => trackSnapshotWriteOperation((async () => {
  if (snapshotWriteShutdownStarted) {
    throw new Error('Snapshot writes are unavailable while the app is quitting.');
  }
  if (!rendererResourceEpochs.isCurrent(owner)) {
    throw new Error('Snapshot write owner is no longer available.');
  }
  if (snapshotWriteSessions.size + pendingSnapshotWriteSessions >= maxSnapshotWriteSessions) {
    throw new Error('Too many snapshot writes are already in progress.');
  }
  pendingSnapshotWriteSessions += 1;
  try {
    await mkdir(dirname(targetPath), { recursive: true });
    const writeId = randomBytes(18).toString('base64url');
    const tempPath = join(dirname(targetPath), `.${basename(targetPath)}.${writeId}.tmp`);
    const handle = await open(tempPath, 'w', 0o600);
    if (snapshotWriteShutdownStarted || !rendererResourceEpochs.isCurrent(owner)) {
      await handle.close().catch(() => {});
      await rm(tempPath, { force: true }).catch(() => {});
      throw new Error(snapshotWriteShutdownStarted
        ? 'Snapshot writes are unavailable while the app is quitting.'
        : 'Snapshot write owner is no longer available.');
    }
    const session = {
      handle,
      tempPath,
      targetPath,
      owner, // Reload and crash cleanup target only the renderer document that began this write.
      backupSummary,
      maxBytes, // Per-session write cap; backups use their declared size.
      backupReservedBytes, // Releases reserved backup quota on finish or abort.
      backupReplacingExisting, // Enables rollback when autosave replaces the same backup id.
      releaseBackupLease, // Holds deletion and pruning until this streamed backup settles.
      closing: false, // Stops completed chunks from rearming a closing session timeout.
      bytesWritten: 0,
      writeError: null,
      writeChain: Promise.resolve(),
      operationBudget: createSnapshotOperationBudget({
        maxOperations: maxSnapshotChunkOperations,
        maxBytes: maxSnapshotChunkOperationBytes,
        errorMessage: 'Too many snapshot write chunks are already in progress.',
      }),
    };
    refreshSnapshotWriteSessionTimeout(writeId, session);
    snapshotWriteSessions.set(writeId, session);
    return writeId;
  } finally {
    pendingSnapshotWriteSessions -= 1;
  }
})());

const getSnapshotWriteSession = (writeId, owner) => {
  const session = snapshotWriteSessions.get(assertSnapshotSessionId(writeId, 'Snapshot write session is invalid.'));
  if (!session) {
    throw new Error('Snapshot write session is no longer available.');
  }
  if (owner && !rendererResourceEpochs.isSame(session.owner, owner)) {
    throw new Error('Snapshot write session belongs to another renderer.');
  }
  return session;
};

const writeSnapshotSessionChunk = async ({ writeId, data, owner }) => {
  const session = getSnapshotWriteSession(writeId, owner);
  const chunk = toBinaryBuffer(data);
  const releaseOperation = session.operationBudget.reserve(chunk.byteLength); // Reserve before the queued closure retains the chunk.
  const writeChunk = async () => {
    let countedBytes = 0;
    try {
      if (session.writeError) {
        throw session.writeError;
      }
      if (session.bytesWritten + chunk.byteLength > session.maxBytes) {
        throw new Error('Snapshot data is too large to write safely.');
      }
      session.bytesWritten += chunk.byteLength;
      countedBytes = chunk.byteLength;
      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await session.handle.write(chunk, offset, chunk.byteLength - offset);
        if (bytesWritten <= 0) {
          throw new Error('Snapshot data could not be written safely.');
        }
        offset += bytesWritten;
      }
      refreshSnapshotWriteSessionTimeout(writeId, session);
      return { written: chunk.byteLength };
    } catch (error) {
      if (countedBytes > 0) {
        session.bytesWritten -= countedBytes;
      }
      session.writeError ??= error;
      throw error;
    } finally {
      releaseOperation();
    }
  };
  const result = session.writeChain.then(writeChunk, writeChunk);
  session.writeChain = result.catch(() => {});
  return result;
};

const finishSnapshotWriteSession = (writeId, owner) => {
  const id = assertSnapshotSessionId(writeId, 'Snapshot write session is invalid.');
  const session = getSnapshotWriteSession(id, owner);
  session.closing = true;
  snapshotWriteSessions.delete(id);
  return trackSnapshotWriteOperation((async () => {
    let renamedTarget = false;
    let rollbackPath = null;
    let pendingMetaPath = null;
    try {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      await session.writeChain;
      if (session.writeError) {
        throw session.writeError;
      }
      if (session.backupSummary && session.bytesWritten !== session.backupSummary.size) {
        throw new Error('Snapshot backup size did not match the declared size.');
      }
      await session.handle.sync(); // Flush large streamed snapshots before exposing the completed file.
      await session.handle.close();
      if (session.backupSummary) {
        pendingMetaPath = await stageSnapshotBackupMeta(session.backupSummary, id, session.backupReplacingExisting);
      }
      if (session.backupSummary && session.backupReplacingExisting) {
        rollbackPath = `${session.targetPath}.${id}.rollback`;
        await rm(rollbackPath, { force: true }).catch(() => {});
        await rename(session.targetPath, rollbackPath);
      }
      await rename(session.tempPath, session.targetPath);
      renamedTarget = true;
      if (session.backupSummary) {
        await rename(pendingMetaPath, getSnapshotBackupMetaPath(session.backupSummary.id));
        pendingMetaPath = null;
        await pruneSnapshotBackupsUnlocked(MAX_SNAPSHOT_BACKUP_COUNT).catch(error => console.error('Snapshot backup pruning failed.', error));
      }
      if (rollbackPath) {
        await rm(rollbackPath, { force: true }).catch(() => {});
      }
      return { saved: true };
    } catch (error) {
      await session.handle.close().catch(() => {});
      await rm(session.tempPath, { force: true });
      if (pendingMetaPath) {
        await rm(pendingMetaPath, { force: true }).catch(() => {});
      }
      if (rollbackPath) {
        if (renamedTarget) {
          await rm(session.targetPath, { force: true }).catch(() => {});
        }
        await rename(rollbackPath, session.targetPath).catch(() => {});
      } else if (renamedTarget && session.backupSummary) {
        await deleteSnapshotBackupFiles(session.backupSummary.id).catch(() => {});
      }
      throw error;
    } finally {
      releaseSnapshotBackupBytes(session.backupReservedBytes);
      session.releaseBackupLease?.(); // The next backup mutation sees only committed or fully aborted state.
    }
  })());
};

const abortSnapshotWriteSession = (writeId, owner) => {
  const id = assertSnapshotSessionId(writeId, 'Snapshot write session is invalid.');
  const session = snapshotWriteSessions.get(id);
  if (!session) {
    return Promise.resolve({ aborted: true });
  }
  if (owner && !rendererResourceEpochs.isSame(session.owner, owner)) {
    throw new Error('Snapshot write session belongs to another renderer.');
  }
  session.closing = true;
  snapshotWriteSessions.delete(id);
  return trackSnapshotWriteOperation((async () => {
    try {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      await session.writeChain.catch(() => {});
      await session.handle.close().catch(() => {});
      await rm(session.tempPath, { force: true });
      return { aborted: true };
    } finally {
      releaseSnapshotBackupBytes(session.backupReservedBytes);
      session.releaseBackupLease?.(); // Timeout and renderer cleanup release queued deletes and backups too.
    }
  })());
};

const abortAllSnapshotWriteSessions = async () => {
  snapshotWriteShutdownStarted = true;
  do {
    const aborts = [...snapshotWriteSessions.keys()].map(id => abortSnapshotWriteSession(id));
    await Promise.allSettled([...aborts, ...snapshotWriteOperations]);
  } while (snapshotWriteSessions.size > 0 || snapshotWriteOperations.size > 0);
};

const abortInvalidatedSnapshotWriteSessions = async (invalidation) => {
  const aborts = [...snapshotWriteSessions.entries()]
    .filter(([, session]) => rendererResourceEpochs.wasInvalidated(session.owner, invalidation))
    .map(([id]) => abortSnapshotWriteSession(id));
  await Promise.allSettled(aborts); // Lifecycle cleanup must continue even if one temp file removal fails.
};

const closeInvalidatedSnapshotReadSources = async (invalidation) => {
  const closes = [...snapshotReadSources.entries()]
    .filter(([, source]) => rendererResourceEpochs.wasInvalidated(source.owner, invalidation))
    .map(([id]) => closeSnapshotReadSource(id));
  await Promise.allSettled(closes); // Close only handles owned by the replaced renderer document.
};

const releaseRendererSnapshotResources = async (ownerId) => {
  const invalidation = rendererResourceEpochs.invalidate(ownerId);
  await Promise.allSettled([
    abortInvalidatedSnapshotWriteSessions(invalidation),
    closeInvalidatedSnapshotReadSources(invalidation),
  ]); // Reloads release renderer-owned resources without disabling future writes.
};

const refreshSnapshotReadSourceTimeout = (sourceId, source) => {
  if (source?.retained) {
    if (source.timeout) {
      clearTimeout(source.timeout);
      source.timeout = null;
    }
    return;
  }
  if (source.timeout) {
    clearTimeout(source.timeout);
  }
  source.timeout = setTimeout(() => {
    void closeSnapshotReadSource(sourceId);
  }, snapshotReadSourceTimeoutMs);
  source.timeout.unref?.();
};

const rememberSnapshotReadSource = async (filePath, owner) => {
  rendererResourceEpochs.assertCurrent(owner, 'Snapshot read request is no longer active.');
  if (snapshotReadSources.size + pendingSnapshotReadSources >= maxSnapshotReadSources) {
    throw new Error('Too many snapshot reads are already in progress.');
  }
  pendingSnapshotReadSources += 1;
  let handle;
  try {
    handle = await open(filePath, 'r');
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) {
      throw new Error('Snapshot import requires a regular file.');
    }
    const fileName = basename(filePath);
    assertSnapshotFileCanBeOpened({ fileName, size: fileStats.size });
    rendererResourceEpochs.assertCurrent(owner, 'Snapshot read request is no longer active.');
    const sourceId = randomBytes(18).toString('base64url');
    const source = {
      handle,
      owner,
      filePath,
      fileName,
      size: fileStats.size,
      type: fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      retained: false,
      operationBudget: createSnapshotOperationBudget({
        maxOperations: maxSnapshotChunkOperations,
        maxBytes: maxSnapshotChunkOperationBytes,
        errorMessage: 'Too many snapshot read ranges are already in progress.',
      }),
      mediaStreamController: createSnapshotMediaStreamController({
        maxActive: maxSnapshotMediaStreams,
        maxPending: maxSnapshotPendingMediaStreams,
        closedErrorMessage: 'Snapshot read source is no longer available.',
        busyErrorMessage: 'Too many snapshot media streams are waiting.',
      }),
      closeLease: null,
    };
    source.closeLease = createDeferredCloseLease({
      close: async () => {
        if (snapshotReadSources.get(sourceId) === source) {
          snapshotReadSources.delete(sourceId);
        }
        source.mediaStreamController.close();
        await source.handle.close().catch(() => {});
      },
    }); // Active native downloads defer handle closure without keeping renderer access alive.
    snapshotReadSources.set(sourceId, source);
    refreshSnapshotReadSourceTimeout(sourceId, source);
    return {
      sourceId,
      fileName,
      size: fileStats.size,
      type: fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      mediaUrlBase: getSnapshotMediaProtocolBaseUrl(sourceId), // The random source id scopes every lazy media URL.
    };
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  } finally {
    pendingSnapshotReadSources -= 1;
  }
};

const getSnapshotReadSource = (sourceId, owner) => {
  const source = snapshotReadSources.get(assertSnapshotSessionId(sourceId, 'Snapshot read source is invalid.'));
  if (!source || source.closeLease.isClosing()) {
    throw new Error('Snapshot read source is no longer available.');
  }
  if (!rendererResourceEpochs.isCurrent(source.owner) || (owner && !rendererResourceEpochs.isSame(source.owner, owner))) {
    throw new Error('Snapshot read source belongs to an inactive renderer document.');
  }
  return source;
};

const getSnapshotReadSourceForProtocol = (media) => {
  if (snapshotDownloadCoordinator.isAuthorized({
    token: media.downloadToken,
    sourceId: media.sourceId,
    offset: media.offset,
    length: media.length,
  })) {
    const source = snapshotReadSources.get(media.sourceId);
    if (source) return source;
  }
  return getSnapshotReadSource(media.sourceId);
}; // A reserved download may finish after its renderer generation is invalidated.

const readSnapshotSourceRange = async ({ sourceId, offset, length, owner }) => {
  const id = assertSnapshotSessionId(sourceId, 'Snapshot read source is invalid.');
  const source = getSnapshotReadSource(id, owner);
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(length) || length < 0) {
    throw new Error('Snapshot byte range is invalid.');
  }
  if (length > MAX_SNAPSHOT_CHUNK_BYTES) {
    throw new Error('Snapshot read range is too large.');
  }
  if (offset + length > source.size) {
    throw new Error('Snapshot byte range is outside the file.');
  }
  const releaseOperation = source.operationBudget.reserve(length); // Reserve before allocating the main-process buffer.
  try {
    const buffer = Buffer.allocUnsafe(length);
    let totalBytesRead = 0;
    while (totalBytesRead < length) {
      const { bytesRead } = await source.handle.read(buffer, totalBytesRead, length - totalBytesRead, offset + totalBytesRead);
      if (bytesRead === 0) {
        throw new Error('Snapshot byte range could not be read completely.');
      }
      totalBytesRead += bytesRead;
    }
    refreshSnapshotReadSourceTimeout(id, source);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + totalBytesRead);
  } finally {
    releaseOperation();
  }
};

const closeSnapshotReadSource = async (sourceId, owner) => {
  const id = assertSnapshotSessionId(sourceId, 'Snapshot read source is invalid.');
  const source = snapshotReadSources.get(id);
  if (owner && source && !rendererResourceEpochs.isSame(source.owner, owner)) {
    throw new Error('Snapshot read source belongs to an inactive renderer document.');
  }
  if (source?.timeout) {
    clearTimeout(source.timeout);
    source.timeout = null;
  }
  await source?.closeLease.requestClose(); // Physical closure waits for native downloads but blocks new renderer work now.
  return { closed: true };
};

const retainSnapshotReadSource = async (sourceId, owner) => {
  const id = assertSnapshotSessionId(sourceId, 'Snapshot read source is invalid.');
  const source = getSnapshotReadSource(id, owner);
  source.retained = true;
  refreshSnapshotReadSourceTimeout(id, source);
  return { retained: true };
};

const closeAllSnapshotReadSources = async () => {
  await Promise.all([...snapshotReadSources.keys()].map(id => closeSnapshotReadSource(id)));
};

const rememberSnapshotAutosaveTarget = (filePath) => {
  const autosaveId = randomBytes(18).toString('base64url');
  snapshotAutosaveTargets.set(autosaveId, filePath);
  while (snapshotAutosaveTargets.size > maxSnapshotAutosaveTargets) {
    const oldestId = snapshotAutosaveTargets.keys().next().value;
    snapshotAutosaveTargets.delete(oldestId);
  }
  return autosaveId;
};

const migrateLegacyDesktopSettings = async () => {
  if (!app.isPackaged) {
    return; // Dev mode reads repo env files instead.
  }
  const nextPath = getDesktopSettingsPath();
  const legacyPath = join(app.getPath('appData'), 'Canva Banana', '.env.local');
  if (!existsSync(nextPath) && existsSync(legacyPath)) {
    await mkdir(dirname(nextPath), { recursive: true });
    await copyFile(legacyPath, nextPath); // Preserve QA keys from the working-name App Support folder.
  }
};

const hasEnvValue = (key) => typeof process.env[key] === 'string' && process.env[key].trim().length > 0;

const buildSettingsStatus = () => {
  const fields = Object.fromEntries(DESKTOP_SETTING_KEYS.map(key => ([
    key,
    {
      present: hasEnvValue(key),
      required: REQUIRED_DESKTOP_SETTING_KEYS.includes(key),
      secret: SECRET_DESKTOP_SETTING_KEYS.includes(key),
    },
  ])));
  const missingKeys = REQUIRED_DESKTOP_SETTING_KEYS.filter(key => !hasEnvValue(key));
  return {
    configPath: getDesktopSettingsPath(),
    fields,
    missingKeys,
    isPackaged: app.isPackaged,
    serviceStatus: getServiceStatusSnapshot(),
  };
};

const loadDockIconImage = (iconId) => {
  if (!supportsDockIcon()) {
    return null; // Non-macOS builds can keep the preference without applying it.
  }
  const selectedIconId = assertKnownAppIconId(iconId);
  const option = getRuntimeAppIconOptions(getAppIconRuntimeContext()).find(candidate => candidate.id === selectedIconId);
  const image = nativeImage.createFromPath(option?.dockIconPath ?? '');
  if (image.isEmpty()) {
    throw new Error(`Could not load app icon asset for "${selectedIconId}".`);
  }
  return image;
};

const applyDockIconImage = (image) => {
  if (!image) {
    return false; // The platform does not support runtime Dock icon changes.
  }
  app.dock.setIcon(image);
  return true;
};

const applySavedDockIcon = async () => {
  try {
    applyDockIconImage(loadDockIconImage(await getSelectedAppIconId()));
  } catch (error) {
    console.warn(error instanceof Error ? error.message : String(error)); // Startup should continue if an icon asset is missing.
  }
};

const buildCurrentAppIconState = async () => buildAppIconState({
  selectedIconId: await getSelectedAppIconId(),
  supportsDockIcon: supportsDockIcon(),
  runtimeContext: getAppIconRuntimeContext(),
});

const refreshRuntimeConfig = (serviceUrls) => {
  runtimeConfig = buildRuntimeConfig(serviceUrls); // Keep preload sync reads aligned with restarted services.
  return runtimeConfig;
};

const loadEnvFile = (envPath) => {
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const parsed = parseDotenvEntry(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value; // Exported shell values should always win over dotenv files.
    }
  }
};

const loadDesktopEnv = () => {
  if (app.isPackaged) {
    loadEnvFile(join(app.getPath('userData'), '.env.local')); // Packaged builds only read user app data env.
    return;
  }
  loadEnvFile(resolve(repoRoot, '.env.local'));
  loadEnvFile(resolve(repoRoot, '.env'));
};

const getAvailablePort = (host) => new Promise((resolvePort, rejectPort) => {
  const server = createServer();
  server.unref();
  server.on('error', rejectPort);
  server.listen(0, host, () => {
    const address = server.address();
    server.close(() => {
      if (address && typeof address === 'object') {
        resolvePort(address.port);
        return;
      }
      rejectPort(new Error('Could not resolve an available local port'));
    });
  });
});

const getConfiguredOrAvailablePort = async (envKey, host) => {
  const configuredPort = Number(process.env[envKey]);
  return Number.isInteger(configuredPort) && configuredPort > 0
    ? configuredPort
    : getAvailablePort(host); // Packaged services avoid fixed localhost ports by default.
};

const waitForHealth = async (label, healthUrl, timeoutMs, signal) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(healthUrl, { signal });
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      // Retry until the backend binds or the timeout expires.
    }
    await delay(350, undefined, signal ? { signal } : undefined);
  }
  signal?.throwIfAborted();
  throw new Error(`${label} did not become healthy at ${healthUrl}`);
};

const getRendererRootDir = () => (
  app.isPackaged ? join(process.resourcesPath, 'web') : webDistDir
);

const getRendererUrl = () => {
  if (devRendererUrl) {
    return devRendererUrl; // Dev mode loads Vite for fast iteration.
  }
  const indexPath = join(getRendererRootDir(), 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error('Missing web build. Run `npm run build:web` before desktop production start.');
  }
  return pathToFileURL(indexPath).toString(); // Packaged mode can load built local assets.
};

const isAllowedNavigationUrl = (targetUrl) => {
  try {
    const parsedTargetUrl = new URL(targetUrl);
    if (devRendererUrl) {
      const parsedDevUrl = new URL(devRendererUrl);
      return parsedTargetUrl.origin === parsedDevUrl.origin; // Dev renderer trust is origin-based, not prefix-based.
    }
    const rendererRootUrl = new URL(pathToFileURL(getRendererRootDir()).toString());
    const rendererRootPath = rendererRootUrl.pathname.endsWith('/') ? rendererRootUrl.pathname : `${rendererRootUrl.pathname}/`;
    return parsedTargetUrl.protocol === 'file:' && parsedTargetUrl.pathname.startsWith(rendererRootPath);
  } catch {
    return false; // Malformed URLs should never navigate the privileged window.
  }
};

const isExternalOpenUrl = (targetUrl) => {
  try {
    const parsedUrl = new URL(targetUrl);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:'; // Only normal browser links leave Electron.
  } catch {
    return false;
  }
};

const getSecureBackendModuleUrl = () => (
  app.isPackaged
    ? pathToFileURL(join(app.getAppPath(), 'generated/secure-backend/server.mjs')).toString()
    : pathToFileURL(resolve(repoRoot, 'apps/secure-backend/src/server.mjs')).toString()
);

const startSecureBackend = async (signal) => {
  signal?.throwIfAborted();
  const host = process.env.NODE_BACKEND_HOST?.trim() || '127.0.0.1';
  const port = await getConfiguredOrAvailablePort('NODE_BACKEND_PORT', host);
  signal?.throwIfAborted();
  const url = normalizeBaseUrl(`http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`);
  setServiceStatus('secureBackend', { state: 'starting', url, mode: 'managed', urlSource: 'managed', authTokenActive: true });
  try {
    const { createSecureBackendServer } = await import(getSecureBackendModuleUrl());
    signal?.throwIfAborted();
    const env = {
      ...process.env,
      NODE_BACKEND_HOST: host,
      NODE_BACKEND_PORT: String(port),
      CANVA_BANANA_DESKTOP_AUTH_TOKEN: desktopAuthToken,
    };
    const server = createSecureBackendServer({ env });
    managedSecureBackendServer = server;
    managedSecureBackendShutdown = createBoundedHttpServerShutdown(server);
    await new Promise((resolveListen, rejectListen) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        server.off('error', onError);
        signal?.removeEventListener('abort', onAbort);
        callback(value);
      };
      const onError = error => finish(rejectListen, error);
      const onAbort = () => finish(rejectListen, signal.reason);
      server.once('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
      server.listen(port, host, () => finish(resolveListen));
    });
    await waitForHealth('secure backend', `${url}/health`, 10000, signal);
    signal?.throwIfAborted();
    setServiceStatus('secureBackend', { state: 'ready', url, mode: 'managed', urlSource: 'managed', authTokenActive: true });
  } catch (error) {
    if (signal?.aborted) return url;
    setServiceStatus('secureBackend', {
      state: 'unavailable',
      url,
      mode: 'managed',
      urlSource: 'managed',
      authTokenActive: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return url;
};

const getPackagedPythonExecutablePath = () => join(
  process.resourcesPath,
  'python-backend',
  'canva-banana-python-backend',
);

const startPythonBackend = async (signal) => {
  signal?.throwIfAborted();
  const host = process.env.CANVA_BANANA_PYTHON_HOST?.trim() || '127.0.0.1';
  const port = await getConfiguredOrAvailablePort('CANVA_BANANA_PYTHON_PORT', host);
  signal?.throwIfAborted();
  const url = normalizeBaseUrl(`http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`);
  const userDataDir = app.getPath('userData');
  const env = {
    ...process.env,
    CANVA_BANANA_ENV_DIR: userDataDir,
    CANVA_BANANA_DESKTOP_AUTH_TOKEN: desktopAuthToken,
    CANVA_BANANA_PYTHON_HOST: host,
    CANVA_BANANA_PYTHON_PORT: String(port),
    JIMENG_WORK_DIR: process.env.JIMENG_WORK_DIR || join(userDataDir, 'jimeng-work'),
  };
  const command = app.isPackaged ? getPackagedPythonExecutablePath() : 'uv';
  const args = app.isPackaged
    ? []
    : [
        'run',
        '--project',
        resolve(repoRoot, 'apps/python-backend/backend'),
        'uvicorn',
        'uvpython_service.main:app',
        '--app-dir',
        resolve(repoRoot, 'apps/python-backend/backend/src'),
        '--host',
        host,
        '--port',
        String(port),
      ];
  setServiceStatus('pythonBackend', { state: 'starting', url });
  if (app.isPackaged && !existsSync(command)) {
    setServiceStatus('pythonBackend', { state: 'unavailable', url, error: `Missing executable at ${command}` });
    return url;
  }
  try {
    signal?.throwIfAborted();
    const child = spawn(command, args, {
      cwd: app.isPackaged ? userDataDir : repoRoot,
      env,
      stdio: app.isPackaged ? 'ignore' : 'inherit',
    });
    managedChildren.add(child);
    child.on('exit', code => {
      managedChildren.delete(child);
      if (serviceStatus.pythonBackend.state === 'ready') {
        setServiceStatus('pythonBackend', { state: 'unavailable', url, error: `Exited with code ${code ?? 'unknown'}` });
      }
    });
    child.on('error', error => {
      managedChildren.delete(child);
      setServiceStatus('pythonBackend', { state: 'unavailable', url, error: error.message });
    });
    await waitForHealth('python backend', `${url}/health`, app.isPackaged ? 45000 : 60000, signal);
    signal?.throwIfAborted();
    setServiceStatus('pythonBackend', { state: 'ready', url });
  } catch (error) {
    if (signal?.aborted) return url;
    setServiceStatus('pythonBackend', {
      state: 'unavailable',
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return url;
};

const startManagedServices = async (signal) => {
  signal?.throwIfAborted();
  if (devRendererUrl) {
    const secureBackendRuntime = resolveSecureBackendRuntime({
      isPackaged: app.isPackaged,
      hasDevRenderer: true,
      env: process.env,
      managedUrl: 'http://localhost:8787',
      desktopAuthToken,
    });
    setServiceStatus('secureBackend', {
      state: 'external',
      url: secureBackendRuntime.url,
      mode: secureBackendRuntime.mode,
      urlSource: secureBackendRuntime.urlSource,
      authTokenActive: secureBackendRuntime.authTokenActive,
    });
    setServiceStatus('pythonBackend', { state: 'external', url: normalizeBaseUrl(process.env.VOLCENGINE_API_BASE_URL || 'http://localhost:8000') });
    return {
      secureBackendUrl: secureBackendRuntime.url,
      pythonBackendUrl: normalizeBaseUrl(process.env.VOLCENGINE_API_BASE_URL || 'http://localhost:8000'),
      pythonBackendAuthOrigin: undefined,
    };
  }
  if (shouldUseExternalSecureBackend({ isPackaged: app.isPackaged, hasDevRenderer: false, env: process.env })) {
    const secureBackendRuntime = resolveSecureBackendRuntime({
      isPackaged: app.isPackaged,
      hasDevRenderer: false,
      env: process.env,
      managedUrl: 'http://localhost:8787',
      desktopAuthToken,
    });
    const pythonBackendUrl = await startPythonBackend(signal);
    setServiceStatus('secureBackend', {
      state: 'external',
      url: secureBackendRuntime.url,
      mode: secureBackendRuntime.mode,
      urlSource: secureBackendRuntime.urlSource,
      authTokenActive: secureBackendRuntime.authTokenActive,
    });
    return { secureBackendUrl: secureBackendRuntime.url, pythonBackendUrl, pythonBackendAuthOrigin: getUrlOrigin(pythonBackendUrl) };
  }
  const [secureBackendUrl, pythonBackendUrl] = await Promise.all([
    startSecureBackend(signal),
    startPythonBackend(signal),
  ]);
  return { secureBackendUrl, pythonBackendUrl, pythonBackendAuthOrigin: getUrlOrigin(pythonBackendUrl) };
};

const buildRuntimeConfig = ({ secureBackendUrl, pythonBackendUrl, pythonBackendAuthOrigin }) => {
  const secureBackendRuntime = resolveSecureBackendRuntime({
    isPackaged: app.isPackaged,
    hasDevRenderer: Boolean(devRendererUrl),
    env: process.env,
    managedUrl: secureBackendUrl,
    desktopAuthToken,
  });
  return {
    isDesktop: true,
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
    secureBackendApiBaseUrl: secureBackendRuntime.url,
    secureBackendMode: secureBackendRuntime.mode,
    falApiUrl: process.env.FAL_API_URL,
    falModelId: process.env.FAL_MODEL_ID,
    secureBackendAuthToken: secureBackendRuntime.authToken,
    pythonBackendAuthToken: pythonBackendAuthOrigin ? desktopAuthToken : undefined,
    pythonBackendAuthOrigin,
    volcengineApiBaseUrl: normalizeBaseUrl(process.env.VOLCENGINE_API_BASE_URL || pythonBackendUrl),
    jimengApiBaseUrl: normalizeBaseUrl(process.env.JIMENG_API_BASE_URL || pythonBackendUrl),
  };
};

const buildRuntimeConfigLaunchArgument = () => ({
  isDesktop: runtimeConfig?.isDesktop,
  secureBackendApiBaseUrl: runtimeConfig?.secureBackendApiBaseUrl,
  secureBackendMode: runtimeConfig?.secureBackendMode,
  falApiUrl: runtimeConfig?.falApiUrl,
  falModelId: runtimeConfig?.falModelId,
  volcengineApiBaseUrl: runtimeConfig?.volcengineApiBaseUrl,
  jimengApiBaseUrl: runtimeConfig?.jimengApiBaseUrl,
}); // Keep process arguments free of API keys and auth tokens.

const encodeRuntimeConfigArgument = () => {
  const encoded = Buffer.from(JSON.stringify(buildRuntimeConfigLaunchArgument()), 'utf8').toString('base64');
  return `--canva-banana-runtime-config=${encoded}`; // Preload uses this only as a non-secret fallback.
};

const waitForChildExit = (child) => new Promise(resolveExit => {
  let settled = false;
  const finish = () => {
    if (!settled) {
      settled = true;
      resolveExit();
    }
  };
  child.once('exit', finish);
  setTimeout(finish, 2500).unref();
});

const stopManagedServices = () => {
  if (managedServicesStopPromise) return managedServicesStopPromise;
  managedServicesStopPromise = (async () => {
    setServiceStatus('secureBackend', { state: 'stopping' });
    setServiceStatus('pythonBackend', { state: 'stopping' });
    const serviceStops = [];
    for (const child of managedChildren) {
      serviceStops.push(waitForChildExit(child));
      child.kill('SIGTERM'); // Give packaged child processes a normal shutdown signal.
    }
    managedChildren.clear();
    const secureBackendShutdown = managedSecureBackendShutdown;
    managedSecureBackendServer = null;
    managedSecureBackendShutdown = null;
    if (secureBackendShutdown) {
      serviceStops.push(secureBackendShutdown()); // Graceful close becomes forced and bounded for hung requests.
    }
    await Promise.all(serviceStops);
    setServiceStatus('secureBackend', { state: 'stopped' });
    setServiceStatus('pythonBackend', { state: 'stopped' });
  })().finally(() => {
    managedServicesStopPromise = null;
  });
  return managedServicesStopPromise;
};

const restartManagedServices = async () => {
  const serviceUrls = await managedServiceLifecycle.restart();
  if (serviceUrls) {
    refreshRuntimeConfig(serviceUrls); // A shutdown-blocked restart must not replace the last runtime config.
  }
  return getServiceStatusSnapshot();
};

const managedServiceLifecycle = createManagedServiceLifecycle({
  start: startManagedServices,
  stop: stopManagedServices,
});

const focusMainWindowForMenuCommand = async () => {
  const targetWindow = await ensureMainWindow();
  if (targetWindow.isMinimized()) {
    targetWindow.restore(); // Native menu commands should work after the app is minimized.
  }
  targetWindow.show();
  targetWindow.focus();
  return targetWindow;
};

const sendFileMenuCommand = async (command) => {
  const targetWindow = await focusMainWindowForMenuCommand();
  const send = () => {
    if (!targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
      targetWindow.webContents.send(fileMenuCommandChannel, command); // React owns the actual app behavior.
    }
  };
  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once('did-finish-load', () => setTimeout(send, 100).unref()); // Wait for preload subscriptions.
    return;
  }
  send();
};

const updateFileMenuItems = () => {
  if (process.platform !== 'darwin') {
    return; // Only the macOS menu bar has these native items.
  }
  const menu = Menu.getApplicationMenu();
  const autosaveItem = menu?.getMenuItemById(APPLICATION_MENU_ITEM_IDS.AUTOSAVE);
  const zoomItem = menu?.getMenuItemById(APPLICATION_MENU_ITEM_IDS.ZOOM_LEVEL_BADGE);
  const fileNameItem = menu?.getMenuItemById(APPLICATION_MENU_ITEM_IDS.FILE_NAME);
  const clearCacheItem = menu?.getMenuItemById(APPLICATION_MENU_ITEM_IDS.CLEAR_JIMENG_CACHE);
  if (autosaveItem) {
    autosaveItem.checked = fileMenuState.autosaveEnabled;
  }
  if (zoomItem) {
    zoomItem.checked = fileMenuState.showZoomLevelBadge;
  }
  if (fileNameItem) {
    fileNameItem.checked = fileMenuState.showFileName;
  }
  if (clearCacheItem) {
    clearCacheItem.enabled = !fileMenuState.isClearingJimengCache;
    clearCacheItem.label = fileMenuState.isClearingJimengCache ? 'Clearing Jimeng Cache...' : 'Clear Jimeng Cache';
  }
};

const sendChatHistoryCleared = (targetWindow, revision) => {
  if (targetWindow && !targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed()) {
    targetWindow.webContents.send(chatHistoryClearedChannel, { revision }); // Let the open panel drop its cached list immediately.
  }
};

const clearChatHistoryFromMenu = async () => {
  const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const dialogOptions = {
    type: 'warning',
    buttons: ['Clear History', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Clear all prompt chat history?',
    detail: 'This permanently deletes every saved prompt chat conversation. This cannot be undone.',
  };
  const { response } = targetWindow
    ? await dialog.showMessageBox(targetWindow, dialogOptions)
    : await dialog.showMessageBox(dialogOptions);
  if (response !== 0) {
    return; // Destructive action stays opt-in.
  }
  const { revision } = await chatHistoryStore.clear();
  sendChatHistoryCleared(targetWindow, revision);
};

const installApplicationMenu = () => {
  if (process.platform !== 'darwin') {
    return; // Only macOS has the application menu.
  }
  const template = buildApplicationMenuTemplate({
    appName: app.name,
    fileMenuState,
    handlers: {
      importSnapshot: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.IMPORT_SNAPSHOT),
      exportSnapshot: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.EXPORT_SNAPSHOT),
      openBackups: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.OPEN_BACKUPS),
      toggleAutosave: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.TOGGLE_AUTOSAVE),
      toggleZoomLevelBadge: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.TOGGLE_ZOOM_LEVEL_BADGE),
      toggleFileName: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.TOGGLE_FILE_NAME),
      openDebugLog: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.OPEN_DEBUG_LOG),
      openManageKeys: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.OPEN_MANAGE_KEYS),
      openChangeIcon: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.OPEN_CHANGE_ICON),
      clearJimengCache: () => void sendFileMenuCommand(FILE_MENU_COMMANDS.CLEAR_JIMENG_CACHE),
      clearChatHistory: () => void clearChatHistoryFromMenu(),
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template)); // Replace Electron's default with the QA key entry.
};

const createMainWindow = async () => {
  const createdWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: 'The Institute',
    backgroundColor: '#1f2937',
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 18, y: 18 },
    } : {}), // Hide the macOS titlebar while keeping native traffic lights.
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [encodeRuntimeConfigArgument()],
    },
  });
  mainWindow = createdWindow;
  const rendererOwnerId = createdWindow.webContents.id;

  createdWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url); // External auth/help links should leave the app sandbox.
    }
    return { action: 'deny' };
  });

  createdWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url)) {
      event.preventDefault(); // Prevent unexpected renderer-initiated top-level navigation.
    }
  });

  createdWindow.webContents.on('render-process-gone', () => {
    void releaseRendererSnapshotResources(rendererOwnerId); // A crash destroys the document that owns open snapshot resources.
  });
  createdWindow.webContents.on('did-navigate', () => {
    void releaseRendererSnapshotResources(rendererOwnerId); // A reload replaces the document and its resource closer list.
  });

  await createdWindow.loadURL(getRendererUrl());
  createdWindow.on('closed', () => {
    void releaseRendererSnapshotResources(rendererOwnerId); // A reopened window must not inherit resources from the old one.
    if (mainWindow === createdWindow) {
      mainWindow = null; // Avoid clearing a newer window if an older one closes late.
    }
  });
  return createdWindow;
};

const ensureMainWindow = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow; // Reuse the existing renderer instead of opening duplicates.
  }
  if (!mainWindowPromise) {
    mainWindowPromise = createMainWindow().finally(() => {
      mainWindowPromise = null; // Let a later reopen retry after success or failure.
    });
  }
  return mainWindowPromise;
};

const startDesktopApp = async () => {
  await migrateLegacyDesktopSettings();
  loadDesktopEnv();
  await reconcileSnapshotBackupDirectory(getSnapshotBackupDir()).catch(error => console.error('Snapshot backup recovery failed.', error));
  await pruneSnapshotBackups(MAX_SNAPSHOT_BACKUP_COUNT).catch(error => console.error('Snapshot backup pruning failed.', error));
  session.defaultSession.protocol.handle(SNAPSHOT_MEDIA_PROTOCOL, handleSnapshotMediaProtocolRequest);
  session.defaultSession.on('will-download', (_event, item, webContents) => {
    snapshotDownloadCoordinator.claim({
      url: item.getURL(),
      webContentsId: webContents.id,
      item,
    });
  }); // DownloadItem completion owns the terminal release for each source lease.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(webContents === mainWindow?.webContents && isAllowedAudioPermissionRequest(permission, details)); // Trust only the app window's microphone requests.
  });

  await applySavedDockIcon();
  const serviceUrls = await managedServiceLifecycle.start();
  if (!serviceUrls || managedServiceLifecycle.isShutdownRequested()) return;
  refreshRuntimeConfig(serviceUrls);
  installApplicationMenu();
  await ensureMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void ensureMainWindow(); // macOS reopens a window after startup has initialized runtime config.
    }
  });
};

const focusMainWindowAfterStartup = async () => {
  await startupPromise;
  return focusMainWindowForMenuCommand(); // Second launches wait for the initialized owner instance.
};

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    void focusMainWindowAfterStartup(); // Bring the file-owning instance forward without racing startup.
  });

  startupPromise = app.whenReady().then(startDesktopApp);
}

ipcMain.on('canva-banana:get-runtime-config', event => {
  event.returnValue = runtimeConfig ?? {}; // Preload needs a synchronous snapshot during renderer startup.
});

ipcMain.handle('canva-banana:get-service-status', () => getServiceStatusSnapshot());

ipcMain.handle('canva-banana:file-menu-set-state', (event, nextState) => {
  fileMenuState = {
    autosaveEnabled: typeof nextState?.autosaveEnabled === 'boolean' ? nextState.autosaveEnabled : fileMenuState.autosaveEnabled,
    showZoomLevelBadge: typeof nextState?.showZoomLevelBadge === 'boolean' ? nextState.showZoomLevelBadge : fileMenuState.showZoomLevelBadge,
    showFileName: typeof nextState?.showFileName === 'boolean' ? nextState.showFileName : fileMenuState.showFileName,
    isClearingJimengCache: typeof nextState?.isClearingJimengCache === 'boolean' ? nextState.isClearingJimengCache : fileMenuState.isClearingJimengCache,
  };
  updateFileMenuItems();
  return true;
});

ipcMain.handle('canva-banana:file-menu-open-snapshot', async (event) => {
  const owner = rendererResourceEpochs.capture(event.sender.id);
  const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const dialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: 'Canvas Snapshot', extensions: ['bcsnap', 'json'] },
    ],
  };
  const result = targetWindow
    ? await dialog.showOpenDialog(targetWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  rendererResourceEpochs.assertCurrent(owner, 'Snapshot open dialog belongs to an inactive renderer document.');
  const filePath = result.filePaths[0];
  const source = await rememberSnapshotReadSource(filePath, owner);
  const autosaveEligible = isAutosaveEligibleSnapshotFileName(source.fileName)
    && await canReplaceSnapshotAutosaveTarget(filePath);
  const autosaveId = autosaveEligible ? rememberSnapshotAutosaveTarget(filePath) : undefined; // Read-only and legacy imports require export first.
  return { canceled: false, ...source, ...(autosaveId ? { autosaveId } : {}) };
});

ipcMain.handle('canva-banana:file-menu-begin-save-snapshot', async (event, payload) => {
  const owner = rendererResourceEpochs.capture(event.sender.id);
  const suggestedName = sanitizeSnapshotFileName(payload?.suggestedName);
  const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const dialogOptions = {
    defaultPath: join(app.getPath('documents'), suggestedName),
    filters: [{ name: 'Canvas Snapshot', extensions: ['bcsnap'] }],
  };
  const result = targetWindow
    ? await dialog.showSaveDialog(targetWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  const writeId = await beginSnapshotWriteSession({ targetPath: result.filePath, owner });
  return {
    canceled: false,
    fileName: basename(result.filePath),
    writeId,
    autosaveId: rememberSnapshotAutosaveTarget(result.filePath),
  };
});

ipcMain.handle('canva-banana:file-menu-begin-autosave-snapshot', async (event, payload) => {
  const owner = rendererResourceEpochs.capture(event.sender.id);
  const autosaveId = typeof payload?.autosaveId === 'string' ? payload.autosaveId : '';
  const filePath = snapshotAutosaveTargets.get(autosaveId);
  if (!filePath) {
    throw new Error('Snapshot autosave target is no longer available. Export the snapshot again.');
  }
  const writeId = await beginSnapshotWriteSession({ targetPath: filePath, owner });
  return { writeId, fileName: basename(filePath) };
});

ipcMain.handle('canva-banana:file-menu-begin-backup-snapshot', async (event, payload) => {
  const owner = rendererResourceEpochs.capture(event.sender.id);
  const summary = normalizeBackupSummary(payload);
  const targetPath = getSnapshotBackupDataPath(summary.id);
  const releaseBackupLease = await snapshotBackupCoordinator.acquire(); // Own backup state for the complete streamed write session.
  let reservation;
  try {
    reservation = await reserveSnapshotBackupBytes(summary);
    const writeId = await beginSnapshotWriteSession({
      targetPath,
      owner,
      backupSummary: summary,
      maxBytes: summary.size,
      backupReservedBytes: summary.size,
      backupReplacingExisting: reservation.replacingExisting,
      releaseBackupLease,
    });
    return { writeId, fileName: summary.fileName };
  } catch (error) {
    if (reservation) {
      releaseSnapshotBackupBytes(summary.size);
    }
    releaseBackupLease();
    throw error;
  }
});

ipcMain.handle('canva-banana:file-menu-write-snapshot-chunk', async (event, payload) => (
  writeSnapshotSessionChunk({
    writeId: payload?.writeId,
    data: payload?.data,
    owner: rendererResourceEpochs.capture(event.sender.id),
  })
));

ipcMain.handle('canva-banana:file-menu-finish-snapshot-write', async (event, payload) => (
  finishSnapshotWriteSession(payload?.writeId, rendererResourceEpochs.capture(event.sender.id))
));

ipcMain.handle('canva-banana:file-menu-abort-snapshot-write', async (event, payload) => (
  abortSnapshotWriteSession(payload?.writeId, rendererResourceEpochs.capture(event.sender.id))
));

ipcMain.handle('canva-banana:file-menu-read-snapshot-range', async (event, payload) => (
  readSnapshotSourceRange({
    sourceId: payload?.sourceId,
    offset: payload?.offset,
    length: payload?.length,
    owner: rendererResourceEpochs.capture(event.sender.id),
  })
));

ipcMain.handle('canva-banana:file-menu-get-snapshot-media-url', async (event, payload) => {
  getSnapshotReadSource(payload?.sourceId, rendererResourceEpochs.capture(event.sender.id));
  return getSnapshotMediaProtocolUrl(payload); // Issue URLs only for sources owned by this renderer document.
});

ipcMain.handle('canva-banana:file-menu-download-snapshot-media', (event, payload) => {
  const requestUrl = assertNonEmptyString(payload?.url, 'Snapshot media download URL is invalid.');
  const media = parseSnapshotMediaProtocolUrl(requestUrl);
  if (!media.downloadFileName) {
    throw new Error('Snapshot media download filename is invalid.');
  }
  const source = getSnapshotReadSource(media.sourceId, rendererResourceEpochs.capture(event.sender.id));
  if (media.offset + media.length > source.size) {
    throw new Error('Snapshot media range is invalid.');
  }
  const releaseSource = source.closeLease.acquire();
  let reservation;
  try {
    reservation = snapshotDownloadCoordinator.reserve({
      requestUrl,
      sourceId: media.sourceId,
      offset: media.offset,
      length: media.length,
      webContentsId: event.sender.id,
      releaseSource,
    });
    event.sender.downloadURL(reservation.url);
  } catch (error) {
    if (reservation) {
      snapshotDownloadCoordinator.release(reservation.token);
    } else {
      releaseSource();
    }
    throw error;
  }
  return { started: true };
}); // Main validates the retained source capability before Chromium streams it to disk.

ipcMain.handle('canva-banana:file-menu-retain-snapshot-read', (event, payload) => (
  retainSnapshotReadSource(payload?.sourceId, rendererResourceEpochs.capture(event.sender.id))
));

ipcMain.handle('canva-banana:file-menu-close-snapshot-read', (event, payload) => (
  closeSnapshotReadSource(payload?.sourceId, rendererResourceEpochs.capture(event.sender.id))
));

ipcMain.handle('canva-banana:file-menu-list-snapshot-backups', () => listSnapshotBackupSummaries());

ipcMain.handle('canva-banana:file-menu-open-backup-snapshot', async (event, payload) => {
  const owner = rendererResourceEpochs.capture(event.sender.id);
  const id = assertSnapshotSessionId(payload?.id, 'Backup id is invalid.');
  return openSnapshotBackupSource({
    coordinator: snapshotBackupCoordinator,
    openSource: async () => {
      let source;
      try {
        source = await rememberSnapshotReadSource(getSnapshotBackupDataPath(id), owner); // The open handle pins this committed backup version.
        const summaries = await listSnapshotBackupSummariesUnlocked();
        const summary = summaries.find(item => item.id === id);
        return {
          ...source,
          fileName: summary?.fileName ?? source.fileName,
        };
      } catch (error) {
        if (source) {
          await closeSnapshotReadSource(source.sourceId, owner); // Do not leak a handle when summary lookup fails.
        }
        throw error;
      }
    },
  }); // Large imports keep reading in chunks from the pinned handle without holding the backup lease.
});

ipcMain.handle('canva-banana:file-menu-delete-backup-snapshot', async (event, payload) => {
  await deleteSnapshotBackup(payload?.id);
  return { deleted: true };
});

ipcMain.handle('canva-banana:load-chat-history', () => chatHistoryStore.read());

ipcMain.handle('canva-banana:save-chat-history', async (event, snapshot) => {
  return chatHistoryStore.save(snapshot ?? { revision: -1, conversations: [], folders: [] });
});

ipcMain.handle('canva-banana:get-settings-status', () => buildSettingsStatus());

ipcMain.handle('canva-banana:clipboard-write-text', (_event, text) => {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text must be a string.');
  }
  if (text.length > maxClipboardTextChars) {
    throw new Error('Clipboard text is too large to write safely.');
  }
  clipboard.writeText(text); // Main-process clipboard works in packaged macOS builds.
  return true;
});

ipcMain.handle('canva-banana:app-icon-get-state', () => buildCurrentAppIconState());

ipcMain.handle('canva-banana:app-icon-set-selected', async (_event, iconId) => {
  const selectedIconId = assertKnownAppIconId(iconId);
  const nextImage = loadDockIconImage(selectedIconId);
  await writeSelectedAppIconId(getAppIconPath(), selectedIconId);
  applyDockIconImage(nextImage);
  return buildCurrentAppIconState();
});

ipcMain.handle('canva-banana:restart-services', async () => {
  await restartManagedServices();
  return buildSettingsStatus();
});

ipcMain.handle('canva-banana:clear-settings', async (event, keys) => {
  const content = await readDesktopSettingsFile(getDesktopSettingsPath());
  const { content: nextContent } = applyDesktopSettings(content, { clears: Array.isArray(keys) ? keys : [] });
  await writeDesktopSettingsFileAtomic(getDesktopSettingsPath(), nextContent);
  for (const key of Array.isArray(keys) ? keys : []) {
    if (DESKTOP_SETTING_KEYS.includes(key)) {
      delete process.env[key]; // Cleared values should disappear from restarted services.
    }
  }
  await restartManagedServices();
  const status = buildSettingsStatus();
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  setTimeout(() => targetWindow?.webContents.reload(), 150).unref();
  return status;
});

ipcMain.handle('canva-banana:save-settings', async (event, payload) => {
  const updates = payload && typeof payload === 'object' ? payload : {};
  const content = await readDesktopSettingsFile(getDesktopSettingsPath());
  const { content: nextContent, values } = applyDesktopSettings(content, { updates });
  await writeDesktopSettingsFileAtomic(getDesktopSettingsPath(), nextContent);
  for (const key of DESKTOP_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && typeof updates[key] === 'string' && updates[key].trim()) {
      process.env[key] = values[key]; // Saved values should affect the restart immediately.
    }
  }
  await restartManagedServices();
  const status = buildSettingsStatus();
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  setTimeout(() => targetWindow?.webContents.reload(), 150).unref();
  return status;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit(); // Match standard non-macOS app lifecycle.
  }
});

const cleanupBeforeQuit = async () => {
  snapshotDownloadCoordinator.cancelAll(); // Quit interrupts downloads so deferred source closure cannot stall shutdown.
  const results = await Promise.allSettled([
    managedServiceLifecycle.shutdown(),
    abortAllSnapshotWriteSessions(),
    closeAllSnapshotReadSources(),
  ]); // Electron does not await asynchronous event listeners, so the barrier owns this promise.
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.error('App shutdown cleanup failed.', result.reason);
    }
  });
};

app.on('before-quit', createAppQuitBarrier({
  cleanup: cleanupBeforeQuit,
  quit: () => app.quit(),
}));
