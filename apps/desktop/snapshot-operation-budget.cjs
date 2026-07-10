const createSnapshotOperationBudget = ({ maxOperations, maxBytes, errorMessage }) => {
  let activeOperations = 0;
  let activeBytes = 0;

  const reserve = (bytes) => {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error('Snapshot operation size is invalid.');
    }
    if (activeOperations >= maxOperations || bytes > maxBytes - activeBytes) {
      throw new Error(errorMessage);
    }
    activeOperations += 1;
    activeBytes += bytes;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeOperations -= 1;
      activeBytes -= bytes;
    }; // Every reservation releases at most once.
  };

  return {
    reserve,
    getUsage: () => ({ activeOperations, activeBytes }), // Tests and diagnostics can confirm reservations return to zero.
  };
};

module.exports = { createSnapshotOperationBudget };
