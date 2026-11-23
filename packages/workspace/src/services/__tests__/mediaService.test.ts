import { readMp4VideoDimensions } from '../mp4VideoDimensions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLazyVideoFromUrl, ensureVideoMetadataLoaded, getVideoFileExtension, getVideoObjectUrl, isVideoPlaybackUnavailable, loadVolcengineVideoFromBlob, loadMediaFromBlob, loadMediaFromUrl, markVideoPlaybackUnavailable, playVideoFromUserGesture, prepareVideoForPlayback } from '../mediaService';

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

  it('preserves the unavailable status on failure and reloads an errored stream on the next Play', async () => {
    const video = createLazyVideoFromUrl('blob:saved-video', 1920, 1080);
    const load = vi.spyOn(video, 'load').mockImplementation(() => {});
    const error = new DOMException('Unsupported codec', 'NotSupportedError');
    const play = vi.spyOn(video, 'play').mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    markVideoPlaybackUnavailable(video);

    await expect(playVideoFromUserGesture(video)).rejects.toBe(error);
    expect(isVideoPlaybackUnavailable(video)).toBe(true);

    Object.defineProperty(video, 'error', { value: { code: 3 } });
    Object.defineProperty(video, 'readyState', { value: HTMLMediaElement.HAVE_METADATA });
    await playVideoFromUserGesture(video);
    expect(load).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
    expect(isVideoPlaybackUnavailable(video)).toBe(false);
  });

  it('marks a lazy Ark video unavailable after a codec error during Play', async () => {
    const video = createLazyVideoFromUrl('blob:saved-ark-video', 1920, 1080);
    vi.spyOn(video, 'load').mockImplementation(() => {});
    const error = new DOMException('Unsupported codec', 'NotSupportedError');
    vi.spyOn(video, 'play').mockRejectedValueOnce(error);

    expect(isVideoPlaybackUnavailable(video)).toBe(false);
    await expect(playVideoFromUserGesture(video, { keepUnavailablePreview: true })).rejects.toBe(error);
    expect(isVideoPlaybackUnavailable(video)).toBe(true);
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

const buildMp4WithDimensions = (width: number, height: number): Blob => {
  const bytes = new Uint8Array(108);
  const view = new DataView(bytes.buffer);
  const writeBox = (offset: number, size: number, name: string) => {
    view.setUint32(offset, size);
    bytes.set(new TextEncoder().encode(name), offset + 4);
  };
  writeBox(0, 108, 'moov');
  writeBox(8, 100, 'trak');
  writeBox(16, 92, 'tkhd');
  view.setUint32(100, width * 65536);
  view.setUint32(104, height * 65536);
  return new Blob([bytes], { type: 'video/mp4' });
};

describe('loadVolcengineVideoFromBlob', () => {
  it('retains one original URL and source dimensions when decoding is unsupported', async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () {
      Object.defineProperty(this, 'error', { value: { code: 4 }, configurable: true });
      this.dispatchEvent(new Event('error'));
    });
    const source = buildMp4WithDimensions(1920, 1080);

    const result = await loadVolcengineVideoFromBlob(source);

    expect(result.canPlay).toBe(false);
    expect(isVideoPlaybackUnavailable(result.element)).toBe(true);
    expect(result.element.width).toBe(1920);
    expect(result.element.height).toBe(1080);
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(source);
    expect(getVideoObjectUrl(result.element)).toBe('blob:mock-object-url');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
  });

  it('preserves ordinary decoded playback', async () => {
    const { revokeObjectURL } = stubObjectUrls();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () {
      this.dispatchEvent(new Event('loadeddata'));
    });

    const result = await loadVolcengineVideoFromBlob(new Blob(['video'], { type: 'video/mp4' }));

    expect(result.canPlay).toBe(true);
    expect(isVideoPlaybackUnavailable(result.element)).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('rejects non-codec failures and releases the original URL', async () => {
    const { revokeObjectURL } = stubObjectUrls();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () {
      Object.defineProperty(this, 'error', { value: { code: 2 }, configurable: true });
      this.dispatchEvent(new Event('error'));
    });

    await expect(loadVolcengineVideoFromBlob(new Blob(['video'], { type: 'video/mp4' }))).rejects.toBeTruthy();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});

describe('readMp4VideoDimensions', () => {
  it('skips a multi-gigabyte media box using bounded reads to find trailing metadata', async () => {
    const mediaBoxSize = 2 ** 32 + 16;
    const header = new Uint8Array(16);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 1);
    header.set(new TextEncoder().encode('mdat'), 4);
    headerView.setBigUint64(8, BigInt(mediaBoxSize));
    const metadata = buildMp4WithDimensions(3840, 2160);
    const totalSize = mediaBoxSize + metadata.size;
    const slice = vi.fn((start = 0, end = totalSize) => start < 16
      ? new Blob([header.slice(start, end)])
      : metadata.slice(start - mediaBoxSize, end - mediaBoxSize));

    const dimensions = await readMp4VideoDimensions({ size: totalSize, slice });

    expect(dimensions).toEqual({ width: 3840, height: 2160 });
    expect(slice.mock.calls.every(([start, end]) => end - start <= 16)).toBe(true);
    expect(slice.mock.calls.some(([start]) => start >= mediaBoxSize)).toBe(true);
  });

  it('returns no dimensions for truncated metadata', async () => {
    expect(await readMp4VideoDimensions(new Blob([new Uint8Array([0, 1, 2])]))).toBeUndefined();
  });
});
