import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptChatPanel } from '../PromptChatPanel';

const sendOpenRouterChat = vi.hoisted(() => vi.fn());

vi.mock('../../services/openRouterChatService', () => ({
  OPENROUTER_CHAT_MODELS: [
    { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'openai/gpt-5.5', label: 'GPT 5.5' },
  ],
  OPENROUTER_MAX_CHAT_MESSAGES: 40,
  OPENROUTER_MAX_MESSAGE_CHARS: 12000,
  sendOpenRouterChat,
}));

const STORAGE_KEY = 'prompt-chat-history-v1';

type SeedConversation = Record<string, unknown> & { id: string; title: string };

const seedConversation = (id: string, title: string, extra: Record<string, unknown> = {}): SeedConversation => ({
  id,
  title,
  model: 'google/gemini-3.5-flash',
  messages: [{ role: 'user', content: `seed-${id}` }],
  createdAt: 1000,
  updatedAt: 1000,
  ...extra,
});

const seedHistory = (conversations: SeedConversation[], folders: Array<Record<string, unknown>> = []) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, conversations, folders }));
};

const getStored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
const storedConversation = (id: string) => getStored().conversations?.find((conversation: { id: string }) => conversation.id === id);

const renderPanel = () =>
  render(<PromptChatPanel isOpen isSuppressed={false} currentPrompt="A cinematic product shot" onToggle={() => {}} />);

const openHistory = () => fireEvent.click(screen.getByRole('button', { name: 'History' }));

const rowFor = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
const openConversationMenu = (title: string) =>
  fireEvent.click(within(rowFor(title)).getByRole('button', { name: 'Conversation actions' }));

describe('PromptChatPanel history management', () => {
  beforeEach(() => {
    sendOpenRouterChat.mockReset();
    window.localStorage.clear();
    delete (window as unknown as { canvaBananaDesktop?: unknown }).canvaBananaDesktop; // Force the localStorage path (no desktop bridge).
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renames a conversation inline and persists the custom title', async () => {
    seedHistory([seedConversation('c1', 'Original chat')]);
    renderPanel();
    openHistory();
    await screen.findByText('Original chat');

    openConversationMenu('Original chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByLabelText('Conversation title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed chat' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Renamed chat')).toBeTruthy();
    expect(screen.queryByText('Original chat')).toBeNull();
    await waitFor(() => {
      const stored = storedConversation('c1');
      expect(stored.title).toBe('Renamed chat');
      expect(stored.titleCustomized).toBe(true);
    });
  });

  it('cancels an inline rename on Escape without persisting', async () => {
    seedHistory([seedConversation('c1', 'Keep me')]);
    renderPanel();
    openHistory();
    await screen.findByText('Keep me');

    openConversationMenu('Keep me');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByLabelText('Conversation title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(await screen.findByText('Keep me')).toBeTruthy();
    expect(screen.queryByText('Discarded')).toBeNull();
    expect(storedConversation('c1').title).toBe('Keep me');
  });

  it('preserves a renamed title when a later message is sent', async () => {
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: 'assistant reply' },
      model: 'google/gemini-3.5-flash',
      usage: null,
    });
    seedHistory([
      seedConversation('c1', 'My Custom Title', {
        titleCustomized: true,
        messages: [{ role: 'user', content: 'derive-me' }],
      }),
    ]);
    renderPanel();
    openHistory();
    await screen.findByText('My Custom Title');

    fireEvent.click(screen.getByText('My Custom Title')); // Select it -> opens the live chat view.
    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'follow up question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalled());

    openHistory();
    expect(await screen.findByText('My Custom Title')).toBeTruthy();
    expect(screen.queryByText('derive-me')).toBeNull(); // Title was NOT re-derived from the first message.
    await waitFor(() => {
      const stored = storedConversation('c1');
      expect(stored.title).toBe('My Custom Title');
      expect(stored.titleCustomized).toBe(true);
    });
  });

  it('persists the submitted user turn before the reply settles', async () => {
    sendOpenRouterChat.mockImplementationOnce(() => new Promise(() => {})); // Keep the reply pending to verify pre-response persistence.
    renderPanel();

    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'save me before reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      const conversations = getStored().conversations as Array<{ messages: Array<{ content: string }> }>;
      expect(conversations[0].messages.map(message => message.content)).toEqual(['save me before reply']);
    });
    expect(sendOpenRouterChat).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Thinking...')).toBeTruthy();
  });

  it('saves an in-flight reply to the original conversation after the user switches chats', async () => {
    let resolveReply: (value: { message: { role: 'assistant'; content: string }; model: string; usage: null }) => void = () => {};
    sendOpenRouterChat.mockImplementationOnce(() => new Promise(resolve => {
      resolveReply = resolve; // Keep the first response pending while the user switches chats.
    }));
    seedHistory([
      seedConversation('c1', 'First chat', { messages: [{ role: 'user', content: 'first seed' }] }),
      seedConversation('c2', 'Second chat', { messages: [{ role: 'user', content: 'second seed' }] }),
    ]);
    renderPanel();
    openHistory();
    await screen.findByText('First chat');

    fireEvent.click(screen.getByText('First chat'));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'follow up for first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(1));

    openHistory();
    fireEvent.click(screen.getByText('Second chat'));
    expect(screen.getByText('second seed')).toBeTruthy();
    expect(screen.queryByText('Thinking...')).toBeNull();
    expect((screen.getByLabelText('Prompt chat message') as HTMLTextAreaElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveReply({ message: { role: 'assistant', content: 'reply for first only' }, model: 'google/gemini-3.5-flash', usage: null });
    });

    expect(screen.getByText('second seed')).toBeTruthy();
    expect(screen.queryByText('reply for first only')).toBeNull();
    await waitFor(() => {
      expect(storedConversation('c1').messages.map((message: { content: string }) => message.content)).toContain('reply for first only');
      expect(storedConversation('c2').messages.map((message: { content: string }) => message.content)).not.toContain('reply for first only');
    });
  });

  it('lets a new chat send immediately after deleting the active pending conversation', async () => {
    let resolveDeletedReply: (value: { message: { role: 'assistant'; content: string }; model: string; usage: null }) => void = () => {};
    sendOpenRouterChat
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveDeletedReply = resolve; // Keep the deleted conversation pending while the user starts over.
      }))
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'fresh reply' },
        model: 'google/gemini-3.5-flash',
        usage: null,
      });
    seedHistory([
      seedConversation('c1', 'Delete me', { messages: [{ role: 'user', content: 'old prompt' }], titleCustomized: true }),
    ]);
    renderPanel();
    openHistory();
    await screen.findByText('Delete me');

    fireEvent.click(screen.getByText('Delete me'));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'pending delete follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(1));

    openHistory();
    openConversationMenu('Delete me');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));

    expect(screen.getByText('Ask for a sharper prompt, alternate versions, or a cleaner structure.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'fresh prompt' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('fresh reply')).toBeTruthy();

    await act(async () => {
      resolveDeletedReply({ message: { role: 'assistant', content: 'late deleted reply' }, model: 'google/gemini-3.5-flash', usage: null });
    });

    expect(screen.queryByText('late deleted reply')).toBeNull();
    expect(storedConversation('c1')).toBeUndefined();
  });

  it('keeps the live active transcript when selecting it from history during a pending reply', async () => {
    let rejectReply: (error: Error) => void = () => {};
    sendOpenRouterChat.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectReply = reject; // Hold the request so History still has the stale saved snapshot.
    }));
    seedHistory([
      seedConversation('c1', 'Active chat', { messages: [{ role: 'user', content: 'original prompt' }], titleCustomized: true }),
    ]);
    renderPanel();
    openHistory();
    await screen.findByText('Active chat');

    fireEvent.click(screen.getByText('Active chat'));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'pending follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(1));

    openHistory();
    fireEvent.click(screen.getByText('Active chat'));

    expect(screen.getByText('pending follow up')).toBeTruthy();
    await act(async () => {
      rejectReply(new Error('network failed'));
    });
    expect(screen.getByText('pending follow up')).toBeTruthy();
    expect(await screen.findByText('network failed')).toBeTruthy();
  });

  it('adopts merged desktop history after saving before hydration finishes', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    let desktopLoadResolved = false;
    const saveBeforeDesktopLoad = vi.fn();
    const save = vi.fn(async (_snapshot: unknown) => {
      if (!desktopLoadResolved) {
        saveBeforeDesktopLoad(); // Any pre-hydration save would overwrite disk history instead of merging.
      }
      return { saved: true, revision: 1 };
    });
    window.canvaBananaDesktop = {
      chatHistory: {
        load: vi.fn(() => new Promise(resolve => {
          resolveLoad = resolve; // Hold desktop hydration until after the local chat save starts.
        })),
        save,
      },
    };
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: 'local reply' },
      model: 'google/gemini-3.5-flash',
      usage: null,
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'local prompt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve(); // Let queued save work run up to the still-pending desktop load.
    });
    expect(saveBeforeDesktopLoad).not.toHaveBeenCalled();

    await act(async () => {
      desktopLoadResolved = true;
      resolveLoad({
        conversations: [seedConversation('disk', 'Disk history')],
        folders: [],
        revision: 0,
      });
    });

    await waitFor(() => expect(save).toHaveBeenCalled());
    openHistory();

    expect(await screen.findByText('Disk history')).toBeTruthy();
    expect(screen.getByText('local prompt')).toBeTruthy();
    expect((save.mock.calls[0][0] as { conversations: SeedConversation[] }).conversations.map(item => item.id)).toContain('disk');
  });

  it('scrolls back to the latest message after returning from history', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2400); // Simulate a long transcript in jsdom.
    seedHistory([
      seedConversation('c1', 'Long chat', {
        messages: Array.from({ length: 18 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `message-${index}`,
        })),
      }),
    ]);
    renderPanel();
    openHistory();
    await screen.findByText('Long chat');

    fireEvent.click(screen.getByText('Long chat'));
    const footer = screen.getByLabelText('Prompt chat message').closest('footer') as HTMLElement;
    const transcript = footer.previousElementSibling as HTMLElement; // Transcript sits directly above the composer.
    await waitFor(() => expect(transcript.scrollTop).toBe(2400));

    transcript.scrollTop = 0; // Reproduce the user being left at the top before switching views.
    openHistory();
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));

    const remountedFooter = screen.getByLabelText('Prompt chat message').closest('footer') as HTMLElement;
    const remountedTranscript = remountedFooter.previousElementSibling as HTMLElement; // Returning from History creates a fresh node.
    expect(remountedTranscript).not.toBe(transcript);
    await waitFor(() => expect(remountedTranscript.scrollTop).toBe(2400));
  });

  it('keeps the draft composer autosized after returning from history', async () => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(220); // Simulate a multi-line draft in jsdom.
    renderPanel();

    const textarea = screen.getByLabelText('Prompt chat message') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'line one\nline two\nline three\nline four\nline five' } });
    await waitFor(() => expect(textarea.style.height).toBe('96px'));

    openHistory();
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));

    const remountedTextarea = screen.getByLabelText('Prompt chat message') as HTMLTextAreaElement;
    expect(remountedTextarea).not.toBe(textarea);
    await waitFor(() => expect(remountedTextarea.style.height).toBe('96px'));
    expect(remountedTextarea.style.overflowY).toBe('auto');
  });

  it('native clear resets the active transcript and ignores a pending response', async () => {
    let clearCallback: ((payload?: { revision?: number }) => void) | null = null;
    let resolveReply: (value: { message: { role: 'assistant'; content: string }; model: string; usage: null }) => void = () => {};
    let desktopStore = {
      conversations: [seedConversation('c1', 'Old chat', { messages: [{ role: 'user', content: 'old prompt' }], titleCustomized: true })],
      folders: [] as Array<Record<string, unknown>>,
    };
    const save = vi.fn(async (snapshot: unknown) => {
      const next = snapshot as typeof desktopStore;
      desktopStore = { conversations: next.conversations, folders: next.folders };
      return { saved: true, revision: 2 };
    });
    window.canvaBananaDesktop = {
      chatHistory: {
        load: vi.fn(async () => ({ ...desktopStore, revision: 0 })),
        save,
        onCleared: vi.fn(callback => {
          clearCallback = callback; // Store the native clear callback for the test.
          return vi.fn();
        }),
      },
    };
    sendOpenRouterChat
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveReply = resolve; // This response should be ignored after native clear.
      }))
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'new reply' },
        model: 'google/gemini-3.5-flash',
        usage: null,
      });

    renderPanel();
    openHistory();
    await screen.findByText('Old chat');
    fireEvent.click(screen.getByText('Old chat'));
    expect(screen.getByText('old prompt')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'pending old follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(1));

    desktopStore = { conversations: [], folders: [] };
    act(() => clearCallback?.({ revision: 1 }));

    expect(screen.queryByText('old prompt')).toBeNull();
    expect(screen.getByText('Ask for a sharper prompt, alternate versions, or a cleaner structure.')).toBeTruthy();

    await act(async () => {
      resolveReply({ message: { role: 'assistant', content: 'late old reply' }, model: 'google/gemini-3.5-flash', usage: null });
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('late old reply')).toBeNull();

    fireEvent.change(screen.getByLabelText('Prompt chat message'), { target: { value: 'new prompt after clear' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    const savedConversation = desktopStore.conversations[0] as SeedConversation & { messages: Array<{ content: string }> };
    expect(savedConversation.messages.map(message => message.content)).toEqual([
      'new prompt after clear',
      'new reply',
    ]);
  });

  it('ignores stale desktop history load results after native clear', async () => {
    let clearCallback: ((payload?: { revision?: number }) => void) | null = null;
    let resolveLoad: (value: unknown) => void = () => {};
    const onCleared = vi.fn(callback => {
      clearCallback = callback; // Store the native clear callback for the race.
      return vi.fn();
    });
    window.canvaBananaDesktop = {
      chatHistory: {
        load: vi.fn(() => new Promise(resolve => {
          resolveLoad = resolve; // Keep initial load pending until after clear.
        })),
        save: vi.fn(),
        onCleared,
      },
    };

    renderPanel();
    openHistory();
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));

    act(() => clearCallback?.({ revision: 1 }));

    await act(async () => {
      resolveLoad({
        conversations: [seedConversation('stale', 'Stale chat')],
        folders: [],
        revision: 0,
      });
    });

    expect(screen.queryByText('Stale chat')).toBeNull();
    expect(screen.getByText('No saved conversations yet. Your prompt chats are saved here automatically.')).toBeTruthy();
  });

  it('pins a conversation to a global Pinned section and persists it', async () => {
    seedHistory([
      seedConversation('c1', 'Chat One', { updatedAt: 1000 }),
      seedConversation('c2', 'Chat Two', { updatedAt: 2000 }),
    ]);
    renderPanel();
    openHistory();
    await screen.findByText('Chat One');
    expect(screen.queryByText('Pinned')).toBeNull(); // No pinned section before pinning.

    openConversationMenu('Chat One');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin to top' }));

    const pinnedSection = (await screen.findByText('Pinned')).closest('section') as HTMLElement;
    expect(within(pinnedSection).getByText('Chat One')).toBeTruthy();
    await waitFor(() => expect(storedConversation('c1').pinned).toBe(true));
  });

  it('creates a folder from the header button and persists it', async () => {
    seedHistory([seedConversation('c1', 'Loose chat')]);
    renderPanel();
    openHistory();
    await screen.findByText('Loose chat');

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const input = screen.getByLabelText('Folder name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Work' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Work')).toBeTruthy();
    await waitFor(() => {
      const folders = getStored().folders;
      expect(folders).toHaveLength(1);
      expect(folders[0].name).toBe('Work');
    });
  });

  it('moves a conversation into a folder and back out', async () => {
    seedHistory([seedConversation('c1', 'First chat')], [{ id: 'f1', name: 'Work', createdAt: 100 }]);
    renderPanel();
    openHistory();
    await screen.findByText('First chat');

    // Move in.
    openConversationMenu('First chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to folder' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Work' }));
    await waitFor(() => expect(storedConversation('c1').folderId).toBe('f1'));

    // Move back out via "Remove from folder".
    openConversationMenu('First chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to folder' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from folder' }));
    await waitFor(() => expect(storedConversation('c1').folderId).toBeNull());
  });

  it('deletes a folder and reparents its chats to unfiled', async () => {
    seedHistory(
      [seedConversation('c1', 'Filed chat', { folderId: 'f1' })],
      [{ id: 'f1', name: 'Work', createdAt: 100 }],
    );
    renderPanel();
    openHistory();
    await screen.findByText('Work');

    fireEvent.click(screen.getByRole('button', { name: 'Folder actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete folder' }));

    await waitFor(() => {
      expect(getStored().folders).toHaveLength(0);
      expect(storedConversation('c1').folderId).toBeNull(); // Chat reparented, not deleted.
    });
    expect(screen.queryByText('Work')).toBeNull();
    expect(screen.getByText('Filed chat')).toBeTruthy();
  });

  it('does not collapse a folder when editing its name', async () => {
    seedHistory(
      [seedConversation('c1', 'Filed chat', { folderId: 'f1' })],
      [{ id: 'f1', name: 'Work', createdAt: 100 }],
    );
    renderPanel();
    openHistory();
    await screen.findByText('Filed chat');

    const folderSection = screen.getByText('Work').closest('section') as HTMLElement;
    fireEvent.click(within(folderSection).getByRole('button', { name: 'Folder actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename folder' }));

    fireEvent.click(screen.getByLabelText('Folder name'));

    expect(screen.getByText('Filed chat')).toBeTruthy();
  });

  it('keeps a pinned chat inside its folder while lifting a loose pinned chat to the top', async () => {
    seedHistory(
      [
        seedConversation('c1', 'Filed Pinned', { pinned: true, folderId: 'f1', updatedAt: 3000 }),
        seedConversation('c2', 'Loose Pinned', { pinned: true, folderId: null, updatedAt: 2000 }),
      ],
      [{ id: 'f1', name: 'Work', createdAt: 100 }],
    );
    renderPanel();
    openHistory();
    await screen.findByText('Loose Pinned');

    const pinnedSection = screen.getByText('Pinned').closest('section') as HTMLElement;
    expect(within(pinnedSection).getByText('Loose Pinned')).toBeTruthy();
    expect(within(pinnedSection).queryByText('Filed Pinned')).toBeNull(); // Folder-pinned chat is NOT lifted out.

    const folderSection = screen.getByText('Work').closest('section') as HTMLElement;
    expect(within(folderSection).getByText('Filed Pinned')).toBeTruthy(); // It stays inside its folder.
  });

  it('loads legacy bare-array history for backward compatibility', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy',
          title: 'Legacy chat',
          model: 'google/gemini-3.5-flash',
          messages: [{ role: 'user', content: 'hi' }],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]),
    );
    renderPanel();
    openHistory();

    expect(await screen.findByText('Legacy chat')).toBeTruthy();
  });
});
