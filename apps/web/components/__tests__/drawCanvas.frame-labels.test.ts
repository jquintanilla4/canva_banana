import { describe, expect, it, vi } from 'vitest';
import { type CanvasImage } from '../../types';
import { drawCanvas } from '../canvas/render/drawCanvas';

const buildContext = (): CanvasRenderingContext2D => ({
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
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

describe('drawCanvas frame role labels', () => {
  it('labels the selected still as first frame and the tail still as last frame', () => {
    const canvas = document.createElement('canvas');
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
    const canvas = document.createElement('canvas');
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
