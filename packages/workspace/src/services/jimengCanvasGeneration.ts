import type { FalQueueJob } from '../types';
import {
  fetchJimengCanvasAsset,
  getJimengCanvasJob,
  JimengCanvasRequestError,
  prepareJimengCanvasJob,
  resumeJimengCanvasPreparation,
  waitForJimengCanvasJob,
  type JimengCanvasJob,
  type JimengCanvasJobSpec,
} from './jimengCanvasService';

export type JimengCanvasQuoteJob = Extract<JimengCanvasJob, { phase: 'awaiting_approval' }>;
export type RequestJimengCanvasApproval = (job: JimengCanvasQuoteJob) => Promise<'approve' | 'cancel'>;

export class JimengCanvasCancelled extends Error {
  constructor() {
    super('Jimeng Canvas generation cancelled.');
  }
}

export const findJimengCanvasAttempt = async (jobId: string): Promise<JimengCanvasJob | undefined> => {
  try {
    return await getJimengCanvasJob({ jobId });
  } catch (error) {
    if (error instanceof JimengCanvasRequestError && error.status === 404) return undefined;
    throw error;
  }
};

export const applyJimengCanvasProgress = (job: FalQueueJob, update: JimengCanvasJob): FalQueueJob => ({
  ...job,
  providerJobId: update.phase === 'failed' ? undefined : update.id,
  ...(update.phase === 'failed' ? { jimengCanvasAttemptId: undefined } : {}),
  status: 'IN_PROGRESS',
  phase: update.phase === 'completed' ? 'downloading' : 'processing',
  phaseMessage: update.phase === 'awaiting_approval' ? 'Waiting for credit approval'
    : update.phase === 'recovering' ? 'Reconnecting to generation'
      : update.phase === 'completed' ? 'Preparing result' : 'Generating media',
  updatedAt: Date.now(),
});

type RunJimengCanvasGenerationOptions = {
  signal?: AbortSignal;
  requestApproval: RequestJimengCanvasApproval;
  onUpdate: (job: JimengCanvasJob) => void;
} & (
  | { resumeJobId: string; spec?: never; files?: never }
  | { resumeJobId?: undefined; spec: JimengCanvasJobSpec; files: File[] }
);

export const runJimengCanvasGeneration = async (options: RunJimengCanvasGenerationOptions) => {
  const { signal, requestApproval, onUpdate } = options;
  const jobId = options.resumeJobId ?? options.spec.requestId;
  const prepared = options.resumeJobId !== undefined
    ? await resumeJimengCanvasPreparation({ jobId, signal })
    : await prepareJimengCanvasJob({ spec: options.spec, files: options.files, signal }).catch(async error => {
      signal?.throwIfAborted();
      try {
        return await getJimengCanvasJob({ jobId, signal });
      } catch {
        throw error;
      }
    });
  if (prepared.phase === 'preparing' && prepared.message) {
    onUpdate(prepared);
    throw new Error(prepared.message);
  }
  const job = await waitForJimengCanvasJob({ jobId: prepared.id, initialJob: prepared, signal, onUpdate, onApprovalRequired: requestApproval });
  if (job.phase === 'cancelled') throw new JimengCanvasCancelled();
  if (job.phase !== 'completed') throw new Error(job.message || 'Jimeng Canvas generation failed.');
  const results: Array<{ id: string; blob: Blob }> = [];
  for (const asset of job.assets) {
    const blob = await fetchJimengCanvasAsset({ jobId: job.id, assetId: asset.id, signal });
    results.push({ id: asset.id, blob });
  }
  return { id: job.id, results };
};

export const readJimengCanvasImage = (blob: Blob, signal?: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Jimeng Canvas did not return an image.'));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read the Jimeng Canvas image.'));
  reader.readAsDataURL(blob);
});
