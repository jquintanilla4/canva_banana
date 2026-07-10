export const createManagedServiceLifecycle = ({ start, stop }) => {
  let operationTail = Promise.resolve(); // Serializes service ownership changes.
  let serviceState = 'unknown'; // Tracks whether shutdown still needs a final stop.
  let activeStartController = null; // Lets quit cancel startup health checks immediately.
  let stopPromise = null; // Shares a concurrent restart or shutdown stop.
  let shutdownRequested = false; // Permanently blocks new starts once quit begins.
  let shutdownPromise = null; // Makes repeated cleanup calls share one result.

  const enqueue = (operation) => {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(() => undefined, () => undefined); // A failed operation must not block later cleanup.
    return result;
  };

  const stopServices = () => {
    if (stopPromise) return stopPromise;
    const operation = (async () => {
      serviceState = 'stopping';
      try {
        await stop();
        serviceState = 'stopped';
      } catch (error) {
        serviceState = 'unknown';
        throw error;
      }
    })();
    stopPromise = operation;
    operation.then(
      () => { if (stopPromise === operation) stopPromise = null; },
      () => { if (stopPromise === operation) stopPromise = null; },
    ); // A later cleanup may retry after this stop settles.
    return operation;
  };

  const startServicesIfAllowed = async () => {
    if (shutdownRequested) return undefined;
    const controller = new AbortController();
    activeStartController = controller;
    serviceState = 'starting';
    try {
      const result = await start(controller.signal);
      if (shutdownRequested || controller.signal.aborted) {
        await stopServices(); // Cleans resources from a startup that ignored cancellation and finished late.
        return undefined;
      }
      serviceState = 'running';
      return result;
    } catch (error) {
      if (shutdownRequested || controller.signal.aborted) {
        await stopServices(); // Covers late failures that may still have acquired service resources.
        return undefined;
      }
      serviceState = 'unknown';
      throw error;
    } finally {
      if (activeStartController === controller) {
        activeStartController = null;
      }
    }
  };

  const startServices = () => enqueue(startServicesIfAllowed);

  const restartServices = () => enqueue(async () => {
    if (shutdownRequested) return undefined;
    await stopServices();
    return startServicesIfAllowed(); // Re-checks shutdown after an in-flight stop settles.
  });

  const shutdownServices = () => {
    shutdownRequested = true; // Mark shutdown before any queued restart can start again.
    activeStartController?.abort(); // Releases abort-aware startup without waiting for its health timeout.
    shutdownPromise ??= serviceState === 'stopped' ? Promise.resolve() : stopServices();
    return shutdownPromise;
  };

  return {
    isShutdownRequested: () => shutdownRequested,
    restart: restartServices,
    shutdown: shutdownServices,
    start: startServices,
  };
};
