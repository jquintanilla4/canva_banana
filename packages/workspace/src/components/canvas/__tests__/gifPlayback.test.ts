import { createRef, StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useGifPlayback } from '../hooks/useGifPlayback';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImage } from '../../../types';
import { createGifPlayback } from '../render/gifPlayback';

vi.mock('../../../services/snapshotService', () => ({ ensureRealSnapshotFile: async (file: File) => ({ stream: () => file }) }));
const makeImage = (id: string): CanvasImage => ({ id, file: new File(['GIF89a'], `${id}.gif`, { type: 'image/gif' }), element: document.createElement('img'), mediaType: 'image', width: 10, height: 10, x: 0, y: 0, rotation: 0, naturalWidth: 10, naturalHeight: 10 });
const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };
const decoders: FakeDecoder[] = [];
let frameCount = 3;
let repetitions = Infinity;
let deferred = false;
let active = 0;
let maximum = 0;
class FakeDecoder {
  static isTypeSupported = async () => true;
  tracks = { ready: Promise.resolve(), selectedTrack: { frameCount, repetitionCount: repetitions } };
  completed = Promise.resolve();
  close = vi.fn();
  indices: number[] = [];
  frames: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  resolve?: () => void;
  constructor() { decoders.push(this); }
  decode = vi.fn(async ({ frameIndex }: { frameIndex: number }) => {
    this.indices.push(frameIndex);
    active += 1;
    maximum = Math.max(maximum, active);
    if (deferred) await new Promise<void>(resolve => { this.resolve = resolve; });
    active -= 1;
    const frame = { displayWidth: 10, displayHeight: 10, duration: 200000, close: vi.fn() };
    this.frames.push(frame);
    return { image: frame };
  });
}
beforeEach(() => {
  decoders.length = 0;
  frameCount = 3;
  repetitions = Infinity;
  deferred = false;
  active = 0;
  maximum = 0;
  vi.useFakeTimers();
  vi.stubGlobal('ImageDecoder', FakeDecoder);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('scene-local GIF playback', () => {
  it('draws and closes complete frames, clears transparent pixels and uses frame duration', async () => {
    const image = makeImage('a');
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const redraw = vi.fn();
    const playback = createGifPlayback(redraw, vi.fn());
    playback.reconcile([image], () => true, false);
    await flush();
    const source = playback.getSource(image);
    expect(source).toBeInstanceOf(HTMLCanvasElement);
    expect(decoders[0].indices).toEqual([0]);
    expect(decoders[0].frames[0].close).toHaveBeenCalledOnce();
    const context = getContext.mock.results[0].value;
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 10, 10);
    expect(context.drawImage).toHaveBeenCalledWith(decoders[0].frames[0], 0, 0);
    expect(vi.mocked(context.clearRect).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(context.drawImage).mock.invocationCallOrder[0]);
    await vi.advanceTimersByTimeAsync(199);
    expect(decoders[0].indices).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(decoders[0].indices).toEqual([0, 1]);
    expect(redraw).toHaveBeenCalledTimes(2);
    playback.dispose();
    expect(decoders[0].close).toHaveBeenCalledOnce();
    expect(source!.width).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors finite repeats and does not schedule a single frame', async () => {
    repetitions = 1;
    frameCount = 2;
    const playback = createGifPlayback(vi.fn(), vi.fn());
    playback.reconcile([makeImage('finite')], () => true, false);
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(decoders[0].indices).toEqual([0, 1, 0, 1]);
    expect(vi.getTimerCount()).toBe(0);
    playback.dispose();
    frameCount = 1;
    const still = createGifPlayback(vi.fn(), vi.fn());
    still.reconcile([makeImage('static')], () => true, false);
    await flush();
    expect(decoders[1].indices).toEqual([0]);
    expect(vi.getTimerCount()).toBe(0);
    still.dispose();
  });

  it('keeps two jobs in flight and lets every visible source advance', async () => {
    deferred = true;
    const images = Array.from({ length: 7 }, (_, index) => makeImage(String(index)));
    const playback = createGifPlayback(vi.fn(), vi.fn());
    playback.reconcile(images, () => true, false);
    await flush();
    expect(decoders).toHaveLength(2);
    for (let batch = 0; batch < 4; batch += 1) {
      decoders.forEach(decoder => decoder.resolve?.());
      await flush();
    }
    expect(decoders).toHaveLength(7);
    expect(maximum).toBe(2);
    expect(decoders.every(decoder => decoder.indices.length === 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    for (let batch = 0; batch < 4; batch += 1) {
      decoders.forEach(decoder => decoder.resolve?.());
      await flush();
    }
    expect(decoders.every(decoder => decoder.indices.length === 2)).toBe(true);
    expect(maximum).toBe(2);
    playback.dispose();
  });

  it('retires hidden/offscreen/replaced sources and closes stale frames without publishing', async () => {
    deferred = true;
    const image = makeImage('a');
    const redraw = vi.fn();
    const playback = createGifPlayback(redraw, vi.fn());
    playback.reconcile([image], () => true, false);
    await flush();
    playback.reconcile([{ ...image, width: 20 }], () => true, false);
    expect(decoders).toHaveLength(1);
    playback.reconcile([image], () => false, false);
    expect(decoders[0].close).toHaveBeenCalledOnce();
    decoders[0].resolve?.();
    await flush();
    expect(decoders[0].frames[0].close).toHaveBeenCalledOnce();
    expect(redraw).not.toHaveBeenCalled();
    expect(playback.getSource(image)).toBeUndefined();
    playback.reconcile([image], () => true, false);
    await flush();
    decoders[1].resolve?.();
    await flush();
    expect(decoders[1].indices).toEqual([0]);
    playback.reconcile([image], () => true, true);
    expect(decoders[1].close).toHaveBeenCalledOnce();
    playback.reconcile([image], () => true, false);
    await flush();
    playback.reconcile([{ ...image, file: makeImage('new').file }], () => true, false);
    decoders[2].resolve?.();
    await flush();
    expect(decoders[2].frames[0].close).toHaveBeenCalledOnce();
    playback.dispose();
    playback.dispose();
    decoders.at(-1)?.resolve?.();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses final streamed metadata and consumes aborted completion rejections', async () => {
    let finish: () => void = () => {};
    let abort: (error: Error) => void = () => {};
    class StreamDecoder extends FakeDecoder {
      completed = new Promise<void>((resolve, reject) => { finish = resolve; abort = reject; });
      close = vi.fn(() => abort(new Error('closed')));
    }
    vi.stubGlobal('ImageDecoder', StreamDecoder);
    frameCount = 1;
    const image = makeImage('stream');
    const playback = createGifPlayback(vi.fn(), vi.fn());
    playback.reconcile([image], () => true, false);
    await flush();
    expect(playback.getSource(image)).toBeUndefined();
    decoders[0].tracks.selectedTrack.frameCount = 3;
    finish();
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    expect(decoders[0].indices).toEqual([0, 1]);
    playback.reconcile([makeImage('pending')], () => true, false);
    await flush();
    playback.dispose();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules from the displayed frame after a delayed decode without catch-up bursts', async () => {
    deferred = true;
    const playback = createGifPlayback(vi.fn(), vi.fn());
    playback.reconcile([makeImage('slow')], () => true, false);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    decoders[0].resolve?.();
    await flush();
    await vi.advanceTimersByTimeAsync(199);
    expect(decoders[0].indices).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(decoders[0].indices).toEqual([0, 1]);
    playback.dispose();
    decoders[0].resolve?.();
    await flush();
  });

  it('recreates under StrictMode, wakes after viewport changes and retires on document visibility and unmount', async () => {
    const image = makeImage('hook');
    const canvasRef = createRef<HTMLCanvasElement>();
    canvasRef.current = document.createElement('canvas');
    const scaleRef = { current: 1 };
    const panRef = { current: { x: 0, y: 0 } };
    const scheduleDraw = vi.fn();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const { result, unmount } = renderHook(() => useGifPlayback({ images: [image], canvasRef, scaleRef, panRef, scheduleDraw }), { wrapper: StrictMode });
    await act(flush);
    expect(decoders).toHaveLength(1);
    expect(result.current.playbackRef.current?.getSource(image)).toBeDefined();
    panRef.current = { x: 1000, y: 0 };
    act(() => result.current.reconcile());
    expect(decoders[0].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    panRef.current = { x: 0, y: 0 };
    await act(async () => { result.current.reconcile(); await flush(); });
    expect(decoders).toHaveLength(2);
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(decoders[1].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await flush(); });
    expect(decoders).toHaveLength(3);
    unmount();
    expect(decoders[2].close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back honestly once per source when unsupported or decoding fails', async () => {
    vi.stubGlobal('ImageDecoder', undefined);
    const image = makeImage('a');
    const report = vi.fn();
    const playback = createGifPlayback(vi.fn(), report);
    playback.reconcile([image], () => true, false);
    await flush();
    expect(playback.getSource(image)).toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.stringContaining('Original GIF downloads remain available'));
    playback.reconcile([], () => true, false);
    playback.reconcile([image], () => true, false);
    await flush();
    expect(report).toHaveBeenCalledOnce();
    playback.dispose();
  });
});
