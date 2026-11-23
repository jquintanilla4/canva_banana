import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { subscribeFalImage } from '../fal/queue';
import { addDebugLog } from '../debugLog';

vi.mock('@fal-ai/client', () => ({ fal: { subscribe: vi.fn() } }));
vi.mock('../debugLog', () => ({ addDebugLog: vi.fn() }));

const result = (requestId = '') => ({ data: { images: [] }, requestId }) as Awaited<ReturnType<typeof fal.subscribe>>;
const queued = (requestId = '') => ({
  status: 'IN_QUEUE' as const, request_id: requestId,
  queue_position: 2, response_url: '', status_url: '', cancel_url: '',
});

describe('Fal image subscription lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('normalizes callbacks and retains the last queue request ID through the result', async () => {
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_modelId, options) => {
      options.onQueueUpdate?.(queued());
      options.onQueueUpdate?.(queued('accepted'));
      options.onQueueUpdate?.({ ...queued(), status: 'IN_PROGRESS', logs: [{ message: 'working', level: 'INFO', source: 'USER', timestamp: '2026-11-23T00:00:00Z' }] });
      return result();
    });
    const onQueueUpdate = vi.fn();
    const onPhaseUpdate = vi.fn();
    const controller = new AbortController();
    expect(await subscribeFalImage('fal-ai/test', { prompt: 'image' }, {
      onQueueUpdate, onPhaseUpdate, abortSignal: controller.signal,
    })).toEqual({ data: { images: [] }, requestId: 'accepted' });
    expect(fal.subscribe).toHaveBeenCalledWith('fal-ai/test', expect.objectContaining({
      input: { prompt: 'image' }, logs: true, abortSignal: controller.signal,
    }));
    expect(onQueueUpdate.mock.calls.map(([update]) => update.requestId)).toEqual(['', 'accepted', 'accepted']);
    expect(onQueueUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ logs: [{ message: 'working' }] }));
    expect(onPhaseUpdate.mock.calls.map(([update]) => update.phase)).toEqual(['submitting', 'queued', 'queued', 'processing']);
    expect(onPhaseUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ requestId: 'accepted' }));
    expect(vi.mocked(addDebugLog).mock.calls.map(([entry]) => entry.message)).toEqual([
      'Phase: submitting', 'Outbound request (fal.subscribe)', 'Phase: queued', 'Queue update',
      'Phase: queued', 'Queue update', 'Phase: processing', 'Queue update', 'Result received',
    ]);
  });

  it.each([false, true])('preserves phase and accepted request ID on provider failure: %s', async accepted => {
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_modelId, options) => {
      if (accepted) options.onQueueUpdate?.(queued('accepted'));
      throw new Error('provider unavailable');
    });
    await expect(subscribeFalImage('fal-ai/test', {}, {})).rejects.toMatchObject({
      message: 'provider unavailable', phase: accepted ? 'processing' : 'submitting',
      requestId: accepted ? 'accepted' : undefined,
    });
    expect(addDebugLog).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 'error', message: 'Request failed' }));
  });

  it('suppresses late callbacks and preserves the original abort error', async () => {
    const controller = new AbortController();
    const onQueueUpdate = vi.fn();
    const stopped = new Error('Stopped');
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_modelId, options) => {
      controller.abort(stopped);
      options.onQueueUpdate?.(queued('late'));
      throw new Error('provider abort error');
    });
    await expect(subscribeFalImage('fal-ai/test', {}, { abortSignal: controller.signal, onQueueUpdate })).rejects.toBe(stopped);
    expect(onQueueUpdate).not.toHaveBeenCalled();
  });
});
