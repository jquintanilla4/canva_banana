import type { CanvasImage, Point } from '../../types';
import { NOTE_PIN_HEAD_OFFSET, NOTE_PIN_HEAD_RADIUS } from './constants';

export type NotePinGeometry = {
  headCenterX: number;
  headCenterY: number;
  headRadius: number;
  tailHalfWidth: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

// World-space geometry of a screen-constant anchor pin (dimensions divide by scale).
// Single source of truth for rendering, hit-testing, and zoom-to-fit bounds.
export const getNotePinGeometry = (anchor: Point, scale: number): NotePinGeometry => {
  const headRadius = NOTE_PIN_HEAD_RADIUS / scale;
  const headCenterY = anchor.y - NOTE_PIN_HEAD_OFFSET / scale;
  return {
    headCenterX: anchor.x,
    headCenterY,
    headRadius,
    tailHalfWidth: headRadius * 0.45,
    bounds: {
      minX: anchor.x - headRadius,
      minY: headCenterY - headRadius,
      maxX: anchor.x + headRadius,
      maxY: anchor.y,
    },
  };
};

export const getImageRotation = (image: CanvasImage): number => image.rotation ?? 0;

export const getImageCenter = (image: CanvasImage): Point => ({
  x: image.x + image.width / 2,
  y: image.y + image.height / 2,
});

export const worldToImageLocal = (point: Point, image: CanvasImage): Point => {
  const center = getImageCenter(image);
  const angle = -getImageRotation(image);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: dx * cos - dy * sin + image.width / 2,
    y: dx * sin + dy * cos + image.height / 2,
  };
};

export const imageLocalToWorld = (local: Point, image: CanvasImage): Point => {
  const center = getImageCenter(image);
  const angle = getImageRotation(image);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const offsetX = local.x - image.width / 2;
  const offsetY = local.y - image.height / 2;
  return {
    x: center.x + offsetX * cos - offsetY * sin,
    y: center.y + offsetX * sin + offsetY * cos,
  };
};

export const getImageBounds = (image: CanvasImage) => {
  const corners = [
    imageLocalToWorld({ x: 0, y: 0 }, image),
    imageLocalToWorld({ x: image.width, y: 0 }, image),
    imageLocalToWorld({ x: 0, y: image.height }, image),
    imageLocalToWorld({ x: image.width, y: image.height }, image),
  ];
  const xs = corners.map(c => c.x);
  const ys = corners.map(c => c.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

