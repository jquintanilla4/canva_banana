export const attachBlobDownloadCompletionNotifier = ({ item, webContents, channel }) => {
  const url = typeof item?.getURL === 'function' ? item.getURL() : '';
  if (!url.startsWith('blob:') || typeof item?.once !== 'function' || typeof webContents?.send !== 'function') {
    return false;
  }
  item.once('done', (_event, state) => {
    if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) return;
    webContents.send(channel, { url, state });
  });
  return true;
}; // Renderer Blob URLs stay valid until Electron finishes or cancels their download.
