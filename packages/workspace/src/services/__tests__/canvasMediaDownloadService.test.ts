import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, type FileEntry } from '@zip.js/zip.js';
import type { CanvasImage } from '../../types';
import {
  CanvasMediaDownloadError,
  CanvasMediaDownloadCancelledError,
  createCanvasMediaArchiveName,
  downloadCanvasMedia,
  downloadCanvasMediaSelection,
  sanitizeCanvasMediaFileName,
} from '../canvasMediaDownloadService';

type LazySnapshotFile = File & {
  snapshotObjectUrl?: string;
  slice: ReturnType<typeof vi.fn>;
};

const buildLazyFile = (snapshotObjectUrl?: string): LazySnapshotFile => ({
  name: 'restored image.png',
  type: 'image/png',
  size: 12,
  lastModified: 1,
  webkitRelativePath: '',
  snapshotObjectUrl,
  slice: vi.fn(() => ({
    arrayBuffer: () => Promise.reject(new Error('Snapshot read source is no longer available.')),
  })),
} as unknown as LazySnapshotFile); // Mirrors the pseudo-File used for desktop snapshot media.

const buildImage = (file: File, element = document.createElement('img')): CanvasImage => ({
  id: 'image-1',
  element,
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file,
});

const readBlobBytes = (blob: Blob): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(blob);
});

describe('downloadCanvasMedia', () => {
  let clickedHref: string | null;
  let clickedDownload: string | null;

  beforeEach(() => {
    clickedHref = null;
    clickedDownload = null;
    window.canvaBananaDesktop = undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload() {
      clickedHref = this.href;
      clickedDownload = this.download;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    Reflect.deleteProperty(window, 'showSaveFilePicker');
    window.canvaBananaDesktop = undefined;
  });

  it('streams restored snapshot media through its retained URL without reading the pseudo-File', async () => {
    const lazyFile = buildLazyFile('canva-banana-snapshot://media/source-1/10/12/snapshot-media?type=image%2Fpng');

    await downloadCanvasMedia(buildImage(lazyFile));

    expect(lazyFile.slice).not.toHaveBeenCalled();
    expect(clickedHref).not.toBeNull();
    const clickedUrl = new URL(clickedHref!);
    expect(clickedUrl.protocol).toBe('canva-banana-snapshot:');
    expect(clickedUrl.searchParams.get('download')).toBe('1');
    expect(clickedUrl.searchParams.get('fileName')).toBe('restored image.png');
    expect(clickedDownload).toBe('restored image.png');
  });

  it('uses Electron native downloads for retained snapshot media', async () => {
    const downloadSnapshotMedia = vi.fn(async (_payload: { url: string }) => ({ started: true }));
    window.canvaBananaDesktop = { fileMenu: { downloadSnapshotMedia } };
    const lazyFile = buildLazyFile('canva-banana-snapshot://media/source-1/10/12/snapshot-media?type=image%2Fpng');

    await downloadCanvasMedia(buildImage(lazyFile));

    expect(downloadSnapshotMedia).toHaveBeenCalledOnce();
    expect(downloadSnapshotMedia.mock.calls[0][0].url).toContain('download=1');
    expect(lazyFile.slice).not.toHaveBeenCalled();
    expect(clickedHref).toBeNull();
  });

  it('keeps Blob downloads for current-session files and revokes their temporary URL', async () => {
    vi.useFakeTimers();
    const file = new File(['current-session'], 'current.png', { type: 'image/png' });
    const createObjectURL = vi.fn(() => 'blob:current-media');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    await downloadCanvasMedia(buildImage(file));
    await vi.runAllTimersAsync();

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(clickedHref).toBe('blob:current-media');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:current-media');
  });

  it('keeps desktop Blob URLs alive until Electron reports download completion', async () => {
    vi.useFakeTimers();
    const file = new File(['current-session'], 'current.png', { type: 'image/png' });
    const createObjectURL = vi.fn(() => 'blob:desktop-media');
    const revokeObjectURL = vi.fn();
    let downloadFinished: ((payload: { url: string; state: 'completed' | 'cancelled' | 'interrupted' }) => void) | undefined;
    const unsubscribe = vi.fn();
    const onMediaDownloadFinished = vi.fn((callback: typeof downloadFinished) => {
      downloadFinished = callback;
      return unsubscribe;
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    window.canvaBananaDesktop = { fileMenu: { onMediaDownloadFinished } };

    await downloadCanvasMedia(buildImage(file));
    await vi.runAllTimersAsync();

    expect(clickedHref).toBe('blob:desktop-media');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    downloadFinished?.({ url: 'blob:another-media', state: 'completed' });
    expect(revokeObjectURL).not.toHaveBeenCalled();

    downloadFinished?.({ url: 'blob:desktop-media', state: 'completed' });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:desktop-media');
  });

  it('uses the rendered media source when a non-retained file can no longer be read', async () => {
    const lazyFile = buildLazyFile();
    const element = document.createElement('img');
    element.src = 'data:image/png;base64,aW1hZ2U=';

    await downloadCanvasMedia(buildImage(lazyFile, element));

    expect(lazyFile.slice).toHaveBeenCalledOnce();
    expect(clickedHref).toBe(element.src);
  });

  it('returns a typed error when neither file bytes nor rendered media remain available', async () => {
    const lazyFile = buildLazyFile();

    await expect(downloadCanvasMedia(buildImage(lazyFile))).rejects.toMatchObject({
      name: 'CanvasMediaDownloadError',
      code: 'source-unavailable',
    } satisfies Partial<CanvasMediaDownloadError>);
  });

  it.each([
    { mediaType: 'video' as const, fileName: 'clip.mov', type: 'video/quicktime' },
    { mediaType: 'audio' as const, fileName: 'voice.m4a', type: 'audio/mp4' },
  ])('downloads one selected $mediaType as its original file', async ({ mediaType, fileName, type }) => {
    vi.useFakeTimers();
    const file = new File([`${mediaType}-bytes`], fileName, { type });
    const createObjectURL = vi.fn(() => `blob:${mediaType}`);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const image = { ...buildImage(file), mediaType } as CanvasImage;

    await downloadCanvasMediaSelection([image]);

    expect(clickedDownload).toBe(fileName);
    expect(createObjectURL).toHaveBeenCalledWith(file);
  });

  it('creates a stable flat ZIP with original bytes, sanitized names, and duplicate suffixes', async () => {
    let archiveBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      archiveBlob = blob;
      return 'blob:media-archive';
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const first = buildImage(new File(['first-bytes'], 'folder/image.png', { type: 'image/png' }));
    const second = {
      ...buildImage(new File(['second-bytes'], 'IMAGE.png', { type: 'image/png' })),
      id: 'video-2',
      mediaType: 'video' as const,
    };
    const progress: Array<{ completedItems: number; totalItems: number }> = [];

    const result = await downloadCanvasMediaSelection([first, second], update => progress.push(update));

    expect(result).toEqual({ downloadedCount: 2, skipped: [] });
    expect(clickedDownload).toMatch(/^canvas-media-.*\.zip$/);
    expect(archiveBlob).toBeInstanceOf(Blob);
    const reader = new ZipReader(new Uint8ArrayReader(await readBlobBytes(archiveBlob!)));
    const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
    expect(entries.map(entry => entry.filename)).toEqual(['image.png', 'IMAGE (2).png']);
    const contents = await Promise.all(entries.map(entry => entry.getData(new Uint8ArrayWriter())));
    expect(new TextDecoder().decode(contents[0])).toBe('first-bytes');
    expect(new TextDecoder().decode(contents[1])).toBe('second-bytes');
    expect(entries.every(entry => entry.compressionMethod === 0)).toBe(true);
    await reader.close();
    expect(progress.at(-1)).toMatchObject({ completedItems: 2, totalItems: 2 });
  });

  it('keeps duplicate ZIP entry names within the filesystem filename limit', async () => {
    let archiveBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        archiveBlob = blob;
        return 'blob:long-name-archive';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const longName = `${'a'.repeat(300)}.png`;
    const first = buildImage(new File(['one'], longName, { type: 'image/png' }));
    const second = { ...buildImage(new File(['two'], longName, { type: 'image/png' })), id: 'second' };

    await downloadCanvasMediaSelection([first, second]);

    const reader = new ZipReader(new Uint8ArrayReader(await readBlobBytes(archiveBlob!)));
    const names = (await reader.getEntries()).map(entry => entry.filename);
    expect(names.every(name => new TextEncoder().encode(name).byteLength <= 255)).toBe(true);
    expect(names[1]).toMatch(/ \(2\)\.png$/);
    await reader.close();
  });

  it('prefixes Windows-reserved ZIP entry names', () => {
    expect(sanitizeCanvasMediaFileName('CON.png', 'download.png')).toBe('_CON.png');
    expect(sanitizeCanvasMediaFileName('nul', 'download.png')).toBe('_nul');
    expect(sanitizeCanvasMediaFileName('LPT1.mov', 'video.mp4')).toBe('_LPT1.mov');
  });

  it('compresses raw media while storing already-compressed media', async () => {
    let archiveBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        archiveBlob = blob;
        return 'blob:compression-archive';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const wav = { ...buildImage(new File([new Uint8Array(4096)], 'audio.wav', { type: 'audio/wav' })), mediaType: 'audio' as const };
    const png = { ...buildImage(new File(['png'], 'image.png', { type: 'image/png' })), id: 'png' };
    const mpeg = {
      ...buildImage(new File(['mpeg'], 'video.mpeg', { type: 'video/mpeg' })),
      id: 'mpeg',
      mediaType: 'video' as const,
    };

    await downloadCanvasMediaSelection([wav, png, mpeg]);

    const reader = new ZipReader(new Uint8ArrayReader(await readBlobBytes(archiveBlob!)));
    const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
    expect(entries.map(entry => entry.compressionMethod)).toEqual([8, 0, 0]);
    await reader.close();
  });

  it('skips an unreadable entry and still creates an archive from readable selections', async () => {
    let archiveBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        archiveBlob = blob;
        return 'blob:partial-archive';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const readable = buildImage(new File(['good'], 'good.png', { type: 'image/png' }));
    const unreadable = { ...buildImage(buildLazyFile()), id: 'missing', element: document.createElement('img') };

    const result = await downloadCanvasMediaSelection([readable, unreadable]);

    expect(result.downloadedCount).toBe(1);
    expect(result.skipped).toEqual([expect.objectContaining({ id: 'missing', fileName: 'restored image.png' })]);
    const reader = new ZipReader(new Uint8ArrayReader(await readBlobBytes(archiveBlob!)));
    expect((await reader.getEntries()).map(entry => entry.filename)).toEqual(['good.png']);
    await reader.close();
  });

  it('does not create an archive when every selected item is unreadable', async () => {
    const createObjectURL = vi.fn(() => 'blob:should-not-exist');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const first = { ...buildImage(buildLazyFile()), id: 'missing-1', element: document.createElement('img') };
    const second = { ...buildImage(buildLazyFile()), id: 'missing-2', element: document.createElement('img') };

    await expect(downloadCanvasMediaSelection([first, second])).rejects.toMatchObject({
      code: 'archive-empty',
    } satisfies Partial<CanvasMediaDownloadError>);

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('streams ZIP output through the bounded desktop archive bridge', async () => {
    const chunks: Uint8Array[] = [];
    const beginMediaArchiveWrite = vi.fn(async () => ({ canceled: false as const, writeId: 'archive-1', fileName: 'canvas-media.zip' }));
    const writeMediaArchiveChunk = vi.fn(async (payload: { data: ArrayBuffer }) => {
      chunks.push(new Uint8Array(payload.data));
      return { written: payload.data.byteLength };
    });
    const finishMediaArchiveWrite = vi.fn(async () => ({ saved: true }));
    const abortMediaArchiveWrite = vi.fn(async () => ({ aborted: true }));
    window.canvaBananaDesktop = { fileMenu: {
      beginMediaArchiveWrite,
      writeMediaArchiveChunk,
      finishMediaArchiveWrite,
      abortMediaArchiveWrite,
    } };
    const first = buildImage(new File(['one'], 'one.png', { type: 'image/png' }));
    const second = { ...buildImage(new File(['two'], 'two.png', { type: 'image/png' })), id: 'two' };

    await expect(downloadCanvasMediaSelection([first, second])).resolves.toEqual({ downloadedCount: 2, skipped: [] });

    expect(beginMediaArchiveWrite).toHaveBeenCalledWith({ suggestedName: expect.stringMatching(/^canvas-media-.*\.zip$/) });
    expect(writeMediaArchiveChunk).toHaveBeenCalled();
    expect(finishMediaArchiveWrite).toHaveBeenCalledWith({ writeId: 'archive-1' });
    expect(abortMediaArchiveWrite).not.toHaveBeenCalled();
    expect(clickedHref).toBeNull();
    const archiveBytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    chunks.forEach(chunk => {
      archiveBytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    const reader = new ZipReader(new Uint8ArrayReader(archiveBytes));
    expect((await reader.getEntries()).map(entry => entry.filename)).toEqual(['one.png', 'two.png']);
    await reader.close();
  });

  it('aborts the desktop archive when ZIP setup fails', async () => {
    const abortMediaArchiveWrite = vi.fn(async () => ({ aborted: true }));
    window.canvaBananaDesktop = { fileMenu: {
      beginMediaArchiveWrite: vi.fn(async () => ({ canceled: false as const, writeId: 'archive-1', fileName: 'canvas-media.zip' })),
      writeMediaArchiveChunk: vi.fn(),
      finishMediaArchiveWrite: vi.fn(),
      abortMediaArchiveWrite,
    } };
    const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      get: () => { throw new Error('Storage API unavailable.'); },
    });
    const first = buildImage(new File(['one'], 'one.png', { type: 'image/png' }));
    const second = { ...buildImage(new File(['two'], 'two.png', { type: 'image/png' })), id: 'two' };

    try {
      await expect(downloadCanvasMediaSelection([first, second])).rejects.toThrow('Storage API unavailable.');
      expect(abortMediaArchiveWrite).toHaveBeenCalledWith({ writeId: 'archive-1' });
    } finally {
      if (storageDescriptor) {
        Object.defineProperty(navigator, 'storage', storageDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'storage');
      }
    }
  });

  it('streams ZIP output to a web save handle when File System Access is available', async () => {
    const chunks: Uint8Array[] = [];
    const close = vi.fn();
    const abort = vi.fn();
    const writable = new WritableStream<Uint8Array>({
      write: chunk => { chunks.push(chunk.slice()); },
      close,
      abort,
    });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: vi.fn(async () => ({ createWritable: async () => writable })),
    });
    const first = buildImage(new File(['one'], 'one.png', { type: 'image/png' }));
    const second = { ...buildImage(new File(['two'], 'two.png', { type: 'image/png' })), id: 'two' };

    await downloadCanvasMediaSelection([first, second]);

    expect(close).toHaveBeenCalledOnce();
    expect(abort).not.toHaveBeenCalled();
    expect(clickedHref).toBeNull();
    const archiveBytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    chunks.forEach(chunk => {
      archiveBytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    const reader = new ZipReader(new Uint8ArrayReader(archiveBytes));
    expect((await reader.getEntries()).map(entry => entry.filename)).toEqual(['one.png', 'two.png']);
    await reader.close();
  });

  it('aborts a web save handle when every selected item is unreadable', async () => {
    const abort = vi.fn();
    const writable = new WritableStream<Uint8Array>({ abort });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: vi.fn(async () => ({ createWritable: async () => writable })),
    });
    const first = { ...buildImage(buildLazyFile()), id: 'missing-1', element: document.createElement('img') };
    const second = { ...buildImage(buildLazyFile()), id: 'missing-2', element: document.createElement('img') };

    await expect(downloadCanvasMediaSelection([first, second])).rejects.toMatchObject({ code: 'archive-empty' });

    expect(abort).toHaveBeenCalledOnce();
  });

  it('treats desktop save-dialog cancellation as a typed silent cancellation', async () => {
    window.canvaBananaDesktop = { fileMenu: {
      beginMediaArchiveWrite: vi.fn(async () => ({ canceled: true as const })),
      writeMediaArchiveChunk: vi.fn(),
      finishMediaArchiveWrite: vi.fn(),
      abortMediaArchiveWrite: vi.fn(),
    } };
    const first = buildImage(new File(['one'], 'one.png', { type: 'image/png' }));
    const second = { ...first, id: 'two' };

    await expect(downloadCanvasMediaSelection([first, second])).rejects.toBeInstanceOf(CanvasMediaDownloadCancelledError);
  });

  it('uses a rendered source after a lazy snapshot stream fails', async () => {
    let archiveBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        archiveBlob = blob;
        return 'blob:fallback-archive';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const fallbackImage = buildImage(buildLazyFile());
    fallbackImage.element.src = 'data:image/png;base64,ZmFsbGJhY2s=';
    const other = { ...buildImage(new File(['other'], 'other.png', { type: 'image/png' })), id: 'other' };

    const result = await downloadCanvasMediaSelection([fallbackImage, other]);

    expect(result.downloadedCount).toBe(2);
    const reader = new ZipReader(new Uint8ArrayReader(await readBlobBytes(archiveBlob!)));
    const entries = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
    const firstBytes = await entries[0].getData(new Uint8ArrayWriter());
    expect(new TextDecoder().decode(firstBytes)).toBe('fallback');
    await reader.close();
  });

  it('keeps a shared snapshot source open until every selected entry is archived', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:leased-archive') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    let activeLeases = 0;
    let closeRequested = false;
    let sourceClosed = false;
    const snapshotLeaseSource = {
      acquireLease: vi.fn(async () => {
        if (closeRequested && activeLeases === 0) throw new Error('Snapshot read source is no longer available.');
        activeLeases += 1;
        return async () => {
          activeLeases -= 1;
          if (closeRequested && activeLeases === 0) sourceClosed = true;
        };
      }),
    };
    const buildLeasedFile = (name: string, contents: string, requestsClose = false): File => {
      const bytes = new TextEncoder().encode(contents);
      const lazyFile = {
        name,
        type: 'image/png',
        size: bytes.byteLength,
        lastModified: 1,
        webkitRelativePath: '',
        snapshotLeaseSource,
        withSourceLease: async <T>(operation: () => Promise<T>): Promise<T> => {
          const release = await snapshotLeaseSource.acquireLease();
          try {
            return await operation();
          } finally {
            await release();
          }
        },
        stream: () => new ReadableStream<Uint8Array>({
          start(controller) {
            if (sourceClosed) {
              controller.error(new Error('Snapshot read source is no longer available.'));
              return;
            }
            controller.enqueue(bytes);
            controller.close();
            if (requestsClose) closeRequested = true;
          },
        }),
      };
      return lazyFile as unknown as File;
    };
    const first = buildImage(buildLeasedFile('first.png', 'first', true));
    const second = { ...buildImage(buildLeasedFile('second.png', 'second')), id: 'second' };

    await expect(downloadCanvasMediaSelection([first, second])).resolves.toEqual({ downloadedCount: 2, skipped: [] });

    expect(sourceClosed).toBe(true);
  });

  it('sanitizes flat filenames and produces timestamped archive names', () => {
    expect(sanitizeCanvasMediaFileName('../bad:name?.png', 'download.png')).toBe('bad_name_.png');
    const oversizedName = sanitizeCanvasMediaFileName(`${'😀'.repeat(20_000)}.png`, 'download.png');
    expect(new TextEncoder().encode(oversizedName).byteLength).toBeLessThanOrEqual(255);
    expect(oversizedName.endsWith('.png')).toBe(true);
    expect(createCanvasMediaArchiveName(new Date('2026-08-15T12:34:56.789Z'))).toBe('canvas-media-2026-08-15T12-34-56-789Z.zip');
  });
});
