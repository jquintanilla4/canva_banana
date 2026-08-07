import type { CanvasImage } from '../../../types';
import { isVideoImage } from '../mediaGuards';

// Level-of-detail cache for canvas media. Canvas2D has no mipmapping, so drawing a
// 2048×1152 element into an 80×45 rect resamples millions of source pixels per image per
// frame. This cache holds downscaled bitmaps at fixed tiers and hands the draw loop the
// smallest one that still covers the item's on-screen size.

export const LOD_TIER_SIZES = [128, 256, 512, 1024] as const; // Longest side, px.

const LOD_MIN_SOURCE_SIZE = 512; // Smaller sources are cheap enough to draw directly.

// Demote to a smaller tier only once the item is comfortably below it, so zooming across
// a boundary doesn't flicker between sharpness levels.
const LOD_DEMOTE_RATIO = 0.85;

const DEFAULT_MAX_BYTES = 400 * 1024 * 1024; // Keep a generous desktop cache while enforcing a hard ceiling.
const DEFAULT_MAX_CONCURRENT_JOBS = 4;
// Background prewarm never occupies more than this many decode slots, so a burst of
// visible-tier jobs always has capacity the moment it arrives.
const PREWARM_MAX_CONCURRENT_JOBS = 2;

// A zoom jump across a tier boundary re-tiers every visible item in the same settle
// frame. Enqueueing them all at once turns the next second into a 4-wide decode storm
// that competes with pan frames, so new tier jobs are metered per frame — each landing
// batch triggers a redraw, which refills the next slice until the view is sharp.
const MAX_TIER_ENQUEUES_PER_FRAME = 8;
// While the user is actively panning/zooming, tier decodes also run narrower so the
// thread pool stays responsive; the full width returns the moment the view rests.
const GESTURE_MAX_CONCURRENT_JOBS = 2;

export type LodBitmap = {
  readonly width: number;
  readonly height: number;
  close(): void;
};

export type LodBitmapFactory = (
  source: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number,
) => Promise<LodBitmap>;

export type ImageLodCacheOptions = {
  maxBytes?: number;
  maxConcurrentJobs?: number;
  // Called (coalesced, at most once per completion batch) when new bitmaps are ready and
  // the scene should repaint. Must be safe to call at any time.
  requestRedraw?: () => void;
  bitmapFactory?: LodBitmapFactory; // Injectable for tests; defaults to createImageBitmap with a canvas fallback.
};

type LodTierEntry = {
  bitmap: LodBitmap;
  bytes: number;
  lastUsedFrame: number;
};

type LodEntry = {
  revision: number; // Distinguishes replacement content that reuses an image id.
  // The element the tiers were generated from. Content edits (crop, resize, background
  // removal, undo) swap CanvasImage.element while keeping the id, so reference equality
  // here is the invalidation key.
  source: HTMLImageElement | HTMLVideoElement;
  tiers: Map<number, LodTierEntry>;
  lastTier: number | null;
  failed: boolean;
  videoTimeKey: number | null; // Captured currentTime for paused-video tiers.
};

type LodJob = {
  key: string;
  imageId: string;
  entryRevision: number; // Prevents stale work from attaching to a replacement entry.
  source: HTMLImageElement | HTMLVideoElement;
  tierSize: number;
  width: number;
  height: number;
  videoTimeKey: number | null;
};

type BudgetBlockedTier = {
  imageId: string;
  entryRevision: number;
  bytes: number;
};

export type ImageLodCache = {
  entries: Map<string, LodEntry>;
  nextEntryRevision: number; // Monotonic identity for each new cache entry.
  pending: Set<string>;
  requestedJobKeys: Set<string>; // Queued tiers needed by the frame currently being drawn.
  budgetBlocked: Map<string, BudgetBlockedTier>; // Prevents over-budget misses from regenerating every frame.
  jobQueue: LodJob[];
  // Low-priority smallest-tier jobs for items nothing has drawn yet. Runs only on idle
  // decode capacity and survives endLodFrame's viewport culling: its whole point is to
  // cover items BEFORE they enter the viewport, so panning never falls back to a
  // full-resolution drawImage of a cold source.
  prewarmQueue: LodJob[];
  runningJobs: number;
  totalBytes: number;
  frameId: number;
  frameEnqueueBudget: number; // Remaining new tier jobs this frame may queue.
  gestureThrottled: boolean; // Narrow decode concurrency while a view gesture is live.
  redrawQueued: boolean;
  disposed: boolean;
  maxBytes: number;
  maxConcurrentJobs: number;
  requestRedraw: (() => void) | null;
  bitmapFactory: LodBitmapFactory;
};

// Stepped-halving canvas fallback for environments without createImageBitmap resize
// support. Halving before the final resample approximates proper filtering.
const canvasBitmapFactory: LodBitmapFactory = async (source, width, height) => {
  let currentSource: CanvasImageSource = source;
  let currentWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  let currentHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

  while (currentWidth / 2 >= width * 2 && currentHeight / 2 >= height * 2) {
    const step = document.createElement('canvas');
    step.width = Math.max(1, Math.round(currentWidth / 2));
    step.height = Math.max(1, Math.round(currentHeight / 2));
    const stepCtx = step.getContext('2d');
    if (!stepCtx) break;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(currentSource, 0, 0, step.width, step.height);
    currentSource = step;
    currentWidth = step.width;
    currentHeight = step.height;
  }

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const targetCtx = target.getContext('2d');
  if (!targetCtx) {
    throw new Error('imageLodCache: 2d context unavailable');
  }
  targetCtx.imageSmoothingQuality = 'high';
  targetCtx.drawImage(currentSource, 0, 0, width, height);
  // The canvas itself is the drawable (a valid CanvasImageSource); close() releases its
  // backing store the same way ImageBitmap.close() does.
  const drawable = target as HTMLCanvasElement & { close: () => void };
  drawable.close = () => {
    target.width = 0;
    target.height = 0;
  };
  return drawable;
};

const defaultBitmapFactory: LodBitmapFactory = (source, width, height) => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(source, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    });
  }
  return canvasBitmapFactory(source, width, height);
};

export function createImageLodCache(options: ImageLodCacheOptions = {}): ImageLodCache {
  return {
    entries: new Map(),
    nextEntryRevision: 1,
    pending: new Set(),
    requestedJobKeys: new Set(),
    budgetBlocked: new Map(),
    jobQueue: [],
    prewarmQueue: [],
    runningJobs: 0,
    totalBytes: 0,
    frameId: 0,
    frameEnqueueBudget: Number.POSITIVE_INFINITY, // Unmetered until the first beginLodFrame.
    gestureThrottled: false,
    redrawQueued: false,
    disposed: false,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    maxConcurrentJobs: options.maxConcurrentJobs ?? DEFAULT_MAX_CONCURRENT_JOBS,
    requestRedraw: options.requestRedraw ?? null,
    bitmapFactory: options.bitmapFactory ?? defaultBitmapFactory,
  };
}

export function selectLodTier(
  screenLongest: number,
  naturalLongest: number,
  lastTier: number | null,
): number | null { // Returns null when the full-resolution element should draw.
  if (!Number.isFinite(screenLongest) || screenLongest <= 0) return null;
  if (naturalLongest <= LOD_MIN_SOURCE_SIZE) return null;

  const largestTier = LOD_TIER_SIZES[LOD_TIER_SIZES.length - 1];
  if (screenLongest > largestTier) return null; // Zoomed in: full-res path, unchanged.

  let tier: number = largestTier;
  for (const tierSize of LOD_TIER_SIZES) {
    if (tierSize >= screenLongest) {
      tier = tierSize;
      break;
    }
  }

  // Hysteresis: stay on the current (larger) tier until the item drops comfortably below
  // the tier one step down from it, so zooming across that boundary doesn't flicker. The
  // threshold must come from lastTier's neighbour, not from the newly computed tier —
  // comparing against the new tier would pin a large lastTier forever after any big
  // zoom-out, since the new tier's threshold is always well below screenLongest.
  if (lastTier !== null && lastTier > tier) {
    const lastIndex = LOD_TIER_SIZES.indexOf(lastTier as (typeof LOD_TIER_SIZES)[number]);
    const nextSmaller = lastIndex > 0 ? LOD_TIER_SIZES[lastIndex - 1] : null;
    if (nextSmaller !== null && screenLongest > nextSmaller * LOD_DEMOTE_RATIO) {
      tier = lastTier;
    }
  }

  return tier;
}

export function computeTierDimensions(
  naturalWidth: number,
  naturalHeight: number,
  tierSize: number,
): { width: number; height: number } { // Preserves aspect ratio without upscaling.
  const longest = Math.max(naturalWidth, naturalHeight);
  const ratio = Math.min(1, tierSize / Math.max(1, longest));
  return {
    width: Math.max(1, Math.round(naturalWidth * ratio)),
    height: Math.max(1, Math.round(naturalHeight * ratio)),
  };
}

const getSourceNaturalSize = (
  source: HTMLImageElement | HTMLVideoElement,
): { width: number; height: number } => (
  source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.naturalWidth, height: source.naturalHeight }
);

const dropEntry = (cache: ImageLodCache, imageId: string, entry: LodEntry): void => {
  entry.tiers.forEach(tier => {
    cache.totalBytes -= tier.bytes;
    tier.bitmap.close();
  });
  entry.tiers.clear();
  cache.entries.delete(imageId);
  cache.budgetBlocked.forEach((blocked, key) => {
    if (blocked.imageId === imageId && blocked.entryRevision === entry.revision) {
      cache.budgetBlocked.delete(key);
    }
  });
};

const evictUntilFits = (
  cache: ImageLodCache,
  incomingBytes: number,
  receivingEntry?: LodEntry,
): boolean => {
  if (incomingBytes > cache.maxBytes) return false; // A single tier larger than the budget draws from its source.
  while (cache.totalBytes + incomingBytes > cache.maxBytes) {
    let oldestKey: { imageId: string; tierSize: number } | null = null;
    let oldestFrame = Infinity;
    cache.entries.forEach((entry, imageId) => {
      entry.tiers.forEach((tier, tierSize) => {
        if (tier.lastUsedFrame >= cache.frameId) return; // Never evict the tier drawn this frame.
        if (tier.lastUsedFrame < oldestFrame) {
          oldestFrame = tier.lastUsedFrame;
          oldestKey = { imageId, tierSize };
        }
      });
    });
    if (!oldestKey) return false; // The visible working set owns the remaining budget.
    const { imageId, tierSize } = oldestKey as { imageId: string; tierSize: number };
    const entry = cache.entries.get(imageId);
    const tier = entry?.tiers.get(tierSize);
    if (!entry || !tier) return false;
    cache.totalBytes -= tier.bytes;
    tier.bitmap.close();
    entry.tiers.delete(tierSize);
    if (entry.tiers.size === 0 && entry !== receivingEntry) {
      cache.entries.delete(imageId);
    } // Keep the destination registered until the caller attaches its completed tier.
  }
  return true;
};

const flushRedraw = (cache: ImageLodCache): void => {
  if (cache.redrawQueued || !cache.requestRedraw) return;
  cache.redrawQueued = true;
  queueMicrotask(() => {
    cache.redrawQueued = false;
    if (!cache.disposed) {
      cache.requestRedraw?.();
    }
  });
};

const startJob = (cache: ImageLodCache, job: LodJob): void => {
  cache.runningJobs += 1;
  cache.bitmapFactory(job.source, job.width, job.height)
    .then(bitmap => {
      cache.runningJobs -= 1;
      cache.pending.delete(job.key);
      if (cache.disposed) {
        bitmap.close();
        return;
      }
      const entry = cache.entries.get(job.imageId); // The source may have changed while the job ran.
      if (!entry || entry.revision !== job.entryRevision || entry.source !== job.source || entry.videoTimeKey !== job.videoTimeKey) {
        bitmap.close();
        pumpJobs(cache);
        return;
      }
      const bytes = bitmap.width * bitmap.height * 4;
      if (!evictUntilFits(cache, bytes, entry)) {
        bitmap.close();
        cache.budgetBlocked.set(job.key, {
          imageId: job.imageId,
          entryRevision: job.entryRevision,
          bytes,
        }); // Fall back to the source without exceeding the cache or regenerating every frame.
        pumpJobs(cache);
        return;
      }
      entry.tiers.set(job.tierSize, { bitmap, bytes, lastUsedFrame: cache.frameId });
      cache.totalBytes += bytes;
      flushRedraw(cache);
      pumpJobs(cache);
    })
    .catch(() => {
      cache.runningJobs -= 1;
      cache.pending.delete(job.key);
      if (cache.disposed) return;
      const entry = cache.entries.get(job.imageId);
      if (entry?.revision === job.entryRevision && entry.source === job.source && entry.videoTimeKey === job.videoTimeKey) {
        entry.failed = true; // Tainted or undecodable source: draw full-res forever.
      }
      pumpJobs(cache);
    });
};

const pumpJobs = (cache: ImageLodCache): void => {
  const regularCap = cache.gestureThrottled
    ? Math.min(cache.maxConcurrentJobs, GESTURE_MAX_CONCURRENT_JOBS)
    : cache.maxConcurrentJobs;
  while (!cache.disposed && cache.runningJobs < regularCap && cache.jobQueue.length > 0) {
    startJob(cache, cache.jobQueue.pop()!); // LIFO: the most recently requested view wins.
  }
  // Prewarm strictly yields to visible-tier work: it runs only when the regular queue is
  // drained, and holds fewer slots so an arriving burst always has decode capacity.
  const prewarmCap = Math.min(cache.maxConcurrentJobs, PREWARM_MAX_CONCURRENT_JOBS);
  while (!cache.disposed && cache.jobQueue.length === 0 && cache.runningJobs < prewarmCap && cache.prewarmQueue.length > 0) {
    startJob(cache, cache.prewarmQueue.shift()!); // FIFO: cover the document in load order.
  }
};

export function beginLodFrame(cache: ImageLodCache, opts?: { throttleJobs?: boolean }): void { // Starts LRU bookkeeping for a new paint.
  cache.frameId += 1;
  cache.requestedJobKeys.clear();
  cache.frameEnqueueBudget = MAX_TIER_ENQUEUES_PER_FRAME;
  cache.gestureThrottled = opts?.throttleJobs ?? false;
}

export function endLodFrame(cache: ImageLodCache): void {
  cache.jobQueue = cache.jobQueue.filter(job => {
    if (cache.requestedJobKeys.has(job.key)) return true;
    cache.pending.delete(job.key);
    return false;
  }); // Do not rasterize media that left the newest viewport while waiting in the queue.

  cache.budgetBlocked.forEach((_blocked, key) => {
    if (!cache.requestedJobKeys.has(key)) {
      cache.budgetBlocked.delete(key); // Leaving the viewport permits a fresh attempt when the tier returns.
    }
  });

  // If an over-budget visible tier can replace stale offscreen data, free that space and
  // request one retry. Processing one tier at a time keeps concurrent jobs within budget.
  for (const [key, blocked] of cache.budgetBlocked) {
    if (!cache.requestedJobKeys.has(key)) continue;
    if (evictUntilFits(cache, blocked.bytes)) {
      cache.budgetBlocked.delete(key);
      flushRedraw(cache);
    }
    break;
  }
}

// Queues background smallest-tier generation for every item that has no cached tier yet.
// Call when the images array changes (load, generation, edit): the cold-entry fallback in
// getLodDrawSource is a full-resolution drawImage, and panning a large zoomed-out document
// hits it for every item entering the viewport until some tier exists. The smallest tier
// is ~37 KB for a 16:9 item, so covering an entire large document is a few MB.
export function prewarmImageLodCache(cache: ImageLodCache, images: readonly CanvasImage[]): void {
  if (cache.disposed) return;
  const queuedIds = new Set(cache.prewarmQueue.map(job => job.imageId));
  images.forEach(image => {
    let videoTimeKey: number | null = null;
    if (isVideoImage(image)) {
      // Undecoded videos draw a cheap placeholder (and createImageBitmap on them would
      // reject, permanently marking the entry failed); playing ones bypass the cache.
      if (image.isPlaying || image.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      videoTimeKey = image.element.currentTime;
    }
    const element = image.element;
    const natural = getSourceNaturalSize(element);
    const naturalLongest = Math.max(natural.width, natural.height);
    if (naturalLongest <= LOD_MIN_SOURCE_SIZE) return; // Small sources always draw directly.
    if (queuedIds.has(image.id)) return;

    let entry = cache.entries.get(image.id);
    if (entry && (entry.source !== element || entry.videoTimeKey !== videoTimeKey)) {
      return; // Stale entry; the draw path (or prune) reconciles it first.
    }
    if (entry && (entry.failed || entry.tiers.size > 0)) return; // Already warm enough to avoid the full-res fallback.
    if (!entry) {
      entry = {
        revision: cache.nextEntryRevision++,
        source: element,
        tiers: new Map(),
        lastTier: null,
        failed: false,
        videoTimeKey,
      };
      cache.entries.set(image.id, entry);
    }

    const tierSize = LOD_TIER_SIZES[0];
    const jobKey = `${image.id}:${entry.revision}:${tierSize}`;
    if (cache.pending.has(jobKey) || cache.budgetBlocked.has(jobKey)) return;
    cache.pending.add(jobKey);
    const dims = computeTierDimensions(natural.width, natural.height, tierSize);
    cache.prewarmQueue.push({
      key: jobKey,
      imageId: image.id,
      entryRevision: entry.revision,
      source: element,
      tierSize,
      width: dims.width,
      height: dims.height,
      videoTimeKey,
    });
  });
  pumpJobs(cache);
}

// Synchronous frame-time lookup. Returns what ctx.drawImage should use THIS frame and
// schedules async generation on a miss (fallback: nearest cached tier, else the element).
export function getLodDrawSource(
  cache: ImageLodCache,
  image: CanvasImage,
  scale: number,
  opts?: { deferTierJobs?: boolean },
): CanvasImageSource {
  let videoTimeKey: number | null = null;
  if (isVideoImage(image)) {
    if (image.isPlaying) {
      return image.element; // Playing frames change every tick; caching would only add copies.
    }
    videoTimeKey = image.element.currentTime;
  }
  const element = image.element;

  const natural = getSourceNaturalSize(element);
  const naturalLongest = Math.max(natural.width, natural.height);
  if (naturalLongest <= 0) {
    return element;
  }

  let entry = cache.entries.get(image.id);
  if (entry && (entry.source !== element || entry.videoTimeKey !== videoTimeKey)) {
    dropEntry(cache, image.id, entry); // Content changed (edit/undo or video seek).
    entry = undefined;
  }
  if (entry?.failed) {
    return element;
  }

  const screenLongest = Math.max(image.width, image.height) * scale;
  const tierSize = selectLodTier(screenLongest, naturalLongest, entry?.lastTier ?? null);
  if (tierSize === null) {
    if (entry) entry.lastTier = null;
    return element;
  }

  if (!entry) {
    entry = {
      revision: cache.nextEntryRevision++,
      source: element,
      tiers: new Map(),
      lastTier: null,
      failed: false,
      videoTimeKey,
    };
    cache.entries.set(image.id, entry);
  }

  const cached = entry.tiers.get(tierSize);
  if (cached) {
    cached.lastUsedFrame = cache.frameId;
    entry.lastTier = tierSize;
    return cached.bitmap as unknown as CanvasImageSource;
  }

  // During a view gesture (pan or zoom), tier promotions are deferred: the nearest cached
  // tier keeps drawing (momentarily soft) and the settle frame enqueues the real tier. Skipping
  // requestedJobKeys also lets endLodFrame cancel promotions queued by earlier frames
  // of the same sweep. Cold entries still enqueue — with no tier at all the fallback is
  // a full-res drawImage, which costs more than the job it would skip.
  if (!(opts?.deferTierJobs && entry.tiers.size > 0)) {
    const jobKey = `${image.id}:${entry.revision}:${tierSize}`; // Queue a miss while drawing the best cached fallback.
    cache.requestedJobKeys.add(jobKey);
    // The per-frame budget meters NEW work only; already-queued keys stay requested so
    // endLodFrame keeps them. Over-budget misses draw their fallback and retry on a later
    // frame — every landing batch requests a redraw, so the refill chain sustains itself.
    if (!cache.pending.has(jobKey) && !cache.budgetBlocked.has(jobKey) && cache.frameEnqueueBudget > 0) {
      cache.frameEnqueueBudget -= 1;
      cache.pending.add(jobKey);
      const dims = computeTierDimensions(natural.width, natural.height, tierSize);
      cache.jobQueue.push({
        key: jobKey,
        imageId: image.id,
        entryRevision: entry.revision,
        source: element,
        tierSize,
        width: dims.width,
        height: dims.height,
        videoTimeKey,
      });
      pumpJobs(cache);
    }
  }

  // Prefer the nearest larger cached tier (sharper), then the nearest smaller one
  // (cheap, momentarily soft), then the full-res element.
  let fallbackTier: number | null = null;
  for (const size of LOD_TIER_SIZES) {
    if (size > tierSize && entry.tiers.has(size)) {
      fallbackTier = size;
      break;
    }
  }
  if (fallbackTier === null) {
    for (let i = LOD_TIER_SIZES.length - 1; i >= 0; i--) {
      const size = LOD_TIER_SIZES[i];
      if (size < tierSize && entry.tiers.has(size)) {
        fallbackTier = size;
        break;
      }
    }
  }
  if (fallbackTier !== null) {
    const tier = entry.tiers.get(fallbackTier)!;
    tier.lastUsedFrame = cache.frameId;
    entry.lastTier = tierSize; // Track the desired tier so hysteresis follows intent.
    return tier.bitmap as unknown as CanvasImageSource;
  }
  return element;
}

// Drops cache state for removed items and swapped elements. Call when the images array
// changes so bitmaps (and their source elements) don't outlive the canvas content.
export function pruneImageLodCache(cache: ImageLodCache, images: readonly CanvasImage[]): void {
  const liveElements = new Map<string, HTMLImageElement | HTMLVideoElement>();
  images.forEach(image => {
    liveElements.set(image.id, image.element);
  });
  const staleIds: string[] = [];
  cache.entries.forEach((entry, imageId) => {
    if (liveElements.get(imageId) !== entry.source) {
      staleIds.push(imageId);
    }
  });
  staleIds.forEach(imageId => {
    const entry = cache.entries.get(imageId);
    if (entry) dropEntry(cache, imageId, entry);
  });

  cache.budgetBlocked.forEach((blocked, key) => {
    const entry = cache.entries.get(blocked.imageId);
    if (!entry || entry.revision !== blocked.entryRevision) {
      cache.budgetBlocked.delete(key);
    }
  });

  const keepCurrentJob = (job: LodJob): boolean => {
    const entry = cache.entries.get(job.imageId);
    const isCurrentJob = liveElements.get(job.imageId) === job.source
      && entry?.revision === job.entryRevision
      && entry.source === job.source
      && entry.videoTimeKey === job.videoTimeKey;
    if (!isCurrentJob) cache.pending.delete(job.key); // Queued work can be cancelled before bitmap creation starts.
    return isCurrentJob;
  };
  cache.jobQueue = cache.jobQueue.filter(keepCurrentJob);
  cache.prewarmQueue = cache.prewarmQueue.filter(keepCurrentJob);
}

export function disposeImageLodCache(cache: ImageLodCache): void {
  cache.disposed = true;
  cache.jobQueue.length = 0;
  cache.prewarmQueue.length = 0;
  cache.entries.forEach(entry => {
    entry.tiers.forEach(tier => tier.bitmap.close());
    entry.tiers.clear();
  });
  cache.entries.clear();
  cache.pending.clear();
  cache.requestedJobKeys.clear();
  cache.budgetBlocked.clear();
  cache.totalBytes = 0;
}
