export const writeClipboardText = async (text: string): Promise<void> => {
  const desktopWriteText = window.canvaBananaDesktop?.clipboard?.writeText; // Desktop bridge avoids blocked web clipboard permissions.
  if (desktopWriteText) {
    await desktopWriteText(text);
    return;
  }
  await navigator.clipboard.writeText(text); // Browser fallback keeps web builds unchanged.
};
