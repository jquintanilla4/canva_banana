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
      selectedNoteIds: [],
      primarySelectedNoteId: null,
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
      selectedNoteIds: [],
      primarySelectedNoteId: null,
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
      selectedNoteIds: [],
      primarySelectedNoteId: null,
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

  it('skips fully offscreen notes', () => {
    const ctx = buildContext();
    drawBase({
      ctx,
      notes: [{
        id: 'note-1',
        x: 1000,
        y: 1000,
        width: 200,
        height: 120,
        text: 'offscreen note',
        backgroundColor: '#111827',
      }],
    });

    expect(vi.mocked(ctx.fillRect)).not.toHaveBeenCalled();
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

    drawBase({ ctx, paths: [path], renderCache: cache });
    const firstStrokeCount = vi.mocked(pathCtx.stroke).mock.calls.length;

    drawBase({ ctx, paths: [path], renderCache: cache });
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
