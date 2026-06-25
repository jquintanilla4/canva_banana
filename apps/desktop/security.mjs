export const getDevRendererUrl = (env, isPackaged) => (
  isPackaged ? undefined : env.ELECTRON_RENDERER_URL?.trim() || undefined
); // Packaged apps must always load bundled renderer assets.

export const isAllowedAudioPermissionRequest = (permission, details = {}) => {
  if (permission !== 'media') {
    return false; // Deny every non-media permission by default.
  }
  const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
  return mediaTypes.includes('audio') && !mediaTypes.includes('video'); // The app only needs microphone capture.
};
