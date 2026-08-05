import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tool, type Path, type Point } from '../../../types';
import { createCanvasRenderCache, drawCanvas } from '../render/drawCanvas';

// The offscreen path bitmap is only re-stroked when drawPathLayer calls getContext on it,
// so counting those calls is a direct measure of cache hits vs. re-rasters.
const countRasters = <T>(run: () => T): { result: T; rasters: number } => {
  const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
  const before = getContext.mock.calls.length;
  const result = run();
  return { result, rasters: getContext.mock.calls.length - before };
};

const buildContext = (): CanvasRenderingContext2D => ({
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  rotate: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  rect: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  roundRect: vi.fn(),
  arc: vi.fn(),
  setLineDash: vi.fn(),
  measureText: () => ({ width: 0 }),
  font: '',
  textBaseline: '',
  textAlign: '',
  lineWidth: 0,
  strokeStyle: '',
  fillStyle: '',
}) as unknown as CanvasRenderingContext2D;

const buildCanvas = (width = 1200, height = 800): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const buildPath = (points: Point[], size = 4): Path => ({
  points,
  color: '#ffffff',
  size,
  tool: Tool.ANNOTATE,
});

describe('drawCanvas path layer cache', () => {
  const cache = createCanvasRenderCache();
  const canvas = buildCanvas();

  const draw = (paths: Path[], pan: Point, scale: number) => drawCanvas({
    canvas,
    ctx: buildContext(),
    pan,
    scale,
    images: [],
    notes: [],
    paths,
    selectedImageIds: [],
    referenceImageIds: [],
    referenceVideoIds: [],
    referenceAudioIds: [],
    referenceImageOrderLabels: null,
    disabledMediaIds: [],
    elementImageIds: [],
    elementImageOrderLabels: null,
    videoLastFrameImageId: null,
    tailSelectionEnabled: false,
    sourceVideoId: null,
    isKlingO3VideoInputMode: false,
    isKlingO3ReferenceMode: false,
    isSeedance15FflfMode: false,
    isKlingV3ControlVideoInputMode: false,
    isVeo31ExtendMode: false,
    isWanAnimateVideoInputMode: false,
    isWan27VideoMode: false,
    isKrea2StyleReferenceMode: false,
    showMetadataOverlay: false,
    cropMode: null,
    transformMode: null,
    renderCache: cache,
  });

  beforeEach(() => {
    Object.assign(cache, createCanvasRenderCache());
  });

  it('converges at extreme zoom instead of re-rasterizing every frame', () => {
    const paths = [buildPath([{ x: 0, y: 0 }, { x: 40, y: 40 }])];

    const first = countRasters(() => draw(paths, { x: 0, y: 0 }, 10));
    expect(first.rasters).toBe(1);

    // Same content, same view: the invalidation predicate must be satisfied by the raster
    // it just produced. The clamped-vs-raw comparison this replaced never converged here.
    const second = countRasters(() => draw(paths, { x: 0, y: 0 }, 10));
    expect(second.rasters).toBe(0);
  });

  it('keeps panning a cache hit for paths spread far across world space', () => {
    // Two strokes ~6000 world units apart: clamping resolution to the full bounding box
    // used to both blur the strokes and re-rasterize on every pan frame.
    const paths = [
      buildPath([{ x: 0, y: 0 }, { x: 40, y: 40 }]),
      buildPath([{ x: 6000, y: 10 }, { x: 6040, y: 50 }]),
    ];

    expect(countRasters(() => draw(paths, { x: 0, y: 0 }, 2)).rasters).toBe(1);
    expect(cache.pathRasterScale).toBeCloseTo(2, 5); // Screen resolution, not a clamped fraction.

    expect(countRasters(() => draw(paths, { x: -40, y: -20 }, 2)).rasters).toBe(0);
    expect(countRasters(() => draw(paths, { x: -80, y: -40 }, 2)).rasters).toBe(0);
  });

  it('re-rasterizes when the view scale drifts, then converges again', () => {
    const paths = [buildPath([{ x: 0, y: 0 }, { x: 40, y: 40 }])];

    draw(paths, { x: 0, y: 0 }, 1);
    expect(countRasters(() => draw(paths, { x: 0, y: 0 }, 4)).rasters).toBe(1);
    expect(countRasters(() => draw(paths, { x: 0, y: 0 }, 4)).rasters).toBe(0);
    expect(cache.pathViewScale).toBe(4);
  });

  it('re-rasterizes when the paths array changes', () => {
    const first = [buildPath([{ x: 0, y: 0 }, { x: 40, y: 40 }])];
    draw(first, { x: 0, y: 0 }, 1);

    const extended = [...first, buildPath([{ x: 10, y: 10 }, { x: 60, y: 60 }])];
    expect(countRasters(() => draw(extended, { x: 0, y: 0 }, 1)).rasters).toBe(1);
  });
});
