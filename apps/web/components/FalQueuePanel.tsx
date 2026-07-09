import React from 'react';
import type { FalQueueJob } from '../types';
import { isSuppressedFalLogMessage } from '../services/falConstants';
import { getBlindTestModelLabel, getOpenSourceAliasLabel, type BlindTestMapping } from '../services/blindTestService';
import { getFalModelLabel, isFalModelId } from '../services/modelConfig';

interface FalQueuePanelProps {
  jobs: FalQueueJob[];
  onDismiss: (jobId: string) => void;
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
  blindTestEnabled,
  openSourceAliasEnabled,
  blindTestMapping,
}) => {
  if (jobs.length === 0) {
    return null;
  }

  // Keep the latest requests at the top so users can watch active generations.
  const sortedJobs = [...jobs].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <aside className="absolute bottom-28 right-4 z-20 w-80 max-w-[calc(100vw-2rem)]">
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700/60 p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-300">Generation Queue</h2>
          <span className="text-xs text-gray-400">{jobs.length} job{jobs.length === 1 ? '' : 's'}</span>
        </div>
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {sortedJobs.map(job => {
            const lastLog = [...job.logs].reverse().find(log => !isSuppressedFalLogMessage(log));
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
                  <button
                    type="button"
                    onClick={() => onDismiss(job.id)}
                    className="mt-2 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Dismiss
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
};
