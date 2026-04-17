import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debugLog', () => ({
  addDebugLog: vi.fn(),
}));

import { addDebugLog } from '../debugLog';
import { generateSeedanceVideo, type VolcengineQueueUpdate } from '../volcengineService';

type GenerateSeedanceVideoOptions = Parameters<typeof generateSeedanceVideo>[1]; // Reuse the runtime signature so tests stay aligned.

type JsonResponseOptions = {
  ok?: boolean;
  status?: number;
  statusText?: string;
}; // Minimal response fields cover the service logic we exercise here.

type SocketCloseOptions = {
  code?: number;
  reason?: string;
  wasClean?: boolean;
};

const DEFAULT_BASE_URL = 'http://localhost:8000'; // Match the runtime fallback so assertions stay stable.

const createJsonResponse = (
  body: unknown,
  options: JsonResponseOptions = {},
): Response => ({
  ok: options.ok ?? true,
  status: options.status ?? ((options.ok ?? true) ? 200 : 500),
  statusText: options.statusText ?? (((options.ok ?? true) ? 'OK' : 'Internal Server Error')),
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response; // The service only reads `ok`, `status`, `statusText`, and `json()`.

const createJobPayload = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'job-1',
  modelId: 'doubao-seedance-2-0-260128',
  modelLabel: 'Seedance 2',
  variant: 'smart',
  prompt: 'test prompt',
  status: 'IN_QUEUE',
  createdAt: 1,
  updatedAt: 2,
  logs: [],
  provider: 'volcengine',
  ...overrides,
}); // Socket and REST payloads share the same shape.

const createHealthResponse = (overrides: Partial<Record<string, unknown>> = {}): Response => createJsonResponse({
  status: 'ok',
  ffprobeAvailable: true,
  ...overrides,
}); // Health defaults to a ready backend unless a test overrides it.

const createOptions = (overrides: Partial<GenerateSeedanceVideoOptions> = {}): GenerateSeedanceVideoOptions => ({
  modelId: 'doubao-seedance-2-0-260128',
  variant: 'smart',
  aspectRatio: '16:9',
  duration: '5',
  resolution: '720p',
  generateAudio: false,
  cameraFixed: false,
  ...overrides,
}); // Shared options keep the transport tests focused on the backend contract.

const getBackendUnreachableMessage = (baseUrl = DEFAULT_BASE_URL): string =>
  `Seedance 2 could not reach the local Volcengine backend at ${baseUrl}. Run \`uv sync --project backend\` once, then \`npm run backend:dev\`.`; // Mirror the service message exactly so regressions fail loudly.

const flushPromises = async (cycles = 8): Promise<void> => {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
}; // Let the submit -> json -> stream promise chain settle fully.

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readyState = 0;

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = 3; // Mirror the closed readyState without triggering a duplicate close callback.
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.(new Event('error'));
  }

  emitClose(options: SocketCloseOptions = {}): void {
    this.readyState = 3;
    this.onclose?.({
      code: options.code ?? 1006,
      reason: options.reason ?? '',
      wasClean: options.wasClean ?? false,
    } as CloseEvent);
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe('volcengineService', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.VOLCENGINE_API_BASE_URL;
  const originalWebSocket = global.WebSocket;
  const originalWindowWebSocket = window.WebSocket;

  beforeEach(() => {
    process.env.VOLCENGINE_API_BASE_URL = DEFAULT_BASE_URL; // Keep endpoint assertions stable across environments.
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    MockWebSocket.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    window.WebSocket = originalWindowWebSocket;
    vi.useRealTimers(); // Reconnect tests switch timers to fake mode.
    if (originalBaseUrl === undefined) {
      delete process.env.VOLCENGINE_API_BASE_URL;
      return;
    }
    process.env.VOLCENGINE_API_BASE_URL = originalBaseUrl;
  });

  it('throws an actionable error when the health preflight fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(generateSeedanceVideo('test prompt', createOptions())).rejects.toThrow(getBackendUnreachableMessage());
    expect(vi.mocked(addDebugLog)).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'error',
      source: 'volcengine',
      title: 'Volcengine backend',
      message: 'Seedance 2 backend unreachable',
      data: expect.objectContaining({
        baseUrl: DEFAULT_BASE_URL,
        stage: 'health',
        error: 'Failed to fetch',
      }),
    }));
  });

  it('throws the same actionable error when the health preflight returns non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse({ status: 'down' }, {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    await expect(generateSeedanceVideo('test prompt', createOptions())).rejects.toThrow(getBackendUnreachableMessage());
    expect(vi.mocked(addDebugLog)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        baseUrl: DEFAULT_BASE_URL,
        stage: 'health',
        error: 'HTTP 503 Service Unavailable',
      }),
    }));
  });

  it('throws the same actionable error when submit fetch fails after health passes', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createHealthResponse())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(generateSeedanceVideo('test prompt', createOptions())).rejects.toThrow(getBackendUnreachableMessage());
    expect(vi.mocked(addDebugLog)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        baseUrl: DEFAULT_BASE_URL,
        stage: 'submit',
        error: 'Failed to fetch',
      }),
    }));
  });

  it('streams queue updates over WebSocket and resolves on a terminal completed payload', async () => {
    const queueUpdates: VolcengineQueueUpdate[] = [];
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createHealthResponse())
      .mockResolvedValueOnce(createJsonResponse(createJobPayload()));

    const request = generateSeedanceVideo('test prompt', createOptions({
      onQueueUpdate: update => queueUpdates.push(update),
    }));
    await flushPromises();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost:8000/api/volcengine/jobs/job-1/ws');

    MockWebSocket.instances[0]?.emitOpen();
    MockWebSocket.instances[0]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'IN_PROGRESS',
      logs: ['Preparing Volcengine request'],
    })));
    MockWebSocket.instances[0]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'COMPLETED',
      logs: ['Preparing Volcengine request', 'Video ready'],
      outputUrl: 'https://example.com/output.mp4',
      providerOutputUrl: 'https://provider.example.com/output.mp4',
      lastFrameUrl: 'https://example.com/last-frame.png',
      providerLastFrameUrl: 'https://provider.example.com/last-frame.png',
    })));

    await expect(request).resolves.toEqual({
      videoUrl: 'https://example.com/output.mp4',
      providerVideoUrl: 'https://provider.example.com/output.mp4',
      requestId: undefined,
      lastFrameUrl: 'https://example.com/last-frame.png',
      providerLastFrameUrl: 'https://provider.example.com/last-frame.png',
    });
    expect(queueUpdates).toEqual([
      expect.objectContaining({ status: 'IN_QUEUE', logs: [] }),
      expect.objectContaining({ status: 'IN_PROGRESS', logs: ['Preparing Volcengine request'] }),
      expect.objectContaining({ status: 'COMPLETED', outputUrl: 'https://example.com/output.mp4' }),
    ]);
  });

  it('rejects when the WebSocket returns a terminal failed payload', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createHealthResponse())
      .mockResolvedValueOnce(createJsonResponse(createJobPayload()));

    const request = generateSeedanceVideo('test prompt', createOptions());
    await flushPromises();

    MockWebSocket.instances[0]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'FAILED',
      logs: ['Volcengine task failed'],
      error: 'Volcengine task failed',
    })));

    await expect(request).rejects.toThrow('Volcengine task failed');
  });

  it('reconnects after a socket disconnect, resyncs once, and continues streaming', async () => {
    vi.useFakeTimers();
    const queueUpdates: VolcengineQueueUpdate[] = [];
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createHealthResponse())
      .mockResolvedValueOnce(createJsonResponse(createJobPayload()))
      .mockResolvedValueOnce(createJsonResponse(createJobPayload({
        status: 'IN_PROGRESS',
        logs: ['Recovered after reconnect'],
      })));

    const request = generateSeedanceVideo('test prompt', createOptions({
      onQueueUpdate: update => queueUpdates.push(update),
    }));
    await flushPromises();

    MockWebSocket.instances[0]?.emitOpen();
    MockWebSocket.instances[0]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'IN_PROGRESS',
      logs: ['Task submitted to Volcengine'],
    })));
    MockWebSocket.instances[0]?.emitClose({ code: 1006, wasClean: false });

    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(global.fetch).toHaveBeenNthCalledWith(3, `${DEFAULT_BASE_URL}/api/volcengine/jobs/job-1`, undefined);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]?.emitOpen();
    MockWebSocket.instances[1]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'COMPLETED',
      logs: ['Recovered after reconnect', 'Video ready'],
      outputUrl: '/api/volcengine/jobs/job-1/output',
      providerOutputUrl: 'https://provider.example.com/output.mp4',
      lastFrameUrl: '/api/volcengine/jobs/job-1/last-frame',
      providerLastFrameUrl: 'https://provider.example.com/last-frame.png',
    })));

    await expect(request).resolves.toEqual({
      videoUrl: `${DEFAULT_BASE_URL}/api/volcengine/jobs/job-1/output`,
      providerVideoUrl: 'https://provider.example.com/output.mp4',
      requestId: undefined,
      lastFrameUrl: `${DEFAULT_BASE_URL}/api/volcengine/jobs/job-1/last-frame`,
      providerLastFrameUrl: 'https://provider.example.com/last-frame.png',
    });
    expect(queueUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'IN_PROGRESS', logs: ['Recovered after reconnect'] }),
      expect.objectContaining({ status: 'COMPLETED', outputUrl: `${DEFAULT_BASE_URL}/api/volcengine/jobs/job-1/output` }),
    ]));
  });

  it('surfaces the actionable backend error when reconnect resync fails', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createHealthResponse())
      .mockResolvedValueOnce(createJsonResponse(createJobPayload()))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const request = generateSeedanceVideo('test prompt', createOptions());
    await flushPromises();

    MockWebSocket.instances[0]?.emitError();
    MockWebSocket.instances[0]?.emitClose({ code: 1006, wasClean: false });

    const assertion = expect(request).rejects.toThrow(getBackendUnreachableMessage());
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(vi.mocked(addDebugLog)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        baseUrl: DEFAULT_BASE_URL,
        stage: 'resync',
        error: 'Failed to fetch',
      }),
    }));
  });

  it('normalizes relative proxy asset URLs from WebSocket payloads into absolute URLs', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createHealthResponse())
      .mockResolvedValueOnce(createJsonResponse(createJobPayload()));

    const request = generateSeedanceVideo('test prompt', createOptions());
    await flushPromises();

    MockWebSocket.instances[0]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'COMPLETED',
      outputUrl: '/api/volcengine/jobs/job-1/output',
      providerOutputUrl: 'https://example.com/output.mp4',
      lastFrameUrl: '/api/volcengine/jobs/job-1/last-frame',
      providerLastFrameUrl: 'https://example.com/last-frame.png',
    })));

    await expect(request).resolves.toEqual({
      videoUrl: `${DEFAULT_BASE_URL}/api/volcengine/jobs/job-1/output`,
      providerVideoUrl: 'https://example.com/output.mp4',
      requestId: undefined,
      lastFrameUrl: `${DEFAULT_BASE_URL}/api/volcengine/jobs/job-1/last-frame`,
      providerLastFrameUrl: 'https://example.com/last-frame.png',
    });
  });
});
