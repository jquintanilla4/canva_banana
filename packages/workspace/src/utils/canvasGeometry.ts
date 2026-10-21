import type { CanvasImage } from '../types';

export const getImageRotation = (img: CanvasImage): number => img.rotation ?? 0;

export const getImageBounds = (img: CanvasImage) => {
  const rotation = getImageRotation(img);
  const centerX = img.x + img.width / 2;
  const centerY = img.y + img.height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const corners = [
    { x: -img.width / 2, y: -img.height / 2 },
    { x: img.width / 2, y: -img.height / 2 },
    { x: -img.width / 2, y: img.height / 2 },
    { x: img.width / 2, y: img.height / 2 },
  ].map(({ x, y }) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos,
  }));

  const xs = corners.map(corner => corner.x);
  const ys = corners.map(corner => corner.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

export const isOverlapping = (img1: CanvasImage, img2: CanvasImage): boolean => {
  const a = getImageBounds(img1);
  const b = getImageBounds(img2);
  return !(a.minX > b.maxX || a.maxX < b.minX || a.minY > b.maxY || a.maxY < b.minY);
};
