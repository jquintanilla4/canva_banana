import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImage } from '../../types';
import { CanvasMediaDownloadError, downloadCanvasMedia } from '../canvasMediaDownloadService';

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
});
