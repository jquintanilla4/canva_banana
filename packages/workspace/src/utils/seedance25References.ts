export const SEEDANCE25_REFERENCE_IMAGE_LIMIT = 30; // Provider cap for still references.
export const SEEDANCE25_REFERENCE_VIDEO_LIMIT = 10; // Provider cap for video references.
export const SEEDANCE25_REFERENCE_AUDIO_LIMIT = 10; // Provider cap for audio references.
export const SEEDANCE25_REFERENCE_TOTAL_FILE_LIMIT = 50; // All reference modalities share this cap.
export const SEEDANCE25_REFERENCE_MEDIA_MIN_DURATION_SECONDS = 1.8; // Provider accepts clips from 1.8 seconds.
export const SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS = 30.2; // Provider accepts clips through 30.2 seconds.
export const SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS = 30.2; // Combined video reference duration.
export const SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS = 30.2; // Combined audio reference duration.
export const JIMENG_SEEDANCE25_REFERENCE_MEDIA_MIN_DURATION_SECONDS = 2; // Dreamina CLI reference clips start at 2 seconds.
export const JIMENG_SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS = 30; // Dreamina CLI reference clips end at 30 seconds.
export const JIMENG_SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS = 30; // Dreamina CLI combined video duration.
export const JIMENG_SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS = 30; // Dreamina CLI combined audio duration.
export const SEEDANCE25_REFERENCE_IMAGE_MAX_BYTES = 30 * 1024 * 1024; // Images may be at most 30 MB.
export const SEEDANCE25_REFERENCE_VIDEO_MAX_BYTES = 200 * 1024 * 1024; // Videos may be at most 200 MB.
export const SEEDANCE25_REFERENCE_AUDIO_MAX_BYTES = 15 * 1024 * 1024; // Audio files may be at most 15 MB.
export const SEEDANCE25_REFERENCE_VIDEO_MIN_DIMENSION = 300; // Both video sides must be at least 300 pixels.
export const SEEDANCE25_REFERENCE_VIDEO_MAX_DIMENSION = 6000; // Both video sides must not exceed 6,000 pixels.
export const SEEDANCE25_REFERENCE_VIDEO_MIN_ASPECT_RATIO = 0.4; // Width divided by height.
export const SEEDANCE25_REFERENCE_VIDEO_MAX_ASPECT_RATIO = 2.5; // Width divided by height.
export const SEEDANCE25_REFERENCE_VIDEO_MIN_FRAME_RATE = 24; // Provider-supported lower frame-rate bound.
export const SEEDANCE25_REFERENCE_VIDEO_MAX_FRAME_RATE = 60; // Provider-supported upper frame-rate bound.

const SEEDANCE25_REFERENCE_VIDEO_FRAME_RATE_TOLERANCE = 0.1; // Accept common NTSC rates such as 23.976 and 59.94.

const SEEDANCE25_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const SEEDANCE25_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']);
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const getBaseMimeType = (mimeType: string): string => mimeType.split(';', 1)[0].trim().toLowerCase(); // Ignore optional codec parameters.

const hasFileExtension = (fileName: string, extensions: readonly string[]): boolean => {
  const normalizedName = fileName.toLowerCase();
  return extensions.some(extension => normalizedName.endsWith(extension));
};

const hasSupportedMediaFormat = (
  file: Pick<File, 'name' | 'type'>,
  mimeTypes: ReadonlySet<string>,
  extensions: readonly string[],
): boolean => {
  const mimeType = getBaseMimeType(file.type);
  return GENERIC_MIME_TYPES.has(mimeType)
    ? hasFileExtension(file.name, extensions)
    : mimeTypes.has(mimeType); // Trust specific MIME metadata; use the extension only when metadata is unavailable.
};

export const getSeedance25VideoReferenceFileError = (
  file: File,
  width?: number,
  height?: number,
  frameRate?: number | null,
): string | null => {
  if (file.size > SEEDANCE25_REFERENCE_VIDEO_MAX_BYTES) {
    return 'Seedance 2.5 reference videos must be 200 MB or smaller.';
  }
  if (!hasSupportedMediaFormat(file, SEEDANCE25_VIDEO_MIME_TYPES, ['.mp4', '.mov'])) {
    return 'Seedance 2.5 reference videos must use MP4 or MOV format.';
  }
  if (width !== undefined && height !== undefined && (
    width < SEEDANCE25_REFERENCE_VIDEO_MIN_DIMENSION
    || height < SEEDANCE25_REFERENCE_VIDEO_MIN_DIMENSION
    || width > SEEDANCE25_REFERENCE_VIDEO_MAX_DIMENSION
    || height > SEEDANCE25_REFERENCE_VIDEO_MAX_DIMENSION
  )) {
    return 'Seedance 2.5 reference video dimensions must be between 300 and 6,000 pixels per side.';
  }
  const aspectRatio = width !== undefined && height !== undefined ? width / height : undefined;
  if (aspectRatio !== undefined && (aspectRatio < SEEDANCE25_REFERENCE_VIDEO_MIN_ASPECT_RATIO || aspectRatio > SEEDANCE25_REFERENCE_VIDEO_MAX_ASPECT_RATIO)) {
    return 'Seedance 2.5 reference video aspect ratio must be between 0.4 and 2.5.';
  }
  if (typeof frameRate === 'number' && Number.isFinite(frameRate) && (
    frameRate < SEEDANCE25_REFERENCE_VIDEO_MIN_FRAME_RATE - SEEDANCE25_REFERENCE_VIDEO_FRAME_RATE_TOLERANCE
    || frameRate > SEEDANCE25_REFERENCE_VIDEO_MAX_FRAME_RATE + SEEDANCE25_REFERENCE_VIDEO_FRAME_RATE_TOLERANCE
  )) {
    return 'Seedance 2.5 reference videos must use a frame rate between 24 and 60 FPS.';
  }
  return null;
};

export const isSeedance25AudioReferenceFormatSupported = (file: Pick<File, 'name' | 'type'>): boolean =>
  hasSupportedMediaFormat(file, SEEDANCE25_AUDIO_MIME_TYPES, ['.mp3', '.wav']); // Supported files can upload without transcoding.

export const getSeedance25AudioReferenceFileError = (file: File): string | null => {
  if (file.size > SEEDANCE25_REFERENCE_AUDIO_MAX_BYTES) {
    return 'Seedance 2.5 reference audio files must be 15 MB or smaller.';
  }
  if (!isSeedance25AudioReferenceFormatSupported(file)) {
    return 'Seedance 2.5 reference audio files must use MP3 or WAV format.';
  }
  return null;
};
