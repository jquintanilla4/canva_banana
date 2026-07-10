export const DEFAULT_HTTP_SERVER_SHUTDOWN_GRACE_MS = 2500; // Lets ordinary local requests finish before forcing sockets closed.
export const DEFAULT_HTTP_SERVER_SHUTDOWN_FORCE_WAIT_MS = 500; // Caps the wait after remaining sockets are destroyed.

const normalizeTimeoutMs = (value, fallback) => (
  Number.isFinite(value) && value >= 0 ? value : fallback
); // Rejects invalid lifecycle configuration without making shutdown unbounded.

const waitForResult = (promise, timeoutMs) => new Promise(resolve => {
  let settled = false;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolve(result);
  };
  const timeout = setTimeout(() => finish(null), timeoutMs);
  timeout.unref?.();
  promise.then(finish, error => finish({ error }));
}); // Resolves with null when the bounded wait expires.

const isAlreadyClosedError = error => error?.code === 'ERR_SERVER_NOT_RUNNING'; // Closing an unopened server is already a successful outcome.

export const createBoundedHttpServerShutdown = (server, {
  graceMs = DEFAULT_HTTP_SERVER_SHUTDOWN_GRACE_MS,
  forceWaitMs = DEFAULT_HTTP_SERVER_SHUTDOWN_FORCE_WAIT_MS,
} = {}) => {
  if (!server || typeof server.close !== 'function' || typeof server.on !== 'function') {
    throw new TypeError('A Node HTTP server is required.');
  }

  const sockets = new Set();
  const rememberSocket = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  }; // Includes upgraded sockets that closeAllConnections cannot reach.
  server.on('connection', rememberSocket);
  let shutdownPromise = null;

  return () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      const closeResultPromise = new Promise(resolve => {
        try {
          server.close(error => resolve({ error }));
        } catch (error) {
          resolve({ error });
        }
      });
      server.closeIdleConnections?.(); // Do not spend the grace period on idle keep-alive sockets.

      const gracefulResult = await waitForResult(
        closeResultPromise,
        normalizeTimeoutMs(graceMs, DEFAULT_HTTP_SERVER_SHUTDOWN_GRACE_MS),
      );
      if (gracefulResult) {
        if (gracefulResult.error && !isAlreadyClosedError(gracefulResult.error)) throw gracefulResult.error;
        server.off?.('connection', rememberSocket);
        return { forced: false, timedOut: false };
      }

      server.closeAllConnections?.(); // Covers active HTTP connections on supported Node versions.
      for (const socket of sockets) {
        socket.destroy(); // Also terminates upgraded or otherwise untracked-by-HTTP requests.
      }
      const forcedResult = await waitForResult(
        closeResultPromise,
        normalizeTimeoutMs(forceWaitMs, DEFAULT_HTTP_SERVER_SHUTDOWN_FORCE_WAIT_MS),
      );
      server.off?.('connection', rememberSocket);
      if (forcedResult?.error && !isAlreadyClosedError(forcedResult.error)) throw forcedResult.error;
      return { forced: true, timedOut: forcedResult === null };
    })();
    return shutdownPromise;
  };
};
