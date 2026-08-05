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

export type ImageBounds = { minX: number; minY: number; maxX: number; maxY: number };

// CanvasImage objects are replaced immutably whenever their geometry changes, so object
// identity is a valid cache key. This runs per image per frame (culling, hit tests),
// which makes recomputing corner transforms and allocating intermediates too expensive.
const imageBoundsCache = new WeakMap<CanvasImage, ImageBounds>();

export const getImageBounds = (image: CanvasImage): ImageBounds => {
  const cached = imageBoundsCache.get(image);
  if (cached) return cached;

  const rotation = getImageRotation(image);
  let bounds: ImageBounds;
  if (rotation === 0) {
    bounds = {
      minX: image.x,
      minY: image.y,
      maxX: image.x + image.width,
      maxY: image.y + image.height,
    };
  } else {
    const cos = Math.abs(Math.cos(rotation)); // Exact AABB uses trigonometric extents without corner allocations.
    const sin = Math.abs(Math.sin(rotation));
    const halfWidth = (image.width * cos + image.height * sin) / 2;
    const halfHeight = (image.width * sin + image.height * cos) / 2;
    const centerX = image.x + image.width / 2;
    const centerY = image.y + image.height / 2;
    bounds = {
      minX: centerX - halfWidth,
      minY: centerY - halfHeight,
      maxX: centerX + halfWidth,
      maxY: centerY + halfHeight,
    };
  }
  imageBoundsCache.set(image, bounds);
  return bounds;
};
