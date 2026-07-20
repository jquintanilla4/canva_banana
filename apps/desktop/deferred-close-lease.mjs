export const createDeferredCloseLease = ({ close }) => {
  if (typeof close !== 'function') {
    throw new Error('Deferred close callback is invalid.');
  }
  let activeLeases = 0;
  let closeRequested = false;
  let closeStarted = false;
  let closePromise = null;
  let resolveClose = null;
  let rejectClose = null;

  const finishCloseIfIdle = () => {
    if (!closeRequested || closeStarted || activeLeases > 0) return;
    closeStarted = true;
    Promise.resolve()
      .then(close)
      .then(resolveClose, rejectClose);
  }; // The physical close starts once after every lease drains.

  const acquire = () => {
    if (closeRequested) {
      throw new Error('Resource is already closing.');
    }
    activeLeases += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeLeases -= 1;
      finishCloseIfIdle();
    };
  }; // Each consumer releases its close blocker at most once.

  const requestClose = () => {
    closeRequested = true;
    if (!closePromise) {
      closePromise = new Promise((resolve, reject) => {
        resolveClose = resolve;
        rejectClose = reject;
      });
    }
    finishCloseIfIdle();
    return closePromise;
  }; // Repeated close requests share the same completion.

  return {
    acquire,
    requestClose,
    isClosing: () => closeRequested,
    getUsage: () => ({ activeLeases, closeRequested, closeStarted }), // Tests and diagnostics can verify draining state.
  };
};
