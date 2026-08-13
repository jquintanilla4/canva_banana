import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../debugLog', () => ({
  addDebugLog: vi.fn(),
}));

import { checkJimengLogin, clearJimengCache, generateJimengSeedanceVideo, getJimengSetupStatus, installJimengCli, startJimengLogin, type JimengQueueUpdate } from '../jimengService';

type GenerateJimengSeedanceVideoOptions = Parameters<typeof generateJimengSeedanceVideo>[1]; // Reuse the runtime signature in tests.

const DEFAULT_BASE_URL = 'http://localhost:8000'; // Match the runtime fallback.
const SETUP_STATUS_INIT = { headers: { 'X-Canva-Banana-Local-Action': 'jimeng-setup' } }; // Setup status also runs a local CLI check.
const SETUP_ACTION_INIT = { method: 'POST', headers: { 'X-Canva-Banana-Local-Action': 'jimeng-setup' } }; // Mirror setup mutation CSRF guard.
const CACHE_CLEAR_INIT = { method: 'DELETE', headers: { 'X-Canva-Banana-Local-Action': 'jimeng-setup' } }; // Cache cleanup uses the same local guard.

const createJsonResponse = (body: unknown, ok = true): Response => ({
  ok,
  status: ok ? 200 : 500,
  statusText: ok ? 'OK' : 'Internal Server Error',
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response; // The service only reads ok/status/statusText/json.

const createJobPayload = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'job-1',
  modelId: 'jimeng-cli/seedance-2',
  modelLabel: 'Seedance 2 (JM CLI)',
  variant: 'smart',
  prompt: 'test prompt',
  status: 'IN_QUEUE',
  createdAt: 1,
  updatedAt: 2,
  logs: [],
  provider: 'jimeng',
  ...overrides,
}); // REST and socket payloads share this shape.

const createOptions = (overrides: Partial<GenerateJimengSeedanceVideoOptions> = {}): GenerateJimengSeedanceVideoOptions => ({
  modelId: 'jimeng-cli/seedance-2',
  variant: 'smart',
  modelVersion: 'seedance2.0fast',
  aspectRatio: '16:9',
  duration: '5',
  resolution: '720p',
  generateAudio: false,
  cameraFixed: false,
  ...overrides,
}); // Shared options keep tests focused on transport behavior.

const flushPromises = async (cycles = 8): Promise<void> => {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
}; // Let submit and socket setup promises settle.

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
    this.readyState = 3; // Mirror closed state without dispatching another close event.
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: false } as CloseEvent);
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe('jimengService', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.JIMENG_API_BASE_URL;
  const originalWebSocket = global.WebSocket;
  const originalWindowWebSocket = window.WebSocket;

  beforeEach(() => {
    process.env.JIMENG_API_BASE_URL = DEFAULT_BASE_URL; // Keep endpoint assertions stable.
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    MockWebSocket.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    window.WebSocket = originalWindowWebSocket;
    delete window.canvaBananaDesktop;
    if (originalBaseUrl === undefined) {
      delete process.env.JIMENG_API_BASE_URL;
      return;
    }
    process.env.JIMENG_API_BASE_URL = originalBaseUrl;
  });

  it('streams queue updates over the Jimeng backend socket', async () => {
    const queueUpdates: JimengQueueUpdate[] = [];
    const referenceImageFile = new File(['image'], 'ref.png', { type: 'image/png' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ status: 'ready', ready: true, cliAvailable: true, authenticated: true }))
      .mockResolvedValueOnce(createJsonResponse(createJobPayload()));

    const request = generateJimengSeedanceVideo('test prompt', createOptions({
      variant: 'reference',
      referenceImageFiles: [referenceImageFile],
      onQueueUpdate: update => queueUpdates.push(update),
    }));
    await flushPromises();

    expect(global.fetch).toHaveBeenNthCalledWith(1, `${DEFAULT_BASE_URL}/api/jimeng/setup/status`, SETUP_STATUS_INIT);
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${DEFAULT_BASE_URL}/api/jimeng/jobs`, expect.objectContaining({
      method: 'POST',
      headers: { 'X-Canva-Banana-Local-Action': 'jimeng-setup' },
    }));
    const requestBody = vi.mocked(global.fetch).mock.calls[1]?.[1]?.body as FormData;
    expect(requestBody.get('variant')).toBe('reference');
    expect(requestBody.getAll('reference_images')).toEqual([referenceImageFile]);
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost:8000/api/jimeng/jobs/job-1/ws');

    MockWebSocket.instances[0]?.emitOpen();
    MockWebSocket.instances[0]?.emitMessage(JSON.stringify(createJobPayload({
      status: 'COMPLETED',
      logs: ['Video ready'],
      outputUrl: '/api/jimeng/jobs/job-1/output',
      providerOutputUrl: null,
    })));

    await expect(request).resolves.toEqual({
      videoUrl: `${DEFAULT_BASE_URL}/api/jimeng/jobs/job-1/output`,
      providerJobId: 'job-1',
      providerVideoUrl: undefined,
      requestId: undefined,
    });
    expect(queueUpdates).toEqual([
      expect.objectContaining({ providerJobId: 'job-1', status: 'IN_QUEUE', logs: [] }),
      expect.objectContaining({ providerJobId: 'job-1', status: 'COMPLETED', outputUrl: `${DEFAULT_BASE_URL}/api/jimeng/jobs/job-1/output` }),
    ]);
  });

  it('does not send the desktop token to an env-overridden Jimeng backend origin', async () => {
    const remoteBaseUrl = 'https://remote-jimeng.example.test/backend';
    window.canvaBananaDesktop = {
      getRuntimeConfig: () => ({
        isDesktop: true,
        pythonBackendAuthToken: 'desktop-secret',
        pythonBackendAuthOrigin: DEFAULT_BASE_URL,
        jimengApiBaseUrl: remoteBaseUrl,
      }),
    };
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ status: 'ready', ready: true, cliAvailable: true, authenticated: true }))
      .mockResolvedValueOnce(createJsonResponse(createJobPayload({
        status: 'COMPLETED',
        outputUrl: 'https://example.com/output.mp4',
      })));

    await expect(generateJimengSeedanceVideo('test prompt', createOptions())).resolves.toEqual({
      videoUrl: 'https://example.com/output.mp4',
      providerJobId: 'job-1',
      providerVideoUrl: undefined,
      requestId: undefined,
    });
    expect(global.fetch).toHaveBeenNthCalledWith(1, `${remoteBaseUrl}/api/jimeng/setup/status`, SETUP_STATUS_INIT);
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${remoteBaseUrl}/api/jimeng/jobs`, expect.objectContaining({
      method: 'POST',
      headers: { 'X-Canva-Banana-Local-Action': 'jimeng-setup' },
    }));
  });

  it('returns setup status from Jimeng setup endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse({
      status: 'ready',
      ready: true,
      cliAvailable: true,
      authenticated: true,
      executable: '/bin/dreamina',
      message: 'Jimeng CLI is ready',
    }));

    await expect(getJimengSetupStatus()).resolves.toEqual({
      status: 'ready',
      ready: true,
      backendReachable: true,
      cliAvailable: true,
      authenticated: true,
      executable: '/bin/dreamina',
      message: 'Jimeng CLI is ready',
      detail: undefined,
    });
    expect(global.fetch).toHaveBeenCalledWith(`${DEFAULT_BASE_URL}/api/jimeng/setup/status`, SETUP_STATUS_INIT);
  });

  it('keeps CLI installed when Jimeng account login is missing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse({
      status: 'login_required',
      ready: false,
      cliAvailable: true,
      authenticated: false,
      executable: '/bin/dreamina',
      message: 'Jimeng CLI is installed, but no valid login is available.',
      detail: '未检测到有效登录态，请先执行 dreamina login',
    }));

    await expect(getJimengSetupStatus()).resolves.toEqual({
      status: 'login_required',
      ready: false,
      backendReachable: true,
      cliAvailable: true,
      authenticated: false,
      executable: '/bin/dreamina',
      message: 'Jimeng CLI is installed, but no valid login is available.',
      detail: '未检测到有效登录态，请先执行 dreamina login',
    });
  });

  it('keeps an authenticated but outdated CLI blocked', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse({
      status: 'update_required',
      ready: false,
      cliAvailable: true,
      authenticated: true,
      cliVersion: '1.4.14',
      message: 'Jimeng CLI 1.4.14 is outdated.',
    }));

    await expect(getJimengSetupStatus()).resolves.toEqual(expect.objectContaining({
      status: 'update_required',
      ready: false,
      cliAvailable: true,
      authenticated: true,
      cliVersion: '1.4.14',
    }));
  });

  it('runs install and login setup actions', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ status: 'ok', message: 'installed' }))
      .mockResolvedValueOnce(createJsonResponse({ status: 'authorization_required', message: 'login started', loginSessionId: 'session-1', verificationUri: 'https://example.com/login', userCode: 'ABCD' }))
      .mockResolvedValueOnce(createJsonResponse({ status: 'ready', ready: true, message: 'logged in' }));

    await expect(installJimengCli()).resolves.toEqual({ status: 'ok', message: 'installed' });
    await expect(startJimengLogin()).resolves.toEqual({ status: 'authorization_required', message: 'login started', loginSessionId: 'session-1', verificationUri: 'https://example.com/login', userCode: 'ABCD' });
    await expect(checkJimengLogin('session-1', 5)).resolves.toEqual({ status: 'ready', ready: true, message: 'logged in' });
    expect(global.fetch).toHaveBeenNthCalledWith(1, `${DEFAULT_BASE_URL}/api/jimeng/setup/install`, SETUP_ACTION_INIT);
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${DEFAULT_BASE_URL}/api/jimeng/setup/login`, SETUP_ACTION_INIT);
    expect(global.fetch).toHaveBeenNthCalledWith(3, `${DEFAULT_BASE_URL}/api/jimeng/setup/login/check?login_session_id=session-1&poll=5`, SETUP_ACTION_INIT);
  });

  it('sends Seedance 2.5 session and audio-only reference fields', async () => {
    const audioFile = new File(['audio'], 'reference.mp3', { type: 'audio/mpeg' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ status: 'ready', ready: true, cliAvailable: true, authenticated: true }))
      .mockResolvedValueOnce(createJsonResponse(createJobPayload({
        modelId: 'jimeng-cli/seedance-2.5',
        status: 'COMPLETED',
        outputUrl: 'https://example.com/output.mp4',
      })));

    await generateJimengSeedanceVideo('', createOptions({
      modelId: 'jimeng-cli/seedance-2.5',
      variant: 'reference',
      modelVersion: 'seedance2.5',
      duration: '30',
      resolution: '480p',
      session: 42,
      referenceAudioFiles: [audioFile],
    }));

    const requestBody = vi.mocked(global.fetch).mock.calls[1]?.[1]?.body as FormData;
    expect(requestBody.get('model_id')).toBe('jimeng-cli/seedance-2.5');
    expect(requestBody.get('model_version')).toBe('seedance2.5');
    expect(requestBody.get('session')).toBe('42');
    expect(requestBody.getAll('reference_audios')).toEqual([audioFile]);
  });

  it('sends Multi-frame images and transition fields', async () => {
    const first = new File(['one'], 'one.png', { type: 'image/png' });
    const second = new File(['two'], 'two.png', { type: 'image/png' });
    const third = new File(['three'], 'three.png', { type: 'image/png' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ status: 'ready', ready: true, cliAvailable: true, authenticated: true }))
      .mockResolvedValueOnce(createJsonResponse(createJobPayload({
        modelId: 'jimeng-cli/multiframe',
        status: 'COMPLETED',
        outputUrl: 'https://example.com/output.mp4',
      })));

    await generateJimengSeedanceVideo('day to night || night to sunrise', createOptions({
      modelId: 'jimeng-cli/multiframe',
      mode: 'multiframe',
      multiframeImageFiles: [first, second, third],
      transitionPrompts: ['day to night', 'night to sunrise'],
      transitionDurations: [3, 4],
    }));

    const requestBody = vi.mocked(global.fetch).mock.calls[1]?.[1]?.body as FormData;
    expect(requestBody.get('mode')).toBe('multiframe');
    expect(requestBody.getAll('multiframe_images')).toEqual([first, second, third]);
    expect(requestBody.getAll('transition_prompts')).toEqual(['day to night', 'night to sunrise']);
    expect(requestBody.getAll('transition_durations')).toEqual(['3', '4']);
  });

  it('clears the Jimeng local cache through the backend', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createJsonResponse({
      status: 'ok',
      deletedFiles: 2,
      bytesFreed: 4096,
      workDir: '/tmp/jimeng',
      errors: [],
      invalidatedJobIds: ['completed-job'],
    }));

    await expect(clearJimengCache()).resolves.toEqual({
      status: 'ok',
      deletedFiles: 2,
      bytesFreed: 4096,
      workDir: '/tmp/jimeng',
      errors: [],
      invalidatedJobIds: ['completed-job'],
    });
    expect(global.fetch).toHaveBeenCalledWith(`${DEFAULT_BASE_URL}/api/jimeng/cache`, CACHE_CLEAR_INIT);
  });

  it('surfaces backend setup transport failures with recovery instructions', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(installJimengCli()).rejects.toThrow(`Seedance 2 (JM CLI) could not reach the local Jimeng backend at ${DEFAULT_BASE_URL}.`);
  });

  it('rejects instead of hanging after repeated non-terminal socket reconnects', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ status: 'ready', ready: true, cliAvailable: true, authenticated: true }))
      .mockResolvedValueOnce(createJsonResponse(createJobPayload({ status: 'IN_PROGRESS' })))
      .mockResolvedValue(createJsonResponse(createJobPayload({ status: 'IN_PROGRESS', logs: ['still processing'] })));

    const request = generateJimengSeedanceVideo('test prompt', createOptions());
    await flushPromises();

    for (let attempt = 0; attempt <= 5; attempt += 1) {
      expect(MockWebSocket.instances[attempt]).toBeTruthy();
      MockWebSocket.instances[attempt]?.emitClose();
      if (attempt < 5) {
        await vi.advanceTimersByTimeAsync(Math.min(1000 * (2 ** attempt), 5000));
        await flushPromises();
      }
    }

    await expect(request).rejects.toThrow('Jimeng job stream did not recover after 5 reconnect attempts.');
  });
});
