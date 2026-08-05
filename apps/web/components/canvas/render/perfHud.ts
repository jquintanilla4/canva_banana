// Dev-only canvas performance HUD. Enable with localStorage.setItem('canvasPerfHud', '1')
// or a ?perfHud query param; shows draws/sec and per-draw scripting time.

export const isCanvasPerfHudEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('canvasPerfHud') === '1'
      || new URLSearchParams(window.location.search).has('perfHud');
  } catch {
    return false;
  }
};

type CanvasPerfStats = { draws: number; totalMs: number; maxMs: number };

const stats: CanvasPerfStats = { draws: 0, totalMs: 0, maxMs: 0 };

export const recordCanvasDraw = (durationMs: number): void => {
  stats.draws += 1;
  stats.totalMs += durationMs;
  if (durationMs > stats.maxMs) stats.maxMs = durationMs;
};

export const drainCanvasPerfStats = (): CanvasPerfStats => {
  const snapshot = { ...stats };
  stats.draws = 0;
  stats.totalMs = 0;
  stats.maxMs = 0;
  return snapshot;
};
