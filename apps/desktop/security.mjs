const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']); // Only same-machine renderers may receive preload secrets.

export const SNAPSHOT_MEDIA_PROTOCOL = 'canva-banana-snapshot';
export const SNAPSHOT_MEDIA_PROTOCOL_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  stream: true,
  supportFetchAPI: true,
  corsEnabled: true,
}); // Snapshot media is a cross-origin streaming resource in both dev and packaged builds.

const isLocalDevRendererUrl = (url) => {
  try {
    const parsedUrl = new URL(url); // Use URL parsing so host checks cannot be bypassed with strings.
    return (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') && LOCAL_DEV_HOSTS.has(parsedUrl.hostname);
  } catch {
    return false; // Invalid renderer URLs fall back to bundled assets.
  }
};

export const getDevRendererUrl = (env, isPackaged) => {
  if (isPackaged) {
    return undefined; // Packaged apps must always load bundled renderer assets.
  }
  const rendererUrl = env.ELECTRON_RENDERER_URL?.trim();
  return rendererUrl && isLocalDevRendererUrl(rendererUrl) ? rendererUrl : undefined;
};

export const isAllowedAudioPermissionRequest = (permission, details = {}) => {
  if (permission !== 'media') {
    return false; // Deny every non-media permission by default.
  }
  const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
  return mediaTypes.includes('audio') && !mediaTypes.includes('video'); // The app only needs microphone capture.
};
