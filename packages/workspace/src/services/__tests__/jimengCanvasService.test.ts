import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JimengCanvasCancelled, runJimengCanvasGeneration } from '../jimengCanvasGeneration';
import {
  fetchJimengCanvasAsset,
  getJimengCanvasCatalog,
  getJimengCanvasJob,
  getJimengCanvasSetupStatus,
  prepareJimengCanvasJob,
  removeJimengLegacyCli,
  waitForJimengCanvasJob,
  type JimengCanvasJobSpec,
} from '../jimengCanvasService';
import { beginWorkspaceSession } from '../workspaceSession';

vi.mock('../runtimeConfig', () => ({ getRuntimeConfig: () => ({ jimengApiBaseUrl: 'http://localhost:8000/' }) }));
vi.mock('../pythonBackendAuth', () => ({ getPythonBackendAuthHeadersForUrl: () => ({ 'X-Canva-Banana-Desktop-Nonce': 'fixture-nonce' }) }));

const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const job = (phase: string, extra: Record<string, unknown> = {}) => ({ id: 'job-1', mediaType: 'image', phase, ...extra });
const spec: JimengCanvasJobSpec = { requestId: 'request-1', workspaceKey: 'workspace-1', mediaType: 'image', model: 'seedream_5.5', mode: 'i2i', prompt: 'Paint the river', resolution: '2K', count: 2 };

describe('Jimeng Canvas transport and approval', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    fetchMock.mockReset();
  });

  it('uses authenticated local actions for setup and protected asset downloads', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ cliAvailable: true, authenticated: true, version: '1.4.1' }));
    await expect(getJimengCanvasSetupStatus()).resolves.toEqual({ cliAvailable: true, authenticated: true, version: '1.4.1', legacyCliInstallations: [] });
    fetchMock.mockResolvedValueOnce(new Response('image-bytes', { headers: { 'Content-Type': 'image/png' } }));
    const asset = await fetchJimengCanvasAsset({ jobId: 'job/1', assetId: 'asset/1' });
    expect(asset.type).toBe('image/png');
    expect(await asset.text()).toBe('image-bytes');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/jimeng/canvas/jobs/job%2F1/assets/asset%2F1');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toMatchObject({ 'X-Canva-Banana-Local-Action': 'jimeng-setup', 'X-Canva-Banana-Desktop-Nonce': 'fixture-nonce' });
    }
  });

  it('parses legacy installations and sends only the selected location in a protected POST', async () => {
    const legacyCliInstallations = [{ location: 'home', path: '/user/.local/bin/dreamina' }];
    fetchMock.mockResolvedValueOnce(jsonResponse({ cliAvailable: false, authenticated: false, legacyCliInstallations }));
    await expect(getJimengCanvasSetupStatus()).resolves.toMatchObject({ legacyCliInstallations });
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok', message: 'Legacy Dreamina CLI removed.' }));
    await expect(removeJimengLegacyCli({ location: 'home' })).resolves.toMatchObject({ status: 'ok' });
    expect(fetchMock.mock.calls[1]).toEqual([
      'http://localhost:8000/api/jimeng/canvas/setup/legacy-cli/home/remove',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Canva-Banana-Local-Action': 'jimeng-setup', 'X-Canva-Banana-Desktop-Nonce': 'fixture-nonce' },
      }),
    ]);
    expect(fetchMock.mock.calls[1][1]?.body).toBeUndefined();
  });

  it('prepares a request with stable identity and ordered references without approval', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(job('preparing')));
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const last = new File(['last'], 'last.png', { type: 'image/png' });
    await prepareJimengCanvasJob({ spec, files: [first, last] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/jimeng/canvas/jobs');
    expect(init?.method).toBe('POST');
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error('Expected multipart upload');
    expect(body.get('spec')).toBe(JSON.stringify(spec));
    expect(body.getAll('files')).toEqual([first, last]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not spend or poll past a quote without an approval callback', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(job('awaiting_approval', { quote: { revision: 'r1', credits: 2.75 } })));
    const result = await waitForJimengCanvasJob({ jobId: 'job-1' });
    expect(result.phase).toBe('awaiting_approval');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it('resumes preparation with the saved job ID and waits for credit approval', async () => {
    const quote = job('awaiting_approval', { quote: { revision: 'r1', credits: 4 } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(quote))
      .mockResolvedValueOnce(jsonResponse(job('cancelled')));
    const requestApproval = vi.fn(async () => 'cancel' as const);

    await expect(runJimengCanvasGeneration({
      resumeJobId: 'job-1', requestApproval, onUpdate: vi.fn(),
    })).rejects.toBeInstanceOf(JimengCanvasCancelled);
    const requests = fetchMock.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method, init?.body]);
    expect(requests).toEqual([
      ['/api/jimeng/canvas/jobs/job-1/resume-preparation', 'POST', undefined],
      ['/api/jimeng/canvas/jobs/job-1/cancel', 'POST', undefined],
    ]);
    expect(requestApproval).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ quote: { revision: 'r1', credits: 4 } }));
  });

  it('requires another user decision when approval returns a changed quote', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(job('awaiting_approval', { quote: { revision: 'r1', credits: 2 } })))
      .mockResolvedValueOnce(jsonResponse(job('awaiting_approval', { quote: { revision: 'r2', credits: 4 } })))
      .mockResolvedValueOnce(jsonResponse(job('cancelled')));
    const decision = vi.fn<(value: unknown) => Promise<'approve' | 'cancel'>>()
      .mockResolvedValueOnce('approve')
      .mockResolvedValueOnce('cancel');
    const result = await waitForJimengCanvasJob({ jobId: 'job-1', onApprovalRequired: decision });
    expect(result.phase).toBe('cancelled');
    expect(decision).toHaveBeenCalledTimes(2);
    expect(decision.mock.calls[1][0]).toMatchObject({ quote: { revision: 'r2', credits: 4 } });
    expect(fetchMock.mock.calls[1][0]).toContain('/approve');
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ revision: 'r1' }));
    expect(fetchMock.mock.calls[2][0]).toContain('/cancel');
  });

  it('stops pending approval when the workspace closes', async () => {
    const closeWorkspace = beginWorkspaceSession();
    fetchMock.mockResolvedValueOnce(jsonResponse(job('awaiting_approval', { quote: { revision: 'r1', credits: 2 } })));
    let sawApproval: () => void = () => undefined;
    const approvalShown = new Promise<void>(resolve => { sawApproval = resolve; });
    const result = waitForJimengCanvasJob({
      jobId: 'job-1',
      onApprovalRequired: () => {
        sawApproval();
        return new Promise(() => undefined);
      },
    });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await approvalShown;
    closeWorkspace();
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops status polling when the workspace closes', async () => {
    vi.useFakeTimers();
    const closeWorkspace = beginWorkspaceSession();
    fetchMock.mockResolvedValue(jsonResponse(job('recovering')));
    let sawUpdate: () => void = () => undefined;
    const update = new Promise<void>(resolve => { sawUpdate = resolve; });
    const result = waitForJimengCanvasJob({ jobId: 'job-1', onUpdate: () => sawUpdate() });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await update;
    closeWorkspace();
    await rejection;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['recovering', 'preparing'])('bounds consecutive %s observations and preserves the job identity', async phase => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => jsonResponse(job(phase)));
    const onUpdate = vi.fn();
    const result = waitForJimengCanvasJob({ jobId: 'job-1', onUpdate });
    const rejection = expect(result).rejects.toThrow('Retry to continue the same job.');

    await vi.advanceTimersByTimeAsync(59_000);
    expect(onUpdate).toHaveBeenCalledTimes(60);
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;

    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job-1', phase }));
    expect(fetchMock).toHaveBeenCalledTimes(60);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe('http://localhost:8000/api/jimeng/canvas/jobs/job-1');
      expect(init?.method).toBeUndefined();
    }
  });

  it('bounds a recovery request that never returns', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const result = waitForJimengCanvasJob({
      jobId: 'job-1',
      initialJob: { id: 'job-1', phase: 'recovering', mediaType: 'image', assets: [] },
    });
    const rejection = expect(result).rejects.toThrow('Retry to continue the same job.');
    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('resets the recovery window when a job returns to running', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(job('recovering')))
      .mockResolvedValueOnce(jsonResponse(job('running')))
      .mockResolvedValueOnce(jsonResponse(job('recovering')))
      .mockResolvedValueOnce(jsonResponse(job('recovering')))
      .mockResolvedValueOnce(jsonResponse(job('completed')));
    const result = waitForJimengCanvasJob({ jobId: 'job-1', pollIntervalMs: 29_000 });
    const completion = expect(result).resolves.toMatchObject({ id: 'job-1', phase: 'completed' });

    await vi.advanceTimersByTimeAsync(116_000);
    await completion;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('keeps waiting for running jobs beyond the recovery window', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(job('running')))
      .mockResolvedValueOnce(jsonResponse(job('running')))
      .mockResolvedValueOnce(jsonResponse(job('completed')));
    const result = waitForJimengCanvasJob({ jobId: 'job-1', pollIntervalMs: 60_000 });
    const completion = expect(result).resolves.toMatchObject({ id: 'job-1', phase: 'completed' });

    await vi.advanceTimersByTimeAsync(120_000);
    await completion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects approval phases with missing or invalid prices', async () => {
    for (const quote of [undefined, { revision: 'r1', credits: -1 }, { revision: '', credits: 2 }]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(job('awaiting_approval', { quote })));
      await expect(getJimengCanvasJob({ jobId: 'job-1' })).rejects.toMatchObject({ kind: 'jimeng_canvas_error', code: 'invalid_response' });
    }
  });

  it('returns structured HTTP failures with backend detail', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Sign in to Jimeng Canvas first.' }, 401));
    await expect(getJimengCanvasCatalog({ kind: 'image' })).rejects.toMatchObject({ kind: 'jimeng_canvas_error', code: 'http', status: 401, message: 'Sign in to Jimeng Canvas first.' });
  });

  it('normalizes the authenticated Seedream catalog with exact settings', async () => {
    const fixture: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'src/services/__tests__/fixtures/jimeng-canvas-image-catalog.json'), 'utf8'));
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));
    const [model] = await getJimengCanvasCatalog({ kind: 'image' });
    expect(model.model).toBe('seedream_5.5');
    expect(model.modes.map(mode => mode.name)).toEqual(['i2i', 't2i']);
    expect(model.modes[0].references).toMatchObject({ min: 1, max: 10 });
    expect(model.modes[0].flags.find(flag => flag.flag === '--resolution')?.values).toEqual(['1.5K', '2K']);
    expect(model.modes[0].flags.find(flag => flag.flag === '--count')).toMatchObject({ min: 1, max: 8 });
  });

  it('preserves first and last frame scenarios and normalizes omitted aliases', async () => {
    const fixture: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'src/services/__tests__/fixtures/jimeng-canvas-video-catalog.json'), 'utf8'));
    if (!fixture || typeof fixture !== 'object' || !('items' in fixture) || !Array.isArray(fixture.items)) throw new Error('Invalid fixture');
    const item: unknown = fixture.items[0];
    if (!item || typeof item !== 'object') throw new Error('Invalid model');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { items: [{ ...item, aliases: undefined }] } }));
    const [model] = await getJimengCanvasCatalog({ kind: 'video' });
    expect(model.aliases).toEqual([]);
    expect(model.modes.filter(mode => mode.name === 'first_last_frame').map(mode => mode.references?.max)).toEqual([2, 1]);
    const multimodal = model.modes.find(mode => mode.name === 'm2v');
    expect(multimodal?.references?.types.map(type => type.mediaType)).toEqual(['image', 'video', 'audio']);
  });
});
