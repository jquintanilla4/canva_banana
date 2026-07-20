import { describe, expect, it } from 'vitest';
import { restoreSnapshotFromFile } from '../snapshotService';

const RESTORE_OPTIONS = { brushSize: 10, eraserSize: 10, brushColor: '#000000' };

const buildSnapshotFile = (notes: unknown[], fileName = 'snapshot.json') => {
  const json = JSON.stringify({
    version: 1,
    createdAt: new Date(0).toISOString(),
    state: { images: [], notes, paths: [] },
  });
  const file = new File([json], fileName, { type: 'application/json' });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) }); // jsdom File lacks text().
  }
  return file;
};

describe('snapshotService note sanitization', () => {
  it('reports legacy JSON from its content even when the file has a binary extension', async () => {
    const restored = await restoreSnapshotFromFile(buildSnapshotFile([], 'renamed-legacy.bcsnap'), RESTORE_OPTIONS);

    expect(restored.sourceFormat).toBe('legacy-json');
  });

  it('drops legacy canvas-rectangle notes on load', async () => {
    const file = buildSnapshotFile([
      { id: 'legacy-1', x: 10, y: 20, width: 200, height: 120, text: 'old sticky', backgroundColor: '#1f2937' },
      { id: 'legacy-2', x: 0, y: 0, width: 100, height: 50, text: 'another', backgroundColor: '#000000', fontSize: 24 },
    ]);

    const restored = await restoreSnapshotFromFile(file, RESTORE_OPTIONS);

    expect(restored.notes).toEqual([]);
    expect(restored.droppedLegacyNoteCount).toBe(2); // Callers surface the loss to the user.
  });

  it('keeps new-format notes and validates their fields', async () => {
    const file = buildSnapshotFile([
      { id: 'anchored', text: 'pinned', label: 3, anchor: { x: 40, y: 60 } },
      { id: 'panel-only', text: 'floating' },
      { id: 'legacy', x: 1, y: 2, width: 100, height: 50, text: 'dropped', backgroundColor: '#fff' },
    ]);

    const restored = await restoreSnapshotFromFile(file, RESTORE_OPTIONS);

    expect(restored.notes).toEqual([
      { id: 'anchored', text: 'pinned', label: 3, anchor: { x: 40, y: 60 } },
      { id: 'panel-only', text: 'floating' },
    ]);
    expect(restored.droppedLegacyNoteCount).toBe(1);
  });

  it('strips labels from notes without a valid anchor and repairs missing fields', async () => {
    const file = buildSnapshotFile([
      { id: 'label-no-anchor', text: 'orphan label', label: 9 },
      { id: 'bad-anchor', text: 'bad anchor', label: 4, anchor: { x: Number.NaN, y: 5 } },
      { id: 'missing-text', anchor: { x: 1, y: 2 } },
    ]);

    const restored = await restoreSnapshotFromFile(file, RESTORE_OPTIONS);

    expect(restored.notes).toEqual([
      { id: 'label-no-anchor', text: 'orphan label' },
      { id: 'bad-anchor', text: 'bad anchor' },
      { id: 'missing-text', text: '' },
    ]);
  });
});
