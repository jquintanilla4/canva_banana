import { describe, expect, it, vi } from 'vitest';
import type { CanvasImage } from '../../../types';
import {
  LOD_TIER_SIZES,
  beginLodFrame,
  computeTierDimensions,
  createImageLodCache,
  disposeImageLodCache,
  endLodFrame,
  getLodDrawSource,
  pruneImageLodCache,
  selectLodTier,
  type LodBitmap,
  type LodBitmapFactory,
} from '../render/imageLodCache';

const buildImage = (id: string, overrides: Partial<CanvasImage> = {}): CanvasImage => {
  const element = document.createElement('img');
  Object.defineProperty(element, 'complete', { value: true });
  Object.defineProperty(element, 'naturalWidth', { value: 2048, configurable: true });
  Object.defineProperty(element, 'naturalHeight', { value: 1152, configurable: true });
  return {
    id,
    element,
    mediaType: 'image',
    x: 0,
    y: 0,
    width: 2048,
    height: 1152,
    rotation: 0,
    naturalWidth: 2048,
    naturalHeight: 1152,
    file: new File(['image'], `${id}.png`, { type: 'image/png' }),
    ...overrides,
  } as CanvasImage;
};

type FakeBitmap = LodBitmap & { closed: boolean };

const buildFakeBitmap = (width: number, height: number): FakeBitmap => {
  const bitmap: FakeBitmap = {
    width,
    height,
    closed: false,
    close: () => {
      bitmap.closed = true;
    },
  };
  return bitmap;
};

const buildControlledFactory = () => { // Resolves generated bitmaps only when flush() mimics async decode.
  const pendingResolves: Array<() => void> = [];
  const created: FakeBitmap[] = [];
  const factory: LodBitmapFactory = (_source, width, height) =>
    new Promise(resolve => {
      pendingResolves.push(() => {
        const bitmap = buildFakeBitmap(width, height);
        created.push(bitmap);
        resolve(bitmap);
      });
    });
  const flush = async () => {
    while (pendingResolves.length > 0) {
      pendingResolves.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return { factory, flush, created, pendingResolves };
};

describe('selectLodTier', () => {
  it('returns null for small sources, zoomed-in views, and bad input', () => {
    expect(selectLodTier(100, 512, null)).toBeNull(); // Source already small.
    expect(selectLodTier(2000, 4096, null)).toBeNull(); // Larger than the top tier.
    expect(selectLodTier(0, 4096, null)).toBeNull();
    expect(selectLodTier(Number.NaN, 4096, null)).toBeNull();
  });

  it('picks the smallest tier covering the on-screen size', () => {
    expect(selectLodTier(80, 2048, null)).toBe(128);
    expect(selectLodTier(128, 2048, null)).toBe(128);
    expect(selectLodTier(129, 2048, null)).toBe(256);
    expect(selectLodTier(1024, 2048, null)).toBe(1024);
  });

  it('holds the larger tier inside the hysteresis band when demoting', () => {
    expect(selectLodTier(120, 2048, 256)).toBe(256); // Stay at 256 above the 128 * 0.85 threshold.
    expect(selectLodTier(100, 2048, 256)).toBe(128); // Demote once comfortably below the threshold.
    expect(selectLodTier(300, 2048, 128)).toBe(512); // Promote immediately when needed.
  });

  it('demotes across multiple tiers in one step after a large zoom-out', () => {
    // Zoom-to-fit from 1:1: the band that holds 1024 is measured against 512 (the tier one
    // step down), not against the newly computed tier — otherwise the item is pinned at
    // 1024 forever and keeps a 2.4 MB bitmap to paint a thumbnail.
    expect(selectLodTier(120, 2048, 1024)).toBe(128);
    expect(selectLodTier(60, 2048, 1024)).toBe(128);
    expect(selectLodTier(500, 2048, 1024)).toBe(1024); // Stay at 1024 inside the 512 hysteresis band.
  });
});

describe('computeTierDimensions', () => {
  it('preserves aspect ratio against the longest side', () => {
    expect(computeTierDimensions(2048, 1152, 256)).toEqual({ width: 256, height: 144 });
    expect(computeTierDimensions(1152, 2048, 256)).toEqual({ width: 144, height: 256 });
  });

  it('never upscales past the natural size', () => {
    expect(computeTierDimensions(200, 100, 512)).toEqual({ width: 200, height: 100 });
  });
});

describe('imageLodCache', () => {
  it('defaults to a 400 MiB memory budget', () => {
    expect(createImageLodCache().maxBytes).toBe(400 * 1024 * 1024);
  });

  it('falls back to the element on a miss, then serves the bitmap once generated', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const requestRedraw = vi.fn();
    const cache = createImageLodCache({ bitmapFactory: factory, requestRedraw });
    const image = buildImage('a');
    const scale = 0.05; // 2048 * 0.05 ≈ 102 → tier 128.

    beginLodFrame(cache);
    expect(getLodDrawSource(cache, image, scale)).toBe(image.element);

    await flush();
    expect(created).toHaveLength(1);
    expect(created[0].width).toBe(128);
    await Promise.resolve(); // Let the coalesced microtask redraw fire.
    expect(requestRedraw).toHaveBeenCalledTimes(1);

    beginLodFrame(cache);
    expect(getLodDrawSource(cache, image, scale)).toBe(created[0]);
  });

  it('deduplicates concurrent requests for the same tier', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory });
    const image = buildImage('a');

    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.05);
    getLodDrawSource(cache, image, 0.05);
    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.05);

    await flush();
    expect(created).toHaveLength(1);
  });

  it('respects the concurrency cap and drains the queue LIFO', async () => {
    const { factory, pendingResolves } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxConcurrentJobs: 2 });

    beginLodFrame(cache);
    for (let i = 0; i < 5; i++) {
      getLodDrawSource(cache, buildImage(`img-${i}`), 0.05);
    }
    expect(pendingResolves).toHaveLength(2); // Only two jobs may run concurrently.
  });

  it('drops queued work that is no longer requested by the newest frame', () => {
    const { factory } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxConcurrentJobs: 1 });
    const running = buildImage('running');
    const stale = buildImage('stale');
    const visible = buildImage('visible');

    beginLodFrame(cache);
    getLodDrawSource(cache, running, 0.05);
    getLodDrawSource(cache, stale, 0.05);
    endLodFrame(cache);
    expect(cache.jobQueue.map(job => job.imageId)).toEqual(['stale']);

    beginLodFrame(cache);
    getLodDrawSource(cache, visible, 0.05);
    endLodFrame(cache);

    expect(cache.jobQueue.map(job => job.imageId)).toEqual(['visible']);
    expect([...cache.pending].some(key => key.startsWith('stale:'))).toBe(false);
  });

  it('keeps queued work that the newest frame still needs', () => {
    const { factory } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxConcurrentJobs: 1 });
    const running = buildImage('running');
    const keep = buildImage('keep');
    const stale = buildImage('stale');
    const visible = buildImage('visible');

    beginLodFrame(cache);
    getLodDrawSource(cache, running, 0.05);
    getLodDrawSource(cache, keep, 0.05);
    getLodDrawSource(cache, stale, 0.05);
    endLodFrame(cache);

    beginLodFrame(cache);
    getLodDrawSource(cache, keep, 0.05);
    getLodDrawSource(cache, visible, 0.05);
    endLodFrame(cache);

    expect(cache.jobQueue.map(job => job.imageId)).toEqual(['keep', 'visible']);
  });

  it('invalidates when the element reference changes (edit/undo)', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory });
    const image = buildImage('a');

    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.05);
    await flush();
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, image, 0.05)).toBe(created[0]);

    const edited = buildImage('a'); // Same id, new element — mirrors crop/bg-removal.
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, edited, 0.05)).toBe(edited.element);
    expect(created[0].closed).toBe(true);

    await flush();
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, edited, 0.05)).toBe(created[1]);
  });

  it('queues replacement content while the old source job is still running', async () => {
    const { factory, flush, created, pendingResolves } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory });
    const original = buildImage('a');
    const edited = buildImage('a'); // Same id and tier, but a replacement element.

    beginLodFrame(cache);
    expect(getLodDrawSource(cache, original, 0.05)).toBe(original.element);
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, edited, 0.05)).toBe(edited.element);
    expect(pendingResolves).toHaveLength(2); // Replacement work must not share the stale pending key.

    await flush();
    expect(created[0].closed).toBe(true); // The old source result is discarded.
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, edited, 0.05)).toBe(created[1]);
  });

  it('queues a new paused-video frame while the prior seek job is still running', async () => {
    const { factory, flush, created, pendingResolves } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory });
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1920 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 1080 });
    videoElement.currentTime = 1;
    const video = buildImage('v', {
      element: videoElement,
      mediaType: 'video',
      isPlaying: false,
    } as Partial<CanvasImage>);

    beginLodFrame(cache);
    expect(getLodDrawSource(cache, video, 0.05)).toBe(videoElement);
    videoElement.currentTime = 2;
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, video, 0.05)).toBe(videoElement);
    expect(pendingResolves).toHaveLength(2); // Each paused frame owns independent work.

    await flush();
    expect(created[0].closed).toBe(true); // The pre-seek frame cannot replace the current one.
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, video, 0.05)).toBe(created[1]);
  });

  it('does not let an old paused-video failure poison the current frame', async () => {
    let attempt = 0;
    let currentBitmap: FakeBitmap | null = null;
    const factory: LodBitmapFactory = async (_source, width, height) => {
      attempt += 1;
      if (attempt === 1) throw new Error('stale frame failed');
      currentBitmap = buildFakeBitmap(width, height);
      return currentBitmap;
    };
    const cache = createImageLodCache({ bitmapFactory: factory });
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1920 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 1080 });
    videoElement.currentTime = 1;
    const video = buildImage('v', {
      element: videoElement,
      mediaType: 'video',
      isPlaying: false,
    } as Partial<CanvasImage>);

    beginLodFrame(cache);
    getLodDrawSource(cache, video, 0.05);
    videoElement.currentTime = 2;
    beginLodFrame(cache);
    getLodDrawSource(cache, video, 0.05);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    beginLodFrame(cache);
    expect(currentBitmap).not.toBeNull();
    expect(getLodDrawSource(cache, video, 0.05)).toBe(currentBitmap);
  });

  it('evicts least-recently-used tiers over budget but never the current frame', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxBytes: 80_000 }); // Two 36,864-byte tier bitmaps fit.
    const first = buildImage('first');
    const second = buildImage('second');
    const third = buildImage('third');

    beginLodFrame(cache);
    getLodDrawSource(cache, first, 0.05);
    await flush();
    beginLodFrame(cache);
    getLodDrawSource(cache, second, 0.05);
    await flush();
    beginLodFrame(cache);
    getLodDrawSource(cache, third, 0.05);
    await flush();

    expect(created[0].closed).toBe(true); // The oldest bitmap is evicted first.
    expect(created[1].closed).toBe(false);
    expect(created[2].closed).toBe(false);
    expect(cache.totalBytes).toBeLessThanOrEqual(80_000);
  });

  it('keeps a receiving entry reachable when its previous tier is evicted', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxBytes: 160_000 }); // The 256 tier fits, but not beside the 128 tier.
    const image = buildImage('same-entry');

    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.05); // Generate the 128 tier first.
    await flush();

    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.1); // Queue a 256 tier while drawing the cached 128 fallback.
    beginLodFrame(cache); // The image leaves the viewport before the larger tier finishes.
    await flush();

    expect(created[0].closed).toBe(true); // The stale 128 tier made room for the completed 256 tier.
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, image, 0.1)).toBe(created[1]);
    expect(cache.totalBytes).toBe(created[1].width * created[1].height * 4);

    disposeImageLodCache(cache);
    expect(created[1].closed).toBe(true); // The replacement tier remains owned by the cache.
  });

  it('keeps the memory ceiling when every cached tier is visible', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxBytes: 80_000 });
    const first = buildImage('first');
    const second = buildImage('second');
    const third = buildImage('third');

    beginLodFrame(cache);
    getLodDrawSource(cache, first, 0.05);
    getLodDrawSource(cache, second, 0.05);
    getLodDrawSource(cache, third, 0.05);
    await flush();

    expect(cache.totalBytes).toBeLessThanOrEqual(80_000);
    expect(created.filter(bitmap => !bitmap.closed)).toHaveLength(2);
    expect(cache.budgetBlocked.size).toBe(1); // The overflow tier uses its source instead of exceeding the budget.

    beginLodFrame(cache);
    getLodDrawSource(cache, first, 0.05);
    getLodDrawSource(cache, second, 0.05);
    getLodDrawSource(cache, third, 0.05);
    endLodFrame(cache);
    await flush();

    expect(created).toHaveLength(3); // A blocked visible tier is not regenerated every frame.
    expect(cache.totalBytes).toBeLessThanOrEqual(80_000);
  });

  it('lets a visible blocked tier replace stale offscreen cache data', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxBytes: 40_000 }); // Only one 36,864-byte tier fits.
    const first = buildImage('first');
    const second = buildImage('second');

    beginLodFrame(cache);
    getLodDrawSource(cache, first, 0.05);
    getLodDrawSource(cache, second, 0.05);
    await flush();
    expect(cache.budgetBlocked.size).toBe(1);

    beginLodFrame(cache);
    getLodDrawSource(cache, second, 0.05);
    endLodFrame(cache); // The first tier is now stale and can make room for the visible second tier.

    beginLodFrame(cache);
    getLodDrawSource(cache, second, 0.05);
    await flush();

    expect(created).toHaveLength(3);
    expect(created[0].closed).toBe(true);
    expect(created[1].closed).toBe(true);
    expect(created[2].closed).toBe(false);
    expect(cache.totalBytes).toBeLessThanOrEqual(40_000);
  });

  it('marks failed generations and falls back to the element without retrying', async () => {
    let attempts = 0;
    const failingFactory: LodBitmapFactory = () => {
      attempts += 1;
      return Promise.reject(new Error('tainted'));
    };
    const cache = createImageLodCache({ bitmapFactory: failingFactory });
    const image = buildImage('a');

    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.05);
    await Promise.resolve();
    await Promise.resolve();

    beginLodFrame(cache);
    expect(getLodDrawSource(cache, image, 0.05)).toBe(image.element);
    expect(attempts).toBe(1);
  });

  it('prunes entries for removed and replaced media', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory });
    const keep = buildImage('keep');
    const remove = buildImage('remove');

    beginLodFrame(cache);
    getLodDrawSource(cache, keep, 0.05);
    getLodDrawSource(cache, remove, 0.05);
    await flush();

    pruneImageLodCache(cache, [keep]);
    expect(created.some(bitmap => bitmap.closed)).toBe(true);
    beginLodFrame(cache);
    expect(getLodDrawSource(cache, keep, 0.05)).toBe(created[0]);
  });

  it('cancels queued bitmap work for pruned media', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const cache = createImageLodCache({ bitmapFactory: factory, maxConcurrentJobs: 1 });
    const keep = buildImage('keep');
    const remove = buildImage('remove');

    beginLodFrame(cache);
    getLodDrawSource(cache, keep, 0.05); // Occupy the only worker.
    getLodDrawSource(cache, remove, 0.05); // Leave removed media queued.
    expect(cache.jobQueue).toHaveLength(1);

    pruneImageLodCache(cache, [keep]);
    expect(cache.jobQueue).toHaveLength(0);
    expect([...cache.pending].some(key => key.startsWith('remove:'))).toBe(false);

    await flush();
    expect(created).toHaveLength(1); // The removed source was never rasterized.
  });

  it('closes everything and stops producing bitmaps after dispose', async () => {
    const { factory, flush, created } = buildControlledFactory();
    const requestRedraw = vi.fn();
    const cache = createImageLodCache({ bitmapFactory: factory, requestRedraw });
    const image = buildImage('a');

    beginLodFrame(cache);
    getLodDrawSource(cache, image, 0.05);
    disposeImageLodCache(cache);
    await flush();

    expect(created.every(bitmap => bitmap.closed)).toBe(true);
    expect(requestRedraw).not.toHaveBeenCalled();
  });

  it('returns the element directly for playing videos', () => {
    const cache = createImageLodCache({ bitmapFactory: buildControlledFactory().factory });
    const videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1920 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 1080 });
    const video = buildImage('v', {
      element: videoElement,
      mediaType: 'video',
      isPlaying: true,
    } as Partial<CanvasImage>);

    beginLodFrame(cache);
    expect(getLodDrawSource(cache, video, 0.05)).toBe(videoElement);
  });

  it('exposes ascending tier sizes', () => {
    const sorted = [...LOD_TIER_SIZES].sort((a, b) => a - b);
    expect([...LOD_TIER_SIZES]).toEqual(sorted);
  });
});
