import type { GenerationFalOptions, KlingV4AspectRatio, KlingV4Duration, KlingV4Resolution, KlingV4Variant } from '../types';

export const KLING_V4_VIDEO_MODEL_ID = 'kling/v4' as const;
export const KLING_V4_TEXT_TO_VIDEO_MODEL_ID = 'kling/v4/text-to-video' as const;
export const KLING_V4_IMAGE_TO_VIDEO_MODEL_ID = 'kling/v4/image-to-video' as const;
export const KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID = 'kling/v4/reference-to-video' as const;
export const KLING_V4_EDIT_VIDEO_MODEL_ID = 'kling/v4/video-to-video/edit' as const;
export type KlingV4Endpoint = typeof KLING_V4_TEXT_TO_VIDEO_MODEL_ID | typeof KLING_V4_IMAGE_TO_VIDEO_MODEL_ID
  | typeof KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID | typeof KLING_V4_EDIT_VIDEO_MODEL_ID;

export const isKlingV4VideoModel = (modelId: string | undefined): boolean =>
  modelId === KLING_V4_VIDEO_MODEL_ID || modelId === KLING_V4_TEXT_TO_VIDEO_MODEL_ID
  || modelId === KLING_V4_IMAGE_TO_VIDEO_MODEL_ID || modelId === KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID
  || modelId === KLING_V4_EDIT_VIDEO_MODEL_ID;

export const KLING_V4_DEFAULTS = {
  klingV4Variant: 'generate',
  klingV4Resolution: '1080p',
  klingV4AspectRatio: '16:9',
  klingV4Duration: '5',
} as const satisfies GenerationFalOptions;

export const KLING_V4_REFERENCE_IMAGE_LIMIT = 10;
export const KLING_V4_REFERENCE_VIDEO_LIMIT = 5;
export const KLING_V4_REFERENCE_TOTAL_LIMIT = 15;
export const KLING_V4_VARIANT_OPTIONS = [
  { value: 'generate', label: 'Generate' },
  { value: 'edit', label: 'Edit' },
] as const satisfies ReadonlyArray<{ value: KlingV4Variant; label: string }>;
export const KLING_V4_RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
] as const satisfies ReadonlyArray<{ value: KlingV4Resolution; label: string }>;
export const KLING_V4_ASPECT_RATIO_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '21:9', label: '21:9' },
] as const satisfies ReadonlyArray<{ value: KlingV4AspectRatio; label: string }>;
export const isKlingV4Variant = (value: unknown): value is KlingV4Variant =>
  KLING_V4_VARIANT_OPTIONS.some(option => option.value === value);
export const isKlingV4Resolution = (value: unknown): value is KlingV4Resolution =>
  KLING_V4_RESOLUTION_OPTIONS.some(option => option.value === value);
export const isKlingV4AspectRatio = (value: unknown): value is KlingV4AspectRatio =>
  KLING_V4_ASPECT_RATIO_OPTIONS.some(option => option.value === value);
export const isKlingV4Duration = (value: unknown): value is KlingV4Duration =>
  value === 'source' || typeof value === 'string' && /^(?:[3-9]|[12]\d|30)$/.test(value);
export const KLING_V4_DURATION_OPTIONS: ReadonlyArray<{ value: KlingV4Duration; label: string }> = [
  { value: 'source', label: 'Source duration' },
  ...Array.from({ length: 28 }, (_, index) => ({ value: String(index + 3), label: `${index + 3}s` }))
    .filter((option): option is { value: KlingV4Duration; label: string } => isKlingV4Duration(option.value)),
];
