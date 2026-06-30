import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatConversation, ChatHistorySnapshot } from '../chatHistoryService';

const conversation = (id: string, title = `Chat ${id}`): ChatConversation => ({
  id,
  title,
  model: 'google/gemini-3.5-flash',
  messages: [{ role: 'user', content: `prompt ${id}` }],
  createdAt: 1000,
  updatedAt: 1000,
});

const resetService = async () => {
  vi.resetModules();
  return import('../chatHistoryService');
};

afterEach(() => {
  delete window.canvaBananaDesktop;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('chatHistoryService', () => {
  it('drops saved conversations with unknown models and filters malformed messages', async () => {
    window.localStorage.setItem('prompt-chat-history-v1', JSON.stringify({
      conversations: [
        {
          id: 'valid',
          title: 'Valid chat',
          model: 'google/gemini-3.5-flash',
          messages: [
            { role: 'system', content: 'discard me' },
            { role: 'user', content: 'keep me' },
            { role: 'assistant', content: 123 },
            { role: 'assistant', content: 'keep reply' },
          ],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'stale-model',
          title: 'Stale chat',
          model: 'provider/removed-model',
          messages: [{ role: 'user', content: 'do not load' }],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      folders: [],
    }));
    const { loadChatHistory } = await resetService();

    const snapshot = await loadChatHistory();

    expect(snapshot.conversations.map(item => item.id)).toEqual(['valid']);
    expect(snapshot.conversations[0].messages).toEqual([
      { role: 'user', content: 'keep me' },
      { role: 'assistant', content: 'keep reply' },
    ]);
  });

  it('merges a desktop save with the initial load before writing', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    const load = vi.fn(() => new Promise(resolve => {
      resolveLoad = resolve; // Keep hydration pending until after the save request.
    }));
    const save = vi.fn(async (_snapshot: unknown) => ({ saved: true, revision: 1 }));
    window.canvaBananaDesktop = { chatHistory: { load, save } };
    const { saveChatHistory } = await resetService();

    const savePromise = saveChatHistory({ conversations: [conversation('local', 'Local draft')], folders: [] });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(save).not.toHaveBeenCalled();

    resolveLoad({ conversations: [conversation('disk', 'Disk history')], folders: [], revision: 0 });
    const returnedSnapshot = await savePromise;

    const savedSnapshot = save.mock.calls[0][0] as ChatHistorySnapshot & { revision: number };
    expect(savedSnapshot.revision).toBe(0);
    expect(savedSnapshot.conversations.map(item => item.id)).toEqual(['local', 'disk']);
    expect(returnedSnapshot.conversations.map(item => item.id)).toEqual(['local', 'disk']);
  });

  it('keeps merging unadopted desktop history across queued saves', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    const saveResolvers: Array<(value: unknown) => void> = [];
    const load = vi.fn(() => new Promise(resolve => {
      resolveLoad = resolve; // Hold the disk read until the first local save is queued.
    }));
    const save = vi.fn((_snapshot: unknown) => new Promise(resolve => {
      saveResolvers.push(resolve); // Keep each write pending so a later save queues behind it.
    }));
    window.canvaBananaDesktop = { chatHistory: { load, save } };
    const { saveChatHistory } = await resetService();

    const firstSave = saveChatHistory({ conversations: [conversation('local-1')], folders: [] });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    resolveLoad({ conversations: [conversation('disk')], folders: [], revision: 0 });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    const secondSave = saveChatHistory({ conversations: [conversation('local-2')], folders: [] });
    saveResolvers[0]({ saved: true, revision: 1 });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect((save.mock.calls[0][0] as ChatHistorySnapshot).conversations.map(item => item.id)).toEqual(['local-1', 'disk']);
    expect((save.mock.calls[1][0] as ChatHistorySnapshot).conversations.map(item => item.id)).toEqual(['local-2', 'disk']);

    saveResolvers[1]({ saved: true, revision: 2 });
    expect((await firstSave).conversations.map(item => item.id)).toEqual(['local-1', 'disk']);
    expect((await secondSave).conversations.map(item => item.id)).toEqual(['local-2', 'disk']);
  });

  it('reloads and retries once while preserving local updates and external additions', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ conversations: [conversation('disk')], folders: [], revision: 4 })
      .mockResolvedValueOnce({ conversations: [conversation('disk'), conversation('newer')], folders: [], revision: 5 });
    const save = vi
      .fn(async (_snapshot: unknown) => ({ saved: false, revision: 5 }))
      .mockResolvedValueOnce({ saved: false, revision: 5 })
      .mockResolvedValueOnce({ saved: true, revision: 6 });
    window.canvaBananaDesktop = { chatHistory: { load, save } };
    const { loadChatHistory, saveChatHistory } = await resetService();

    await loadChatHistory();
    await saveChatHistory({ conversations: [conversation('local'), conversation('disk')], folders: [] });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0]).toMatchObject({ revision: 4 });
    expect(save.mock.calls[1][0]).toMatchObject({ revision: 5 });
    expect((save.mock.calls[1][0] as ChatHistorySnapshot).conversations.map(item => item.id)).toEqual(['local', 'disk', 'newer']);
  });

  it('preserves local deletions when retrying a stale desktop save', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ conversations: [conversation('disk')], folders: [], revision: 4 })
      .mockResolvedValueOnce({ conversations: [conversation('disk'), conversation('newer')], folders: [], revision: 5 });
    const save = vi
      .fn(async (_snapshot: unknown) => ({ saved: false, revision: 5 }))
      .mockResolvedValueOnce({ saved: false, revision: 5 })
      .mockResolvedValueOnce({ saved: true, revision: 6 });
    window.canvaBananaDesktop = { chatHistory: { load, save } };
    const { loadChatHistory, markChatHistorySnapshotAdopted, saveChatHistory } = await resetService();

    markChatHistorySnapshotAdopted(await loadChatHistory());
    const returnedSnapshot = await saveChatHistory({ conversations: [], folders: [] });

    expect(save).toHaveBeenCalledTimes(2);
    expect((save.mock.calls[1][0] as ChatHistorySnapshot).conversations.map(item => item.id)).toEqual(['newer']);
    expect(returnedSnapshot.conversations.map(item => item.id)).toEqual(['newer']);
  });

  it('invalidates the cached desktop load after native clear', async () => {
    let clearCallback: ((payload?: { revision?: number }) => void) | null = null;
    const load = vi
      .fn()
      .mockResolvedValueOnce({ conversations: [conversation('old')], folders: [], revision: 0 })
      .mockResolvedValueOnce({ conversations: [], folders: [], revision: 1 });
    window.canvaBananaDesktop = {
      chatHistory: {
        load,
        save: vi.fn(),
        onCleared: vi.fn(callback => {
          clearCallback = callback; // Keep the native event hook for this test.
          return vi.fn();
        }),
      },
    };
    const { loadChatHistory, subscribeToHistoryCleared } = await resetService();

    expect((await loadChatHistory()).conversations.map(item => item.id)).toEqual(['old']);
    const unsubscribe = subscribeToHistoryCleared(vi.fn());
    clearCallback?.({ revision: 1 });

    expect((await loadChatHistory()).conversations).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('does not merge stale pending desktop loads into saves after native clear', async () => {
    let clearCallback: ((payload?: { revision?: number }) => void) | null = null;
    let resolveLoad: (value: unknown) => void = () => {};
    const load = vi.fn(() => new Promise(resolve => {
      resolveLoad = resolve; // Keep the first disk read pending across the clear event.
    }));
    const save = vi.fn(async (_snapshot: unknown) => ({ saved: true, revision: 2 }));
    window.canvaBananaDesktop = {
      chatHistory: {
        load,
        save,
        onCleared: vi.fn(callback => {
          clearCallback = callback; // Keep the native clear callback for the race.
          return vi.fn();
        }),
      },
    };
    const { loadChatHistory, saveChatHistory, subscribeToHistoryCleared } = await resetService();

    const unsubscribe = subscribeToHistoryCleared(vi.fn());
    const pendingLoad = loadChatHistory();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    clearCallback?.({ revision: 1 });
    resolveLoad({ conversations: [conversation('stale')], folders: [], revision: 0 });

    expect((await pendingLoad).conversations).toEqual([]);
    await saveChatHistory({ conversations: [conversation('fresh')], folders: [] });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ revision: 1 });
    expect((save.mock.calls[0][0] as ChatHistorySnapshot).conversations.map(item => item.id)).toEqual(['fresh']);
    unsubscribe();
  });
});
