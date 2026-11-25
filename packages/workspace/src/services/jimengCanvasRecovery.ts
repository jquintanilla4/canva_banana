import type { FalQueueJob, GenerationInputs } from '../types';
import type { JimengCanvasJob } from './jimengCanvasService';
import { JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_SEEDANCE_25_VIDEO_MODEL_ID } from './modelConfig';
import { workspaceStorageKey } from './runtimeConfig';
import { SEEDREAM_55_JIMENG_CANVAS_MODEL_ID } from './seedream55Config';
import { normalizeSnapshotImageMetadata } from './snapshotService';

const storagePrefix = () => workspaceStorageKey('jimeng-canvas-recovery:');

export const getJimengCanvasResumeId = (job: FalQueueJob): string | undefined =>
  job.provider === 'jimeng' ? job.providerJobId : undefined;

export const keepsJimengCanvasQueueRow = (job: FalQueueJob): boolean =>
  Boolean(getJimengCanvasResumeId(job) || job.jimengCanvasAttemptId);

export const forgetJimengCanvasJob = (jobId: string): void => {
  try {
    window.localStorage.removeItem(storagePrefix() + jobId);
  } catch {
    return;
  }
};

export const rememberJimengCanvasJob = (job: JimengCanvasJob, inputs: GenerationInputs, documentName?: string): void => {
  if (job.phase === 'failed' || job.phase === 'cancelled') {
    forgetJimengCanvasJob(job.id);
    return;
  }
  const key = storagePrefix() + job.id;
  try {
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, JSON.stringify({ inputs, documentName }));
    }
  } catch {
    if (job.phase === 'awaiting_approval') {
      throw new Error('Could not save Jimeng Canvas recovery details. Check local storage and resume this job.');
    }
  }
};

const restoreJob = (id: string, stored: string): FalQueueJob | undefined => {
  try {
    const record = JSON.parse(stored);
    const documentName = typeof record?.documentName === 'string' ? record.documentName : undefined;
    const inputs = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: record?.inputs,
    })?.generation;
    if (inputs?.provider !== 'jimeng' || !inputs.modelId) return undefined;
    const isVideo = inputs.modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID || inputs.modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID;
    if (isVideo ? inputs.kind !== 'video' : inputs.modelId !== SEEDREAM_55_JIMENG_CANVAS_MODEL_ID
      || (inputs.kind !== 'text_to_image' && inputs.kind !== 'image_edit')) return undefined;
    const now = Date.now();
    return {
      id, providerJobId: id, provider: 'jimeng', modelId: inputs.modelId,
      ...(documentName ? { jimengCanvasDocumentName: documentName } : {}),
      modelLabel: inputs.modelLabel ?? inputs.modelId, prompt: inputs.prompt, retryInputs: inputs,
      status: 'FAILED', phaseMessage: documentName
        ? `Started on ${documentName}. Open it and choose Resume here.`
        : 'Started on an untitled canvas. Open the destination and choose Resume here.',
      logs: [], createdAt: now, updatedAt: now,
    };
  } catch {
    return undefined;
  }
};

export const restoreJimengCanvasJobs = (): FalQueueJob[] => {
  try {
    const prefix = storagePrefix();
    return Object.keys(window.localStorage).flatMap(key => {
      if (!key.startsWith(prefix)) return [];
      const stored = window.localStorage.getItem(key);
      const job = stored ? restoreJob(key.slice(prefix.length), stored) : undefined;
      return job ? [job] : [];
    });
  } catch {
    return [];
  }
};
