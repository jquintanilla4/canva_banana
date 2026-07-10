import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const BACKUP_ID_PATTERN = '[A-Za-z0-9_-]+';
const DATA_FILE_PATTERN = new RegExp(`^(${BACKUP_ID_PATTERN})\\.bcsnap$`);
const META_FILE_PATTERN = new RegExp(`^(${BACKUP_ID_PATTERN})\\.json$`);
const DATA_TEMP_FILE_PATTERN = new RegExp(`^\\.(${BACKUP_ID_PATTERN})\\.bcsnap\\.(${BACKUP_ID_PATTERN})\\.tmp$`);
const META_TEMP_FILE_PATTERN = new RegExp(`^(${BACKUP_ID_PATTERN})\\.json\\.[A-Fa-f0-9]+\\.tmp$`);
const PENDING_META_FILE_PATTERN = new RegExp(`^(${BACKUP_ID_PATTERN})\\.json\\.(${BACKUP_ID_PATTERN})\\.pending$`);
const ROLLBACK_FILE_PATTERN = new RegExp(`^(${BACKUP_ID_PATTERN})\\.bcsnap\\.(${BACKUP_ID_PATTERN})\\.rollback$`);

const removeFile = filePath => rm(filePath, { force: true });

const readMatchingBackupMeta = async (metaPath, id, dataStats) => {
  try {
    const summary = JSON.parse(await readFile(metaPath, 'utf8'));
    const matchesData = summary
      && typeof summary === 'object'
      && summary.id === id
      && Number.isFinite(summary.createdAt)
      && Number.isFinite(summary.updatedAt)
      && typeof summary.fileName === 'string'
      && summary.fileName.length > 0
      && Number.isSafeInteger(summary.size)
      && summary.size === dataStats.size;
    return matchesData ? summary : null;
  } catch {
    return null;
  }
};

const writeRecoveredBackupMeta = async (backupDir, id, dataStats) => {
  const metaPath = join(backupDir, `${id}.json`);
  const tempPath = `${metaPath}.${randomBytes(8).toString('hex')}.tmp`;
  const updatedAt = Number.isFinite(dataStats.mtimeMs) ? dataStats.mtimeMs : Date.now();
  const createdAt = Number.isFinite(dataStats.birthtimeMs) && dataStats.birthtimeMs > 0 ? dataStats.birthtimeMs : updatedAt;
  const summary = {
    id,
    createdAt,
    updatedAt,
    fileName: `${id}.bcsnap`,
    size: dataStats.size,
  };
  try {
    await writeFile(tempPath, JSON.stringify(summary), { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, metaPath);
  } catch (error) {
    await removeFile(tempPath).catch(() => {});
    throw error;
  }
};

const selectNewestFile = async (backupDir, files) => {
  const candidates = await Promise.all(files.map(async file => ({
    ...file,
    mtimeMs: (await stat(join(backupDir, file.fileName))).mtimeMs,
  })));
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
};

const removeFiles = async (backupDir, files) => {
  await Promise.all(files.map(file => removeFile(join(backupDir, file.fileName))));
};

export const reconcileSnapshotBackupDirectory = async (backupDir) => {
  await mkdir(backupDir, { recursive: true });
  const entries = await readdir(backupDir, { withFileTypes: true });
  const records = new Map();
  const staleTempFiles = [];

  const getRecord = (id) => {
    const existing = records.get(id);
    if (existing) return existing;
    const record = { dataFileName: null, metaFileName: null, pendingMetaFiles: [], rollbackFiles: [] };
    records.set(id, record);
    return record;
  };

  entries.forEach(entry => {
    if (!entry.isFile()) return;
    const dataMatch = DATA_FILE_PATTERN.exec(entry.name);
    if (dataMatch) {
      getRecord(dataMatch[1]).dataFileName = entry.name;
      return;
    }
    const metaMatch = META_FILE_PATTERN.exec(entry.name);
    if (metaMatch) {
      getRecord(metaMatch[1]).metaFileName = entry.name;
      return;
    }
    const pendingMetaMatch = PENDING_META_FILE_PATTERN.exec(entry.name);
    if (pendingMetaMatch) {
      getRecord(pendingMetaMatch[1]).pendingMetaFiles.push({ fileName: entry.name, writeId: pendingMetaMatch[2] });
      return;
    }
    const rollbackMatch = ROLLBACK_FILE_PATTERN.exec(entry.name);
    if (rollbackMatch) {
      getRecord(rollbackMatch[1]).rollbackFiles.push({ fileName: entry.name, writeId: rollbackMatch[2] });
      return;
    }
    if (DATA_TEMP_FILE_PATTERN.test(entry.name) || META_TEMP_FILE_PATTERN.test(entry.name)) {
      staleTempFiles.push(entry.name); // Startup has no active write sessions, so matching temp files are stale.
    }
  });

  await Promise.all(staleTempFiles.map(fileName => removeFile(join(backupDir, fileName))));

  for (const [id, record] of records) {
    const dataPath = join(backupDir, `${id}.bcsnap`);
    const metaPath = join(backupDir, `${id}.json`);
    if (!record.dataFileName && record.rollbackFiles.length > 0) {
      const rollbackToRestore = await selectNewestFile(backupDir, record.rollbackFiles);
      if (rollbackToRestore) {
        await rename(join(backupDir, rollbackToRestore.fileName), dataPath); // Restore the last committed data when replacement stopped before rename.
        record.dataFileName = `${id}.bcsnap`;
        record.rollbackFiles = record.rollbackFiles.filter(file => file.fileName !== rollbackToRestore.fileName);
      }
    }

    if (!record.dataFileName) {
      await removeFiles(backupDir, record.pendingMetaFiles);
      await removeFiles(backupDir, record.rollbackFiles);
      if (record.metaFileName) await removeFile(metaPath); // A sidecar without data cannot be restored.
      continue;
    }

    let dataStats = await stat(dataPath);
    let summary = record.metaFileName ? await readMatchingBackupMeta(metaPath, id, dataStats) : null;

    if (record.rollbackFiles.length > 0) {
      const committedRollback = summary?.commitId
        ? record.rollbackFiles.find(file => file.writeId === summary.commitId)
        : null;
      const pendingCandidates = [];
      for (const pendingFile of record.pendingMetaFiles) {
        if (!record.rollbackFiles.some(file => file.writeId === pendingFile.writeId)) continue;
        const pendingSummary = await readMatchingBackupMeta(join(backupDir, pendingFile.fileName), id, dataStats);
        if (pendingSummary?.commitId === pendingFile.writeId && pendingSummary.replacesExisting === true) {
          pendingCandidates.push({ ...pendingFile, summary: pendingSummary });
        }
      }

      if (committedRollback) {
        await removeFiles(backupDir, record.rollbackFiles); // The sidecar commit completed before rollback cleanup.
        await removeFiles(backupDir, record.pendingMetaFiles);
      } else if (pendingCandidates.length > 0) {
        const pendingToCommit = await selectNewestFile(backupDir, pendingCandidates);
        await rename(join(backupDir, pendingToCommit.fileName), metaPath); // Complete the transaction-linked sidecar commit.
        summary = pendingToCommit.summary;
        await removeFiles(backupDir, record.rollbackFiles);
        await removeFiles(backupDir, record.pendingMetaFiles);
      } else {
        const rollbackToRestore = await selectNewestFile(backupDir, record.rollbackFiles);
        await removeFile(dataPath);
        await rename(join(backupDir, rollbackToRestore.fileName), dataPath); // Ambiguous legacy states keep the last known-consistent pair.
        await removeFiles(backupDir, record.rollbackFiles.filter(file => file.fileName !== rollbackToRestore.fileName));
        await removeFiles(backupDir, record.pendingMetaFiles);
        dataStats = await stat(dataPath);
        summary = record.metaFileName ? await readMatchingBackupMeta(metaPath, id, dataStats) : null;
      }
    } else if (record.pendingMetaFiles.length > 0) {
      const pendingCandidates = [];
      for (const pendingFile of record.pendingMetaFiles) {
        const pendingSummary = await readMatchingBackupMeta(join(backupDir, pendingFile.fileName), id, dataStats);
        if (pendingSummary?.commitId === pendingFile.writeId && pendingSummary.replacesExisting === false) {
          pendingCandidates.push({ ...pendingFile, summary: pendingSummary });
        }
      }
      if (pendingCandidates.length > 0) {
        const pendingToCommit = await selectNewestFile(backupDir, pendingCandidates);
        await rename(join(backupDir, pendingToCommit.fileName), metaPath); // New backups also recover after data rename but before sidecar rename.
        summary = pendingToCommit.summary;
      }
      await removeFiles(backupDir, record.pendingMetaFiles);
    }

    if (!summary) {
      await writeRecoveredBackupMeta(backupDir, id, dataStats); // Complete a data rename interrupted before its sidecar commit.
    }
  }
};
