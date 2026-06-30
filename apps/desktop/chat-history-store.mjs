import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const CHAT_HISTORY_LIMITS = Object.freeze({
  conversations: 100,
  folders: 50,
  messagesPerConversation: 40,
  idChars: 120,
  titleChars: 160,
  modelChars: 160,
  folderNameChars: 160,
  messageChars: 12000,
  payloadBytes: 5 * 1024 * 1024,
});

const EMPTY_CHAT_HISTORY = Object.freeze({ conversations: [], folders: [] });
const MESSAGE_ROLES = new Set(['user', 'assistant']); // Match backend-accepted chat roles.

const clampString = (value, maxChars) => (
  typeof value === 'string' ? value.slice(0, maxChars) : null
);

const normalizeTimestamp = (value) => (
  Number.isFinite(value) && value >= 0 ? value : Date.now()
);

const normalizeMessage = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const role = MESSAGE_ROLES.has(value.role) ? value.role : null;
  const content = clampString(value.content, CHAT_HISTORY_LIMITS.messageChars);
  return role && content !== null ? { role, content } : null;
};

const normalizeConversation = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.messages)) {
    return null;
  }
  const id = clampString(value.id, CHAT_HISTORY_LIMITS.idChars);
  const title = clampString(value.title, CHAT_HISTORY_LIMITS.titleChars);
  const model = clampString(value.model, CHAT_HISTORY_LIMITS.modelChars);
  if (!id || title === null || !model) {
    return null;
  }
  const messages = value.messages
    .slice(-CHAT_HISTORY_LIMITS.messagesPerConversation)
    .map(normalizeMessage)
    .filter(Boolean);
  const conversation = {
    id,
    title,
    model,
    messages,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
  if (typeof value.pinned === 'boolean') {
    conversation.pinned = value.pinned;
  }
  if (typeof value.folderId === 'string') {
    conversation.folderId = value.folderId.slice(0, CHAT_HISTORY_LIMITS.idChars);
  } else if (value.folderId === null) {
    conversation.folderId = null;
  }
  if (typeof value.titleCustomized === 'boolean') {
    conversation.titleCustomized = value.titleCustomized;
  }
  return conversation;
};

const normalizeFolder = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const id = clampString(value.id, CHAT_HISTORY_LIMITS.idChars);
  const name = clampString(value.name, CHAT_HISTORY_LIMITS.folderNameChars);
  if (!id || name === null) {
    return null;
  }
  const folder = {
    id,
    name,
    createdAt: normalizeTimestamp(value.createdAt),
  };
  if (Number.isFinite(value.updatedAt) && value.updatedAt >= 0) {
    folder.updatedAt = value.updatedAt;
  }
  return folder;
};

const reconcileFolderRefs = ({ conversations, folders }) => {
  const folderIds = new Set(folders.map(folder => folder.id));
  return {
    conversations: conversations.map(conversation => (
      conversation.folderId && !folderIds.has(conversation.folderId)
        ? { ...conversation, folderId: null }
        : conversation
    )),
    folders,
  };
};

export const normalizeChatHistorySnapshot = (raw) => {
  const candidate = Array.isArray(raw) ? { conversations: raw, folders: [] } : (raw ?? {});
  const conversations = (Array.isArray(candidate.conversations) ? candidate.conversations : [])
    .slice(0, CHAT_HISTORY_LIMITS.conversations)
    .map(normalizeConversation)
    .filter(Boolean);
  const folders = (Array.isArray(candidate.folders) ? candidate.folders : [])
    .slice(0, CHAT_HISTORY_LIMITS.folders)
    .map(normalizeFolder)
    .filter(Boolean);
  return reconcileFolderRefs({ conversations, folders });
};

export const serializeChatHistorySnapshot = (raw) => {
  const snapshot = normalizeChatHistorySnapshot(raw);
  let conversations = snapshot.conversations;
  let payload = JSON.stringify({ version: 2, conversations, folders: snapshot.folders });
  while (Buffer.byteLength(payload, 'utf8') > CHAT_HISTORY_LIMITS.payloadBytes && conversations.length > 0) {
    conversations = conversations.slice(0, -1);
    payload = JSON.stringify({ version: 2, conversations, folders: snapshot.folders });
  }
  if (Buffer.byteLength(payload, 'utf8') > CHAT_HISTORY_LIMITS.payloadBytes) {
    throw new Error('Chat history payload is too large.');
  }
  return payload;
};

export const createChatHistoryStore = ({ getHistoryPath }) => {
  let mutationQueue = Promise.resolve();
  let revision = 0;

  const enqueueMutation = (operation) => {
    const run = mutationQueue.catch(() => {}).then(operation);
    mutationQueue = run.catch(() => {});
    return run;
  };

  const readFromDisk = async () => {
    try {
      const parsed = JSON.parse(await readFile(getHistoryPath(), 'utf8'));
      return { ...normalizeChatHistorySnapshot(parsed), revision };
    } catch {
      return { ...EMPTY_CHAT_HISTORY, revision };
    }
  };

  const read = () => mutationQueue.catch(() => {}).then(readFromDisk);

  const save = async (snapshot) => {
    const requestedRevision = Number.isFinite(snapshot?.revision) ? snapshot.revision : null;
    return enqueueMutation(async () => {
      if (requestedRevision !== revision) {
        return { saved: false, revision }; // Reject stale renderer saves after a native clear or newer save.
      }
      const historyPath = getHistoryPath();
      await mkdir(dirname(historyPath), { recursive: true });
      const tempPath = `${historyPath}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await writeFile(tempPath, serializeChatHistorySnapshot(snapshot), { encoding: 'utf8', mode: 0o600 }); // Keep saved prompts private on disk.
        await rename(tempPath, historyPath);
        await chmod(historyPath, 0o600); // Repair mode when replacing an older history file.
        revision += 1;
        return { saved: true, revision };
      } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
      }
    });
  };

  const clear = async () => enqueueMutation(async () => {
    await rm(getHistoryPath(), { force: true });
    revision += 1;
    return { revision };
  });

  return {
    clear,
    getRevision: () => revision,
    read,
    save,
  };
};
