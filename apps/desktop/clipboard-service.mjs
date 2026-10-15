const maxClipboardTextChars = 1_000_000; // Match preload's native clipboard IPC cap.

export const writeClipboardText = async (clipboard, text) => {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text must be a string.');
  }
  if (text.length > maxClipboardTextChars) {
    throw new Error('Clipboard text is too large to write safely.');
  }
  await clipboard.writeText(text); // Electron 44 completes native writes asynchronously.
  return true;
};
