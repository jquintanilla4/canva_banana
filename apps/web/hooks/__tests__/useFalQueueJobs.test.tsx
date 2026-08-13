import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAL_QUEUE_COMPLETED_AUTO_DISMISS_MS, useFalQueueJobs } from '../useFalQueueJobs';

describe('useFalQueueJobs', () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it('removes only invalidated output links from completed jobs', () => {
    const { result } = renderHook(() => useFalQueueJobs());

    act(() => {
      result.current.setFalJobs([
        {
          id: 'client-deleted-output',
          providerJobId: 'backend-deleted-output',
          prompt: 'Prompt',
          modelId: 'model',
          modelLabel: 'Model',
          provider: 'jimeng',
          status: 'COMPLETED',
          outputUrl: 'http://localhost/deleted-output',
          logs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'client-remote-output',
          providerJobId: 'backend-remote-output',
          prompt: 'Prompt',
          modelId: 'model',
          modelLabel: 'Model',
          provider: 'jimeng',
          status: 'COMPLETED',
          outputUrl: 'http://localhost/remote-output',
          logs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    });
    act(() => {
      result.current.invalidateJobOutputs(['backend-deleted-output']);
    });

    expect(result.current.falJobs.find(job => job.id === 'client-deleted-output')?.outputUrl).toBeUndefined();
    expect(result.current.falJobs.find(job => job.id === 'client-remote-output')?.outputUrl).toBe('http://localhost/remote-output');
  });
});
