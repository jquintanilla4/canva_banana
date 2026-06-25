import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFalQueueJobs } from '../useFalQueueJobs';

describe('useFalQueueJobs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses completed jobs after one second', () => {
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
      vi.advanceTimersByTime(1000);
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
