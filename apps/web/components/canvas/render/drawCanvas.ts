import { formatDuration } from '../../../services/audioService';
import { Tool, type CanvasImage, type CanvasImageMetadata, type CanvasNote, type Path, type Point } from '../../../types';
import { CROP_HANDLE_SIZE, NOTE_PIN_BORDER, NOTE_PIN_FILL, NOTE_PIN_LABEL_FONT_SIZE, ROTATION_HANDLE_DISTANCE, TRANSFORM_HANDLE_SIZE } from '../constants';
import { getImageBounds, getImageCenter, getImageRotation, getNotePinGeometry } from '../geometry';
import { isVideoImage } from '../mediaGuards';
import { beginLodFrame, endLodFrame, getLodDrawSource, type ImageLodCache } from './imageLodCache';
import { fitTextWithinBox } from './text';

type CropModeState = { imageId: string; rect: { x: number; y: number; width: number; height: number; }; };
type TransformModeState = { imageId: string; };
type CanvasBadgeColors = { fill: string; stroke: string; text: string };
type CanvasRect = { minX: number; minY: number; maxX: number; maxY: number };

const FAVORITE_STAR_INSET_RATIO = 1.5;
const FAVORITE_STAR_RADIUS_RATIO = 0.058; // ~11.6% of the item's smaller dimension as diameter.
const FAVORITE_STAR_PREFERRED_MIN_RADIUS = 10;
const FAVORITE_STAR_BACKDROP_RATIO = 1.3; // Backdrop half-size relative to the star's outer radius.

type TextFitResult = { fontSize: number; lineHeight: number; lines: string[] };
// fit stays null until the text is first drawn at readable size, so toggling the overlay
// on while zoomed far out never pays the measureText-heavy fit for hundreds of items.
type OverlayEntry = { overlayText: string; fit: TextFitResult | null };

// Below these screen sizes the metadata text is illegible; its layout and fill are pure
// cost, and zoomed out they dominate the frame. The dark band still draws so the toggle
// reads as on.
const OVERLAY_TEXT_MIN_BAND_SCREEN_PX = 6;
const OVERLAY_TEXT_MIN_FONT_SCREEN_PX = 3.5;

// Items smaller than this on screen skip badges and favorite stars — the chrome would be
// illegible anyway, and its layout cost dominates zoomed-out frames. Measured against the
// item's LONGER on-screen side, so a tall narrow item still keeps its markers.
export const MIN_CHROME_SCREEN_PX = 40;

// Re-rasterize the path layer when zoom drifts this far from the view scale the bitmap
// was rasterized at. Both sides of this comparison are raw view scales — never a clamped
// raster resolution — so a fresh raster always satisfies its own predicate and the cache
// converges instead of re-stroking every frame.
const PATH_RASTER_SCALE_MIN_RATIO = 0.5;
const PATH_RASTER_SCALE_MAX_RATIO = 1.25; // Above this the blit would upscale visibly.
const PATH_LAYER_MAX_PX = 4096; // Cap the offscreen path bitmap's longest side.
// World margin rasterized around the viewport so short pans stay cache hits. Coverage is
// sacrificed before resolution, so strokes stay crisp no matter how far apart they are.
const PATH_LAYER_VIEWPORT_MARGIN_RATIO = 0.35;

export type CanvasRenderCache = {
  pathCanvas: HTMLCanvasElement | null;
  // Identity of the paths array the bitmap was rasterized from. Appending a point
  // replaces the outer array, so reference equality detects every content change in O(1).
  pathsRef: Path[] | null;
  pathBounds: CanvasRect | null; // Recomputed only when pathsRef changes.
  pathRasterScale: number; // Bitmap pixels per world unit.
  pathViewScale: number; // The view scale the bitmap was rasterized at.
  pathWorldRect: CanvasRect | null; // World region the bitmap covers.
  dotGridTile: HTMLCanvasElement | null;
  dotGridPattern: CanvasPattern | null;
  dotGridKey: string | null;
  // Overlay text and its fit are pure functions of the item object (world-unit box,
  // metadata text), so entries key on item identity like getImageBounds and are GC'd
  // with the item. null marks items whose overlay text is empty.
  overlayFitCache: WeakMap<CanvasImage, OverlayEntry | null>;
};

export const createCanvasRenderCache = (): CanvasRenderCache => ({
  pathCanvas: null,
  pathsRef: null,
  pathBounds: null,
  pathRasterScale: 0,
  pathViewScale: 0,
  pathWorldRect: null,
  dotGridTile: null,
  dotGridPattern: null,
  dotGridKey: null,
  overlayFitCache: new WeakMap(),
});

const getWorldViewport = (canvas: HTMLCanvasElement, pan: Point, scale: number): CanvasRect => {
  const safeScale = Math.max(scale, 0.0001); // Avoid divide-by-zero if scale is ever malformed.
  return {
    minX: -pan.x / safeScale,
    minY: -pan.y / safeScale,
    maxX: (canvas.width - pan.x) / safeScale,
    maxY: (canvas.height - pan.y) / safeScale,
  };
};

const expandRect = (rect: CanvasRect, amount: number): CanvasRect => ({
  minX: rect.minX - amount,
  minY: rect.minY - amount,
  maxX: rect.maxX + amount,
  maxY: rect.maxY + amount,
});

const rectsIntersect = (a: CanvasRect, b: CanvasRect): boolean => (
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
);

const intersectRects = (a: CanvasRect, b: CanvasRect): CanvasRect | null => {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
};

const rectContains = (outer: CanvasRect, inner: CanvasRect): boolean => (
  outer.minX <= inner.minX && outer.maxX >= inner.maxX
  && outer.minY <= inner.minY && outer.maxY >= inner.maxY
);

// Shrinks [min, max] toward [keepMin, keepMax] until it fits maxSpan, never dropping any
// of the keep range — the result still covers everything currently on screen.
const fitSpanAroundKeep = (
  min: number,
  max: number,
  keepMin: number,
  keepMax: number,
  maxSpan: number,
): [number, number] => {
  if (max - min <= maxSpan) return [min, max];
  const span = Math.max(maxSpan, keepMax - keepMin);
  const center = (keepMin + keepMax) / 2;
  let lo = center - span / 2;
  let hi = center + span / 2;
  if (lo < min) {
    hi = Math.min(max, hi + (min - lo));
    lo = min;
  }
  if (hi > max) {
    lo = Math.max(min, lo - (hi - max));
    hi = max;
  }
  return [lo, hi];
};

const getAudioPlaybackTime = (
  image: CanvasImage,
  audioPlaybackTimes?: Readonly<Record<string, number>>,
): number | undefined => (
  image.isPlaying ? audioPlaybackTimes?.[image.id] ?? image.currentPlaybackTime : image.currentPlaybackTime
);

const getReusablePathCanvas = (cache: CanvasRenderCache, width: number, height: number): HTMLCanvasElement => {
  if (!cache.pathCanvas) {
    cache.pathCanvas = document.createElement('canvas'); // One offscreen layer is reused across draws.
  }
  if (cache.pathCanvas.width !== width || cache.pathCanvas.height !== height) {
    cache.pathCanvas.width = width;
    cache.pathCanvas.height = height;
  }
  return cache.pathCanvas;
};

const computePathBounds = (paths: Path[]): CanvasRect | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxStroke = 0;
  paths.forEach(path => {
    if (path.size > maxStroke) maxStroke = path.size;
    path.points.forEach(point => {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    });
  });
  if (!Number.isFinite(minX)) return null;
  const margin = maxStroke / 2 + 2;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
};

// The path layer is rasterized in WORLD space and blitted under the scene transform, so
// panning is a cache hit; only content changes, panning past the margin, or real zoom
// drift re-stroke. The rasterized region is clipped to the padded viewport so resolution
// tracks screen resolution regardless of how far apart the strokes are in world space.
const drawPathLayer = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cache: CanvasRenderCache,
  paths: Path[],
  pan: Point,
  scale: number,
  isViewGesture: boolean,
): void => {
  if (cache.pathsRef !== paths) {
    cache.pathsRef = paths;
    cache.pathBounds = computePathBounds(paths);
    cache.pathWorldRect = null; // Content changed: the cached bitmap is stale.
  }
  const bounds = cache.pathBounds;
  if (!bounds) return;

  const viewport = getWorldViewport(canvas, pan, scale);
  const visible = intersectRects(bounds, viewport);
  if (!visible) return; // Every stroke is offscreen; keep the bitmap for the way back.

  const viewScaleRatio = cache.pathViewScale > 0 ? scale / cache.pathViewScale : Infinity;
  // Mid-gesture (pan or zoom), scale drift alone blits the existing bitmap under the
  // live transform instead of re-stroking (briefly soft/oversharp but geometrically
  // correct); the settle frame re-rasters sharp. A fast 3%→19% sweep would otherwise
  // re-stroke the full layer at up to 4096² several times, synchronously inside gesture
  // frames. Coverage misses still raster even mid-gesture — a long pan must not leave
  // strokes missing at the leading edge.
  const needsRaster = isViewGesture
    ? (!cache.pathWorldRect || !rectContains(cache.pathWorldRect, visible))
    : (!cache.pathWorldRect
      || !rectContains(cache.pathWorldRect, visible)
      || viewScaleRatio < PATH_RASTER_SCALE_MIN_RATIO
      || viewScaleRatio > PATH_RASTER_SCALE_MAX_RATIO);

  if (needsRaster) {
    const marginWorld = Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY)
      * PATH_LAYER_VIEWPORT_MARGIN_RATIO;
    const padded = intersectRects(bounds, expandRect(viewport, marginWorld)) ?? visible;

    // Prefer screen resolution: shrink coverage toward the visible region first, and only
    // fall back to a lower raster resolution if even that exceeds the bitmap cap.
    const targetScale = Math.max(scale, 0.05);
    const maxWorldSpan = PATH_LAYER_MAX_PX / targetScale;
    const [rectMinX, rectMaxX] = fitSpanAroundKeep(padded.minX, padded.maxX, visible.minX, visible.maxX, maxWorldSpan);
    const [rectMinY, rectMaxY] = fitSpanAroundKeep(padded.minY, padded.maxY, visible.minY, visible.maxY, maxWorldSpan);
    const worldRect: CanvasRect = { minX: rectMinX, minY: rectMinY, maxX: rectMaxX, maxY: rectMaxY };

    const worldWidth = Math.max(worldRect.maxX - worldRect.minX, 1e-6);
    const worldHeight = Math.max(worldRect.maxY - worldRect.minY, 1e-6);
    const rasterScale = Math.min(
      targetScale,
      PATH_LAYER_MAX_PX / worldWidth,
      PATH_LAYER_MAX_PX / worldHeight,
    );

    const bitmapWidth = Math.max(1, Math.ceil(worldWidth * rasterScale));
    const bitmapHeight = Math.max(1, Math.ceil(worldHeight * rasterScale));
    const pathCanvas = getReusablePathCanvas(cache, bitmapWidth, bitmapHeight);
    const pathCtx = pathCanvas.getContext('2d');
    if (!pathCtx) return;

    pathCtx.setTransform?.(1, 0, 0, 1, 0, 0);
    pathCtx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
    pathCtx.scale(rasterScale, rasterScale);
    pathCtx.translate(-worldRect.minX, -worldRect.minY);

    paths.forEach(path => { // Preserve the drawing and erasing sequence.
      if (path.tool === Tool.ERASE) {
        pathCtx.globalCompositeOperation = 'destination-out';
        pathCtx.strokeStyle = 'rgba(0,0,0,1)'; // Erasing ignores color but still needs full alpha.
      } else {
        pathCtx.globalCompositeOperation = 'source-over';
        pathCtx.strokeStyle = path.color;
      }

      pathCtx.lineWidth = path.size;
      pathCtx.lineCap = 'round';
      pathCtx.lineJoin = 'round';
      pathCtx.beginPath();
      path.points.forEach((point, index) => {
        if (index === 0) pathCtx.moveTo(point.x, point.y);
        else pathCtx.lineTo(point.x, point.y);
      });
      pathCtx.stroke();
    });

    pathCtx.globalCompositeOperation = 'source-over';
    cache.pathRasterScale = rasterScale;
    cache.pathViewScale = scale;
    cache.pathWorldRect = worldRect;
  }

  if (cache.pathCanvas && cache.pathWorldRect) {
    const rect = cache.pathWorldRect;
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);
    ctx.drawImage(cache.pathCanvas, rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
    ctx.restore();
  }
};

// One pattern-filled rect replaces the CSS radial-gradient background, whose
// backgroundPosition changes forced a full-viewport DOM repaint on every pan frame.
// This paints its own canvas, which sits UNDER the DOM overlays (video prompt area
// panels) that the CSS background used to sit under — the scene canvas is above them.
export const drawDotGridLayer = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cache: CanvasRenderCache,
  pan: Point,
  spacing: number,
  dotRadius: number,
): void => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!(spacing > 0) || !(dotRadius > 0)) return;
  if (typeof ctx.createPattern !== 'function') return; // Mocked/limited 2D contexts.

  // The tile is drawn at integer size anyway, so key on the quantized values: a raw
  // float key changes every zoom frame and turned continuous zooming into a tile
  // rebuild + createPattern per frame. Quarter-pixel radius steps are invisible.
  const tileSize = Math.max(1, Math.round(spacing));
  const quantRadius = Math.max(0.25, Math.round(dotRadius * 4) / 4);
  const key = `${tileSize}|${quantRadius}`;
  if (cache.dotGridKey !== key || !cache.dotGridPattern) {
    if (!cache.dotGridTile) {
      cache.dotGridTile = document.createElement('canvas');
    }
    const tile = cache.dotGridTile;
    tile.width = tileSize;
    tile.height = tileSize;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) return;
    tileCtx.clearRect(0, 0, tileSize, tileSize);
    tileCtx.fillStyle = 'rgba(255,255,255,0.2)';
    tileCtx.beginPath();
    tileCtx.arc(tileSize / 2, tileSize / 2, quantRadius, 0, Math.PI * 2);
    tileCtx.fill();
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    cache.dotGridPattern = pattern;
    cache.dotGridKey = key;
  }

  const offsetX = ((pan.x % tileSize) + tileSize) % tileSize;
  const offsetY = ((pan.y % tileSize) + tileSize) % tileSize;
  ctx.save();
  ctx.translate(offsetX - tileSize, offsetY - tileSize);
  ctx.fillStyle = cache.dotGridPattern;
  ctx.fillRect(0, 0, canvas.width + tileSize * 2, canvas.height + tileSize * 2);
  ctx.restore();
};

const buildOverlayText = (metadata: CanvasImageMetadata): string => {
  const segments: string[] = [];

  const modelLabel = metadata.modelLabel?.trim() ?? '';
  if (modelLabel.length > 0) {
    segments.push(modelLabel);
  }

  const upscaleFactor = metadata.upscaleFactor;
  if (typeof upscaleFactor === 'number' && Number.isFinite(upscaleFactor) && upscaleFactor > 0) {
    const formattedFactor = Number.isInteger(upscaleFactor)
      ? `${upscaleFactor}x`
      : `${Number.parseFloat(upscaleFactor.toFixed(2))}x`;
    segments.push(formattedFactor);
  }

  const noiseScale = metadata.noiseScale;
  if (typeof noiseScale === 'number' && Number.isFinite(noiseScale)) {
    segments.push((Math.round(noiseScale * 10) / 10).toFixed(1));
  }

  const creativity = metadata.creativity;
  if (typeof creativity === 'number' && Number.isFinite(creativity)) {
    segments.push(`Creativity ${creativity.toFixed(1)}`);
  }

  const promptText = metadata.prompt?.trim() ?? '';
  if (promptText.length > 0) {
    segments.push(promptText);
  }

  return segments.join('; ');
};

const drawCanvasBadge = (
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  scale: number,
  colors: CanvasBadgeColors,
): void => {
  const badgePaddingX = 8 / scale;
  const badgePaddingY = 6 / scale;
  const badgeFontSize = 24 / scale;
  ctx.font = `${badgeFontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const textWidth = ctx.measureText(label).width;
  const badgeWidth = textWidth + badgePaddingX * 2;
  const badgeHeight = badgeFontSize + badgePaddingY * 2;

  ctx.fillStyle = colors.fill;
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  ctx.rect(x, y, badgeWidth, badgeHeight);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.text;
  ctx.fillText(label, x + badgePaddingX, y + badgeHeight / 2);
};

const drawFavoriteStar = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
): void => {
  const backdropHalf = outerRadius * FAVORITE_STAR_BACKDROP_RATIO;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; // Backdrop keeps the star visible on similar-hued media.
  ctx.beginPath();
  ctx.roundRect(cx - backdropHalf, cy - backdropHalf, backdropHalf * 2, backdropHalf * 2, outerRadius * 0.5);
  ctx.fill();

  const innerRadius = outerRadius * 0.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = '#FFA21E';
  ctx.fill();
};

const getFavoriteStarRadius = (width: number, height: number): number | null => {
  const minDimension = Math.min(width, height);
  if (!Number.isFinite(minDimension) || minDimension <= 0) {
    return null;
  }
  const preferredRadius = Math.max(
    FAVORITE_STAR_PREFERRED_MIN_RADIUS,
    minDimension * FAVORITE_STAR_RADIUS_RATIO,
  );
  const containmentRatio = FAVORITE_STAR_INSET_RATIO + FAVORITE_STAR_BACKDROP_RATIO;
  return Math.min(preferredRadius, minDimension / containmentRatio); // Keep the backdrop's far edge inside the media.
};

const drawVideoPlaceholder = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
): void => {
  ctx.fillStyle = '#303744';
  ctx.fillRect(x, y, width, height); // Keep unloaded videos visible without opening their streams.
  ctx.strokeStyle = '#596274';
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(x, y, width, height); // Define the video bounds on dark canvases.

  const iconSize = Math.min(width, height, 64 / scale) * 0.32;
  const iconCenterX = x + width / 2;
  const iconCenterY = y + height / 2;
  ctx.fillStyle = '#d1d5db';
  ctx.beginPath();
  ctx.moveTo(iconCenterX - iconSize * 0.35, iconCenterY - iconSize * 0.55);
  ctx.lineTo(iconCenterX + iconSize * 0.55, iconCenterY);
  ctx.lineTo(iconCenterX - iconSize * 0.35, iconCenterY + iconSize * 0.55);
  ctx.closePath();
  ctx.fill(); // Mark the placeholder as playable media.
};

type DrawCanvasArgs = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pan: Point;
  scale: number;
  images: CanvasImage[];
  notes: CanvasNote[];
  paths: Path[];
  selectedImageIds: string[];
  referenceImageIds: string[];
  krea2StyleReferenceImageIds?: string[];
  referenceVideoIds: string[];
  referenceAudioIds: string[];
  referenceImageOrderLabels?: Record<string, string> | null;
  disabledMediaIds?: string[];
  elementImageIds: string[];
  elementImageOrderLabels?: Record<string, string> | null;
  videoLastFrameImageId: string | null;
  tailSelectionEnabled: boolean;
  sourceVideoId: string | null;
  isKlingO3VideoInputMode: boolean;
  isKlingO3ReferenceMode: boolean;
  isSeedance15FflfMode: boolean;
  isKlingV3ControlVideoInputMode: boolean;
  isVeo31ExtendMode: boolean;
  isWanAnimateVideoInputMode: boolean;
  isWan27VideoMode: boolean;
  isKrea2StyleReferenceMode: boolean;
  showMetadataOverlay: boolean;
  cropMode: CropModeState | null;
  transformMode: TransformModeState | null;
  renderCache?: CanvasRenderCache;
  imageLodCache?: ImageLodCache;
  audioPlaybackTimes?: Readonly<Record<string, number>>;
  isPresentationMode?: boolean;
  // True while a view gesture (pan or zoom) is in flight; expensive reconciliation (LOD
  // tier jobs, path scale-drift re-raster) is deferred to the settle frame that follows.
  isViewGesture?: boolean;
};

export function drawCanvas({
  canvas,
  ctx,
  pan,
  scale,
  images,
  notes,
  paths,
  selectedImageIds,
  referenceImageIds,
  krea2StyleReferenceImageIds,
  referenceVideoIds,
  referenceAudioIds,
  referenceImageOrderLabels,
  disabledMediaIds = [],
  elementImageIds,
  elementImageOrderLabels,
  videoLastFrameImageId,
  tailSelectionEnabled,
  sourceVideoId,
  isKlingO3VideoInputMode,
  isKlingO3ReferenceMode,
  isSeedance15FflfMode,
  isKlingV3ControlVideoInputMode,
  isVeo31ExtendMode,
  isWanAnimateVideoInputMode,
  isWan27VideoMode,
  isKrea2StyleReferenceMode,
  showMetadataOverlay,
  cropMode,
  transformMode,
  renderCache,
  imageLodCache,
  audioPlaybackTimes,
  isPresentationMode = false,
  isViewGesture = false,
}: DrawCanvasArgs) {
  // --- 1. Draw scene (images, notes, selections) ---
  const shouldShowCanvasChrome = !isPresentationMode;
  const viewport = expandRect(getWorldViewport(canvas, pan, scale), Math.max(128 / Math.max(scale, 0.0001), 64));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(scale, scale);

  if (imageLodCache) {
    // Protects this frame's bitmaps from LRU eviction; a live gesture also narrows decode
    // concurrency so tier generation never competes with interaction frames.
    beginLodFrame(imageLodCache, { throttleJobs: isViewGesture });
  }
  const lodOpts = { deferTierJobs: isViewGesture }; // Hoisted so the item loop allocates nothing.

  const disabledSet = new Set(disabledMediaIds); // Sets keep per-image membership checks constant-time.
  const selectedSet = new Set(selectedImageIds);
  const referenceTaggedSet = new Set([...referenceImageIds, ...referenceVideoIds, ...referenceAudioIds]);
  const krea2Set = new Set(krea2StyleReferenceImageIds ?? referenceImageIds); // Fall back for older callers.
  const elementSet = new Set(elementImageIds);

  // Draw images
  images.forEach(image => {
    if (!rectsIntersect(getImageBounds(image), viewport)) {
      return; // Skip fully offscreen media and its badges.
    }
    const isDisabledMedia = disabledSet.has(image.id);
    const showItemChrome = shouldShowCanvasChrome
      && Math.max(image.width, image.height) * scale >= MIN_CHROME_SCREEN_PX;
    // The metadata overlay is a band of wrapped text, so it additionally needs horizontal
    // room; below that its fit pass is pure cost for something unreadable.
    const showItemTextOverlay = showItemChrome && image.width * scale >= MIN_CHROME_SCREEN_PX;
    const rotation = getImageRotation(image);
    const center = getImageCenter(image);
    const halfWidth = image.width / 2;
    const halfHeight = image.height / 2;
    const baseX = -halfWidth;
    const baseY = -halfHeight;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);
    ctx.globalAlpha = isDisabledMedia ? 0.28 : 1; // Unsupported or overflow media should stay visible but look inactive.

    if (image.element instanceof HTMLImageElement) {
      if (!image.element.complete || image.element.naturalWidth === 0 || image.element.naturalHeight === 0) {
        ctx.restore();
        return;
      }
    }

    const isVideoWaitingForFrame = isVideoImage(image)
      && image.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    if (isVideoWaitingForFrame) {
      drawVideoPlaceholder(ctx, baseX, baseY, image.width, image.height, scale);
    } else {
      // Zoomed out, the LOD cache substitutes a pre-downscaled bitmap so drawImage isn't
      // resampling the full-resolution source per item per frame.
      const drawSource = imageLodCache
        ? getLodDrawSource(imageLodCache, image, scale, lodOpts)
        : image.element;
      ctx.drawImage(drawSource, baseX, baseY, image.width, image.height);
    }

    // Draw playhead for audio objects
    const audioPlaybackTime = image.mediaType === 'audio' ? getAudioPlaybackTime(image, audioPlaybackTimes) : undefined;
    if (image.mediaType === 'audio' && image.audioDuration && audioPlaybackTime !== undefined) {
      const progress = audioPlaybackTime / image.audioDuration;
      const playheadX = baseX + (image.width * progress);

      // Draw playhead line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(playheadX, baseY);
      ctx.lineTo(playheadX, baseY + image.height);
      ctx.stroke();

      // Draw playhead triangle marker at top
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(playheadX, baseY);
      ctx.lineTo(playheadX - 6 / scale, baseY - 8 / scale);
      ctx.lineTo(playheadX + 6 / scale, baseY - 8 / scale);
      ctx.closePath();
      ctx.fill();
    }

    const metadata = image.metadata;
    if (showItemTextOverlay && showMetadataOverlay && metadata && metadata.source !== 'imported') {
      // Warm frames do a single WeakMap lookup: no string assembly, no key hashing of
      // multi-KB prompts, both of which used to run per visible item per frame.
      let entry = renderCache?.overlayFitCache.get(image);
      if (entry === undefined) {
        const overlayText = buildOverlayText(metadata);
        entry = overlayText.length > 0 ? { overlayText, fit: null } : null;
        renderCache?.overlayFitCache.set(image, entry);
      }

      if (entry) {
        const overlayHeight = image.height * 0.15;
        const overlayY = baseY + image.height - overlayHeight;
        const paddingInner = Math.max(8, overlayHeight * 0.1);
        const textAreaWidth = Math.max(image.width - paddingInner * 2, 0);
        const overlayInnerHeight = Math.max(overlayHeight - paddingInner * 2, 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(baseX, overlayY, image.width, overlayHeight);

        const textIsReadable = overlayInnerHeight * scale >= OVERLAY_TEXT_MIN_BAND_SCREEN_PX;
        if (textAreaWidth > 0 && overlayInnerHeight > 0 && textIsReadable) {
          if (!entry.fit) {
            // Deferring the fit to the first readable draw amortizes the per-word
            // measureText loop over zoom-ins instead of paying it for every visible item
            // in the same frame the overlay is toggled on.
            const baseFontSize = Math.max(14, overlayHeight * 0.35);
            const fit = fitTextWithinBox(ctx, entry.overlayText, textAreaWidth, overlayInnerHeight, baseFontSize);
            // Keep only the lines the clip reveals; overflow fillText calls are pure cost.
            const maxLines = Math.max(1, Math.floor(overlayInnerHeight / fit.lineHeight));
            entry.fit = {
              fontSize: fit.fontSize,
              lineHeight: fit.lineHeight,
              lines: fit.lines.length > maxLines ? fit.lines.slice(0, maxLines) : fit.lines,
            };
          }
          const { fontSize: fittedFontSize, lineHeight, lines } = entry.fit;

          if (fittedFontSize * scale >= OVERLAY_TEXT_MIN_FONT_SCREEN_PX) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(baseX + paddingInner, overlayY + paddingInner, textAreaWidth, overlayInnerHeight);
            ctx.clip();
            ctx.fillStyle = '#ffffff';
            ctx.font = `${fittedFontSize}px sans-serif`;
            lines.forEach((line, lineIndex) => {
              const textY = overlayY + paddingInner + fittedFontSize + lineIndex * lineHeight;
              ctx.fillText(line, baseX + paddingInner, textY);
            });
            ctx.restore();
          }
        }
      }
    }

    ctx.globalAlpha = 1;

    const padding = 5 / scale;
    const isSelected = selectedSet.has(image.id);
    const isFflfSelectedVideo = isKlingO3ReferenceMode && image.mediaType === 'video' && isSelected;

    const isReferenceTagged = referenceTaggedSet.has(image.id); // Seedance reference mode can tag non-image media.
    const isKrea2StyleReferenceTagged = krea2Set.has(image.id); // Only actual Krea style inputs.

    if (shouldShowCanvasChrome && elementSet.has(image.id)) {
      ctx.strokeStyle = '#a855f7'; // purple-500 for elements
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && (isKlingO3VideoInputMode || isKlingV3ControlVideoInputMode || isVeo31ExtendMode) && sourceVideoId === image.id) {
      ctx.strokeStyle = '#f97316'; // orange-500 for source video in video input mode
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && isWanAnimateVideoInputMode && sourceVideoId === image.id) {
      ctx.strokeStyle = '#f97316'; // orange-500 for source video in WAN animate mode
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && isFflfSelectedVideo) {
      ctx.strokeStyle = '#f97316'; // orange-500 for FFLF video selection
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && isSelected && image.mediaType === 'audio') {
      ctx.strokeStyle = '#eab308'; // yellow-500 for audio
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);

      // Draw audio duration badge
      if (showItemChrome && image.audioDuration) {
        const currentTime = audioPlaybackTime ?? 0;
        const totalTime = image.audioDuration;
        const durationText = image.isPlaying
          ? `${formatDuration(currentTime)}/${formatDuration(totalTime)}`
          : formatDuration(totalTime);

        const badgePaddingX = 8 / scale;
        const badgePaddingY = 6 / scale;
        const badgeFontSize = 24 / scale;
        ctx.font = `bold ${badgeFontSize}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const textWidth = ctx.measureText(durationText).width;
        const badgeWidth = textWidth + badgePaddingX * 2;
        const badgeHeight = badgeFontSize + badgePaddingY * 2;
        const badgeX = baseX - padding;
        const badgeY = baseY - padding - badgeHeight - 2 / scale;

        // Yellow background to match selection
        ctx.fillStyle = 'rgba(234, 179, 8, 0.95)'; // yellow-500
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4 / scale);
        ctx.fill();

        // Dark text for contrast
        ctx.fillStyle = '#000000';
        ctx.fillText(durationText, badgeX + badgePaddingX, badgeY + badgeHeight / 2);
      }
    } else if (shouldShowCanvasChrome && isWan27VideoMode && isSelected && image.mediaType === 'image') {
      ctx.strokeStyle = '#3b82f6'; // blue-500 for images in Wan 2.7 mode
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && isKrea2StyleReferenceMode && isKrea2StyleReferenceTagged) {
      ctx.strokeStyle = '#10b981'; // emerald-500 — Krea treats every reference (incl. the primary) equally
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && isSelected) {
      ctx.strokeStyle = '#0ea5e9'; // sky-500
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && videoLastFrameImageId === image.id) {
      ctx.strokeStyle = '#f97316'; // orange-500 dashed outline for tail/end frame (aligns with Seedance)
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    } else if (shouldShowCanvasChrome && isReferenceTagged) {
      ctx.strokeStyle = '#10b981'; // emerald-500 for reference
      ctx.lineWidth = 4 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(baseX - padding, baseY - padding, image.width + padding * 2, image.height + padding * 2);
      ctx.setLineDash([]);
    }

    const isKlingSourceVideo = isKlingO3VideoInputMode && sourceVideoId === image.id;
    const frameRoleLabel = tailSelectionEnabled && image.mediaType === 'image'
      ? selectedImageIds[0] === image.id
        ? 'First frame'
        : videoLastFrameImageId === image.id
          ? 'Last frame'
          : null
      : null; // Only video first/last-frame modes should label selected stills this way.
    const referenceOrderLabel = frameRoleLabel ?? (isKlingSourceVideo ? 'Video' : referenceImageOrderLabels?.[image.id]);
    const shouldShowReferenceBadge = showItemChrome && !!referenceOrderLabel;
    if (shouldShowReferenceBadge) {
      const badgeX = baseX - padding;
      const badgeY = baseY - padding - ((24 / scale) + (6 / scale) * 2) - 2 / scale;

      const isPrimaryReference = selectedImageIds[0] === image.id;
      const badgeFillColor = frameRoleLabel === 'Last frame'
        ? 'rgba(249, 115, 22, 0.95)'
        : isKlingSourceVideo
        ? 'rgba(249, 115, 22, 0.95)'
        : isPrimaryReference
          ? 'rgba(14, 165, 233, 0.95)'
          : 'rgba(16, 185, 129, 0.92)';
      const badgeStrokeColor = frameRoleLabel === 'Last frame'
        ? '#c2410c'
        : isKlingSourceVideo
        ? '#c2410c'
        : isPrimaryReference
          ? '#0ea5e9'
          : '#064e3b';
      drawCanvasBadge(ctx, referenceOrderLabel, badgeX, badgeY, scale, {
        fill: badgeFillColor,
        stroke: badgeStrokeColor,
        text: '#ecfdf3',
      });
    }

    const elementOrderLabel = elementImageOrderLabels?.[image.id];
    if (showItemChrome && elementOrderLabel) {
      const badgeX = baseX - padding;
      const badgeY = baseY - padding - ((24 / scale) + (6 / scale) * 2) - 2 / scale;
      drawCanvasBadge(ctx, elementOrderLabel, badgeX, badgeY, scale, {
        fill: 'rgba(139, 92, 246, 0.95)',
        stroke: '#5b21b6',
        text: '#f5f3ff',
      });
    }

    if (showItemChrome && image.isFavorite) {
      const starOuterRadius = getFavoriteStarRadius(image.width, image.height);
      if (starOuterRadius !== null) {
        const starInset = starOuterRadius * FAVORITE_STAR_INSET_RATIO;
        drawFavoriteStar(ctx, baseX + image.width - starInset, baseY + starInset, starOuterRadius); // World units keep the marker proportional while zooming.
      }
    }

    ctx.restore();
  });

  if (imageLodCache) {
    endLodFrame(imageLodCache); // Retry deferred eviction after visible tiers are protected.
  }

  if (shouldShowCanvasChrome && cropMode) {
    const imageToCrop = images.find(img => img.id === cropMode.imageId);
    if (imageToCrop && rectsIntersect(getImageBounds(imageToCrop), viewport)) {
      const rotation = getImageRotation(imageToCrop);
      const center = getImageCenter(imageToCrop);
      const handleSize = CROP_HANDLE_SIZE / scale;
      const baseX = -imageToCrop.width / 2;
      const baseY = -imageToCrop.height / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const cropAbsX = baseX + cropMode.rect.x;
      const cropAbsY = baseY + cropMode.rect.y;

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);

      // Overlay outside the crop rect, within the image bounds
      ctx.fillRect(baseX, baseY, imageToCrop.width, cropMode.rect.y); // Top
      ctx.fillRect(baseX, cropAbsY + cropMode.rect.height, imageToCrop.width, imageToCrop.height - (cropMode.rect.y + cropMode.rect.height)); // Bottom
      ctx.fillRect(baseX, cropAbsY, cropMode.rect.x, cropMode.rect.height); // Left
      ctx.fillRect(cropAbsX + cropMode.rect.width, cropAbsY, imageToCrop.width - (cropMode.rect.x + cropMode.rect.width), cropMode.rect.height); // Right

      // Crop rect border
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(cropAbsX, cropAbsY, cropMode.rect.width, cropMode.rect.height);

      // Grid lines
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(cropAbsX + cropMode.rect.width / 3, cropAbsY);
      ctx.lineTo(cropAbsX + cropMode.rect.width / 3, cropAbsY + cropMode.rect.height);
      ctx.moveTo(cropAbsX + 2 * cropMode.rect.width / 3, cropAbsY);
      ctx.lineTo(cropAbsX + 2 * cropMode.rect.width / 3, cropAbsY + cropMode.rect.height);
      ctx.moveTo(cropAbsX, cropAbsY + cropMode.rect.height / 3);
      ctx.lineTo(cropAbsX + cropMode.rect.width, cropAbsY + cropMode.rect.height / 3);
      ctx.moveTo(cropAbsX, cropAbsY + 2 * cropMode.rect.height / 3);
      ctx.lineTo(cropAbsX + cropMode.rect.width, cropAbsY + 2 * cropMode.rect.height / 3);
      ctx.stroke();

      // Handles
      ctx.fillStyle = '#0ea5e9';
      const handles = [
        { x: cropAbsX, y: cropAbsY }, // TL
        { x: cropAbsX + cropMode.rect.width / 2, y: cropAbsY }, // T
        { x: cropAbsX + cropMode.rect.width, y: cropAbsY }, // TR
        { x: cropAbsX + cropMode.rect.width, y: cropAbsY + cropMode.rect.height / 2 }, // R
        { x: cropAbsX + cropMode.rect.width, y: cropAbsY + cropMode.rect.height }, // BR
        { x: cropAbsX + cropMode.rect.width / 2, y: cropAbsY + cropMode.rect.height }, // B
        { x: cropAbsX, y: cropAbsY + cropMode.rect.height }, // BL
        { x: cropAbsX, y: cropAbsY + cropMode.rect.height / 2 }, // L
      ];
      handles.forEach(p => ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize));

      ctx.restore();
    }
  }

  // Draw transform handles when in transform mode
  if (shouldShowCanvasChrome && transformMode) {
    const imageToTransform = images.find(img => img.id === transformMode.imageId);
    if (imageToTransform && rectsIntersect(getImageBounds(imageToTransform), viewport)) {
      const handleSize = TRANSFORM_HANDLE_SIZE / scale;
      const rotationDistance = ROTATION_HANDLE_DISTANCE / scale;
      const rotation = getImageRotation(imageToTransform);
      const center = getImageCenter(imageToTransform);
      const baseX = -imageToTransform.width / 2;
      const baseY = -imageToTransform.height / 2;

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);

      // Draw bounding box
      ctx.strokeStyle = '#f97316'; // orange-500
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([]);
      ctx.strokeRect(baseX, baseY, imageToTransform.width, imageToTransform.height);

      // Draw line from top center to rotation handle
      const topCenterX = baseX + imageToTransform.width / 2;
      const topCenterY = baseY;
      const rotationHandleY = baseY - rotationDistance;

      ctx.beginPath();
      ctx.moveTo(topCenterX, topCenterY);
      ctx.lineTo(topCenterX, rotationHandleY);
      ctx.stroke();

      // Draw rotation handle (circle)
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(topCenterX, rotationHandleY, handleSize, 0, Math.PI * 2);
      ctx.fill();

      // Draw corner handles (squares)
      const cornerHandles = [
        { x: baseX, y: baseY }, // TL
        { x: baseX + imageToTransform.width, y: baseY }, // TR
        { x: baseX, y: baseY + imageToTransform.height }, // BL
        { x: baseX + imageToTransform.width, y: baseY + imageToTransform.height }, // BR
      ];
      cornerHandles.forEach(p => {
        ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
      });

      // Draw edge handles (smaller squares)
      const edgeHandles = [
        { x: baseX + imageToTransform.width / 2, y: baseY }, // T
        { x: baseX + imageToTransform.width, y: baseY + imageToTransform.height / 2 }, // R
        { x: baseX + imageToTransform.width / 2, y: baseY + imageToTransform.height }, // B
        { x: baseX, y: baseY + imageToTransform.height / 2 }, // L
      ];
      const edgeHandleSize = handleSize * 0.8;
      edgeHandles.forEach(p => {
        ctx.fillRect(p.x - edgeHandleSize / 2, p.y - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
      });

      ctx.restore();
    }
  }

  // Draw note anchor pins (constant screen size — dimensions divide by scale).
  // Pins are content annotations, not selection chrome, so they stay visible in presentation mode.
  if (notes.length > 0) {
    ctx.save();
    ctx.font = `bold ${NOTE_PIN_LABEL_FONT_SIZE / scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = NOTE_PIN_BORDER;

    notes.forEach(note => {
      if (!note.anchor) {
        return; // Non-anchored notes live only in the side panel.
      }
      const pin = getNotePinGeometry(note.anchor, scale);
      if (!rectsIntersect(pin.bounds, viewport)) {
        return; // Skip fully offscreen pins.
      }

      // Pseudo-shadow: offset dark copies of the pin shapes. ctx.shadowBlur forces an
      // expensive filter pass per pin per frame, which adds up with many notes.
      const pinShadowOffsetY = 2 / scale;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(pin.headCenterX - pin.tailHalfWidth, pin.headCenterY + pin.headRadius * 0.6 + pinShadowOffsetY);
      ctx.lineTo(pin.headCenterX + pin.tailHalfWidth, pin.headCenterY + pin.headRadius * 0.6 + pinShadowOffsetY);
      ctx.lineTo(note.anchor.x, note.anchor.y + pinShadowOffsetY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pin.headCenterX, pin.headCenterY + pinShadowOffsetY, pin.headRadius, 0, Math.PI * 2);
      ctx.fill();

      // Tail: triangle from the head down to the anchor tip.
      ctx.beginPath();
      ctx.moveTo(pin.headCenterX - pin.tailHalfWidth, pin.headCenterY + pin.headRadius * 0.6);
      ctx.lineTo(pin.headCenterX + pin.tailHalfWidth, pin.headCenterY + pin.headRadius * 0.6);
      ctx.lineTo(note.anchor.x, note.anchor.y);
      ctx.closePath();
      ctx.fillStyle = NOTE_PIN_FILL;
      ctx.fill();

      // Head: filled circle with a light border.
      ctx.beginPath();
      ctx.arc(pin.headCenterX, pin.headCenterY, pin.headRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (note.label !== undefined) {
        ctx.fillStyle = NOTE_PIN_BORDER;
        ctx.fillText(String(note.label), pin.headCenterX, pin.headCenterY);
      }
    });

    ctx.restore();
  }

  ctx.restore(); // Restore main context transform

  // --- 2. Draw path overlay ---
  if (paths.length > 0) {
    const cache = renderCache ?? createCanvasRenderCache();
    drawPathLayer(ctx, canvas, cache, paths, pan, scale, isViewGesture);
  } else if (renderCache) {
    renderCache.pathsRef = null;
    renderCache.pathBounds = null;
    renderCache.pathWorldRect = null;
  }
}
