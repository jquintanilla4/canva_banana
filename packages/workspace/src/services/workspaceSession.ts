let session: AbortController | undefined;

export const beginWorkspaceSession = (): (() => void) => {
  const controller = new AbortController();
  session = controller;
  return () => {
    controller.abort(new DOMException('Workspace closed.', 'AbortError'));
    if (session === controller) session = undefined;
  };
};

export const getWorkspaceSignal = (): AbortSignal | undefined => session?.signal;

export const workspaceFetch: typeof fetch = (input, init) => {
  const signal = session?.signal;
  if (!signal) return fetch(input, init);
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return fetch(input, { ...init, signal: callerSignal ? AbortSignal.any([signal, callerSignal]) : signal });
}; // Abort renderer-owned requests when the embedded workspace unmounts.

export const workspaceDelay = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal?.reason); };
  const timer = window.setTimeout(() => {
    signal?.removeEventListener('abort', abort);
    resolve();
  }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
