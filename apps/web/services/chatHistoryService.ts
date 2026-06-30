import {
  OPENROUTER_CHAT_MODELS,
  OPENROUTER_MAX_CHAT_MESSAGES,
  OPENROUTER_MAX_MESSAGE_CHARS,
  type OpenRouterChatMessage,
  type OpenRouterChatModelId,
} from './openRouterChatService';

export type ChatConversation = {
  id: string;
  title: string;
  model: OpenRouterChatModelId;
  messages: OpenRouterChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean; // undefined/false => unpinned.
  folderId?: string | null; // undefined/null => unfiled; otherwise a ChatFolder.id.
  titleCustomized?: boolean; // true => user renamed the chat; suppress title auto-derivation.
};

export type ChatFolder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
};

export type ChatHistorySnapshot = {
  conversations: ChatConversation[];
  folders: ChatFolder[];
};

const STORAGE_KEY = 'prompt-chat-history-v1'; // Web fallback when the desktop bridge is absent.
const MAX_CONVERSATIONS = 100; // Bound on-disk growth; keeps the newest sessions.
const MAX_FOLDERS = 50; // Bound folder growth; the flat list stays manageable.
const TITLE_MAX_CHARS = 60;
const FALLBACK_TITLE = 'New conversation';

const EMPTY_SNAPSHOT: ChatHistorySnapshot = { conversations: [], folders: [] };

let desktopHistoryRevision = 0;
let desktopHistoryGeneration = 0;
let desktopSaveQueue: Promise<ChatHistorySnapshot> = Promise.resolve(EMPTY_SNAPSHOT);
let desktopBridgeIdentity: unknown = null;
let desktopInitialLoadPromise: Promise<ChatHistorySnapshot> | null = null;
let desktopInitialLoadSettled = false;
let desktopBaseSnapshot: ChatHistorySnapshot | null = null;
let desktopUnadoptedBaseSnapshot: ChatHistorySnapshot | null = null;
let desktopBaseAdopted = false;
let desktopLoadRequestId = 0;

const getBridge = () => (typeof window !== 'undefined' ? window.canvaBananaDesktop?.chatHistory : undefined);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const CHAT_MODEL_IDS = new Set<OpenRouterChatModelId>(OPENROUTER_CHAT_MODELS.map(model => model.id)); // Saved models must still be available.

const isOpenRouterChatModelId = (value: unknown): value is OpenRouterChatModelId =>
  typeof value === 'string' && CHAT_MODEL_IDS.has(value as OpenRouterChatModelId);

const normalizeChatMessage = (value: unknown): OpenRouterChatMessage | null => {
  if (!isRecord(value)) {
    return null;
  }
  const role = value.role === 'user' || value.role === 'assistant' ? value.role : null;
  if (!role || typeof value.content !== 'string') {
    return null;
  }
  return { role, content: value.content.slice(0, OPENROUTER_MAX_MESSAGE_CHARS) }; // Match the backend message size cap.
};

const resetDesktopStateForBridge = (bridge: unknown) => {
  if (bridge === desktopBridgeIdentity) {
    return;
  }
  desktopBridgeIdentity = bridge;
  desktopHistoryRevision = 0;
  desktopHistoryGeneration = 0;
  desktopSaveQueue = Promise.resolve(EMPTY_SNAPSHOT);
  desktopInitialLoadPromise = null;
  desktopInitialLoadSettled = false;
  desktopBaseSnapshot = null;
  desktopUnadoptedBaseSnapshot = null;
  desktopBaseAdopted = false;
  desktopLoadRequestId = 0;
};

const updateDesktopHistoryRevision = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= desktopHistoryRevision) {
    desktopHistoryRevision = value; // Never roll back after a newer clear/save revision arrives.
  }
};

export const createConversationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `conv-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`; // Fallback for non-secure contexts.
};

export const deriveConversationTitle = (messages: OpenRouterChatMessage[]): string => {
  const firstUserMessage = messages.find(message => message.role === 'user');
  const text = firstUserMessage?.content.trim().replace(/\s+/g, ' ') ?? '';
  if (!text) {
    return FALLBACK_TITLE;
  }
  return text.length > TITLE_MAX_CHARS ? `${text.slice(0, TITLE_MAX_CHARS).trimEnd()}…` : text;
};

const normalizeConversation = (value: unknown): ChatConversation | null => {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    return null;
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    !isOpenRouterChatModelId(value.model) ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number'
  ) {
    return null;
  }
  const messages = value.messages
    .map(normalizeChatMessage)
    .filter((message): message is OpenRouterChatMessage => Boolean(message))
    .slice(-OPENROUTER_MAX_CHAT_MESSAGES);
  const conversation: ChatConversation = {
    id: value.id,
    title: value.title,
    model: value.model,
    messages,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (typeof value.pinned === 'boolean') {
    conversation.pinned = value.pinned;
  }
  const rawFolderId = value.folderId;
  const folderId: ChatConversation['folderId'] = typeof rawFolderId === 'string' ? rawFolderId : rawFolderId === null ? null : undefined;
  if (folderId !== undefined) {
    conversation.folderId = folderId;
  }
  if (typeof value.titleCustomized === 'boolean') {
    conversation.titleCustomized = value.titleCustomized;
  }
  return conversation;
};

const isChatFolder = (value: unknown): value is ChatFolder => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ChatFolder>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.createdAt === 'number';
};

// Keep every pinned chat plus the newest unpinned ones, so an old pinned chat is never dropped by the cap.
const capConversations = (conversations: ChatConversation[]): ChatConversation[] => {
  if (conversations.length <= MAX_CONVERSATIONS) {
    return conversations;
  }
  const pinned = conversations.filter(conversation => conversation.pinned);
  const unpinned = conversations.filter(conversation => !conversation.pinned);
  const room = Math.max(0, MAX_CONVERSATIONS - pinned.length);
  return [...pinned, ...unpinned.slice(0, room)].slice(0, MAX_CONVERSATIONS); // Preserve incoming (newest-first) order per group.
};

const normalizeConversations = (value: unknown): ChatConversation[] => {
  const list = Array.isArray(value) ? value : [];
  return capConversations(list.map(normalizeConversation).filter((conversation): conversation is ChatConversation => Boolean(conversation)));
};

const normalizeFolders = (value: unknown): ChatFolder[] => {
  const list = Array.isArray(value) ? value : [];
  return list.filter(isChatFolder).slice(0, MAX_FOLDERS);
};

// Rewrite any folderId that no longer points at a real folder so the chat reads as unfiled.
const reconcileFolderRefs = (snapshot: ChatHistorySnapshot): ChatHistorySnapshot => {
  const folderIds = new Set(snapshot.folders.map(folder => folder.id));
  const conversations = snapshot.conversations.map(conversation =>
    conversation.folderId && !folderIds.has(conversation.folderId) ? { ...conversation, folderId: null } : conversation,
  );
  return { conversations, folders: snapshot.folders };
};

const mergeById = <Item extends { id: string }>(baseItems: Item[], overlayItems: Item[]): Item[] => {
  const overlayById = new Map(overlayItems.map(item => [item.id, item]));
  const merged = baseItems.map(item => overlayById.get(item.id) ?? item);
  const baseIds = new Set(baseItems.map(item => item.id));
  return [...overlayItems.filter(item => !baseIds.has(item.id)), ...merged]; // New local items stay visible before older loaded ones.
};

const mergeSnapshots = (base: ChatHistorySnapshot, overlay: ChatHistorySnapshot): ChatHistorySnapshot =>
  reconcileFolderRefs({
    conversations: capConversations(mergeById(base.conversations, overlay.conversations)),
    folders: mergeById(base.folders, overlay.folders).slice(0, MAX_FOLDERS),
  });

const mergeItemsPreservingDeletes = <Item extends { id: string }>(latestItems: Item[], localItems: Item[], baseItems: Item[]): Item[] => {
  const baseIds = new Set(baseItems.map(item => item.id));
  const localIds = new Set(localItems.map(item => item.id));
  const externalItems = latestItems.filter(item => !baseIds.has(item.id) && !localIds.has(item.id));
  return [...localItems, ...externalItems]; // Local omissions delete known base items; unknown latest items are external additions.
};

const mergeSnapshotsPreservingDeletes = (
  latest: ChatHistorySnapshot,
  local: ChatHistorySnapshot,
  base: ChatHistorySnapshot,
): ChatHistorySnapshot => reconcileFolderRefs({
  conversations: capConversations(mergeItemsPreservingDeletes(latest.conversations, local.conversations, base.conversations)),
  folders: mergeItemsPreservingDeletes(latest.folders, local.folders, base.folders).slice(0, MAX_FOLDERS),
});

const normalizeSnapshotForSave = ({ conversations, folders }: ChatHistorySnapshot): ChatHistorySnapshot =>
  reconcileFolderRefs({
    conversations: capConversations(conversations),
    folders: folders.slice(0, MAX_FOLDERS),
  });

// Tolerate both the legacy bare-array payload and the { conversations, folders } envelope.
const normalizeSnapshot = (raw: unknown): ChatHistorySnapshot => {
  if (Array.isArray(raw)) {
    return reconcileFolderRefs({ conversations: normalizeConversations(raw), folders: [] });
  }
  const candidate = (raw ?? {}) as { conversations?: unknown; folders?: unknown };
  return reconcileFolderRefs({
    conversations: normalizeConversations(candidate.conversations),
    folders: normalizeFolders(candidate.folders),
  });
};

const readLocalStorageSnapshot = (): ChatHistorySnapshot => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSnapshot(JSON.parse(raw)) : EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT; // Corrupted/blocked storage degrades to empty history.
  }
};

const loadDesktopHistory = async (
  bridge: NonNullable<ReturnType<typeof getBridge>>,
  options: { force?: boolean } = {},
): Promise<ChatHistorySnapshot> => {
  resetDesktopStateForBridge(bridge);
  if (!bridge.load) {
    desktopInitialLoadSettled = true;
    return EMPTY_SNAPSHOT;
  }
  if (options.force || !desktopInitialLoadPromise) {
    const generationAtLoad = desktopHistoryGeneration;
    const loadRequestId = desktopLoadRequestId + 1;
    desktopLoadRequestId = loadRequestId;
    desktopInitialLoadSettled = false;
    desktopInitialLoadPromise = bridge.load().then(raw => {
      if (generationAtLoad !== desktopHistoryGeneration || loadRequestId !== desktopLoadRequestId) {
        return EMPTY_SNAPSHOT; // Ignore results from a pre-clear or superseded desktop load.
      }
      if (isRecord(raw)) {
        updateDesktopHistoryRevision(raw.revision);
      }
      const snapshot = normalizeSnapshot(raw);
      desktopBaseSnapshot = snapshot;
      desktopUnadoptedBaseSnapshot = snapshot;
      desktopBaseAdopted = false;
      return snapshot;
    }).catch(() => EMPTY_SNAPSHOT).finally(() => {
      if (loadRequestId === desktopLoadRequestId) {
        desktopInitialLoadSettled = true; // Only the active load can mark hydration complete.
      }
    });
  }
  return desktopInitialLoadPromise;
};

const writeLocalStorageSnapshot = (snapshot: ChatHistorySnapshot): void => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, conversations: snapshot.conversations, folders: snapshot.folders }),
    );
  } catch {
    // Ignore storage write failures (quota/private mode); history stays in memory.
  }
};

export const loadChatHistory = async (): Promise<ChatHistorySnapshot> => {
  const bridge = getBridge();
  if (bridge?.load) {
    return loadDesktopHistory(bridge);
  }
  return readLocalStorageSnapshot(); // localStorage helpers swallow the no-window (SSR/test) case.
};

export const markChatHistorySnapshotAdopted = (snapshot: ChatHistorySnapshot): void => {
  const bridge = getBridge();
  if (bridge) {
    resetDesktopStateForBridge(bridge);
  }
  desktopBaseSnapshot = normalizeSnapshotForSave(snapshot);
  desktopUnadoptedBaseSnapshot = null;
  desktopBaseAdopted = true;
};

export const saveChatHistory = async ({ conversations, folders }: ChatHistorySnapshot): Promise<ChatHistorySnapshot> => {
  const snapshot = normalizeSnapshotForSave({ conversations, folders });
  const bridge = getBridge();
  if (bridge?.save) {
    resetDesktopStateForBridge(bridge);
    const generationAtCall = desktopHistoryGeneration;
    const shouldMergeUnadoptedBaseAtCall = Boolean(bridge.load) && !desktopBaseAdopted;
    const baseAtCall = desktopBaseSnapshot;
    const run = desktopSaveQueue.catch(() => EMPTY_SNAPSHOT).then(async () => {
      if (generationAtCall !== desktopHistoryGeneration) {
        return snapshot; // Drop renderer saves that were queued before native Clear Chat History.
      }
      const baseForUnadoptedMerge = shouldMergeUnadoptedBaseAtCall
        ? desktopUnadoptedBaseSnapshot ?? (desktopInitialLoadSettled && desktopBaseSnapshot ? desktopBaseSnapshot : await loadDesktopHistory(bridge))
        : null;
      const snapshotToSave = baseForUnadoptedMerge ? mergeSnapshots(baseForUnadoptedMerge, snapshot) : snapshot;
      if (generationAtCall !== desktopHistoryGeneration) {
        return snapshot; // A native clear while hydration was pending makes this save stale.
      }
      const result = await bridge.save({ ...snapshotToSave, revision: desktopHistoryRevision });
      if (isRecord(result)) {
        if (result.saved === false) {
          const latest = await loadDesktopHistory(bridge, { force: true });
          if (generationAtCall !== desktopHistoryGeneration) {
            return snapshot; // Do not retry across a clear event.
          }
          const retrySnapshot = baseForUnadoptedMerge
            ? mergeSnapshots(latest, snapshot)
            : baseAtCall
              ? mergeSnapshotsPreservingDeletes(latest, snapshot, baseAtCall)
              : mergeSnapshots(latest, snapshot);
          const retryResult = await bridge.save({ ...retrySnapshot, revision: desktopHistoryRevision });
          if (!isRecord(retryResult) || retryResult.saved === false) {
            throw new Error('Chat history save was rejected as stale.');
          }
          updateDesktopHistoryRevision(retryResult.revision);
          desktopBaseSnapshot = retrySnapshot;
          return retrySnapshot;
        }
        updateDesktopHistoryRevision(result.revision);
      }
      desktopBaseSnapshot = snapshotToSave;
      return snapshotToSave;
    });
    desktopSaveQueue = run.catch(() => snapshot);
    try {
      return await run;
    } catch {
      // Ignore persistence failures; the in-memory list is still usable.
    }
    return snapshot;
  }
  writeLocalStorageSnapshot(snapshot);
  return snapshot;
};

export const subscribeToHistoryCleared = (callback: () => void): (() => void) => {
  const bridge = getBridge();
  if (bridge) {
    resetDesktopStateForBridge(bridge);
  }
  return bridge?.onCleared?.(payload => {
    desktopHistoryGeneration += 1;
    desktopLoadRequestId += 1;
    updateDesktopHistoryRevision(payload?.revision);
    desktopBaseSnapshot = EMPTY_SNAPSHOT;
    desktopUnadoptedBaseSnapshot = null;
    desktopBaseAdopted = true;
    desktopInitialLoadPromise = null;
    desktopInitialLoadSettled = true;
    callback();
  }) ?? (() => {}); // No native clear menu on the web build.
};
