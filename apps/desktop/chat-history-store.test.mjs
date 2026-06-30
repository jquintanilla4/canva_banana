import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CHAT_HISTORY_LIMITS, createChatHistoryStore } from './chat-history-store.mjs';

let tempDirs = [];

const conversation = (id, extra = {}) => ({
  id,
  title: `Chat ${id}`,
  model: 'google/gemini-3.5-flash',
  messages: [{ role: 'user', content: `hello ${id}` }],
  createdAt: 1000,
  updatedAt: 1000,
  ...extra,
});

const createTempStore = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canva-banana-history-'));
  tempDirs.push(dir);
  const historyPath = join(dir, 'chat-history.json');
  return { historyPath, store: createChatHistoryStore({ getHistoryPath: () => historyPath }) };
};

afterEach(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('chat-history-store', () => {
  it('serializes a save followed by clear so clear wins', async () => {
    const { store } = await createTempStore();

    const [saveResult, clearResult] = await Promise.all([
      store.save({ revision: 0, conversations: [conversation('c1')], folders: [] }),
      store.clear(),
    ]);

    expect(saveResult.saved).toBe(true);
    expect(clearResult.revision).toBe(2);
    expect(await store.read()).toMatchObject({ conversations: [], folders: [], revision: 2 });
  });

  it('rejects stale saves after a newer clear revision', async () => {
    const { store } = await createTempStore();

    await store.clear();
    const result = await store.save({ revision: 0, conversations: [conversation('stale')], folders: [] });

    expect(result).toEqual({ saved: false, revision: 1 });
    expect(await store.read()).toMatchObject({ conversations: [], folders: [], revision: 1 });
  });

  it('writes chat history with private file permissions', async () => {
    const { historyPath, store } = await createTempStore();

    await store.save({ revision: 0, conversations: [conversation('private')], folders: [] });

    expect((await stat(historyPath)).mode & 0o777).toBe(0o600);
  });

  it('waits for pending mutations before reading history', async () => {
    const { store } = await createTempStore();

    await store.save({ revision: 0, conversations: [conversation('c1')], folders: [] });
    const clearPromise = store.clear();
    const readResult = await store.read();

    expect(await clearPromise).toEqual({ revision: 2 });
    expect(readResult).toMatchObject({ conversations: [], folders: [], revision: 2 });
  });

  it('caps conversations, messages, strings, and total serialized bytes', async () => {
    const { historyPath, store } = await createTempStore();
    const longMessage = 'x'.repeat(CHAT_HISTORY_LIMITS.messageChars + 500);
    const conversations = Array.from({ length: CHAT_HISTORY_LIMITS.conversations + 1 }, (_, index) => conversation(`c${index}`));

    await store.save({ revision: 0, conversations, folders: [] });

    const parsed = JSON.parse(await readFile(historyPath, 'utf8'));
    expect(parsed.conversations).toHaveLength(CHAT_HISTORY_LIMITS.conversations);

    const oversizedConversations = Array.from({ length: 20 }, (_, index) => conversation(`oversized-${index}`, {
      messages: Array.from({ length: CHAT_HISTORY_LIMITS.messagesPerConversation + 5 }, () => ({ role: 'user', content: longMessage })),
    }));

    await store.save({ revision: 1, conversations: oversizedConversations, folders: [] });

    const payload = await readFile(historyPath, 'utf8');
    const cappedPayload = JSON.parse(payload);
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(CHAT_HISTORY_LIMITS.payloadBytes);
    expect(cappedPayload.conversations.length).toBeLessThanOrEqual(CHAT_HISTORY_LIMITS.conversations);
    expect(cappedPayload.conversations[0].messages).toHaveLength(CHAT_HISTORY_LIMITS.messagesPerConversation);
    expect(cappedPayload.conversations[0].messages[0].content).toHaveLength(CHAT_HISTORY_LIMITS.messageChars);
  });

  it('drops messages with roles the chat backend rejects', async () => {
    const { historyPath, store } = await createTempStore();

    await store.save({
      revision: 0,
      conversations: [conversation('roles', {
        messages: [
          { role: 'system', content: 'hidden instruction' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
          { role: 'tool', content: 'external result' },
        ],
      })],
      folders: [],
    });

    const parsed = JSON.parse(await readFile(historyPath, 'utf8'));
    expect(parsed.conversations[0].messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });
});
