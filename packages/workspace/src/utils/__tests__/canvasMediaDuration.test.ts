import { describe, expect, it, vi } from 'vitest';
import type { CanvasImage } from '../../types';
import { getCanvasMediaDurationSeconds, resolveCanvasMediaDurationSeconds, resolveOptionalCanvasMediaDurationSeconds } from '../canvasMediaDuration';

const buildVideo = (videoDuration?: number): CanvasImage => ({
  id: 'video-1',
  element: document.createElement('video'),
  mediaType: 'video',
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  rotation: 0,
  naturalWidth: 1920,
  naturalHeight: 1080,
  file: new File(['video'], 'video.mp4', { type: 'video/mp4' }),
  videoDuration,
}); // Minimal video fixture for persisted and legacy metadata paths.

describe('canvasMediaDuration', () => {
  it('uses persisted duration without loading a lazy video', async () => {
    const image = buildVideo(8.5);
    const load = vi.spyOn(image.element as HTMLVideoElement, 'load').mockImplementation(() => {});

    expect(getCanvasMediaDurationSeconds(image)).toBe(8.5);
    await expect(resolveCanvasMediaDurationSeconds(image)).resolves.toBe(8.5);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads metadata on demand for a legacy snapshot video', async () => {
    const image = buildVideo();
    const video = image.element as HTMLVideoElement;
    vi.spyOn(video, 'load').mockImplementation(() => {});

    const pendingDuration = resolveCanvasMediaDurationSeconds(image);
    Object.defineProperty(video, 'duration', { configurable: true, value: 6 });
    video.dispatchEvent(new Event('loadedmetadata'));

    await expect(pendingDuration).resolves.toBe(6);
  });

  it('returns an unknown optional duration when legacy metadata cannot load', async () => {
    const image = buildVideo();
    const video = image.element as HTMLVideoElement;
    vi.spyOn(video, 'load').mockImplementation(() => video.dispatchEvent(new Event('error'))); // Simulate an unreadable metadata stream.

    await expect(resolveOptionalCanvasMediaDurationSeconds(image)).resolves.toBeNull();
    await expect(resolveCanvasMediaDurationSeconds(image)).rejects.toThrow('Failed to load video metadata.');
  });
});
