import type { FalPhaseOptions, FalPhaseUpdate } from './types'; // Fal phase callback types.
import { logFalEvent } from './logging'; // Fal debug logging.

export const emitFalPhase = (
  options: FalPhaseOptions | undefined,
  endpointId: string,
  update: FalPhaseUpdate,
) => { // Emit a phase update to UI and debug logs.
  options?.onPhaseUpdate?.(update);
  logFalEvent('info', endpointId, `Phase: ${update.phase}`, {
    jobId: options?.jobId,
    ...update,
  });
};
