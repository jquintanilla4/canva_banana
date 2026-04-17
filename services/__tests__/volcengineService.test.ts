import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debugLog', () => ({
  addDebugLog: vi.fn(),
}));

import { addDebugLog } from '../debugLog';
import { generateSeedanceVideo } from '../volcengineService';

const createJsonResponse = (body: unknown, ok = true): Response => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response; // The service only reads `ok` and `json()` in these tests.

describe('volcengineService', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.VOLCENGINE_API_BASE_URL;

  beforeEach(() => {
    process.env.VOLCENGINE_API_BASE_URL = 'http://localhost:8000'; // Keep endpoint assertions stable across environments.
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.VOLCENGINE_API_BASE_URL;
      return;
    }
    process.env.VOLCENGINE_API_BASE_URL = originalBaseUrl;
  });

  it('logs a health fallback warning when reference media is submitted without ffprobe', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({
        status: 'ok',
        ffprobeAvailable: false,
        ffprobeSource: 'missing',
        ffprobeWarning: 'rerun uv sync',
      }))
      .mockResolvedValueOnce(createJsonResponse({
        id: 'job-1',
        modelId: 'doubao-seedance-2-0-260128',
        modelLabel: 'Seedance 2',
        variant: 'reference',
        prompt: 'test prompt',
        status: 'COMPLETED',
        createdAt: 1,
        updatedAt: 2,
        logs: [],
        outputUrl: 'https://example.com/output.mp4',
        provider: 'volcengine',
      }));

    const result = await generateSeedanceVideo('test prompt', {
      modelId: 'doubao-seedance-2-0-260128',
      variant: 'reference',
      aspectRatio: '16:9',
      duration: '5',
      resolution: '720p',
      generateAudio: false,
      cameraFixed: false,
      referenceVideoFiles: [new File(['video'], 'reference.mp4', { type: 'video/mp4' })],
    });

    expect(result.videoUrl).toBe('https://example.com/output.mp4');
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/health');
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/volcengine/jobs', expect.objectContaining({
      method: 'POST',
    }));
    expect(vi.mocked(addDebugLog)).toHaveBeenCalledWith(expect.objectContaining({
      message: 'ffprobe unavailable; backend reference duration validation is using the fallback path',
      data: expect.objectContaining({
        ffprobeSource: 'missing',
        ffprobeWarning: 'rerun uv sync',
      }),
    }));
  });
});
