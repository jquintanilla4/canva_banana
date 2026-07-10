const assertOwnerId = (ownerId) => {
  if (!Number.isSafeInteger(ownerId) || ownerId < 0) {
    throw new Error('Renderer resource owner is invalid.');
  }
  return ownerId;
};

export const createRendererResourceEpochs = () => {
  const generations = new Map();

  const capture = (ownerId) => {
    const id = assertOwnerId(ownerId);
    return { ownerId: id, generation: generations.get(id) ?? 0 }; // Bind resources to one renderer document.
  };

  const invalidate = (ownerId) => {
    const id = assertOwnerId(ownerId);
    const invalidatedThrough = generations.get(id) ?? 0;
    generations.set(id, invalidatedThrough + 1); // A reloaded document receives a fresh generation.
    return { ownerId: id, invalidatedThrough };
  };

  const isCurrent = (owner) => (
    owner != null
    && Number.isSafeInteger(owner.ownerId)
    && Number.isSafeInteger(owner.generation)
    && (generations.get(owner.ownerId) ?? 0) === owner.generation
  );

  const assertCurrent = (owner, message = 'Renderer resource owner is no longer active.') => {
    if (!isCurrent(owner)) {
      throw new Error(message);
    }
    return owner;
  }; // Recheck owners after dialogs and filesystem awaits.

  const isSame = (left, right) => (
    left?.ownerId === right?.ownerId && left?.generation === right?.generation
  );

  const wasInvalidated = (owner, invalidation) => (
    owner?.ownerId === invalidation?.ownerId && owner.generation <= invalidation.invalidatedThrough
  );

  return { assertCurrent, capture, invalidate, isCurrent, isSame, wasInvalidated }; // Keep lifecycle policy independent of filesystem code.
};
