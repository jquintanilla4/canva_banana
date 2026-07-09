import type { FalJobPhase } from '../../types'; // Shared queue phase type.

export class FalPhaseError extends Error {
  readonly phase: FalJobPhase; // Phase that failed.
  readonly originalMessage: string; // Raw provider/browser error text.
  readonly requestId?: string; // Request id if Fal accepted the job.

  constructor(phase: FalJobPhase, error: unknown, requestId?: string) {
    const message = error instanceof Error ? error.message : String(error); // Preserve the useful error text.
    super(message);
    this.name = 'FalPhaseError';
    this.phase = phase;
    this.originalMessage = message;
    this.requestId = requestId;
  }
}

export const getFalErrorPhase = (error: unknown): FalJobPhase | undefined => {
  return error instanceof FalPhaseError ? error.phase : undefined; // Expose phase without instanceof checks upstream.
};

export const getFalErrorRequestId = (error: unknown): string | undefined => {
  return error instanceof FalPhaseError ? error.requestId : undefined; // Expose request id without leaking class checks.
};
