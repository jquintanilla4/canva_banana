import { buildSnapshotBinaryFromState, restoreSnapshotFromFile, snapshotBinaryToBlob, type SnapshotMetaState } from '../snapshotService';
import { downloadCanvasMediaSelection } from '../canvasMediaDownloadService';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter, type FileEntry } from '@zip.js/zip.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cropCanvasImage, exportCanvasImage } from '../imageOperations';
import { normalizeImageFile, readBlobBytes } from '../svgMedia';
import type { CanvasImage } from '../../types';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 30 200 100"><text>日本語 ☀</text></svg>';
const text = async (file: Blob) => new TextDecoder().decode(await readBlobBytes(file));
const image = (): CanvasImage => ({ id: 'svg', file: new File([svg], 'quadrants.svg', { type: 'image/svg+xml' }),
  element: Object.assign(document.createElement('img'), { width: 200, height: 100 }), mediaType: 'image',
  x: 10, y: 20, width: 400, height: 100, naturalWidth: 200, naturalHeight: 100, rotation: Math.PI / 2 });

beforeEach(() => {
  vi.stubGlobal('Image', class {
    onload?: () => void;
    naturalWidth = 200;
    naturalHeight = 100;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:test');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('SVG image operations', () => {
  it('normalizes filename candidates without changing their bytes and rejects malformed labeled SVG', async () => {
    const file = await normalizeImageFile(new File([svg], 'test.svg', { type: 'application/octet-stream' }));
    expect(file.type).toBe('image/svg+xml');
    expect(await text(file)).toBe(svg);
    await expect(normalizeImageFile(new File(['<svg>'], 'test.svg'))).rejects.toThrow('Invalid SVG');
    await expect(normalizeImageFile(new File(['PNG bytes'], 'x.png', { type: 'image/svg+xml' }))).rejects.toThrow('Invalid SVG');
  });

  it.each(['le', 'be'])('validates UTF-16%s SVG without re-encoding its source bytes', async endian => {
    const source = `<?xml version="1.0" encoding="UTF-16"?>${svg}`;
    const bytes = new Uint8Array(2 + source.length * 2);
    bytes.set(endian === 'le' ? [0xff, 0xfe] : [0xfe, 0xff]);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < source.length; index += 1) view.setUint16(2 + index * 2, source.charCodeAt(index), endian === 'le');
    const file = await normalizeImageFile(new File([bytes], 'utf16.svg', { type: 'application/octet-stream' }));
    expect(new Uint8Array(await readBlobBytes(file))).toEqual(bytes);
    const cropped = await cropCanvasImage({ ...image(), file }, { x: 0, y: 0, width: 200, height: 50 });
    expect(new Uint8Array(await readBlobBytes(await exportCanvasImage(cropped, { format: 'original' })))).toEqual(bytes);
  });

  it('exports tight nonuniform resized geometry at right and arbitrary rotations without an extra pixel', async () => {
    const current = image();
    const root = new DOMParser().parseFromString(await text(await exportCanvasImage(current, { format: 'image/svg+xml', geometry: 'current' })), 'image/svg+xml').documentElement;
    expect(root.getAttribute('width')).toBe('100');
    expect(root.getAttribute('height')).toBe('400');
    expect(root.querySelector('image')?.getAttribute('width')).toBe('400');
    const rotated = new DOMParser().parseFromString(await text(await exportCanvasImage({ ...current, rotation: Math.PI / 4 }, { format: 'image/svg+xml', geometry: 'current' })), 'image/svg+xml').documentElement;
    expect(Number(rotated.getAttribute('width'))).toBeCloseTo(500 / Math.sqrt(2));
    expect(await text(await exportCanvasImage(current, { format: 'original' }))).toBe(svg);
  });

  it('composes ten crops into one payload, preserves original Unicode bytes, and rotates the crop center', async () => {
    const first = await cropCanvasImage(image(), { x: 100, y: 20, width: 200, height: 60 });
    expect(first.rotation).toBe(Math.PI / 2);
    expect(first.x).toBeCloseTo(110);
    expect(first.y).toBeCloseTo(40);
    let current = first;
    for (let round = 0; round < 10; round += 1) current = await cropCanvasImage(current, { x: 0, y: 0, width: current.width * 0.9, height: current.height * 0.9 });
    const root = new DOMParser().parseFromString(await text(current.file), 'image/svg+xml').documentElement;
    expect(root.querySelectorAll('image')).toHaveLength(1);
    const payload = root.querySelector('image')!.getAttribute('href')!.split(',')[1];
    expect(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0)))).toBe(svg);
    expect(current.file.size).toBeLessThan(first.file.size + 200);
    expect(await text(await exportCanvasImage(current, { format: 'original' }))).toBe(svg);
    expect((await exportCanvasImage(current, { format: 'original' })).name).toBe('quadrants.svg');
  });

  it('preserves canonical crop geometry and original bytes through snapshot reopen and another crop', async () => {
    const cropped = await cropCanvasImage(image(), { x: 80, y: 10, width: 200, height: 50 });
    expect(cropped.x).toBeCloseTo(125);
    expect(cropped.y).toBeCloseTo(25);
    const binary = await buildSnapshotBinaryFromState({ images: [cropped], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState });
    const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'crop.bcsnap'), { brushSize: 20, eraserSize: 20, brushColor: '#000000' });
    expect(restored.images[0]).toMatchObject({ x: 125, y: 25, width: 200, height: 50, rotation: Math.PI / 2 });
    const recropped = await cropCanvasImage(restored.images[0], { x: 10, y: 5, width: 100, height: 20 });
    expect(await text(await exportCanvasImage(recropped, { format: 'original' }))).toBe(svg);
    expect(recropped.file.size).toBeLessThan(cropped.file.size + 100);
  });

  it('never replaces an unreadable SVG snapshot source with a PNG preview', async () => {
    await expect(buildSnapshotBinaryFromState({ images: [image()], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState }, { fallbackMediaIds: new Set(['svg']) })).rejects.toThrow('SVG cannot be replaced by a preview');
  });

  it('uses identical current SVG output for single and ZIP downloads while leaving mixed raster bytes unchanged', async () => {
    const outputs: Blob[] = [];
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn((blob: Blob) => { outputs.push(blob); return `blob:output-${outputs.length}`; });
      static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const current = image();
    await downloadCanvasMediaSelection([current], undefined, { svgFormat: 'image/svg+xml' });
    const single = await readBlobBytes(outputs[0]);
    const raster = { ...current, id: 'png', file: new File(['png-source'], 'raster.png', { type: 'image/png' }) };
    await downloadCanvasMediaSelection([current, raster], undefined, { svgFormat: 'image/svg+xml' });
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readBlobBytes(outputs.at(-1)!))));
    try {
      const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
      expect(entries.map(entry => entry.filename)).toEqual(['quadrants-export.svg', 'raster.png']);
      expect(await entries[0].getData!(new Uint8ArrayWriter())).toEqual(new Uint8Array(single));
      expect(new TextDecoder().decode(await entries[1].getData!(new Uint8ArrayWriter()))).toBe('png-source');
    } finally { await reader.close(); }
  });

  it('does not unwrap foreign SVG or confuse export wrappers with crop wrappers', async () => {
    const exported = await exportCanvasImage(image(), { format: 'image/svg+xml', geometry: 'current' });
    const wrapped = { ...image(), file: exported };
    expect(await text(await exportCanvasImage(wrapped, { format: 'original' }))).toBe(await text(exported));
  });

  it.each(['a', 'bm90LXN2Zw=='])('keeps a foreign crop marker opaque when its embedded payload is invalid (%s)', async payload => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" preserveAspectRatio="none" data-canvas-role="canvas-banana-crop-v1" data-source-name="foreign.svg"><image width="200" height="100" preserveAspectRatio="none" href="data:image/svg+xml;base64,${payload}"/></svg>`;
    const foreign = { ...image(), file: new File([source], 'foreign.svg', { type: 'image/svg+xml' }) };
    expect(await text(await exportCanvasImage(foreign, { format: 'original' }))).toBe(source);
    const cropped = await cropCanvasImage(foreign, { x: 0, y: 0, width: 200, height: 50 });
    expect(await text(await exportCanvasImage(cropped, { format: 'original' }))).toBe(source);
  });

  it('uses true raster encoder MIME and rejects unsupported encoders and SVG tracing', async () => {
    const context = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['raster'], { type })));
    const jpeg = await exportCanvasImage(image(), { format: 'image/jpeg', geometry: 'current' });
    expect(jpeg.type).toBe('image/jpeg');
    expect(jpeg.name.endsWith('.jpg')).toBe(true);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 400);
    encode.mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })));
    await expect(exportCanvasImage(image(), { format: 'image/webp', geometry: 'current' })).rejects.toThrow('encoder is unavailable');
    await expect(exportCanvasImage({ ...image(), file: new File(['png'], 'test.png', { type: 'image/png' }) }, { format: 'image/svg+xml', geometry: 'current' })).rejects.toThrow('cannot be traced');
  });
});
