import type { CanvasImage, Point } from '../../types';

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

