import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberJimengCanvasJob } from '../../services/jimengCanvasRecovery';
import { SEEDREAM_55_JIMENG_CANVAS_MODEL_ID } from '../../services/seedream55Config';
import { FAL_QUEUE_COMPLETED_AUTO_DISMISS_MS, useFalQueueJobs } from '../useFalQueueJobs';

describe('useFalQueueJobs', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('restores a placed Canvas job on remount until the user dismisses it', () => {
    vi.useFakeTimers();
    const id = '01234567-89ab-4cde-8fab-0123456789ab';
    const inputs = {
      kind: 'image_edit', modelMode: 'image', modelId: SEEDREAM_55_JIMENG_CANVAS_MODEL_ID,
      provider: 'jimeng', prompt: 'Saved edit', primaryImageId: 'old-source',
    } as const;
    const original = renderHook(() => useFalQueueJobs());
    rememberJimengCanvasJob({ id, phase: 'awaiting_approval', mediaType: 'image', assets: [], quote: { revision: 'r1', credits: 3 } }, inputs, 'Original.bcsnap');
    act(() => original.result.current.setFalJobs([{
      id, providerJobId: id, status: 'COMPLETED', provider: 'jimeng', prompt: inputs.prompt,
      modelId: inputs.modelId, modelLabel: 'Seedream 5.5', logs: [], createdAt: 1, updatedAt: 1,
    }]));
    act(() => vi.advanceTimersByTime(FAL_QUEUE_COMPLETED_AUTO_DISMISS_MS));
    expect(original.result.current.falJobs).toHaveLength(1);
    original.unmount();

    const restored = renderHook(() => useFalQueueJobs());
    expect(restored.result.current.falJobs).toEqual([expect.objectContaining({
      id, providerJobId: id, jimengCanvasDocumentName: 'Original.bcsnap',
      status: 'FAILED', retryInputs: expect.objectContaining(inputs),
    })]);
    act(() => restored.result.current.dismissFalJob(id));
    restored.unmount();
    expect(renderHook(() => useFalQueueJobs()).result.current.falJobs).toEqual([]);
  });

  it('permits results to load when storage fails after approval', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    const inputs = {
      kind: 'text_to_image', modelMode: 'image', modelId: SEEDREAM_55_JIMENG_CANVAS_MODEL_ID,
      provider: 'jimeng', prompt: 'Saved image',
    } as const;
    const job = { id: 'saved-job', mediaType: 'image', assets: [] } as const;
    try {
      expect(() => rememberJimengCanvasJob({ ...job, assets: [], phase: 'completed' }, inputs)).not.toThrow();
      expect(() => rememberJimengCanvasJob({
        ...job, assets: [], phase: 'awaiting_approval', quote: { revision: 'r1', credits: 3 },
      }, inputs)).toThrow('Could not save Jimeng Canvas recovery details.');
    } finally {
      read.mockRestore();
    }
  });

  it('auto-dismisses completed jobs after the notification window', () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useFalQueueJobs());

    act(() => {
      result.current.setFalJobs([{
        id: 'completed-job',
        prompt: 'Prompt',
        modelId: 'model',
        modelLabel: 'Model',
        provider: 'volcengine',
        status: 'COMPLETED',
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }]);
    });

    act(() => {
      vi.advanceTimersByTime(FAL_QUEUE_COMPLETED_AUTO_DISMISS_MS - 1);
    });

    expect(result.current.falJobs).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.falJobs).toHaveLength(0);
  });

  it('keeps in-progress and failed jobs in the queue', () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useFalQueueJobs());

    act(() => {
      result.current.setFalJobs([
        {
          id: 'in-progress-job',
          prompt: 'Prompt',
          modelId: 'model',
          modelLabel: 'Model',
          provider: 'volcengine',
          status: 'IN_PROGRESS',
          logs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'failed-job',
          prompt: 'Prompt',
          modelId: 'model',
          modelLabel: 'Model',
          provider: 'volcengine',
          status: 'FAILED',
          logs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.falJobs).toHaveLength(2);
    expect(result.current.falJobs.map(job => job.status)).toEqual(['IN_PROGRESS', 'FAILED']);
  });
});
