import React, { useEffect, useRef, useState } from 'react';
import type { FalQueueJob } from '../types';
import { isSuppressedFalLogMessage } from '../services/falConstants';
import { getBlindTestModelLabel, getOpenSourceAliasLabel, type BlindTestMapping } from '../services/blindTestService';
import { getFalModelLabel, isFalModelId } from '../services/modelConfig';
import { ChevronDownIcon, RerunIcon } from './Icons';

interface FalQueuePanelProps {
  jobs: FalQueueJob[];
  onDismiss: (jobId: string) => void;
  onRetry: (jobId: string) => boolean | Promise<boolean>;
  blindTestEnabled: boolean;
  openSourceAliasEnabled: boolean;
  blindTestMapping: BlindTestMapping;
}

const statusStyles: Record<FalQueueJob['status'], string> = {
  IN_QUEUE: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  COMPLETED: 'bg-green-500/20 text-green-300 border border-green-500/40',
  FAILED: 'bg-red-500/20 text-red-300 border border-red-500/40',
};

const statusLabels: Record<FalQueueJob['status'], string> = {
  IN_QUEUE: 'Queued',
  IN_PROGRESS: 'Processing',
  COMPLETED: 'Done',
  FAILED: 'Failed',
};

const phaseLabels: Record<NonNullable<FalQueueJob['phase']>, string> = {
  uploading: 'Uploading',
  submitting: 'Submitting',
  queued: 'Queued',
  processing: 'Processing',
  downloading: 'Downloading',
  completed: 'Done',
  failed: 'Failed',
}; // User-facing queue phase labels.

const getProviderLabel = (provider: FalQueueJob['provider']): string => {
  if (provider === 'volcengine') {
    return 'VOLCENGINE';
  }
  if (provider === 'jimeng') {
    return 'JIMENG';
  }
  return 'FAL'; // Google jobs do not use this queue today, but keep the fallback readable.
};

export const FalQueuePanel: React.FC<FalQueuePanelProps> = ({
  jobs,
  onDismiss,
  onRetry,
  blindTestEnabled,
  openSourceAliasEnabled,
  blindTestMapping,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [retryingJobIds, setRetryingJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const jobsRef = useRef(jobs); // Tracks latest rows during async retry cleanup.
  const hasActiveJob = jobs.some(job => job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS'); // Active jobs should keep progress visible.
  const unlockRetry = (jobId: string) => {
    setRetryingJobIds(prev => {
      const next = new Set(prev);
      next.delete(jobId);
      return next.size === prev.size ? prev : next;
    });
  };
  const isFailedJob = (jobId: string) => {
    const job = jobsRef.current.find(candidate => candidate.id === jobId);
    return job?.status === 'FAILED';
  };

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    if (jobs.length === 0 || hasActiveJob) {
      setIsCollapsed(false);
    }
  }, [hasActiveJob, jobs.length]); // New or active queue sessions should reopen with visible progress.

  useEffect(() => {
    setRetryingJobIds(prev => {
      const failedJobIds = new Set(jobs.filter(job => job.status === 'FAILED').map(job => job.id));
      const next = new Set([...prev].filter(jobId => failedJobIds.has(jobId)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]); // Clear retry locks after the row leaves failed state.

  if (jobs.length === 0) {
    return null;
  }

  // Keep the latest requests at the top so users can watch active generations.
  const sortedJobs = [...jobs].sort((a, b) => b.createdAt - a.createdAt);
  const jobCountLabel = `${jobs.length} job${jobs.length === 1 ? '' : 's'}`;

  if (isCollapsed) {
    return (
      <aside className="absolute bottom-28 right-4 z-20 w-80 max-w-[calc(100vw-2rem)]">
        <div className="rounded-lg border border-gray-700/60 bg-gray-900/80 p-3 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-gray-300">Queue Notifications</h2>
              <span className="text-xs text-gray-400">{jobCountLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              aria-label="Expand queue notifications"
              aria-expanded={false}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-700/70 text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
            >
              <ChevronDownIcon className="h-3 w-3 rotate-180" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="absolute bottom-28 right-4 z-20 w-80 max-w-[calc(100vw-2rem)]">
      <div className="rounded-lg border border-gray-700/60 bg-gray-900/80 p-3 shadow-2xl backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-gray-300">Queue Notifications</h2>
            <span className="text-xs text-gray-400">{jobCountLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse queue notifications"
            aria-expanded={true}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-700/70 text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
          >
            <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
        <ul className="max-h-[calc(100dvh-13rem)] space-y-2 overflow-y-auto pr-1">
          {sortedJobs.map(job => {
            const lastLog = [...job.logs].reverse().find(log => !isSuppressedFalLogMessage(log));
            const isRetrying = retryingJobIds.has(job.id);
            const displayModelLabel = (() => {
              if (job.provider !== 'fal') {
                return job.modelLabel;
              }
              if (!blindTestEnabled && !openSourceAliasEnabled) {
                return job.modelLabel;
              }
              if (!isFalModelId(job.modelId)) {
                return job.modelLabel;
              }
              const baseLabel = getFalModelLabel(job.modelId);
              const suffix = job.modelLabel.startsWith(baseLabel) ? job.modelLabel.slice(baseLabel.length) : '';
              if (blindTestEnabled) {
                return `${getBlindTestModelLabel(job.modelId, blindTestMapping)}${suffix}`;
              }
              const alias = getOpenSourceAliasLabel(job.modelId);
              if (alias) {
                return `${alias}${suffix}`;
              }
              return job.modelLabel;
            })();
            return (
              <li key={job.id} className="bg-gray-800/70 rounded-md border border-gray-700/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-100 font-medium leading-snug break-words">
                      {displayModelLabel}
                    </p>
                    {job.requestId && (
                      <p className="text-[11px] text-gray-400 mt-1 break-all">
                        Generation ID: {job.requestId}
                      </p>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">
                      {getProviderLabel(job.provider)}
                    </p>
                  </div>
                  <span className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${statusStyles[job.status]}`}>
                    {job.phase ? phaseLabels[job.phase] : statusLabels[job.status]}
                  </span>
                </div>
                {job.phaseMessage && (
                  <p className="text-[11px] text-gray-300 mt-2 leading-snug">
                    {job.phaseMessage}
                  </p>
                )}
                {lastLog && (
                  <p className="text-[11px] text-gray-300 mt-2 leading-snug">
                    {lastLog}
                  </p>
                )}
                {job.error && (
                  <p className="text-[11px] text-red-300 mt-2 leading-snug">
                    {job.error}
                  </p>
                )}
                {job.status === 'COMPLETED' && job.outputUrl && (
                  <a
                    href={job.outputUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-300 hover:text-blue-200 transition-colors block mt-2 break-all"
                  >
                    Open result
                  </a>
                )}
                {job.status === 'COMPLETED' && job.description && (
                  <p className="text-[11px] text-gray-300 mt-2 leading-snug">
                    {job.description}
                  </p>
                )}
                {(job.status === 'COMPLETED' || job.status === 'FAILED') && (
                  <div className="mt-2 flex items-center gap-3">
                    {job.status === 'FAILED' && job.retryInputs && (
                      <button
                        type="button"
                        onClick={() => {
                          setRetryingJobIds(prev => new Set(prev).add(job.id));
                          void (async () => {
                            try {
                              const retryStarted = await onRetry(job.id);
                              if (!retryStarted || isFailedJob(job.id)) {
                                unlockRetry(job.id);
                              }
                            } catch (error) {
                              console.error(error);
                              unlockRetry(job.id);
                            }
                          })();
                        }}
                        disabled={isRetrying}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-300 transition-colors hover:text-blue-200 disabled:cursor-not-allowed disabled:text-gray-500"
                      >
                        <RerunIcon className="h-3 w-3" aria-hidden="true" />
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismiss(job.id)}
                      className="text-[11px] text-gray-400 transition-colors hover:text-gray-200"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
};
