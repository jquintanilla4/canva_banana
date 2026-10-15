import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_AUTH_TOKEN_HEADER } from '../secureBackendService';
import { sendOpenRouterChat } from '../openRouterChatService';

const originalFetch = global.fetch;

const createJsonResponse = (body: unknown, ok = true): Response => ({
  ok,
  status: ok ? 200 : 500,
  statusText: ok ? 'OK' : 'Internal Server Error',
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response; // The service only reads fetch's JSON response contract.

describe('openRouterChatService', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    delete window.canvaBananaDesktop;
  });

  it('posts chat messages to the secure backend with desktop auth headers', async () => {
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({
        isDesktop: true,
        secureBackendApiBaseUrl: 'http://localhost:9876',
        secureBackendAuthToken: 'desktop-secret',
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(createJsonResponse({
      message: { role: 'assistant', content: 'Improved prompt.' },
      model: 'google/gemini-3.5-flash',
      usage: { total_tokens: 22 },
    }));

    const response = await sendOpenRouterChat({
      model: 'google/gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Improve this.' }],
    });

    expect(response.message.content).toBe('Improved prompt.');
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:9876/api/openrouter/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [DESKTOP_AUTH_TOKEN_HEADER]: 'desktop-secret',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Improve this.' }],
      }),
    });
  });

  it('throws backend detail errors', async () => {
    global.fetch = vi.fn().mockResolvedValue(createJsonResponse({ detail: 'OPENROUTER_API_KEY must be set.' }, false));

    await expect(sendOpenRouterChat({
      model: 'google/gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Improve this.' }],
    })).rejects.toThrow('OPENROUTER_API_KEY must be set.');
  });
});
