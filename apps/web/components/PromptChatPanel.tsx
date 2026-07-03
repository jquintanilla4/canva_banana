import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDownIcon, CopyIcon, DeleteIcon, FolderIcon, HistoryIcon, KebabIcon, LayerUpIcon, NewFolderIcon, PinIcon, PlusIcon, RenameIcon, RobotIcon } from './Icons';
import {
  OPENROUTER_CHAT_MODELS,
  OPENROUTER_MAX_CHAT_MESSAGES,
  OPENROUTER_MAX_MESSAGE_CHARS,
  sendOpenRouterChat,
  type OpenRouterChatMessage,
  type OpenRouterChatModelId,
} from '../services/openRouterChatService';
import { writeClipboardText } from '../services/clipboardService';
import {
  createConversationId,
  deriveConversationTitle,
  loadChatHistory,
  markChatHistorySnapshotAdopted,
  saveChatHistory,
  subscribeToHistoryCleared,
  type ChatConversation,
  type ChatFolder,
} from '../services/chatHistoryService';
import { PROMPT_BAR_FOOTER_MARGIN_BOTTOM } from '../utils/promptBarFooterLayout';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';

type PromptChatPanelProps = {
  isOpen: boolean;
  isSuppressed?: boolean;
  currentPrompt: string;
  onToggle: () => void;
};

const PANEL_WIDTH = 'clamp(380px, 33vw, 620px)'; // Keep the overlay near one-third of desktop width.
const PANEL_LEFT_INSET = '0.625rem'; // Leaves a visible edge away from the app window.
const PANEL_TOP_OFFSET = 'calc(3.25rem + 14px)'; // Aligns below the lower edge of the top toolbar.
const PANEL_BOTTOM_OFFSET = `calc(${PROMPT_BAR_FOOTER_MARGIN_BOTTOM} + 5px)`; // Lifts the panel to the prompt bar bottom edge.
const CHAT_ACTION_BUTTON_SIZE_REM = 2.64; // Matches the normal prompt bar submit button.
const TOGGLE_VIEWPORT_RIGHT_GAP = '1rem'; // Keeps the toggle reachable on narrow screens.
const COPY_STATUS_TIMEOUT_MS = 1600;
const HEADER_TOP_OFFSET_PX = 12; // Mirrors the absolute header's top-3 offset.
const HEADER_BODY_GAP_PX = 12; // Keeps scroll content clear of the floating header shadow.
const DEFAULT_HEADER_CLEARANCE_PX = 56; // One 32px header row plus top/gap spacing before measurement.
const HEADER_ACTION_BUTTON_CLASS = 'pointer-events-auto flex h-8 items-center gap-2 rounded-md border border-white/10 bg-[#080A16] px-2.5 text-xs font-semibold text-gray-200 shadow-[5px_0_12px_rgba(0,0,0,0.12),0_6px_10px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors hover:bg-white/10'; // Shared pill style for the panel header buttons.

const formatRelativeTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) {
    return time; // Same-day conversations only need the clock time.
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${time}`;
  }
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

const capPromptChatMessages = (messages: OpenRouterChatMessage[]) => {
  const cappedMessages = messages.slice(-OPENROUTER_MAX_CHAT_MESSAGES); // Keep within backend transcript limit.
  const firstUserIndex = cappedMessages.findIndex(message => message.role === 'user'); // Drop orphaned assistant replies.
  return firstUserIndex === -1 ? [] : cappedMessages.slice(firstUserIndex); // OpenRouter context should start with user intent.
};

const MENU_ITEM_CLASS = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-gray-200 transition-colors hover:bg-white/10'; // Shared row-menu item style.

const resizeDraftTextarea = (textarea: HTMLTextAreaElement, panelHeight: number) => {
  const maxHeight = Math.max(96, Math.floor(panelHeight / 3)); // Composer grows until it uses one third of the panel.
  textarea.style.height = 'auto';
  textarea.style.maxHeight = `${maxHeight}px`;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
};

// Self-contained inline rename field: owns its draft, autoselects, and commits on Enter/blur (Escape cancels).
const InlineRenameInput: React.FC<{
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
  ariaLabel?: string;
}> = ({ initialValue, onCommit, onCancel, className, ariaLabel }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false); // Set on Enter/Escape so the unavoidable blur does not double-fire.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select(); // Select-all so typing replaces the current name.
  }, []);
  return (
    <input
      ref={inputRef}
      value={value}
      aria-label={ariaLabel}
      onFocus={event => event.currentTarget.select()}
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          skipCommitRef.current = true;
          onCommit(value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          skipCommitRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (skipCommitRef.current) {
          skipCommitRef.current = false;
          return;
        }
        onCommit(value);
      }}
      className={className}
    />
  );
};

// Shared kebab dropdown: owns the trigger, open state, outside-click/Escape dismissal, and viewport flip-up.
// The body is unmounted while closed, so callers' menu-local state resets automatically on each open.
const KebabMenu: React.FC<{
  ariaLabel: string;
  menuClassName?: string;
  children: (close: () => void) => React.ReactNode;
}> = ({ ariaLabel, menuClassName = 'min-w-[12rem]', children }) => {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUp(rect.bottom > window.innerHeight * 0.6); // Flip upward near the scroll container's bottom.
    }
    setOpen(prev => !prev);
  };

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-200"
      >
        <KebabIcon className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-30 rounded-md border border-white/10 bg-[#080A16] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} ${menuClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
};

// Per-row kebab actions (Rename / Pin / Move to folder / Delete). Move-to-folder is an inline second view, not a nested popup.
const ConversationMenuItems: React.FC<{
  conversation: ChatConversation;
  folders: ChatFolder[];
  onStartRename: () => void;
  onTogglePin: () => void;
  onMove: (folderId: string | null) => void;
  onCreateFolderAndMove: (name: string) => void;
  onDelete: () => void;
  close: () => void;
}> = ({ conversation, folders, onStartRename, onTogglePin, onMove, onCreateFolderAndMove, onDelete, close }) => {
  const [view, setView] = useState<'main' | 'move' | 'create'>('main');
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (view === 'create') {
      newFolderInputRef.current?.focus(); // Focus the inline field when the "New folder…" input appears.
    }
  }, [view]);

  const submitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      return;
    }
    onCreateFolderAndMove(trimmed);
    close();
  };

  if (view === 'main') {
    return (
      <>
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { onStartRename(); close(); }}>
          <RenameIcon className="h-3 w-3 text-gray-400" /> Rename
        </button>
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { onTogglePin(); close(); }}>
          <PinIcon className="h-3 w-3 text-gray-400" /> {conversation.pinned ? 'Unpin' : 'Pin to top'}
        </button>
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => setView('move')}>
          <FolderIcon className="h-3 w-3 text-gray-400" /> Move to folder
          <ChevronDownIcon className="ml-auto h-2.5 w-2.5 -rotate-90 text-gray-500" />
        </button>
        <button type="button" role="menuitem" className={`${MENU_ITEM_CLASS} text-red-200 hover:bg-red-400/10 hover:text-red-100`} onClick={() => { onDelete(); close(); }}>
          <DeleteIcon className="h-3 w-3" /> Delete
        </button>
      </>
    );
  }

  return (
    <>
      <button type="button" className={`${MENU_ITEM_CLASS} text-gray-400`} onClick={() => setView('main')}>
        <ChevronDownIcon className="h-2.5 w-2.5 rotate-90" /> Back
      </button>
      <div className="my-1 border-t border-white/10" />
      {folders.length === 0 && view !== 'create' && (
        <p className="px-3 py-1.5 text-xs text-gray-500">No folders yet.</p>
      )}
      {folders.map(folder => (
        <button key={folder.id} type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { onMove(folder.id); close(); }}>
          <FolderIcon className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="min-w-0 truncate">{folder.name}</span>
          {conversation.folderId === folder.id && <span className="ml-auto text-cyan-200">✓</span>}
        </button>
      ))}
      {conversation.folderId != null && (
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { onMove(null); close(); }}>
          <span className="h-3 w-3" /> Remove from folder
        </button>
      )}
      <div className="my-1 border-t border-white/10" />
      {view === 'create' ? (
        <div className="px-2 py-1">
          <input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={event => setNewFolderName(event.target.value)}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                submitNewFolder();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setView('move');
                setNewFolderName('');
              }
            }}
            placeholder="Folder name"
            className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-gray-100 outline-none focus:border-cyan-300/60"
          />
        </div>
      ) : (
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => setView('create')}>
          <NewFolderIcon className="h-3 w-3 text-gray-400" /> New folder…
        </button>
      )}
    </>
  );
};

const ChatRowMenu: React.FC<{
  conversation: ChatConversation;
  folders: ChatFolder[];
  onStartRename: () => void;
  onTogglePin: () => void;
  onMove: (folderId: string | null) => void;
  onCreateFolderAndMove: (name: string) => void;
  onDelete: () => void;
}> = props => (
  <KebabMenu ariaLabel="Conversation actions" menuClassName="max-h-[60vh] min-w-[12rem] overflow-y-auto">
    {close => <ConversationMenuItems {...props} close={close} />}
  </KebabMenu>
);

// Folder-header kebab (Rename folder / Delete folder).
const FolderHeaderMenu: React.FC<{ onStartRename: () => void; onDelete: () => void }> = ({ onStartRename, onDelete }) => (
  <KebabMenu ariaLabel="Folder actions" menuClassName="min-w-[10rem]">
    {close => (
      <>
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { onStartRename(); close(); }}>
          <RenameIcon className="h-3 w-3 text-gray-400" /> Rename folder
        </button>
        <button type="button" role="menuitem" className={`${MENU_ITEM_CLASS} text-red-200 hover:bg-red-400/10 hover:text-red-100`} onClick={() => { onDelete(); close(); }}>
          <DeleteIcon className="h-3 w-3" /> Delete folder
        </button>
      </>
    )}
  </KebabMenu>
);

export const PromptChatPanel: React.FC<PromptChatPanelProps> = ({
  isOpen,
  isSuppressed = false,
  currentPrompt,
  onToggle,
}) => {
  const [model, setModel] = useState<OpenRouterChatModelId>('google/gemini-3.5-flash');
  const [messages, setMessages] = useState<OpenRouterChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<{ type: 'chat' | 'folder'; id: string } | null>(null); // Inline rename target, if any.
  const [headerClearancePx, setHeaderClearancePx] = useState(DEFAULT_HEADER_CLEARANCE_PX);
  const panelRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const copyStatusTimeoutRef = useRef<number | null>(null);
  const conversationsRef = useRef<ChatConversation[]>([]);
  const foldersRef = useRef<ChatFolder[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const deletedConversationIdsRef = useRef<Set<string>>(new Set());
  const historyMutationGenerationRef = useRef(0);
  const historyClearGenerationRef = useRef(0);
  const sendRequestIdRef = useRef(0);

  const resetActiveConversationState = useCallback(() => {
    setMessages([]);
    setDraft('');
    setError(null);
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
  }, []);

  const abandonPendingChatRequest = useCallback(() => {
    sendRequestIdRef.current += 1; // Invalidate any pending reply before it can update state.
    setIsSending(false);
    setPendingConversationId(null);
  }, []);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant') ?? null,
    [messages],
  );
  const activeConversationIsSending = isSending && pendingConversationId === activeConversationId;
  const hasPendingChatRequest = isSending;
  const selectedModelLabel = OPENROUTER_CHAT_MODELS.find(option => option.id === model)?.label ?? model;
  const historyGroups = useMemo(() => {
    const byRecency = (a: ChatConversation, b: ChatConversation) => b.updatedAt - a.updatedAt;
    const byPinnedThenRecency = (a: ChatConversation, b: ChatConversation) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1; // Within a folder, pinned chats float to the top.
      }
      return b.updatedAt - a.updatedAt;
    };
    // One pass buckets each conversation by folder; unknown/dangling folderIds fall into the loose (null) bucket.
    const buckets = new Map<string | null, ChatConversation[]>();
    folders.forEach(folder => buckets.set(folder.id, []));
    conversations.forEach(conversation => {
      const key = conversation.folderId != null && buckets.has(conversation.folderId) ? conversation.folderId : null;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(conversation);
      } else {
        buckets.set(key, [conversation]);
      }
    });
    const loose = buckets.get(null) ?? [];
    const pinned = loose.filter(conversation => conversation.pinned).sort(byRecency); // Only loose pinned chats are lifted to the global section.
    const unfiled = loose.filter(conversation => !conversation.pinned).sort(byRecency);
    const folderGroups = [...folders]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(folder => ({ folder, items: (buckets.get(folder.id) ?? []).sort(byPinnedThenRecency) })); // Pinned chats stay in their folder, floated to the top.
    return { pinned, folderGroups, unfiled };
  }, [conversations, folders]);

  const persistSnapshot = useCallback((nextConversations: ChatConversation[], nextFolders: ChatFolder[]) => {
    const mutationGeneration = historyMutationGenerationRef.current + 1;
    historyMutationGenerationRef.current = mutationGeneration;
    conversationsRef.current = nextConversations;
    foldersRef.current = nextFolders;
    setConversations(nextConversations);
    setFolders(nextFolders);
    void saveChatHistory({ conversations: nextConversations, folders: nextFolders }).then(saved => {
      if (historyMutationGenerationRef.current !== mutationGeneration) {
        return; // A newer local edit owns the visible history now.
      }
      conversationsRef.current = saved.conversations;
      foldersRef.current = saved.folders;
      setConversations(saved.conversations);
      setFolders(saved.folders);
      markChatHistorySnapshotAdopted(saved);
    }); // Both lists save together as one snapshot.
  }, []);

  const commitConversations = useCallback((next: ChatConversation[]) => {
    persistSnapshot(next, foldersRef.current);
  }, [persistSnapshot]);

  const commitFolders = useCallback((next: ChatFolder[]) => {
    persistSnapshot(conversationsRef.current, next);
  }, [persistSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const loadGeneration = historyMutationGenerationRef.current;
    void loadChatHistory().then(loaded => {
      if (cancelled || loadGeneration !== historyMutationGenerationRef.current) {
        return;
      }
      conversationsRef.current = loaded.conversations;
      foldersRef.current = loaded.folders;
      setConversations(loaded.conversations);
      setFolders(loaded.folders);
      markChatHistorySnapshotAdopted(loaded);
    });
    return () => {
      cancelled = true; // Avoid setting state after unmount.
    };
  }, []);

  useEffect(() => subscribeToHistoryCleared(() => {
    historyMutationGenerationRef.current += 1;
    historyClearGenerationRef.current += 1;
    sendRequestIdRef.current += 1;
    deletedConversationIdsRef.current.clear();
    conversationsRef.current = [];
    foldersRef.current = [];
    setConversations([]);
    setFolders([]);
    setIsSending(false);
    setPendingConversationId(null);
    resetActiveConversationState(); // Native clear invalidates active and in-flight transcript state.
  }), [resetActiveConversationState]);

  const persistConversation = useCallback((conversationId: string, turnMessages: OpenRouterChatMessage[], turnModel: OpenRouterChatModelId) => {
    if (turnMessages.length === 0) {
      return; // Nothing meaningful to save yet.
    }
    if (deletedConversationIdsRef.current.has(conversationId)) {
      return; // Do not resurrect a conversation the user deleted while a request was running.
    }
    const now = Date.now();
    const previous = conversationsRef.current;
    const existingIndex = previous.findIndex(conversation => conversation.id === conversationId);
    let next: ChatConversation[];
    if (existingIndex >= 0) {
      const prev = previous[existingIndex];
      const updated: ChatConversation = {
        ...prev,
        title: prev.titleCustomized ? prev.title : deriveConversationTitle(turnMessages), // Preserve a user-renamed title across saves.
        model: turnModel,
        messages: turnMessages,
        updatedAt: now,
      };
      next = [updated, ...previous.filter((_, index) => index !== existingIndex)];
    } else {
      next = [{ id: conversationId, title: deriveConversationTitle(turnMessages), model: turnModel, messages: turnMessages, createdAt: now, updatedAt: now }, ...previous];
    }
    commitConversations(next);
  }, [commitConversations]);

  const handleNewChat = useCallback(() => {
    abandonPendingChatRequest();
    resetActiveConversationState();
    setIsHistoryOpen(false);
  }, [abandonPendingChatRequest, resetActiveConversationState]);

  const handleSelectConversation = useCallback((conversation: ChatConversation) => {
    if (conversation.id === activeConversationIdRef.current) {
      setIsHistoryOpen(false); // Keep the live transcript; saved history may lag behind an in-flight turn.
      return;
    }
    deletedConversationIdsRef.current.delete(conversation.id);
    setMessages(conversation.messages);
    setModel(conversation.model);
    setDraft('');
    setError(null);
    activeConversationIdRef.current = conversation.id;
    setActiveConversationId(conversation.id);
    setIsHistoryOpen(false); // Reopen the live chat to continue the selected conversation.
  }, []);

  const handleDeleteConversation = useCallback((conversationId: string) => {
    deletedConversationIdsRef.current.add(conversationId);
    const next = conversationsRef.current.filter(conversation => conversation.id !== conversationId);
    commitConversations(next);
    if (activeConversationIdRef.current === conversationId) {
      abandonPendingChatRequest();
      resetActiveConversationState(); // The conversation being viewed is gone; start fresh.
    }
  }, [abandonPendingChatRequest, commitConversations, resetActiveConversationState]);

  const handleRenameConversation = useCallback((id: string, nextTitle: string) => {
    const trimmed = nextTitle.trim();
    if (!trimmed) {
      return; // Empty rename is treated as cancel; keep the prior title.
    }
    const next = conversationsRef.current.map(conversation =>
      conversation.id === id ? { ...conversation, title: trimmed, titleCustomized: true } : conversation,
    );
    commitConversations(next); // No updatedAt bump: renaming must not reorder the row.
  }, [commitConversations]);

  const handleTogglePin = useCallback((id: string) => {
    const next = conversationsRef.current.map(conversation =>
      conversation.id === id ? { ...conversation, pinned: !conversation.pinned } : conversation,
    );
    commitConversations(next);
  }, [commitConversations]);

  const handleMoveToFolder = useCallback((id: string, folderId: string | null) => {
    const next = conversationsRef.current.map(conversation =>
      conversation.id === id ? { ...conversation, folderId } : conversation,
    );
    commitConversations(next);
  }, [commitConversations]);

  const handleCreateFolder = useCallback((name: string, moveConversationId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const folder: ChatFolder = { id: createConversationId(), name: trimmed, createdAt: Date.now() };
    const nextFolders = [...foldersRef.current, folder];
    const nextConversations = moveConversationId
      ? conversationsRef.current.map(conversation =>
          conversation.id === moveConversationId ? { ...conversation, folderId: folder.id } : conversation,
        )
      : conversationsRef.current;
    persistSnapshot(nextConversations, nextFolders);
  }, [persistSnapshot]);

  const handleNewFolderFromHeader = useCallback(() => {
    const folder: ChatFolder = { id: createConversationId(), name: 'New folder', createdAt: Date.now() };
    persistSnapshot(conversationsRef.current, [...foldersRef.current, folder]);
    setEditing({ type: 'folder', id: folder.id }); // Drop straight into rename so the user can name it.
  }, [persistSnapshot]);

  const handleRenameFolder = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const next = foldersRef.current.map(folder =>
      folder.id === id ? { ...folder, name: trimmed, updatedAt: Date.now() } : folder,
    );
    commitFolders(next);
  }, [commitFolders]);

  const handleDeleteFolder = useCallback((id: string) => {
    const nextFolders = foldersRef.current.filter(folder => folder.id !== id);
    const nextConversations = conversationsRef.current.map(conversation =>
      conversation.folderId === id ? { ...conversation, folderId: null } : conversation, // Reparent chats to unfiled; never delete them.
    );
    persistSnapshot(nextConversations, nextFolders);
  }, [persistSnapshot]);

  const toggleFolderCollapsed = useCallback((id: string) => {
    setCollapsedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderConversationRow = (conversation: ChatConversation) => {
    const isEditingChat = editing?.type === 'chat' && editing.id === conversation.id;
    return (
      <li key={conversation.id}>
        <div className={`group flex items-center gap-2 rounded-md border px-3 py-2 transition-colors ${conversation.id === activeConversationId ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-white/10 bg-[#080A16] hover:bg-white/10'}`}>
          {isEditingChat ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <InlineRenameInput
                initialValue={conversation.title}
                ariaLabel="Conversation title"
                onCommit={value => { handleRenameConversation(conversation.id, value); setEditing(null); }}
                onCancel={() => setEditing(null)}
                className="w-full rounded border border-cyan-300/40 bg-black/40 px-1.5 py-0.5 text-sm font-semibold text-gray-100 outline-none focus:border-cyan-300/70"
              />
              <span className="text-xs text-gray-400">{formatRelativeTime(conversation.updatedAt)}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleSelectConversation(conversation)}
              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                {conversation.pinned && <PinIcon className="h-3 w-3 shrink-0 text-cyan-200/80" aria-hidden="true" />}
                <span className="truncate text-sm font-semibold text-gray-100">{conversation.title}</span>
              </span>
              <span className="text-xs text-gray-400">{formatRelativeTime(conversation.updatedAt)}</span>
            </button>
          )}
          <ChatRowMenu
            conversation={conversation}
            folders={folders}
            onStartRename={() => setEditing({ type: 'chat', id: conversation.id })}
            onTogglePin={() => handleTogglePin(conversation.id)}
            onMove={folderId => handleMoveToFolder(conversation.id, folderId)}
            onCreateFolderAndMove={name => handleCreateFolder(name, conversation.id)}
            onDelete={() => handleDeleteConversation(conversation.id)}
          />
        </div>
      </li>
    );
  };

  useLayoutEffect(() => {
    if (!isOpen || !headerRef.current) {
      setHeaderClearancePx(DEFAULT_HEADER_CLEARANCE_PX);
      return; // Header is unmounted while the panel is closed.
    }
    const measureHeader = () => {
      const measuredHeight = Math.ceil(headerRef.current?.getBoundingClientRect().height ?? 0);
      const nextClearance = Math.max(DEFAULT_HEADER_CLEARANCE_PX, HEADER_TOP_OFFSET_PX + measuredHeight + HEADER_BODY_GAP_PX);
      setHeaderClearancePx(prev => (prev === nextClearance ? prev : nextClearance)); // Avoid rerenders when ResizeObserver reports the same size.
    };
    measureHeader();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measureHeader) : null;
    observer?.observe(headerRef.current);
    window.addEventListener('resize', measureHeader);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureHeader);
    };
  }, [isHistoryOpen, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || isHistoryOpen || !transcriptRef.current) {
      return; // Transcript is absent while History is mounted.
    }
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; // Keep the latest turn visible after remounts.
  }, [isOpen, isHistoryOpen, messages, isSending]);

  useEffect(() => () => {
    if (copyStatusTimeoutRef.current !== null) {
      window.clearTimeout(copyStatusTimeoutRef.current);
    }
  }, []);

  const resizeDraftComposer = useCallback(() => {
    const textarea = draftTextareaRef.current;
    if (!textarea) {
      return;
    }
    const panelHeight = panelRef.current?.clientHeight ?? window.innerHeight;
    resizeDraftTextarea(textarea, panelHeight);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || isHistoryOpen) {
      return;
    }
    resizeDraftComposer(); // Re-apply sizing after draft edits and after History remounts the composer.
  }, [draft, isOpen, isHistoryOpen, resizeDraftComposer]);

  useEffect(() => {
    if (!isOpen || isHistoryOpen) {
      return undefined;
    }
    const handleResize = () => resizeDraftComposer();
    window.addEventListener('resize', handleResize);
    const observer = typeof ResizeObserver === 'function' && panelRef.current ? new ResizeObserver(handleResize) : null;
    observer?.observe(panelRef.current);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [isOpen, isHistoryOpen, resizeDraftComposer]);

  const showCopyStatus = (status: string) => {
    setCopyStatus(status);
    if (copyStatusTimeoutRef.current !== null) {
      window.clearTimeout(copyStatusTimeoutRef.current);
    }
    copyStatusTimeoutRef.current = window.setTimeout(() => setCopyStatus(null), COPY_STATUS_TIMEOUT_MS);
  };

  const copyText = async (text: string, emptyMessage: string, successMessage: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      showCopyStatus(emptyMessage);
      return;
    }
    try {
      await writeClipboardText(trimmedText);
      showCopyStatus(successMessage);
    } catch {
      showCopyStatus('Copy failed');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || hasPendingChatRequest) {
      return;
    }
    if (content.length > OPENROUTER_MAX_MESSAGE_CHARS) {
      setError(`Prompt chat messages must be ${OPENROUTER_MAX_MESSAGE_CHARS.toLocaleString()} characters or fewer.`);
      return;
    }
    const conversationId = activeConversationIdRef.current ?? createConversationId();
    const requestGeneration = historyClearGenerationRef.current;
    const requestId = sendRequestIdRef.current + 1;
    sendRequestIdRef.current = requestId;
    deletedConversationIdsRef.current.delete(conversationId);
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    const userMessage: OpenRouterChatMessage = { role: 'user', content };
    const nextMessages = capPromptChatMessages([...messages, userMessage]); // Keep whole turns after capping.
    setMessages(nextMessages);
    setDraft('');
    setError(null);
    setIsSending(true);
    setPendingConversationId(conversationId);
    persistConversation(conversationId, nextMessages, model); // Save the visible user turn before the network reply returns.
    const canCommitRequest = () => (
      sendRequestIdRef.current === requestId &&
      historyClearGenerationRef.current === requestGeneration &&
      !deletedConversationIdsRef.current.has(conversationId)
    );
    try {
      const response = await sendOpenRouterChat({ model, messages: nextMessages });
      const finalMessages = capPromptChatMessages([...nextMessages, response.message]); // Keep whole turns after capping.
      if (canCommitRequest()) {
        persistConversation(conversationId, finalMessages, model); // Save to the chat that started this request.
        if (activeConversationIdRef.current === conversationId) {
          setMessages(finalMessages);
        }
      }
    } catch (chatError) {
      if (canCommitRequest()) {
        persistConversation(conversationId, nextMessages, model); // Keep the user's message even when the reply fails.
        if (activeConversationIdRef.current === conversationId) {
          setError(chatError instanceof Error ? chatError.message : String(chatError));
        }
      }
    } finally {
      if (sendRequestIdRef.current === requestId) {
        setIsSending(false);
        setPendingConversationId(null);
      }
    }
  };

  const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return; // IME Enter confirms text before it should submit.
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const panelTransform = isOpen ? 'translateX(0)' : 'translateX(calc(-1 * (var(--prompt-chat-panel-width) + var(--prompt-chat-panel-left-inset))))';
  const toggleLeft = isOpen
    ? `min(calc(var(--prompt-chat-panel-left-inset) + var(--prompt-chat-panel-width) + 0.75rem), calc(100vw - ${CHAT_ACTION_BUTTON_SIZE_REM}rem - ${TOGGLE_VIEWPORT_RIGHT_GAP}))`
    : '1rem';
  const headerAwareBodyStyle: React.CSSProperties = { paddingTop: `${headerClearancePx}px` };
  const modelPicker = (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-sm font-bold text-white">Model:</span>
      <div className="relative inline-flex min-w-0 items-center gap-1.5 py-1">
        <span className="truncate text-sm font-semibold text-white">{selectedModelLabel}</span>
        <ChevronDownIcon className="h-3 w-3 shrink-0 text-white/80" aria-hidden="true" />
        <select
          id="prompt-chat-model"
          value={model}
          onChange={event => setModel(event.target.value as OpenRouterChatModelId)}
          disabled={activeConversationIsSending}
          aria-label="Prompt chat model"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-transparent opacity-0 outline-none disabled:cursor-not-allowed"
          style={{ colorScheme: 'dark' }}
        >
          {OPENROUTER_CHAT_MODELS.map(option => (
            <option key={option.id} value={option.id} className="bg-gray-950 text-white">{option.label}</option>
          ))}
        </select>
      </div>
    </div>
  );

  if (isSuppressed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isOpen}
        aria-label={isOpen ? 'Close prompt chat' : 'Open prompt chat'}
        title={isOpen ? 'Close prompt chat' : 'Open prompt chat'}
        className={`fixed top-1/2 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex -translate-y-1/2 items-center justify-center rounded-full border border-cyan-300/25 bg-gray-950/92 text-cyan-100 shadow-2xl shadow-black/40 backdrop-blur-md transition-[background-color,border-color,left] duration-200 hover:border-cyan-200/60 hover:bg-cyan-300/12`}
        style={{
          left: toggleLeft,
          height: `${CHAT_ACTION_BUTTON_SIZE_REM}rem`,
          width: `${CHAT_ACTION_BUTTON_SIZE_REM}rem`,
          ['--prompt-chat-panel-width' as string]: PANEL_WIDTH,
          ['--prompt-chat-panel-left-inset' as string]: PANEL_LEFT_INSET,
        }}
      >
        <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
          <RobotIcon className="h-5 w-5" />
        </span>
      </button>
      <aside
        ref={panelRef}
        aria-label="Prompt chat"
        aria-hidden={!isOpen}
        className={`fixed ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex max-w-[calc(100vw-4.75rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#050917]/96 text-gray-100 shadow-[10px_0_24px_rgba(0,0,0,0.18),0_10px_18px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-transform duration-200`}
        style={{
          left: PANEL_LEFT_INSET,
          top: PANEL_TOP_OFFSET,
          bottom: PANEL_BOTTOM_OFFSET,
          width: PANEL_WIDTH,
          transform: panelTransform,
          ['--prompt-chat-panel-width' as string]: PANEL_WIDTH,
          ['--prompt-chat-panel-left-inset' as string]: PANEL_LEFT_INSET,
        }}
      >
        {isOpen && (
          <>
            <div ref={headerRef} className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(prev => !prev)}
                aria-pressed={isHistoryOpen}
                title={isHistoryOpen ? 'Back to chat' : 'Chat history'}
                className={`pointer-events-auto flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold shadow-[5px_0_12px_rgba(0,0,0,0.12),0_6px_10px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors ${isHistoryOpen ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25' : 'border-white/10 bg-[#080A16] text-gray-200 hover:bg-white/10'}`}
              >
                <HistoryIcon className="h-3.5 w-3.5" />
                {isHistoryOpen ? 'Back to chat' : 'History'}
              </button>
              {!isHistoryOpen && (
                <>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    title="Start a new chat"
                    className={HEADER_ACTION_BUTTON_CLASS}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    New chat
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(currentPrompt, 'No prompt', 'Prompt copied')}
                    className={HEADER_ACTION_BUTTON_CLASS}
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    Copy prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(latestAssistantMessage?.content ?? '', 'No reply', 'Reply copied')}
                    disabled={!latestAssistantMessage}
                    className={`${HEADER_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    Copy latest reply
                  </button>
                </>
              )}
            </div>

            {isHistoryOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#01030a]/96 px-3 pb-4" style={headerAwareBodyStyle}>
                {conversations.length === 0 && folders.length === 0 ? (
                  <p className="text-sm leading-6 text-gray-400">No saved conversations yet. Your prompt chats are saved here automatically.</p>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chat history</span>
                      <button
                        type="button"
                        onClick={handleNewFolderFromHeader}
                        title="Create a folder"
                        className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-2 text-xs font-semibold text-gray-400 transition-colors hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
                      >
                        <NewFolderIcon className="h-3 w-3" />
                        New folder
                      </button>
                    </div>

                    {historyGroups.pinned.length > 0 && (
                      <section className="mb-4">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <PinIcon className="h-3 w-3" />
                          Pinned
                        </div>
                        <ul className="space-y-2">
                          {historyGroups.pinned.map(renderConversationRow)}
                        </ul>
                      </section>
                    )}

                    {historyGroups.folderGroups.map(({ folder, items }) => {
                      const collapsed = collapsedFolderIds.has(folder.id);
                      const isEditingFolder = editing?.type === 'folder' && editing.id === folder.id;
                      return (
                        <section key={folder.id} className="mb-3">
                          <div className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-white/5">
                            {isEditingFolder ? (
                              <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                <ChevronDownIcon className={`h-2.5 w-2.5 shrink-0 text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                <InlineRenameInput
                                  initialValue={folder.name}
                                  ariaLabel="Folder name"
                                  onCommit={value => { handleRenameFolder(folder.id, value); setEditing(null); }}
                                  onCancel={() => setEditing(null)}
                                  className="min-w-0 flex-1 rounded border border-cyan-300/40 bg-black/40 px-1.5 py-0.5 text-sm font-semibold text-gray-100 outline-none focus:border-cyan-300/70"
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleFolderCollapsed(folder.id)}
                                aria-expanded={!collapsed}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                <ChevronDownIcon className={`h-2.5 w-2.5 shrink-0 text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                <span className="truncate text-sm font-semibold text-gray-200">{folder.name}</span>
                                <span className="shrink-0 text-xs text-gray-500">{items.length}</span>
                              </button>
                            )}
                            <FolderHeaderMenu
                              onStartRename={() => setEditing({ type: 'folder', id: folder.id })}
                              onDelete={() => handleDeleteFolder(folder.id)}
                            />
                          </div>
                          {!collapsed && (
                            items.length > 0 ? (
                              <ul className="mt-2 space-y-2 pl-3">
                                {items.map(renderConversationRow)}
                              </ul>
                            ) : (
                              <p className="mt-1 pl-3 text-xs text-gray-500">No chats in this folder.</p>
                            )
                          )}
                        </section>
                      );
                    })}

                    {historyGroups.unfiled.length > 0 && (
                      <section>
                        {folders.length > 0 && (
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Other chats</div>
                        )}
                        <ul className="space-y-2">
                          {historyGroups.unfiled.map(renderConversationRow)}
                        </ul>
                      </section>
                    )}
                  </>
                )}
              </div>
            )}

            {!isHistoryOpen && (
            <>
            <div
              ref={transcriptRef}
              className={`min-h-0 flex-1 overflow-y-auto bg-[#01030a]/96 ${messages.length === 0 ? 'flex items-center justify-center px-8 pb-14 text-center' : 'px-3 pb-4'}`}
              style={headerAwareBodyStyle}
            >
              {messages.length === 0 ? (
                <p className="max-w-[18rem] break-words text-wrap text-sm leading-6 text-gray-400">Ask for a sharper prompt, alternate versions, or a cleaner structure.</p>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'block'}>
                      {message.role === 'user' ? (
                        <div className="max-w-[86%] rounded-md bg-cyan-500/18 px-3 py-2 text-sm leading-6 text-cyan-50">
                          {message.content}
                        </div>
                      ) : (
                        <div className="prompt-chat-markdown text-sm leading-6 text-gray-100">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            disallowedElements={['img']}
                            components={{
                              a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline decoration-cyan-200/40 underline-offset-2">{children}</a>,
                              code: ({ children, className, ...props }) => (
                                <code {...props} className={`${className ?? ''} rounded bg-black/35 px-1 py-0.5 text-[0.85em] text-cyan-100`}>
                                  {children}
                                </code>
                              ),
                              pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-md border border-white/10 bg-black/35 p-3 text-xs">{children}</pre>,
                              ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
                              ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                  {activeConversationIsSending && <p className="text-sm text-gray-400">Thinking...</p>}
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-white/10 p-3">
              {error && <p className="mb-2 rounded-md border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs text-red-100">{error}</p>}
              {copyStatus && <p className="mb-2 text-xs font-semibold text-cyan-100">{copyStatus}</p>}
              <div className="mb-2 px-3">{modelPicker}</div>
              <form onSubmit={handleSubmit} className="relative">
                <textarea
                  ref={draftTextareaRef}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  disabled={activeConversationIsSending}
                  aria-label="Prompt chat message"
                  placeholder="Ask for prompt help..."
                  rows={3}
                  className="min-h-20 w-full resize-none rounded-md border border-white/10 bg-black/35 py-2 pl-3 pr-16 text-sm leading-5 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={hasPendingChatRequest || draft.trim().length === 0}
                  className="absolute bottom-[0.875rem] right-3 flex items-center justify-center rounded-full bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-500"
                  style={{ height: `${CHAT_ACTION_BUTTON_SIZE_REM}rem`, width: `${CHAT_ACTION_BUTTON_SIZE_REM}rem` }}
                >
                  {activeConversationIsSending ? (
                    <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
                      <svg className="h-[1.1rem] w-[1.1rem] animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </span>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
                      <LayerUpIcon className="h-[1.1rem] w-[1.1rem] text-white" aria-hidden="true" />
                    </span>
                  )}
                </button>
              </form>
            </footer>
            </>
            )}
          </>
        )}
      </aside>
    </>
  );
};
