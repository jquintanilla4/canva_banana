import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLazyVideoFromUrl, ensureVideoMetadataLoaded, getVideoFileExtension, getVideoObjectUrl, loadMediaFromBlob, loadMediaFromUrl, prepareVideoForPlayback } from '../mediaService';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stubObjectUrls = () => {
  const createObjectURL = vi.fn(() => 'blob:mock-object-url');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL }));
  return { createObjectURL, revokeObjectURL };
}; // jsdom does not implement object URLs.

describe('getVideoFileExtension', () => {
  it('maps the QuickTime MIME subtype to the standard MOV extension', () => {
    expect(getVideoFileExtension('video/quicktime')).toBe('mov');
    expect(getVideoFileExtension('video/quicktime; codecs=hvc1')).toBe('mov');
  });

  it('keeps ordinary video subtypes and falls back safely', () => {
    expect(getVideoFileExtension('video/mp4')).toBe('mp4');
    expect(getVideoFileExtension('application/octet-stream')).toBe('mp4');
  });
});

describe('loadMediaFromUrl', () => {
  it('loads images with crossOrigin so protocol-served media does not taint canvases', async () => {
    vi.stubGlobal('Image', class {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.()); // Simulate a successful load.
      }
    } as unknown as typeof Image);

    const element = await loadMediaFromUrl('canva-banana-snapshot://media/source-1/0/1/a.png', 'image');

    expect(element.crossOrigin).toBe('anonymous');
  });

  it('resolves protocol videos from metadata without fetching the first frame', async () => {
    const createElement = vi.spyOn(document, 'createElement');

    const pending = loadMediaFromUrl('canva-banana-snapshot://media/source-1/0/1/a.mp4', 'video', false, 'metadata');
    const video = createElement.mock.results.at(-1)?.value as HTMLVideoElement;

    expect(video.crossOrigin).toBe('anonymous');
    expect(video.preload).toBe('metadata');
    expect(video.onloadeddata).toBeNull();

    video.onloadedmetadata?.(new Event('loadedmetadata'));

    await expect(pending).resolves.toBe(video);
  });
});

describe('createLazyVideoFromUrl', () => {
  it('keeps desktop snapshot videos dormant until playback starts', () => {
    const video = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/a.mp4', 1920, 1080);

    expect(video.crossOrigin).toBe('anonymous');
    expect(video.preload).toBe('none');
    expect(video.width).toBe(1920);
    expect(video.height).toBe(1080);
    expect(getVideoObjectUrl(video)).toBe('canva-banana-snapshot://media/source-1/0/1/a.mp4');
  });

  it('explicitly wakes a dormant snapshot video before playback', () => {
    const video = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/a.mp4', 1920, 1080);
    const load = vi.spyOn(video, 'load').mockImplementation(() => {});

    prepareVideoForPlayback(video);
    prepareVideoForPlayback(video);

    expect(video.preload).toBe('auto');
    expect(load).toHaveBeenCalledTimes(1); // Repeated playback sync must not reset the stream.
  });

  it('does not reset an ordinary or already-loaded video', () => {
    const video = document.createElement('video');
    const load = vi.spyOn(video, 'load').mockImplementation(() => {});

    prepareVideoForPlayback(video);

    expect(load).not.toHaveBeenCalled();
  });

  it('deduplicates on-demand metadata loads and restores the lazy preload policy', async () => {
    const video = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/a.mp4', 1920, 1080);
    const load = vi.spyOn(video, 'load').mockImplementation(() => {}); // Keep the simulated request pending.

    const firstLoad = ensureVideoMetadataLoaded(video);
    const secondLoad = ensureVideoMetadataLoaded(video);

    expect(load).toHaveBeenCalledTimes(1);
    expect(video.preload).toBe('metadata');
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(Promise.all([firstLoad, secondLoad])).resolves.toEqual([undefined, undefined]);
    expect(video.preload).toBe('none');
  });

  it('does not reset playback while waiting for metadata from an active video', async () => {
    const video = createLazyVideoFromUrl('canva-banana-snapshot://media/source-1/0/1/a.mp4', 1920, 1080);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    const load = vi.spyOn(video, 'load').mockImplementation(() => {});

    const pending = ensureVideoMetadataLoaded(video);

    expect(load).not.toHaveBeenCalled();
    video.dispatchEvent(new Event('loadedmetadata'));
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('loadMediaFromBlob', () => {
  it('revokes the object URL when a video fails to load', async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const createElement = vi.spyOn(document, 'createElement');

    const pending = loadMediaFromBlob(new Blob(['x'], { type: 'video/mp4' }), 'video');
    const video = createElement.mock.results.at(-1)?.value as HTMLVideoElement;
    video.onerror?.(new Event('error'));

    await expect(pending).rejects.toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url');
  });

  it('keeps the object URL alive for videos that load successfully', async () => {
    const { revokeObjectURL } = stubObjectUrls();
    const createElement = vi.spyOn(document, 'createElement');

    const pending = loadMediaFromBlob(new Blob(['x'], { type: 'video/mp4' }), 'video');
    const video = createElement.mock.results.at(-1)?.value as HTMLVideoElement;
    video.onloadeddata?.(new Event('loadeddata'));

    await expect(pending).resolves.toBe(video);
    expect(revokeObjectURL).not.toHaveBeenCalled(); // Playback still needs the URL; history cleanup revokes it later.
  });
});
