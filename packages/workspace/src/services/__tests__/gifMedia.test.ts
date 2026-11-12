import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter, type FileEntry } from '@zip.js/zip.js';
import type { CanvasImage } from '../../types';
import { isGifFile, isGifImage } from '../gifMedia';
import { normalizeImageFile, readBlobBytes } from '../svgMedia';
import { confirmRasterCopies } from '../stillImagePolicy';
import { prepareGeneratedImage } from '../mediaService';
import { exportCanvasImage } from '../imageOperations';
import { buildSnapshotBinaryFromState, restoreSnapshotFromFile, snapshotBinaryToBlob, type SnapshotMetaState } from '../snapshotService';
import { downloadCanvasMediaSelection } from '../canvasMediaDownloadService';

const source = new Uint8Array(readFileSync('src/services/__tests__/fixtures/blink.gif'));
const file = () => new File([source], 'blink.gif', { type: 'image/gif' });
const image = (): CanvasImage => ({ id: 'gif', element: document.createElement('img'), file: file(), mediaType: 'image', x: 20, y: 30, width: 100, height: 50, naturalWidth: 64, naturalHeight: 48, rotation: 0.5 });
beforeEach(() => {
  vi.stubGlobal('Image', class {
    onload?: () => void;
    naturalWidth = 64;
    naturalHeight = 48;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('original GIF sources', () => {
  it('accepts MIME or filename GIFs, validates ingress headers and retains exact bytes', async () => {
    expect(isGifFile(new File([], 'BLINK.GIF'))).toBe(true);
    expect(isGifFile(new File([], 'blink', { type: 'image/gif' }))).toBe(true);
    expect(isGifImage({ ...image(), mediaType: 'video' })).toBe(false);
    const normalized = await normalizeImageFile(new File([source], 'blink.gif'));
    expect(normalized.type).toBe('image/gif');
    expect(new Uint8Array(await readBlobBytes(normalized))).toEqual(source);
    await expect(normalizeImageFile(new File(['not a gif'], 'blink.gif'))).rejects.toThrow('Invalid GIF');
    const original = file();
    expect(await normalizeImageFile(original)).toBe(original);
  });

  it('asks once for the exact distinct protected sources and explains deterministic GIF conversion', () => {
    const gif = image();
    const svg = { ...image(), id: 'svg', file: new File([], 'vector.svg', { type: 'image/svg+xml' }) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(confirmRasterCopies([gif, { ...gif, id: 'same-file' }, svg], 'Edit image')).toBe(false);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('1 SVG image and 1 GIF image'));
    expect(confirm.mock.calls[0][0]).toContain('first frame only, without animation');
    expect(confirmRasterCopies([{ ...image(), file: new File([], 'still.png', { type: 'image/png' }) }], 'Edit image')).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('retains genuine generated GIF through repeated snapshot reopen, original host export and single/mixed ZIP downloads', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return `blob:gif-${blobs.length}`; });
      static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const convert = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    const generated = await prepareGeneratedImage(`data:image/gif;base64,${btoa(String.fromCharCode(...source))}`, 'preserve-original');
    let current: CanvasImage = { ...image(), file: generated.file, element: generated.image };
    expect(current.file.name).toBe('generated.gif');
    expect(current.file.type).toBe('image/gif');
    expect(convert).not.toHaveBeenCalled();
    for (let round = 0; round < 2; round += 1) {
      const binary = await buildSnapshotBinaryFromState({ images: [current], notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'animation.bcsnap'), { brushSize: 20, eraserSize: 20, brushColor: '#000' });
      current = restored.images[0];
      expect(current).toMatchObject({ x: 20, y: 30, width: 100, height: 50, rotation: 0.5 });
      expect(current.file.type).toBe('image/gif');
      expect(new Uint8Array(await readBlobBytes(current.file))).toEqual(source);
    }
    expect(new Uint8Array(await readBlobBytes(await exportCanvasImage(current, { format: 'original' })))).toEqual(source);
    await downloadCanvasMediaSelection([current]);
    expect(new Uint8Array(await readBlobBytes(blobs.at(-1)!))).toEqual(source);
    const png = { ...current, id: 'png', file: new File(['png-bytes'], 'still.png', { type: 'image/png' }) };
    await downloadCanvasMediaSelection([current, png]);
    const archive = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readBlobBytes(blobs.at(-1)!))));
    try {
      const entries = (await archive.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
      expect(entries.map(entry => entry.filename)).toEqual(['generated.gif', 'still.png']);
      expect(await entries[0].getData!(new Uint8ArrayWriter())).toEqual(source);
      expect(new TextDecoder().decode(await entries[1].getData!(new Uint8ArrayWriter()))).toBe('png-bytes');
    } finally { await archive.close(); }
  });

  it('refuses preview substitution for an unreadable GIF source', async () => {
    await expect(buildSnapshotBinaryFromState({ images: [image()], notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState }, { fallbackMediaIds: new Set(['gif']) })).rejects.toThrow('GIF cannot be replaced by a preview');
  });
});
