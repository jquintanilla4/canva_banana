import { describe, expect, it, vi, afterEach } from 'vitest';
import type { FalQueueJob } from '../../types';
import { applyJimengCanvasProgress, findJimengCanvasAttempt, runJimengCanvasGeneration } from '../jimengCanvasGeneration';
import type { JimengCanvasJob } from '../jimengCanvasService';

vi.mock('../runtimeConfig', () => ({ getRuntimeConfig: () => ({ jimengApiBaseUrl: 'http://localhost:8000/' }) }));
vi.mock('../pythonBackendAuth', () => ({ getPythonBackendAuthHeadersForUrl: () => ({}) }));

const queueJob: FalQueueJob = {
  id: 'queue-1',
  providerJobId: 'canvas-1',
  jimengCanvasAttemptId: 'canvas-1',
  prompt: 'Paint the river',
  modelId: 'seedream_5.5',
  modelLabel: 'Seedream 5.5',
  provider: 'jimeng',
  status: 'IN_PROGRESS',
  logs: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('Jimeng Canvas generation identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('clears provider identity after an authoritative backend failure', () => {
    expect(applyJimengCanvasProgress(queueJob, {
      id: 'canvas-1', mediaType: 'image', phase: 'failed', assets: [], message: 'Generation failed.',
    })).toMatchObject({ providerJobId: undefined, jimengCanvasAttemptId: undefined });
  });

  const resumablePhases: Exclude<JimengCanvasJob['phase'], 'awaiting_approval'>[] = ['preparing', 'submitting', 'running', 'recovering', 'completed', 'cancelled'];

  it.each(resumablePhases)('preserves provider identity for %s observations', phase => {
    expect(applyJimengCanvasProgress(queueJob, {
      id: 'canvas-1', mediaType: 'image', phase, assets: [],
    }).providerJobId).toBe('canvas-1');
  });

  it('preserves provider identity for an approval quote', () => {
    expect(applyJimengCanvasProgress(queueJob, {
      id: 'canvas-1', mediaType: 'image', phase: 'awaiting_approval', assets: [], quote: { revision: 'r1', credits: 4 },
    }).providerJobId).toBe('canvas-1');
  });

  it('keeps the resumable ID when observation fails with a transport error', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'canvas-1', mediaType: 'image', phase: 'recovering' })))
      .mockRejectedValueOnce(new TypeError('Connection closed'));
    vi.stubGlobal('fetch', fetchMock);
    let current = queueJob;

    await expect(runJimengCanvasGeneration({
      resumeJobId: 'canvas-1',
      requestApproval: async () => 'cancel',
      onUpdate: update => { current = applyJimengCanvasProgress(current, update); },
    })).rejects.toMatchObject({ code: 'transport' });

    expect(current.providerJobId).toBe('canvas-1');
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/jimeng/canvas/jobs/canvas-1/resume-preparation',
      '/api/jimeng/canvas/jobs/canvas-1',
    ]);
  });

  it('finds the stored attempt and only treats 404 as absence', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'canvas-1', mediaType: 'image', phase: 'preparing' })))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new TypeError('Connection closed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(findJimengCanvasAttempt('canvas-1')).resolves.toMatchObject({ id: 'canvas-1', phase: 'preparing' });
    await expect(findJimengCanvasAttempt('canvas-1')).resolves.toBeUndefined();
    await expect(findJimengCanvasAttempt('canvas-1')).rejects.toMatchObject({ code: 'transport' });
  });
});
