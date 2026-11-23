import { useEffect, useState } from 'react';
import { isArkIdentifier, type VolcengineDraft, type VolcengineFinalResolution } from '../services/volcengineSettings';
import type { CanvasImage } from '../types';
import { CANVAS_INTERACTION_BOUNDARY_PROPS } from '../utils/canvasInteractionBoundary';
import { getSavedDraftFinalization, hasVolcengineFinalVideo } from '../services/volcengineDraftJournal';

const resolutions: readonly VolcengineFinalResolution[] = ['1080p', '4k'];

export const VolcengineDraftActions = ({ draft, images, onRender, onClearPending }: {
  draft: VolcengineDraft;
  images: readonly CanvasImage[];
  onRender: (resolution: VolcengineFinalResolution, recoveryId?: string) => void;
  onClearPending?: (resolution: VolcengineFinalResolution) => void;
}) => {
  const [recovery, setRecovery] = useState<{ resolution: VolcengineFinalResolution; taskId: string; confirmClear?: boolean }>();
  const [now, updateTime] = useState(Date.now);
  const { expiresAt } = draft;
  useEffect(() => {
    if (now >= expiresAt) return;
    const delay = Math.min(2 ** 31 - 1, Math.max(0, expiresAt - Date.now()));
    const timer = window.setTimeout(() => updateTime(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, now]);

  return (
    <div {...CANVAS_INTERACTION_BOUNDARY_PROPS} className="relative">
      <div role="group" aria-label="Render Seedance Draft" className="flex shrink-0 items-center gap-1 rounded-md bg-gray-800 px-2 text-xs text-white shadow-lg">
        <span className="pr-1">Render final</span>
        {resolutions.map(resolution => {
          const task = getSavedDraftFinalization(draft, resolution);
          const displayResolution = resolution === '4k' ? '4K' : resolution;
          const expired = !task && now >= expiresAt;
          const onCanvas = hasVolcengineFinalVideo(images, draft.requestId, resolution);
          const disabled = onCanvas || expired;
          const label = onCanvas ? displayResolution
            : task?.kind === 'submitting' ? `Recover ${displayResolution}`
            : task?.kind === 'completed' ? `Restore ${displayResolution}`
            : task?.kind === 'submitted' ? `Resume ${displayResolution}`
            : displayResolution;
          const title = onCanvas ? `${displayResolution} final video is already on the canvas`
            : expired ? 'This Draft has expired'
            : task?.kind === 'submitting' ? `Recover ${displayResolution} with an Ark task ID`
            : task?.kind === 'completed' ? `Restore ${displayResolution} final video`
            : task?.kind === 'submitted' ? `Resume ${displayResolution} final render`
            : `Render final video at ${displayResolution}`;
          return (
            <button key={resolution} type="button" aria-label={title} title={title} disabled={disabled} onClick={() => {
              if (task?.kind === 'submitting') setRecovery({ resolution, taskId: task.restoredRequestId ?? '' });
              else onRender(resolution);
            }}
              className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">
              {label}
            </button>
          );
        })}
      </div>
      {recovery?.confirmClear && onClearPending ? (
        <div className="absolute top-full z-10 mt-2 w-72 rounded-md bg-gray-800 p-3 text-xs text-white shadow-lg">
          <p>Check Ark for a pending or completed render at this resolution. If Ark accepted the request, starting another render can incur a second charge.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => {
              onClearPending(recovery.resolution);
              setRecovery(undefined);
            }} className="rounded bg-white/10 px-2 py-1">Clear pending render</button>
            <button type="button" onClick={() => setRecovery({ ...recovery, confirmClear: false })} className="rounded px-2 py-1">Back</button>
          </div>
        </div>
      ) : recovery && (
        <form onSubmit={event => {
          event.preventDefault();
          const taskId = recovery.taskId.trim();
          if (!isArkIdentifier(taskId)) return;
          onRender(recovery.resolution, taskId);
          setRecovery(undefined);
        }} className="absolute top-full z-10 mt-2 flex items-center gap-2 rounded-md bg-gray-800 p-2 text-xs text-white shadow-lg">
          <input aria-label="Ark final video task ID" placeholder="Ark final video task ID" value={recovery.taskId}
            onChange={event => setRecovery({ ...recovery, taskId: event.target.value })}
            className="rounded bg-black/25 px-2 py-1" />
          <button type="submit" disabled={!isArkIdentifier(recovery.taskId.trim())} className="rounded bg-white/10 px-2 py-1 disabled:opacity-50">Resume</button>
          {onClearPending && <button type="button" onClick={() => setRecovery({ ...recovery, confirmClear: true })} className="whitespace-nowrap rounded px-2 py-1">Clear pending…</button>}
          <button type="button" onClick={() => setRecovery(undefined)} className="rounded px-2 py-1">Cancel</button>
        </form>
      )}
    </div>
  );
};
