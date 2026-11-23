import type { CanvasImage } from '../types';
import { isArkIdentifier, normalizeVolcengineDraft, type VolcengineDraft, type VolcengineFinalization, type VolcengineFinalResolution } from './volcengineSettings';

export const hasVolcengineFinalVideo = (
  images: readonly CanvasImage[],
  draftId: string,
  resolution: VolcengineFinalResolution,
) => images.some(image => image.mediaType === 'video'
  && image.metadata?.generation?.volcengineFinalizedFrom === draftId
  && image.metadata.generation.volcengineOptions?.seedance2Resolution === resolution);

const keyFor = (draft: VolcengineDraft, resolution: VolcengineFinalResolution) =>
  `canva-banana:ark-finalization:${draft.requestId}:${resolution}`;

const activeDraftOperations = new Set<string>();

export const withDraftFinalizationLock = async (
  draft: VolcengineDraft,
  resolution: VolcengineFinalResolution,
  operation: () => void | Promise<void>,
): Promise<boolean> => {
  const key = keyFor(draft, resolution);
  if (navigator.locks) {
    return navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock) return false;
      await operation();
      return true;
    });
  }
  if (activeDraftOperations.has(key)) return false;
  activeDraftOperations.add(key);
  try {
    await operation();
    return true;
  } finally {
    activeDraftOperations.delete(key);
  }
};

type ActiveFinalization = Exclude<VolcengineFinalization, { kind: 'rejected' }>;
export type VolcengineDraftJournalUpdate = 'submission' | 'restore';

const readDraftJournal = (draft: VolcengineDraft, resolution: VolcengineFinalResolution) => {
  try {
    const raw = localStorage.getItem(keyFor(draft, resolution));
    if (!raw) return undefined;
    const entry: unknown = JSON.parse(raw);
    const journal = normalizeVolcengineDraft(entry);
    if (journal?.requestId !== draft.requestId || Date.now() >= journal.expiresAt + 7 * 86400000) return undefined;

    const task = journal.finalizations?.[resolution];
    const unavailableRequestIds = entry && typeof entry === 'object' && 'unavailableRequestIds' in entry && Array.isArray(entry.unavailableRequestIds)
      ? entry.unavailableRequestIds.filter(isArkIdentifier)
      : [];
    if (task?.kind === 'rejected' && task.requestId) unavailableRequestIds.push(task.requestId);
    return { task, unavailableRequestIds };
  } catch {
    return undefined;
  }
};

export const getSavedDraftFinalization = (draft: VolcengineDraft, resolution: VolcengineFinalResolution): ActiveFinalization | undefined => {
  const inSnapshot = draft.finalizations?.[resolution];
  const journal = readDraftJournal(draft, resolution);
  const task = journal?.task;
  if (inSnapshot?.kind === 'completed' && !journal?.unavailableRequestIds.includes(inSnapshot.requestId)) return inSnapshot;
  if (task?.kind === 'rejected') return undefined;
  if (task) return task;
  return inSnapshot?.kind === 'rejected' ? undefined : inSnapshot;
};

export const wasDraftFinalizationUnavailable = (draft: VolcengineDraft, resolution: VolcengineFinalResolution, requestId: string): boolean => {
  const task = draft.finalizations?.[resolution];
  return (task?.kind === 'rejected' && task.requestId === requestId)
    || readDraftJournal(draft, resolution)?.unavailableRequestIds.includes(requestId) === true;
};

export const saveDraftFinalization = (
  draft: VolcengineDraft,
  resolution: VolcengineFinalResolution,
  task: VolcengineFinalization,
  update: VolcengineDraftJournalUpdate = 'submission',
) => {
  try {
    const journal = readDraftJournal(draft, resolution);
    const current = journal?.task;
    const unavailableRequestIds = new Set(journal?.unavailableRequestIds);
    if (task.kind === 'rejected' && task.requestId) unavailableRequestIds.add(task.requestId);
    if (task.kind === 'completed') unavailableRequestIds.delete(task.requestId);
    const preserveCurrent = (task.kind === 'rejected' || update === 'restore') && 'requestId' in task && task.requestId
      && current && current.kind !== 'rejected'
      && (current.kind === 'submitting' || current.requestId !== task.requestId);
    localStorage.setItem(keyFor(draft, resolution), JSON.stringify({
      requestId: draft.requestId, expiresAt: draft.expiresAt,
      finalizations: { [resolution]: preserveCurrent ? current : task },
      unavailableRequestIds: [...unavailableRequestIds],
    }));
  } catch {
    return;
  }
};
