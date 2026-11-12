import { afterEach, describe, expect, it, vi } from 'vitest';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, type FileEntry } from '@zip.js/zip.js';
import { prepareGeneratedImage } from '../mediaService';
import { buildSnapshotBinaryFromState, snapshotBinaryToBlob, restoreSnapshotFromFile, type SnapshotMetaState } from '../snapshotService';
import { downloadCanvasMedia, downloadCanvasMediaSelection } from '../canvasMediaDownloadService';
import { GPT_IMAGE_26_MODEL_ID } from '../gptImage26Config';
import type { CanvasImage } from '../../types';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 96"><path fill="#ffcc00" d="M0 0h128v96H0z"/></svg>';
const bytes = (blob: Blob): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(blob);
});
const setupImage = () => {
  vi.stubGlobal('Image', class {
    onload?: () => void;
    naturalWidth = 128;
    naturalHeight = 96;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('original generated image files', () => {
  it.each(['image/svg+xml', 'image/svg+xml;charset=utf-8', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])(
    'preserves original %s bytes, MIME and extension without a canvas conversion', async mime => {
      setupImage();
      const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
      const source = mime.startsWith('image/svg+xml') ? svg : mime === 'image/gif' ? 'GIF89a-original-bytes' : 'raster-original-bytes';
      const { file } = await prepareGeneratedImage(`data:${mime};base64,${btoa(source)}`, 'preserve-original');
      const plainMime = mime.split(';')[0];
      expect(file.type).toBe(plainMime);
      expect(file.name).toBe(`generated.${plainMime === 'image/svg+xml' ? 'svg' : plainMime.split('/')[1]}`);
      expect(Array.from(await bytes(file))).toEqual(Array.from(new TextEncoder().encode(source)));
      expect(toDataURL).not.toHaveBeenCalled();
    },
  );

  it.each(['application/octet-stream', 'image/png', 'image/svg+xml'])('preserves actual generated SVG bytes despite %s response MIME and PNG policy', async mime => {
    setupImage();
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    const result = await prepareGeneratedImage(`data:${mime};base64,${btoa(svg)}`, 'png');
    expect(result.file.type).toBe('image/svg+xml');
    expect(result.file.name).toBe('generated.svg');
    expect(Array.from(await bytes(result.file))).toEqual(Array.from(new TextEncoder().encode(svg)));
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('retains SVG through save/open/save and single/ZIP downloads', async () => {
    setupImage();
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return `blob:svg-${blobs.length}`; });
      static revokeObjectURL = vi.fn();
    });
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function capture() { downloads.push(this.download); });
    const generated = await prepareGeneratedImage(`data:image/svg+xml;base64,${btoa(svg)}`, 'preserve-original');
    let image: CanvasImage = {
      id: 'vector', element: generated.image, file: generated.file, mediaType: 'image', x: 0, y: 0, width: 128, height: 96, rotation: 0, naturalWidth: 128, naturalHeight: 96,
      metadata: { source: 'generated', generation: { provider: 'fal', modelMode: 'image', modelId: GPT_IMAGE_26_MODEL_ID, kind: 'text_to_image', prompt: 'A vector', falOptions: { gptImage26OutputFormat: 'svg', gptImage26ReasoningEffort: 'high', numImages: 1 } } },
    };
    for (let round = 0; round < 2; round += 1) {
      const binary = await buildSnapshotBinaryFromState({ images: [image], notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [], meta: {} as SnapshotMetaState });
      const restored = await restoreSnapshotFromFile(new File([snapshotBinaryToBlob(binary)], 'vector.bcsnap'), { brushSize: 20, eraserSize: 20, brushColor: '#000000' });
      image = restored.images[0];
      expect(image.file.name).toBe('generated.svg');
      expect(image.file.type).toBe('image/svg+xml');
      expect(Array.from(await bytes(image.file))).toEqual(Array.from(new TextEncoder().encode(svg)));
      expect(image.metadata?.generation?.falOptions).toMatchObject({ gptImage26OutputFormat: 'svg', gptImage26ReasoningEffort: 'high' });
    }
    await downloadCanvasMedia(image);
    expect(downloads.at(-1)).toBe('generated.svg');
    expect(Array.from(await bytes(blobs.at(-1)!))).toEqual(Array.from(new TextEncoder().encode(svg)));
    await downloadCanvasMediaSelection([image, { ...image, id: 'second' }]);
    const reader = new ZipReader(new Uint8ArrayReader(await bytes(blobs.at(-1)!)));
    try {
      const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
      expect(entries.map(entry => entry.filename)).toEqual(['generated.svg', 'generated (2).svg']);
      for (const entry of entries) expect(Array.from(await entry.getData!(new Uint8ArrayWriter()))).toEqual(Array.from(new TextEncoder().encode(svg)));
    } finally { await reader.close(); }
  });
});
