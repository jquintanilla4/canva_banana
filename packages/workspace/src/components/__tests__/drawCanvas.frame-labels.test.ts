import { describe, expect, it, vi } from 'vitest';
import { Tool, type CanvasImage, type Path } from '../../types';
import { createCanvasRenderCache, drawCanvas } from '../canvas/render/drawCanvas';

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
  measureText: (text: string) => ({ width: text.length * 8 }),
  font: '',
  textBaseline: '',
  textAlign: '',
  lineWidth: 0,
  strokeStyle: '',
  fillStyle: '',
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
}) as unknown as CanvasRenderingContext2D; // Minimal canvas API used by drawCanvas.

const buildCanvas = (width = 300, height = 150): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const buildImage = (id: string, x: number): CanvasImage => {
  const element = document.createElement('img');
  Object.defineProperty(element, 'complete', { value: true });
  Object.defineProperty(element, 'naturalWidth', { value: 100 });
  Object.defineProperty(element, 'naturalHeight', { value: 80 });
  return {
    id,
    element,
    mediaType: 'image',
    x,
    y: 20,
    width: 100,
    height: 80,
    rotation: 0,
    naturalWidth: 100,
    naturalHeight: 80,
    file: new File(['image'], `${id}.png`, { type: 'image/png' }),
  }; // Still image fixture for frame-role badges.
};

const buildAudioImage = (overrides: Partial<CanvasImage> = {}): CanvasImage => {
  const element = document.createElement('img');
  Object.defineProperty(element, 'complete', { value: true });
  Object.defineProperty(element, 'naturalWidth', { value: 100 });
  Object.defineProperty(element, 'naturalHeight', { value: 40 });
  return {
    id: 'audio-1',
    element,
    mediaType: 'audio',
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    rotation: 0,
    naturalWidth: 100,
    naturalHeight: 40,
    file: new File(['audio'], 'audio.wav', { type: 'audio/wav' }),
    isPlaying: true,
    audioDuration: 10,
    currentPlaybackTime: 1,
    ...overrides,
  }; // Audio waveform fixture with a saved fallback time.
};

const buildVideoImage = (readyState: number): CanvasImage => {
  const element = document.createElement('video');
  Object.defineProperty(element, 'readyState', { configurable: true, value: readyState });
  return {
    id: 'video-1',
    element,
    mediaType: 'video',
    x: 20,
    y: 20,
    width: 120,
    height: 80,
    rotation: 0,
    naturalWidth: 120,
    naturalHeight: 80,
    file: new File(['video'], 'video.mp4', { type: 'video/mp4' }),
  }; // Video fixture can represent both lazy and decoded states.
};

describe('drawCanvas frame role labels', () => {
  it('labels the selected still as first frame and the tail still as last frame', () => {
    const canvas = buildCanvas();
    const ctx = buildContext();
    const firstFrame = buildImage('first', 10);
    const lastFrame = buildImage('last', 140);

    drawCanvas({
      canvas,
      ctx,
      pan: { x: 0, y: 0 },
      scale: 1,
      images: [firstFrame, lastFrame],
      notes: [],
      paths: [],
      selectedImageIds: [firstFrame.id],
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      referenceImageOrderLabels: null,
      disabledMediaIds: [],
      elementImageIds: [],
      elementImageOrderLabels: null,
      videoLastFrameImageId: lastFrame.id,
      tailSelectionEnabled: true,
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
    });

    const labels = vi.mocked(ctx.fillText).mock.calls.map(([label]) => label);
    expect(labels).toContain('First frame');
    expect(labels).toContain('Last frame');
  });

  it('does not label ordinary selected stills outside first-last-frame modes', () => {
    const canvas = buildCanvas();
    const ctx = buildContext();
    const selectedImage = buildImage('selected', 10);

    drawCanvas({
      canvas,
      ctx,
      pan: { x: 0, y: 0 },
      scale: 1,
      images: [selectedImage],
      notes: [],
      paths: [],
      selectedImageIds: [selectedImage.id],
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
    });

    const labels = vi.mocked(ctx.fillText).mock.calls.map(([label]) => label);
    expect(labels).not.toContain('First frame');
  });

  it('hides selection badges and outlines in presentation mode', () => {
    const canvas = buildCanvas();
    const ctx = buildContext();
    const firstFrame = buildImage('first', 10);
    const lastFrame = buildImage('last', 140);

    drawCanvas({
      canvas,
      ctx,
      pan: { x: 0, y: 0 },
      scale: 1,
      images: [firstFrame, lastFrame],
      notes: [],
      paths: [],
      selectedImageIds: [firstFrame.id],
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
      referenceImageOrderLabels: null,
      disabledMediaIds: [],
      elementImageIds: [],
      elementImageOrderLabels: null,
      videoLastFrameImageId: lastFrame.id,
      tailSelectionEnabled: true,
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
      isPresentationMode: true,
    });

    const labels = vi.mocked(ctx.fillText).mock.calls.map(([label]) => label);
    expect(labels).not.toContain('First frame');
    expect(labels).not.toContain('Last frame');
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

describe('drawCanvas culling and path cache', () => {
  const drawBase = (overrides: Partial<Parameters<typeof drawCanvas>[0]>) => {
    const { canvas: overrideCanvas, ctx: overrideCtx, ...restOverrides } = overrides;
    const canvas = overrideCanvas ?? buildCanvas(200, 120);
    const ctx = overrideCtx ?? buildContext();
    drawCanvas({
      canvas,
      ctx,
      pan: { x: 0, y: 0 },
      scale: 1,
      images: [],
      notes: [],
      paths: [],
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
      ...restOverrides,
    });
    return { canvas, ctx };
  };

  it('draws visible images and skips fully offscreen images', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      images: [
        buildImage('visible', 20),
        buildImage('offscreen', 1000),
      ],
    });

    expect(vi.mocked(ctx.drawImage)).toHaveBeenCalledTimes(1);
  });

  it('draws favorite chrome only outside presentation mode', () => {
    const favorite = { ...buildImage('favorite', 20), isFavorite: true };
    const favoriteCtx = buildContext();
    const presentationCtx = buildContext();

    drawBase({ ctx: favoriteCtx, images: [favorite] });
    drawBase({ ctx: presentationCtx, images: [favorite], isPresentationMode: true });

    expect(vi.mocked(favoriteCtx.lineTo)).toHaveBeenCalledTimes(9);
    expect(vi.mocked(presentationCtx.lineTo)).not.toHaveBeenCalled();
  });

  it.each([
    // Scale/pan keep each item above the chrome threshold and inside the viewport;
    // the star containment assertions below are in world units, unaffected by zoom.
    { label: 'minimum square', width: 20, height: 20, scale: 2, pan: { x: 0, y: 0 } },
    { label: 'short panorama', width: 100, height: 2, scale: 1, pan: { x: 0, y: 0 } },
    // Tall and narrow: the chrome gate measures the LONGER on-screen side, so this stays
    // starred at 1:1 even though its width is below MIN_CHROME_SCREEN_PX.
    { label: 'narrow portrait', width: 2, height: 100, scale: 1, pan: { x: 0, y: 0 } },
  ])('keeps favorite chrome inside $label media', ({ width, height, scale, pan }) => {
    const favorite = { ...buildImage('favorite', 20), width, height, isFavorite: true };
    const ctx = buildContext();

    drawBase({ ctx, images: [favorite], scale, pan });

    const points = [
      ...vi.mocked(ctx.moveTo).mock.calls,
      ...vi.mocked(ctx.lineTo).mock.calls,
    ] as Array<[number, number]>;
    const halfStroke = ctx.lineWidth / 2;
    expect(points).toHaveLength(10);
    points.forEach(([x, y]) => {
      expect(x - halfStroke).toBeGreaterThanOrEqual(-width / 2);
      expect(x + halfStroke).toBeLessThanOrEqual(width / 2);
      expect(y - halfStroke).toBeGreaterThanOrEqual(-height / 2);
      expect(y + halfStroke).toBeLessThanOrEqual(height / 2);
    });
  });

  it('scales the favorite star with large media instead of capping it', () => {
    const favorite = { ...buildImage('favorite', 20), width: 1024, height: 1024, isFavorite: true };
    const ctx = buildContext();

    drawBase({ ctx, images: [favorite] });

    // The star path starts at its top vertex: y = baseY + inset(1.5r) - r = -height/2 + 0.5r.
    const [, topY] = vi.mocked(ctx.moveTo).mock.calls[0];
    const outerRadius = (topY + 1024 / 2) / 0.5;
    expect(outerRadius).toBeCloseTo(1024 * 0.058, 5);
  });

  it('draws a visible placeholder and selection outline for a lazy video', () => {
    const ctx = buildContext();
    const video = buildVideoImage(HTMLMediaElement.HAVE_NOTHING);

    drawBase({
      ctx,
      images: [video],
      selectedImageIds: [video.id],
    });

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(-60, -40, 120, 80);
    expect(ctx.strokeRect).toHaveBeenCalledWith(-65, -45, 130, 90);
  });

  it('replaces the placeholder with the real video frame once decoded', () => {
    const ctx = buildContext();
    const video = buildVideoImage(HTMLMediaElement.HAVE_CURRENT_DATA);

    drawBase({ ctx, images: [video] });

    expect(ctx.drawImage).toHaveBeenCalledWith(video.element, -60, -40, 120, 80);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('uses rotation-aware bounds when culling images', () => {
    const ctx = buildContext();
    const rotatedImage = { ...buildImage('rotated', -235), y: 0, rotation: Math.PI / 4 };

    drawBase({
      canvas: buildCanvas(100, 100),
      ctx,
      images: [rotatedImage],
    });

    expect(vi.mocked(ctx.drawImage)).toHaveBeenCalledTimes(1);
  });

  it('draws visible note pins with their label', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      notes: [{
        id: 'note-1',
        text: 'visible note',
        label: 7,
        anchor: { x: 100, y: 60 },
      }],
    });

    expect(vi.mocked(ctx.arc)).toHaveBeenCalled();
    expect(vi.mocked(ctx.fillText)).toHaveBeenCalledWith('7', 100, 38);
  });

  it('keeps note pins visible in presentation mode', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      isPresentationMode: true,
      notes: [{
        id: 'note-1',
        text: 'presented note',
        label: 2,
        anchor: { x: 100, y: 60 },
      }],
    });

    expect(vi.mocked(ctx.arc)).toHaveBeenCalled();
    expect(vi.mocked(ctx.fillText)).toHaveBeenCalledWith('2', 100, 38);
  });

  it('skips panel-only notes without an anchor', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      notes: [{
        id: 'note-1',
        text: 'panel-only note',
      }],
    });

    expect(vi.mocked(ctx.arc)).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.fillText)).not.toHaveBeenCalled();
  });

  it('skips fully offscreen note pins', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      notes: [{
        id: 'note-1',
        text: 'offscreen note',
        label: 1,
        anchor: { x: 10000, y: 10000 },
      }],
    });

    expect(vi.mocked(ctx.arc)).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.fillText)).not.toHaveBeenCalled();
  });

  it('reuses the cached path layer until path inputs change', () => {
    const ctx = buildContext();
    const pathCtx = buildContext();
    const cache = createCanvasRenderCache();
    cache.pathCanvas = buildCanvas();
    vi.spyOn(cache.pathCanvas, 'getContext').mockReturnValue(pathCtx);
    const path: Path = {
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      color: '#ffffff',
      size: 4,
      tool: Tool.ANNOTATE,
    };

    // The cache keys on the paths array identity — appending a point always replaces the
    // outer array in state, so a stable reference means unchanged content.
    const stablePaths = [path];
    drawBase({ ctx, paths: stablePaths, renderCache: cache });
    const firstStrokeCount = vi.mocked(pathCtx.stroke).mock.calls.length;

    drawBase({ ctx, paths: stablePaths, renderCache: cache });
    expect(vi.mocked(pathCtx.stroke).mock.calls.length).toBe(firstStrokeCount);

    drawBase({
      ctx,
      paths: [{ ...path, points: [...path.points, { x: 30, y: 30 }] }],
      renderCache: cache,
    });
    expect(vi.mocked(pathCtx.stroke).mock.calls.length).toBe(firstStrokeCount + 1);
  });

  it('uses live audio playback time before the saved fallback', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      images: [buildAudioImage()],
      audioPlaybackTimes: { 'audio-1': 5 },
    });

    expect(vi.mocked(ctx.moveTo)).toHaveBeenCalledWith(-50 + 50, -20);
  });

  it('uses saved audio playback time when no live time exists', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      images: [buildAudioImage()],
    });

    expect(vi.mocked(ctx.moveTo)).toHaveBeenCalledWith(-50 + 10, -20);
  });

  it('uses saved paused audio time even when a stale live time exists', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      images: [buildAudioImage({ isPlaying: false, currentPlaybackTime: 2 })],
      audioPlaybackTimes: { 'audio-1': 8 },
    });

    expect(vi.mocked(ctx.moveTo)).toHaveBeenCalledWith(-50 + 20, -20);
  });
});
