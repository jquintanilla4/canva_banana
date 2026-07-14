import { describe, expect, it } from 'vitest';
import type { CanvasImage } from '../../types';
import { extendCanvasImageDraftBaseline, mergeCanvasImageDraft } from '../canvasImageDraftMerge';

const buildImage = (id: string, overrides: Partial<CanvasImage> = {}): CanvasImage => ({
  id,
  element: new Image(),
  mediaType: 'image',
  x: 10,
  y: 20,
  width: 320,
  height: 180,
  rotation: 0,
  naturalWidth: 320,
  naturalHeight: 180,
  file: new File(['media'], `${id}.png`, { type: 'image/png' }),
  ...overrides,
}); // Small canvas item keeps merge expectations readable.

describe('mergeCanvasImageDraft', () => {
  it('applies staged fields while preserving concurrent additions and updates', () => {
    const baselineImage = buildImage('existing');
    const stagedImage = { ...baselineImage, x: 90 };
    const latestImage = { ...baselineImage, videoDuration: 7.5 };
    const generatedImage = buildImage('generated', { mediaType: 'video' });

    const merged = mergeCanvasImageDraft(
      [baselineImage],
      [stagedImage],
      [latestImage, generatedImage],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'existing', x: 90, videoDuration: 7.5 });
    expect(merged[1]).toBe(generatedImage);
  });

  it('does not infer deletion from a staged array omission', () => {
    const firstImage = buildImage('first');
    const secondImage = buildImage('second');

    const merged = mergeCanvasImageDraft(
      [firstImage, secondImage],
      [{ ...firstImage, y: 70 }],
      [firstImage, secondImage],
    );

    expect(merged.map(image => image.id)).toEqual(['first', 'second']);
    expect(merged[1]).toBe(secondImage);
  });

  it('does not resurrect an item removed from the latest committed state', () => {
    const baselineImage = buildImage('removed');

    expect(mergeCanvasImageDraft(
      [baselineImage],
      [{ ...baselineImage, x: 40 }],
      [],
    )).toEqual([]);
  });

  it('preserves lazy video resources and metadata on untouched items', () => {
    const videoElement = document.createElement('video');
    const lazyFile = new File(['video'], 'lazy.mp4', { type: 'video/mp4' });
    const lazyVideo = buildImage('lazy-video', {
      element: videoElement,
      mediaType: 'video',
      file: lazyFile,
      naturalWidth: 1920,
      naturalHeight: 1080,
      videoDuration: 6,
    });
    const editedImage = buildImage('edited');

    const merged = mergeCanvasImageDraft(
      [lazyVideo, editedImage],
      [lazyVideo, { ...editedImage, rotation: 0.5 }],
      [lazyVideo, editedImage],
    );

    expect(merged[0]).toBe(lazyVideo);
    expect(merged[0]?.element).toBe(videoElement);
    expect(merged[0]?.file).toBe(lazyFile);
    expect(merged[0]).toMatchObject({ naturalWidth: 1920, naturalHeight: 1080, videoDuration: 6 });
  });

  it('appends a genuinely staged item once without changing latest ordering', () => {
    const existingImage = buildImage('existing');
    const stagedAddition = buildImage('staged');

    const merged = mergeCanvasImageDraft(
      [existingImage],
      [existingImage, stagedAddition],
      [existingImage],
    );

    expect(merged.map(image => image.id)).toEqual(['existing', 'staged']);
    expect(merged[1]).toBe(stagedAddition);
  });

  it('captures a concurrent addition only once as a stable draft baseline', () => {
    const original = buildImage('original');
    const generated = buildImage('generated');
    const firstBaseline = extendCanvasImageDraftBaseline([original], [original, generated]);
    const updatedGenerated = { ...generated, videoDuration: 8 };

    const secondBaseline = extendCanvasImageDraftBaseline(firstBaseline, [original, updatedGenerated]);

    expect(firstBaseline).toEqual([original, generated]);
    expect(secondBaseline).toBe(firstBaseline);
    expect(secondBaseline[1]).toBe(generated);
  });
});
