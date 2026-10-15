import type { SerializedSnapshotV1, SnapshotMetaState } from './snapshotService';
import type { CanvasNote, Path } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const normalizeStoryboardSnapshot = (value: unknown): unknown => {
  if (!isRecord(value) || value.version !== 2 || 'state' in value || !isRecord(value.meta)
    || !Array.isArray(value.images) || !Array.isArray(value.notes) || !Array.isArray(value.paths)) return value;
  for (const image of value.images) {
    if (!isRecord(image) || image.mediaType !== 'image' || typeof image.dataUrl !== 'string') {
      throw new Error('Storyboard snapshot contains an invalid still image.');
    }
  }
  const notes: CanvasNote[] = value.notes.map((note, index) => {
    if (!isRecord(note) || typeof note.text !== 'string') throw new Error('Storyboard snapshot contains an invalid note.');
    return { id: typeof note.id === 'string' ? note.id : crypto.randomUUID(), text: note.text,
      ...(typeof note.x === 'number' && Number.isFinite(note.x) && typeof note.y === 'number' && Number.isFinite(note.y)
        ? { anchor: { x: note.x, y: note.y }, label: index + 1 } : {}) };
  }); // Preserve rectangle-note text and location as modern note pins; rectangle styling has no modern equivalent.
  return { version: 1, createdAt: new Date(0).toISOString(), state: {
    images: value.images, notes, paths: value.paths as Path[], meta: value.meta as SnapshotMetaState,
  } } satisfies SerializedSnapshotV1;
};
