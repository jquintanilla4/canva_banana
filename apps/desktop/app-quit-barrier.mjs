export const createAppQuitBarrier = ({ cleanup, quit, onCleanupError = console.error }) => {
  let cleanupPromise = null;
  let allowQuit = false;

  return event => {
    if (allowQuit) return;
    event.preventDefault();
    if (cleanupPromise) return;
    cleanupPromise = Promise.resolve()
      .then(cleanup)
      .catch(error => onCleanupError('App shutdown cleanup failed.', error))
      .finally(() => {
        allowQuit = true;
        quit(); // Re-enter Electron's quit flow only after cleanup settles.
      });
  };
};
