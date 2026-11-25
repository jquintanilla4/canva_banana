import React, { useRef } from 'react';
import type { JimengCanvasApprovalJob } from '../services/jimengCanvasService';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';

export interface JimengCanvasApprovalProps {
  job: JimengCanvasApprovalJob;
  onApprove: (revision: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export const JimengCanvasApproval: React.FC<JimengCanvasApprovalProps> = ({ job, onApprove, onCancel, busy = false }) => {
  const decidedRevision = useRef<string | null>(null);
  const choose = (approve: boolean): void => {
    const key = JSON.stringify([job.id, job.quote.revision]);
    if (busy || decidedRevision.current === key) return;
    decidedRevision.current = key;
    if (approve) onApprove(job.quote.revision);
    else onCancel();
  };

  return (
    <div className={`fixed inset-0 ${OVERLAY_LAYER_CLASS_NAMES.blockingModal} flex items-center justify-center bg-black/60 p-4`}>
      <section role="dialog" aria-modal="true" aria-labelledby="jimeng-canvas-approval-title" className="w-full max-w-sm rounded-xl border border-cyan-300/25 bg-gray-950 p-5 text-gray-100 shadow-2xl">
        <h2 id="jimeng-canvas-approval-title" className="text-base font-semibold text-white">Approve Jimeng generation</h2>
        <p className="mt-3 text-sm text-gray-300">This {job.mediaType} generation is quoted at up to <strong className="text-white">{job.quote.credits} credits</strong>.</p>
        <p className="mt-2 text-xs text-gray-400">Credits are spent only after you approve this quote.</p>
        {job.message && <p className="mt-3 text-xs text-gray-300">{job.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => choose(false)} disabled={busy} className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-45">Cancel</button>
          <button type="button" autoFocus onClick={() => choose(true)} disabled={busy} className="rounded-md border border-cyan-300/40 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/25 disabled:opacity-45">Approve {job.quote.credits} credits</button>
        </div>
      </section>
    </div>
  );
};
