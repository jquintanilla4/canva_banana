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

export const findNonOverlappingPlacement = (
  images: readonly CanvasImage[],
  width: number,
  height: number,
  startX: number,
  startY: number,
): { x: number; y: number } => {
  const spacing = 20;
  const bounds = images.map(getImageBounds);
  const touchesRow = (box: ReturnType<typeof getImageBounds>, y: number) => y <= box.maxY && y + height >= box.minY;
  const overlapsAt = (x: number, y: number) =>
    bounds.some(box => touchesRow(box, y) && x <= box.maxX && x + width >= box.minX);

  let x = startX;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (!overlapsAt(x, startY)) return { x, y: startY };
    x += width + spacing;
  }

  const y = startY + height + spacing;
  if (!overlapsAt(startX, y)) return { x: startX, y };
  const rightOfRow = bounds.reduce((nextX, box) => touchesRow(box, y) ? Math.max(nextX, box.maxX + spacing) : nextX, startX);
  return { x: rightOfRow, y };
};

export const placeImagesAfterCanvasTail = (canvasImages: readonly CanvasImage[], images: readonly CanvasImage[]): CanvasImage[] => {
  const occupied = [...canvasImages];
  return images.map(image => {
    const tail = occupied.at(-1);
    const bounds = tail && getImageBounds(tail);
    const position = findNonOverlappingPlacement(occupied, image.width, image.height, bounds ? bounds.maxX + 20 : 100, bounds?.minY ?? 100);
    const placed = { ...image, ...position };
    occupied.push(placed);
    return placed;
  });
};
