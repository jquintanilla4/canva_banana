import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDebugLogs, getDebugLogs } from '../../services/debugLog';
import type { CanvasImage } from '../../types';
import { useCanvasHistory, type AppState } from '../useCanvasHistory';

const buildImage = (id: string, overrides: Partial<CanvasImage> = {}): CanvasImage => ({
  id,
  element: new Image(),
  mediaType: 'image',
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['media'], `${id}.png`, { type: 'image/png' }),
  ...overrides,
}); // Minimal image supports live canvas history tests.

const buildState = (images: CanvasImage[]): AppState => ({
  images,
  paths: [],
  notes: [],
  videoPromptAreas: [],
  videoPromptBars: [],
}); // Unrelated canvas slices stay empty in image race tests.

describe('useCanvasHistory image drafts', () => {
  beforeEach(() => {
    clearDebugLogs();
  });

  it('shows and commits a generation that finishes during a live transform', () => {
    const original = buildImage('original');
    const generated = buildImage('generated', { mediaType: 'video' });
    const { result } = renderHook(() => useCanvasHistory(buildState([original])));

    act(() => {
      result.current.setLiveImages([{ ...original, x: 120 }]);
    });
    act(() => {
      result.current.setState(previous => ({
        ...previous,
        images: [...previous.images, generated],
      }));
    });

    expect(result.current.displayedImages.map(image => image.id)).toEqual(['original', 'generated']);
    expect(result.current.displayedImages[0]?.x).toBe(120);

    act(() => {
      result.current.setLiveImages(result.current.displayedImages.map(image => (
        image.id === original.id ? { ...image, x: 140 } : image
      ))); // A later pointer move echoes the newly visible generation through the staged array.
    });
    act(() => {
      result.current.commit();
    });

    expect(result.current.images.map(image => image.id)).toEqual(['original', 'generated']);
    expect(result.current.images[0]?.x).toBe(140);
    expect(getDebugLogs()).toContainEqual(expect.objectContaining({
      source: 'canvas',
      title: 'Canvas draft merged',
      data: expect.objectContaining({ preservedMediaIds: ['generated'] }),
    }));
  });

  it('merges an immediate playback override with a concurrent append', () => {
    const original = buildImage('original', { mediaType: 'video', isPlaying: false });
    const generated = buildImage('generated');
    const { result } = renderHook(() => useCanvasHistory(buildState([original])));

    act(() => {
      const staged = [{ ...original, isPlaying: true }];
      result.current.setLiveImages(staged);
      result.current.setState(previous => ({ ...previous, images: [...previous.images, generated] }));
      result.current.commit({ images: staged });
    });

    expect(result.current.images.map(image => image.id)).toEqual(['original', 'generated']);
    expect(result.current.images[0]?.isPlaying).toBe(true);
  });

  it('chains functional draft updates before an immediate commit', () => {
    const original = buildImage('original');
    const { result } = renderHook(() => useCanvasHistory(buildState([original])));

    act(() => {
      result.current.setLiveImages([{ ...original, x: 20 }]);
      result.current.setLiveImages(current => current?.map(image => ({ ...image, x: image.x + 15 })) ?? null);
      result.current.commit();
    });

    expect(result.current.images[0]?.x).toBe(35);
  });

  it('commits edits made to media that arrived during an active draft', () => {
    const original = buildImage('original');
    const generated = buildImage('generated', { mediaType: 'video', isPlaying: false });
    const { result } = renderHook(() => useCanvasHistory(buildState([original])));

    act(() => {
      result.current.setLiveImages([{ ...original, x: 40 }]);
    });
    act(() => {
      result.current.setState(previous => ({ ...previous, images: [...previous.images, generated] }));
    });
    act(() => {
      result.current.setLiveImages(result.current.displayedImages.map(image => (
        image.id === generated.id ? { ...image, x: 240 } : image
      )));
    });
    act(() => {
      result.current.replaceState(previous => ({
        ...previous,
        images: previous.images.map(image => (
          image.id === generated.id ? { ...image, isPlaying: true } : image
        )),
      }));
    });
    act(() => {
      result.current.commit();
    });

    expect(result.current.images.find(image => image.id === generated.id)).toMatchObject({
      x: 240,
      isPlaying: true,
    });
  });

  it('keeps lazy video references unchanged after another image is edited', () => {
    const videoElement = document.createElement('video');
    const lazyFile = new File(['video'], 'snapshot.mp4', { type: 'video/mp4' });
    const lazyVideo = buildImage('lazy', {
      element: videoElement,
      mediaType: 'video',
      file: lazyFile,
      naturalWidth: 1920,
      naturalHeight: 1080,
      videoDuration: 5.06,
    });
    const edited = buildImage('edited');
    const { result } = renderHook(() => useCanvasHistory(buildState([lazyVideo, edited])));

    act(() => {
      result.current.setLiveImages([lazyVideo, { ...edited, width: 640 }]);
      result.current.commit();
    });

    expect(result.current.images[0]).toBe(lazyVideo);
    expect(result.current.images[0]?.element).toBe(videoElement);
    expect(result.current.images[0]?.file).toBe(lazyFile);
    expect(result.current.images[0]?.videoDuration).toBe(5.06);
  });

  it('undoes the transform without removing the concurrent generation', () => {
    const original = buildImage('original');
    const generated = buildImage('generated');
    const { result } = renderHook(() => useCanvasHistory(buildState([original])));

    act(() => {
      result.current.setLiveImages([{ ...original, y: 80 }]);
    });
    act(() => {
      result.current.setState(previous => ({ ...previous, images: [...previous.images, generated] }));
    });
    act(() => {
      result.current.commit();
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.images.map(image => image.id)).toEqual(['original', 'generated']);
    expect(result.current.images[0]?.y).toBe(0);
  });
});
