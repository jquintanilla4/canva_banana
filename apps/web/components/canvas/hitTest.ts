import type { CanvasImage, CanvasNote, Point } from '../../types';
import { CROP_HANDLE_SIZE, ROTATION_HANDLE_DISTANCE, TRANSFORM_HANDLE_SIZE } from './constants';
import { getNotePinGeometry, imageLocalToWorld, worldToImageLocal } from './geometry';

// FIX: Added 'resize-l' to the CropAction type to support left-side cropping and fix a type error.
export type CropAction =
  | 'move'
  | 'resize-tl'
  | 'resize-t'
  | 'resize-tr'
  | 'resize-r'
  | 'resize-br'
  | 'resize-b'
  | 'resize-bl'
  | 'resize-l';

export type TransformAction =
  | 'scale-tl'
  | 'scale-t'
  | 'scale-tr'
  | 'scale-r'
  | 'scale-br'
  | 'scale-b'
  | 'scale-bl'
  | 'scale-l'
  | 'rotate';

export function getNoteAnchorAtPoint(point: Point, notes: CanvasNote[], scale: number): CanvasNote | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    if (!note.anchor) continue;
    const pin = getNotePinGeometry(note.anchor, scale);
    const dx = point.x - pin.headCenterX;
    const dy = point.y - pin.headCenterY;
    if (dx * dx + dy * dy <= pin.headRadius * pin.headRadius) {
      return note;
    }
    // Tail: slim bbox between the head and the anchor tip.
    if (
      point.x >= note.anchor.x - pin.tailHalfWidth && point.x <= note.anchor.x + pin.tailHalfWidth &&
      point.y >= pin.headCenterY && point.y <= note.anchor.y
    ) {
      return note;
    }
  }
  return null;
}

export function getImageAtPoint(point: Point, images: CanvasImage[]): CanvasImage | null {
  // Iterate backwards to select the top-most image
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i];
    const localPoint = worldToImageLocal(point, img);
    if (localPoint.x >= 0 && localPoint.x <= img.width && localPoint.y >= 0 && localPoint.y <= img.height) {
      return img;
    }
  }
  return null;
}

export function getCropActionForPoint(
  point: Point,
  image: CanvasImage,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
): CropAction | null {
  const handleSize = CROP_HANDLE_SIZE / scale;
  const checkHandle = (target: Point) =>
    point.x >= target.x - handleSize / 2 && point.x <= target.x + handleSize / 2 &&
    point.y >= target.y - handleSize / 2 && point.y <= target.y + handleSize / 2;

  const localToWorld = (local: Point) => imageLocalToWorld(local, image);

  const tl = localToWorld({ x: rect.x, y: rect.y });
  const tr = localToWorld({ x: rect.x + rect.width, y: rect.y });
  const bl = localToWorld({ x: rect.x, y: rect.y + rect.height });
  const br = localToWorld({ x: rect.x + rect.width, y: rect.y + rect.height });
  const top = localToWorld({ x: rect.x + rect.width / 2, y: rect.y });
  const right = localToWorld({ x: rect.x + rect.width, y: rect.y + rect.height / 2 });
  const bottom = localToWorld({ x: rect.x + rect.width / 2, y: rect.y + rect.height });
  const left = localToWorld({ x: rect.x, y: rect.y + rect.height / 2 });

  if (checkHandle(tl)) return 'resize-tl';
  if (checkHandle(tr)) return 'resize-tr';
  if (checkHandle(bl)) return 'resize-bl';
  if (checkHandle(br)) return 'resize-br';
  if (checkHandle(top)) return 'resize-t';
  if (checkHandle(right)) return 'resize-r';
  if (checkHandle(bottom)) return 'resize-b';
  if (checkHandle(left)) return 'resize-l';

  const localPoint = worldToImageLocal(point, image);
  if (localPoint.x > rect.x && localPoint.x < rect.x + rect.width && localPoint.y > rect.y && localPoint.y < rect.y + rect.height) return 'move';

  return null;
}

export function getTransformActionForPoint(point: Point, image: CanvasImage, scale: number): TransformAction | null {
  const handleSize = TRANSFORM_HANDLE_SIZE / scale;
  const rotationDistance = ROTATION_HANDLE_DISTANCE / scale;

  const checkHandle = (target: Point) =>
    point.x >= target.x - handleSize && point.x <= target.x + handleSize &&
    point.y >= target.y - handleSize && point.y <= target.y + handleSize;

  const localRotationHandle = { x: image.width / 2, y: -rotationDistance };
  const rotationHandle = imageLocalToWorld(localRotationHandle, image);
  if (checkHandle(rotationHandle)) return 'rotate';

  const cornerHandles = [
    { action: 'scale-tl' as const, point: imageLocalToWorld({ x: 0, y: 0 }, image) },
    { action: 'scale-tr' as const, point: imageLocalToWorld({ x: image.width, y: 0 }, image) },
    { action: 'scale-bl' as const, point: imageLocalToWorld({ x: 0, y: image.height }, image) },
    { action: 'scale-br' as const, point: imageLocalToWorld({ x: image.width, y: image.height }, image) },
  ];
  const cornerHit = cornerHandles.find(handle => checkHandle(handle.point));
  if (cornerHit) return cornerHit.action;

  const edgeHandles = [
    { action: 'scale-t' as const, point: imageLocalToWorld({ x: image.width / 2, y: 0 }, image) },
    { action: 'scale-r' as const, point: imageLocalToWorld({ x: image.width, y: image.height / 2 }, image) },
    { action: 'scale-b' as const, point: imageLocalToWorld({ x: image.width / 2, y: image.height }, image) },
    { action: 'scale-l' as const, point: imageLocalToWorld({ x: 0, y: image.height / 2 }, image) },
  ];
  const edgeHit = edgeHandles.find(handle => checkHandle(handle.point));
  if (edgeHit) return edgeHit.action;

  return null;
}

