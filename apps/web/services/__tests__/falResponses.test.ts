import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debugLog', () => ({
  addDebugLog: vi.fn(),
}));

import { extractInlineData } from '../fal/responses';

const createResponse = (
  status: number,
  body = 'image-bytes',
  cancel = vi.fn().mockResolvedValue(undefined),
): Response => ({
  ok: status >= 200 && status < 300,
  status,
  body: { cancel },
  blob: vi.fn().mockResolvedValue(new Blob([body], { type: 'image/png' })),
}) as unknown as Response; // Provide only the response fields used by image extraction and cleanup.

describe('Fal image response downloads', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries transient Fal CDN responses before reading the image', async () => {
    vi.useFakeTimers();
    const cancelBadGateway = vi.fn().mockResolvedValue(undefined);
    const cancelUnavailable = vi.fn().mockResolvedValue(undefined);
    const cancelSuccess = vi.fn().mockResolvedValue(undefined);
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createResponse(502, 'bad gateway', cancelBadGateway))
      .mockResolvedValueOnce(createResponse(503, 'unavailable', cancelUnavailable))
      .mockResolvedValueOnce(createResponse(200, 'image-bytes', cancelSuccess));

    const download = extractInlineData('https://v3.fal.media/files/example.png');
    await vi.runAllTimersAsync();

    await expect(download).resolves.toMatch(/^data:image\/png;base64,/);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(cancelBadGateway).toHaveBeenCalledOnce();
    expect(cancelUnavailable).toHaveBeenCalledOnce();
    expect(cancelSuccess).not.toHaveBeenCalled();
  });

  it('retries a temporary network failure', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(createResponse(200));

    const download = extractInlineData('https://v3.fal.media/files/example.png');
    await vi.runAllTimersAsync();

    await expect(download).resolves.toMatch(/^data:image\/png;base64,/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('continues retrying when a failed response body cannot be cancelled', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn().mockRejectedValue(new Error('stream cleanup failed'));
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createResponse(503, 'unavailable', cancel))
      .mockResolvedValueOnce(createResponse(200));

    const download = extractInlineData('https://v3.fal.media/files/example.png');
    await vi.runAllTimersAsync();

    await expect(download).resolves.toMatch(/^data:image\/png;base64,/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('fails permanent download responses without retrying', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue(createResponse(404, 'missing', cancel));

    await expect(extractInlineData('https://v3.fal.media/files/missing.png')).rejects.toThrow(
      'Failed to download image from Fal.ai response. HTTP 404',
    );
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('stops after four transient download attempts', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn().mockResolvedValue(undefined);
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(createResponse(502, 'bad gateway', cancel)));

    const download = extractInlineData('https://v3.fal.media/files/unavailable.png');
    const rejection = expect(download).rejects.toThrow('Failed to download image from Fal.ai response. HTTP 502'); // Observe rejection before timers settle.
    await vi.runAllTimersAsync();

    await rejection;
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(cancel).toHaveBeenCalledTimes(4);
  });
});
