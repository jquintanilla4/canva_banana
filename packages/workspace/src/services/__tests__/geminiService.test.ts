import { afterEach, expect, it, vi } from 'vitest';
import { generateImage } from '../geminiService';
import { mountWorkspaceRuntime } from '../runtimeConfig';

afterEach(() => vi.unstubAllGlobals());

it('generates an image through the Gemini Developer API v1beta endpoint', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    candidates: [{
      content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] },
    }],
  }));
  vi.stubGlobal('fetch', fetchMock);

  const unmount = mountWorkspaceRuntime(
    { config: { geminiApiKey: 'test-api-key' } },
    document.createElement('div'),
    document.createElement('div'),
  );
  try {
    const result = await generateImage('A poster');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent');
    expect(request?.method).toBe('POST');
    expect(result.imagesBase64).toEqual(['aW1hZ2U=']);
  } finally {
    unmount();
  }
});
