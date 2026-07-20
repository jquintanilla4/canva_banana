export const SNAPSHOT_DOWNLOAD_TOKEN_PARAM = 'downloadToken';

const getDownloadToken = (url) => {
  try {
    return new URL(url).searchParams.get(SNAPSHOT_DOWNLOAD_TOKEN_PARAM);
  } catch {
    return null;
  }
};

export const createSnapshotDownloadCoordinator = ({ createToken, startTimeoutMs = 30_000 }) => {
  if (typeof createToken !== 'function' || !Number.isSafeInteger(startTimeoutMs) || startTimeoutMs <= 0) {
    throw new Error('Snapshot download coordinator options are invalid.');
  }
  const reservations = new Map();

  const releaseReservation = (token) => {
    const reservation = reservations.get(token);
    if (!reservation) return false;
    reservations.delete(token);
    clearTimeout(reservation.startTimeout);
    reservation.releaseSource();
    return true;
  }; // Terminal paths release the source lease exactly once.

  const reserve = ({ requestUrl, sourceId, offset, length, webContentsId, releaseSource }) => {
    if (typeof releaseSource !== 'function') {
      throw new Error('Snapshot download source release is invalid.');
    }
    const token = createToken();
    if (typeof token !== 'string' || token.length === 0 || reservations.has(token)) {
      throw new Error('Snapshot download token is invalid.');
    }
    const downloadUrl = new URL(requestUrl);
    downloadUrl.searchParams.set(SNAPSHOT_DOWNLOAD_TOKEN_PARAM, token);
    const reservation = {
      sourceId,
      offset,
      length,
      webContentsId,
      releaseSource,
      item: null,
      startTimeout: null,
    };
    reservation.startTimeout = setTimeout(() => releaseReservation(token), startTimeoutMs);
    reservation.startTimeout.unref?.();
    reservations.set(token, reservation);
    return { token, url: downloadUrl.toString() };
  }; // A unique URL token binds Electron's later download event to this source lease.

  const claim = ({ url, webContentsId, item }) => {
    const token = getDownloadToken(url);
    const reservation = token ? reservations.get(token) : null;
    if (!reservation || reservation.webContentsId !== webContentsId || reservation.item || typeof item?.once !== 'function') {
      return false;
    }
    clearTimeout(reservation.startTimeout);
    reservation.item = item;
    item.once('done', () => releaseReservation(token));
    return true;
  }; // Only the renderer that reserved the token can attach its DownloadItem.

  const isAuthorized = ({ token, sourceId, offset, length }) => {
    const reservation = typeof token === 'string' ? reservations.get(token) : null;
    return Boolean(
      reservation
      && reservation.sourceId === sourceId
      && reservation.offset === offset
      && reservation.length === length,
    );
  }; // Closing sources accept only the exact range reserved for an active download.

  const cancelAll = () => {
    [...reservations.entries()].forEach(([token, reservation]) => {
      try {
        reservation.item?.cancel?.();
      } finally {
        releaseReservation(token);
      }
    });
  }; // App shutdown interrupts downloads before waiting for source closure.

  return {
    reserve,
    claim,
    isAuthorized,
    cancelAll,
    release: releaseReservation,
    getUsage: () => ({ active: reservations.size }), // Tests and shutdown diagnostics can detect leaked reservations.
  };
};
