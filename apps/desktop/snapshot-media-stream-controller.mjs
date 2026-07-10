import { Readable } from 'node:stream';

const createAbortError = (signal) => {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('Snapshot media request was canceled.');
  error.name = 'AbortError';
  return error;
};

const busyErrorCode = 'SNAPSHOT_MEDIA_STREAM_BUSY';

export const isSnapshotMediaStreamBusyError = error => error?.code === busyErrorCode;

export const createSnapshotMediaStreamController = ({ maxActive, maxPending, closedErrorMessage, busyErrorMessage }) => {
  if (!Number.isSafeInteger(maxActive) || maxActive <= 0) {
    throw new Error('Snapshot media stream limit is invalid.');
  }
  if (!Number.isSafeInteger(maxPending) || maxPending < 0) {
    throw new Error('Snapshot media pending limit is invalid.');
  }
  let active = 0;
  let closed = false;
  const pending = [];
  const activeStreams = new Set();
  const createClosedError = () => new Error(closedErrorMessage);
  const createBusyError = () => Object.assign(new Error(busyErrorMessage), { code: busyErrorCode });

  const grantPending = () => {
    while (!closed && active < maxActive && pending.length > 0) {
      const request = pending.shift();
      request.signal?.removeEventListener('abort', request.onAbort);
      if (request.signal?.aborted) {
        request.reject(createAbortError(request.signal));
        continue;
      }
      active += 1;
      request.resolve(createRelease());
    }
  };

  const createRelease = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
      grantPending();
    }; // Each active stream returns its slot once.
  };

  const acquire = (signal) => {
    if (closed) return Promise.reject(createClosedError());
    if (signal?.aborted) return Promise.reject(createAbortError(signal));
    if (active < maxActive) {
      active += 1;
      return Promise.resolve(createRelease());
    }
    if (pending.length >= maxPending) return Promise.reject(createBusyError()); // Protect main while valid renderer work stays scheduled upstream.
    return new Promise((resolve, reject) => {
      const request = {
        signal,
        resolve,
        reject,
        onAbort: null,
      };
      request.onAbort = () => {
        const index = pending.indexOf(request);
        if (index >= 0) pending.splice(index, 1);
        reject(createAbortError(signal));
      };
      pending.push(request);
      signal?.addEventListener('abort', request.onAbort, { once: true });
    });
  };

  const open = async ({ signal, createStream }) => {
    const releaseCapacity = await acquire(signal);
    let stream;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', abortStream);
      if (stream) activeStreams.delete(stream);
      releaseCapacity();
    };
    const abortStream = () => stream?.destroy(createAbortError(signal));
    try {
      if (closed) throw createClosedError();
      if (signal?.aborted) throw createAbortError(signal);
      stream = createStream();
      activeStreams.add(stream);
      stream.once('end', release);
      stream.once('close', release);
      stream.once('error', release);
      signal?.addEventListener('abort', abortStream, { once: true });
      return Readable.toWeb(stream);
    } catch (error) {
      stream?.destroy();
      release();
      throw error;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    const error = createClosedError();
    while (pending.length > 0) {
      const request = pending.shift();
      request.signal?.removeEventListener('abort', request.onAbort);
      request.reject(error);
    }
    activeStreams.forEach(stream => stream.destroy(error));
  };

  return {
    open,
    close,
    getUsage: () => ({ active, pending: pending.length, closed }), // Tests confirm slots and waiters return to zero.
  };
};
