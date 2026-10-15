import { describe, expect, it } from 'vitest';
import { normalizeStoryboardSnapshot } from '../storyboardSnapshot';
import { restoreSnapshotFromFile } from '../snapshotService';

describe('committed Storyboard snapshot compatibility', () => {
  it('keeps image metadata and rejects malformed media at the format boundary', () => {
    const image = { id: 'shot-1', mediaType: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=', fileName: 'shot.png', fileType: 'image/png', x: 4, y: 7, width: 200, height: 100,
      metadata: { source: 'generated', generation: { kind: 'image', provider: 'fal', prompt: 'Close-up', modelId: 'fal-ai/nano-banana-pro/edit' } } };
    const snapshot = { version: 2, images: [image], paths: [], notes: [], meta: { prompt: 'Close-up' } };
    expect(normalizeStoryboardSnapshot(snapshot)).toMatchObject({ version: 1, state: { images: [image], meta: snapshot.meta } });
    expect(() => normalizeStoryboardSnapshot({ ...snapshot, images: [{ mediaType: 'video' }] })).toThrow('invalid still image');
  });

  it('preserves prompts, settings, paths and rectangle-note text/location without overwriting the source', async () => {
    const data = JSON.stringify({ version: 2, images: [], paths: [],
      notes: [{ id: 'shot-note', x: 12, y: 34, width: 200, height: 80, backgroundColor: '#fff', text: 'Keep the reference face' }],
      meta: { prompt: 'Close-up', apiProvider: 'fal', falModelId: 'fal-ai/nano-banana-pro/edit', brushSize: 12, eraserSize: 14, brushColor: '#fff' } });
    const file = new File([data], 'old-project.bcsnap', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(data) });
    const result = await restoreSnapshotFromFile(file, { brushSize: 1, eraserSize: 1, brushColor: '#000' });
    expect(result.notes).toEqual([{ id: 'shot-note', text: 'Keep the reference face', anchor: { x: 12, y: 34 }, label: 1 }]);
    expect(result.meta?.prompt).toBe('Close-up');
    expect(result.droppedLegacyNoteCount).toBe(0);
    expect(result.sourceFormat).toBe('legacy-json');
    expect(await file.text()).toBe(data);
  });
});
