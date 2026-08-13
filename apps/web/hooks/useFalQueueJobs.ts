import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FalQueueJob } from '../types';

export const FAL_QUEUE_COMPLETED_AUTO_DISMISS_MS = 10_000; // Leave completed queue rows visible long enough to notice.

type UseFalQueueJobsResult = {
  falJobs: FalQueueJob[];
  setFalJobs: Dispatch<SetStateAction<FalQueueJob[]>>;
  dismissFalJob: (jobId: string) => void;
  invalidateJobOutputs: (providerJobIds: string[]) => void;
};

export function useFalQueueJobs(): UseFalQueueJobsResult {
  const [falJobs, setFalJobs] = useState<FalQueueJob[]>([]);
  const autoDismissTimeouts = useRef<Map<string, number>>(new Map());

  const dismissFalJob = useCallback((jobId: string) => {
    const timeoutId = autoDismissTimeouts.current.get(jobId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      autoDismissTimeouts.current.delete(jobId);
    }
    setFalJobs(prev => prev.filter(job => job.id !== jobId));
  }, []);

  const invalidateJobOutputs = useCallback((providerJobIds: string[]) => {
    if (providerJobIds.length === 0) {
      return;
    }
    const invalidatedIds = new Set(providerJobIds);
    setFalJobs(previous => {
      let changed = false;
      const next = previous.map(job => {
        if (!job.providerJobId || !invalidatedIds.has(job.providerJobId) || !job.outputUrl) {
          return job;
        }
        const nextJob = { ...job };
        delete nextJob.outputUrl;
        changed = true;
        return nextJob;
      });
      return changed ? next : previous;
    });
  }, []);

  useEffect(() => {
    const timeoutMap = autoDismissTimeouts.current;

    timeoutMap.forEach((timeoutId, jobId) => {
      const job = falJobs.find(j => j.id === jobId);
      if (!job || job.status !== 'COMPLETED') {
        window.clearTimeout(timeoutId);
        timeoutMap.delete(jobId);
      }
    });

    falJobs.forEach(job => {
      if (job.status !== 'COMPLETED') {
        return;
      }
      if (timeoutMap.has(job.id)) {
        return;
      }
      const timeoutId = window.setTimeout(() => {
        timeoutMap.delete(job.id);
        setFalJobs(prev => prev.filter(j => j.id !== job.id));
      }, FAL_QUEUE_COMPLETED_AUTO_DISMISS_MS);
      timeoutMap.set(job.id, timeoutId);
    });
  }, [falJobs]);

  useEffect(() => {
    return () => {
      autoDismissTimeouts.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      autoDismissTimeouts.current.clear();
    };
  }, []);

  return { falJobs, setFalJobs, dismissFalJob, invalidateJobOutputs };
}
