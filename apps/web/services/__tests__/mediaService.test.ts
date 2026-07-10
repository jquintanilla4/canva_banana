import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMediaFromBlob, loadMediaFromUrl } from '../mediaService';

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
