import type { Flux3AspectRatio, Flux3Duration, Flux3KeyframeTiming, Flux3Resolution, Flux3Variant } from '../types';

export const FLUX3_FPS = 24;
export const FLUX3_MAX_KEYFRAMES = 10;
export const FLUX3_EXTEND_MAX_BYTES = 50_000_000;
export const FLUX3_EXTEND_MAX_SECONDS = 15;

const FLUX3_MENTION_REGEX = /(^|[^A-Za-z0-9_])@(Image|Video)\s*(\d+)(?![A-Za-z0-9_])/gi;

export type Flux3InputKind = 'optional-start-image' | 'first-last-images' | 'keyframe-images' | 'source-video';

export interface Flux3ModePolicy {
  variant: Flux3Variant;
  label: string;
  inputKind: Flux3InputKind;
  defaultImageRole: 'primary' | 'reference' | null;
  defaultVideoRole: 'reference' | null;
  shiftImageRole: 'tail' | 'reference' | null;
  maxImages: number;
  maxVideos: number;
  supportsTextOnly: boolean;
  requiresExplicitDuration: boolean;
}

const FLUX3_MODE_POLICIES = {
  smart: {
    variant: 'smart', label: 'Smart Mode', inputKind: 'optional-start-image',
    defaultImageRole: 'primary', defaultVideoRole: null, shiftImageRole: null,
    maxImages: 1, maxVideos: 0, supportsTextOnly: true, requiresExplicitDuration: false,
  },
  'first-last-frame': {
    variant: 'first-last-frame', label: 'First & Last Frame', inputKind: 'first-last-images',
    defaultImageRole: 'reference', defaultVideoRole: null, shiftImageRole: 'reference',
    maxImages: 2, maxVideos: 0, supportsTextOnly: false, requiresExplicitDuration: true,
  },
  keyframes: {
    variant: 'keyframes', label: 'Keyframes', inputKind: 'keyframe-images',
    defaultImageRole: 'reference', defaultVideoRole: null, shiftImageRole: 'reference',
    maxImages: FLUX3_MAX_KEYFRAMES, maxVideos: 0, supportsTextOnly: false, requiresExplicitDuration: true,
  },
  extend: {
    variant: 'extend', label: 'Extend', inputKind: 'source-video',
    defaultImageRole: null, defaultVideoRole: 'reference', shiftImageRole: null,
    maxImages: 0, maxVideos: 1, supportsTextOnly: false, requiresExplicitDuration: false,
  },
} as const satisfies Record<Flux3Variant, Flux3ModePolicy>;

export const getFlux3ModePolicy = (variant: Flux3Variant = 'smart'): Flux3ModePolicy => FLUX3_MODE_POLICIES[variant];

export const getFlux3ExtendVideoFileError = (file: Pick<File, 'size' | 'type'>): string | null => {
  const mediaType = file.type.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'video/mp4') return 'Flux 3 Extend supports MP4 source videos only.';
  if (file.size >= FLUX3_EXTEND_MAX_BYTES) return 'Flux 3 Extend supports source videos under 50 MB.';
  return null;
};

export interface ResolvedFlux3Settings {
  flux3Variant: Flux3Variant;
  flux3AspectRatio: Flux3AspectRatio;
  flux3Resolution: Flux3Resolution;
  flux3Duration: Flux3Duration;
  flux3GenerateAudio: boolean;
  flux3KeyframeTimings: Flux3KeyframeTiming[];
}

export const resolveFlux3Settings = (
  settings: Partial<ResolvedFlux3Settings> = {},
): ResolvedFlux3Settings => {
  const flux3Variant = settings.flux3Variant ?? 'smart';
  const requestedDuration = settings.flux3Duration ?? 'auto';
  return {
    flux3Variant,
    flux3AspectRatio: settings.flux3AspectRatio ?? 'auto',
    flux3Resolution: settings.flux3Resolution ?? '720p',
    flux3Duration: getFlux3ModePolicy(flux3Variant).requiresExplicitDuration && requestedDuration === 'auto' ? '5' : requestedDuration,
    flux3GenerateAudio: settings.flux3GenerateAudio ?? true,
    flux3KeyframeTimings: settings.flux3KeyframeTimings ?? [],
  };
};


export const parseFlux3KeyframeTimings = (value: unknown): Flux3KeyframeTiming[] => {
  if (!Array.isArray(value)) return [];
  const imageIds = new Set<string>();
  const timings: Flux3KeyframeTiming[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const imageId = (entry as { imageId?: unknown }).imageId;
    const timestampSeconds = (entry as { timestampSeconds?: unknown }).timestampSeconds;
    if (typeof imageId !== 'string' || imageId.length === 0 || imageIds.has(imageId)) continue;
    if (typeof timestampSeconds !== 'number' || !Number.isFinite(timestampSeconds) || timestampSeconds < 0) continue;
    imageIds.add(imageId);
    timings.push({ imageId, timestampSeconds });
    if (timings.length === FLUX3_MAX_KEYFRAMES) break;
  }
  return timings;
};

export const getFlux3DurationSeconds = (duration: Flux3Duration): number | null => (
  duration === 'auto' ? null : Number(duration)
);

export const buildEvenFlux3KeyframeTimings = (
  imageIds: readonly string[],
  duration: Flux3Duration,
): Flux3KeyframeTiming[] => {
  const durationSeconds = getFlux3DurationSeconds(duration) ?? 5;
  if (imageIds.length <= 1) {
    return imageIds.map(imageId => ({ imageId, timestampSeconds: 0 }));
  }
  return imageIds.map((imageId, index) => ({
    imageId,
    timestampSeconds: (durationSeconds * index) / (imageIds.length - 1),
  }));
};

export const reconcileFlux3KeyframeTimings = (
  imageIds: readonly string[],
  timings: ReadonlyArray<Flux3KeyframeTiming>,
  duration: Flux3Duration,
): Flux3KeyframeTiming[] => {
  const existing = new Map(timings.map(timing => [timing.imageId, timing.timestampSeconds]));
  const defaults = buildEvenFlux3KeyframeTimings(imageIds, duration);
  return defaults.map(entry => ({
    imageId: entry.imageId,
    timestampSeconds: existing.get(entry.imageId) ?? entry.timestampSeconds,
  }));
};

export const scaleFlux3KeyframeTimings = (
  timings: ReadonlyArray<Flux3KeyframeTiming>,
  previousDuration: Flux3Duration,
  nextDuration: Flux3Duration,
): Flux3KeyframeTiming[] => {
  const previousSeconds = getFlux3DurationSeconds(previousDuration) ?? 5;
  const nextSeconds = getFlux3DurationSeconds(nextDuration) ?? 5;
  if (previousSeconds === nextSeconds) return timings.map(timing => ({ ...timing }));
  const scale = nextSeconds / previousSeconds;
  return timings.map(timing => ({ ...timing, timestampSeconds: timing.timestampSeconds * scale }));
};

export const getFlux3KeyframeTimingError = (
  timings: ReadonlyArray<Flux3KeyframeTiming>,
  duration: Flux3Duration,
): string | null => {
  const durationSeconds = getFlux3DurationSeconds(duration);
  if (!durationSeconds) return 'Flux 3 Keyframes requires an explicit duration.';
  if (timings.length === 0) return 'Flux 3 Keyframes requires at least one still image.';
  if (timings.length > FLUX3_MAX_KEYFRAMES) return `Flux 3 Keyframes supports up to ${FLUX3_MAX_KEYFRAMES} still images.`;
  const frameIndexes = new Set<number>();
  for (const timing of timings) {
    if (!Number.isFinite(timing.timestampSeconds) || timing.timestampSeconds < 0 || timing.timestampSeconds > durationSeconds) {
      return `Each keyframe timestamp must be between 0 and ${durationSeconds} seconds.`;
    }
    const frameIndex = Math.round(timing.timestampSeconds * FLUX3_FPS);
    if (frameIndexes.has(frameIndex)) return 'Keyframe timestamps must resolve to unique frames.';
    frameIndexes.add(frameIndex);
  }
  return null;
};

export const flux3TimingsToFrameIndexes = (timings: Flux3KeyframeTiming[]) => (
  timings.map(timing => ({ imageId: timing.imageId, frameIndex: Math.round(timing.timestampSeconds * FLUX3_FPS) }))
);

export const getFlux3MentionOptions = (variant: Flux3Variant, mediaCount: number): string[] => {
  const policy = getFlux3ModePolicy(variant);
  if (policy.inputKind === 'source-video') return mediaCount > 0 ? ['@Video1'] : [];
  const limit = Math.min(mediaCount, policy.maxImages);
  return Array.from({ length: limit }, (_, index) => `@Image${index + 1}`);
};

export const normalizeFlux3PromptMentions = (prompt: string, variant: Flux3Variant): string => (
  prompt.replace(FLUX3_MENTION_REGEX, (match, prefix: string, kind: string, indexText: string) => {
    const index = Number(indexText);
    if (kind.toLowerCase() === 'video') return variant === 'extend' && index === 1 ? `${prefix}the source video` : match;
    if (variant === 'smart' && index === 1) return `${prefix}the starting image`;
    if (variant === 'first-last-frame') {
      if (index === 1) return `${prefix}the first frame`;
      if (index === 2) return `${prefix}the last frame`;
    }
    if (variant === 'keyframes') return `${prefix}keyframe ${index}`;
    return match;
  })
);

export const getInvalidFlux3Mentions = (prompt: string, validOptions: string[]): string[] => {
  const valid = new Set(validOptions.map(option => option.toLowerCase()));
  const invalid = new Set<string>();
  for (const match of prompt.matchAll(new RegExp(FLUX3_MENTION_REGEX.source, 'gi'))) {
    const token = `@${match[2]}${match[3]}`;
    if (!valid.has(token.toLowerCase())) invalid.add(token);
  }
  return [...invalid];
};

export interface Flux3RunPlanInput {
  prompt: string;
  variant: Flux3Variant;
  duration: Flux3Duration;
  primaryImageId?: string | null;
  lastFrameImageId?: string | null;
  referenceImageIds: readonly string[];
  sourceVideoId?: string | null;
  selectedMediaIds?: readonly string[];
  keyframeTimings: ReadonlyArray<Flux3KeyframeTiming>;
}

export interface Flux3RunPlan {
  policy: Flux3ModePolicy;
  mentionOptions: string[];
  keyframeTimings: Flux3KeyframeTiming[];
  keyframeError: string | null;
  inputError: string | null;
  mentionError: string | null;
  error: string | null;
}

export const buildFlux3RunPlan = ({
  prompt,
  variant,
  duration,
  primaryImageId = null,
  lastFrameImageId = null,
  referenceImageIds,
  sourceVideoId = null,
  selectedMediaIds,
  keyframeTimings,
}: Flux3RunPlanInput): Flux3RunPlan => {
  const policy = getFlux3ModePolicy(variant);
  const reconciledTimings = policy.inputKind === 'keyframe-images'
    ? reconcileFlux3KeyframeTimings(referenceImageIds, keyframeTimings, duration)
    : [];
  const keyframeError = policy.inputKind === 'keyframe-images'
    ? getFlux3KeyframeTimingError(reconciledTimings, duration)
    : null;
  const selectedInputIds = selectedMediaIds ? new Set(selectedMediaIds) : null;
  const firstLastInputCount = selectedInputIds
    ? new Set([...selectedInputIds, primaryImageId, lastFrameImageId].filter((id): id is string => Boolean(id))).size
    : null;
  const extendInputCount = selectedInputIds
    ? new Set([...selectedInputIds, sourceVideoId].filter((id): id is string => Boolean(id))).size
    : null;
  const inputError = policy.inputKind === 'first-last-images'
    && (!primaryImageId || !lastFrameImageId || (firstLastInputCount !== null && firstLastInputCount !== 2))
    ? 'Flux 3 First & Last Frame requires exactly two still images.'
    : policy.inputKind === 'source-video'
      && (!sourceVideoId || (extendInputCount !== null && extendInputCount !== 1))
      ? 'Flux 3 Extend requires exactly one source video.'
      : keyframeError;
  const mediaCount = policy.inputKind === 'source-video'
    ? sourceVideoId ? 1 : 0
    : policy.inputKind === 'keyframe-images'
      ? referenceImageIds.length
      : primaryImageId ? lastFrameImageId ? 2 : 1 : 0;
  const mentionOptions = getFlux3MentionOptions(variant, mediaCount);
  const invalidMentions = getInvalidFlux3Mentions(prompt, mentionOptions);
  const mentionError = invalidMentions.length > 0
    ? `These Flux 3 mentions do not match the selected canvas media: ${invalidMentions.join(', ')}.`
    : null;
  const promptError = prompt.trim() ? null : 'Flux 3 requires a prompt.';
  return {
    policy,
    mentionOptions,
    keyframeTimings: reconciledTimings,
    keyframeError,
    inputError,
    mentionError,
    error: promptError ?? mentionError ?? inputError,
  };
};
