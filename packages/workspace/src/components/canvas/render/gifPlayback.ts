import type { CanvasImage } from '../../../types';
import { isGifImage } from '../../../services/gifMedia';
import { ensureRealSnapshotFile } from '../../../services/snapshotService';

interface GifDecoder {
  readonly tracks: { readonly ready: Promise<void>; readonly selectedTrack: { readonly frameCount: number; readonly repetitionCount: number } | null };
  readonly completed: Promise<void>;
  decode(options: { frameIndex: number; completeFramesOnly: boolean }): Promise<{ image: VideoFrame }>;
  close(): void;
}
interface GifDecoderConstructor {
  new(options: { data: ReadableStream<Uint8Array>; type: string; preferAnimation: boolean }): GifDecoder;
  isTypeSupported(type: string): Promise<boolean>;
}
type GifState =
  | { kind: 'opening'; decoder?: GifDecoder }
  | { kind: 'ready'; decoder: GifDecoder; surface: HTMLCanvasElement; frameCount: number; repetitionCount: number; nextIndex: number; repeats: number; due: number }
  | { kind: 'unavailable' };
interface GifEntry {
  id: string;
  file: File;
  state: GifState;
}
export interface GifPlayback {
  reconcile(images: readonly CanvasImage[], isVisible: (image: CanvasImage) => boolean, hidden: boolean): void;
  getSource(image: CanvasImage): HTMLCanvasElement | undefined;
  dispose(): void;
}

const nativeDecoder = (): GifDecoderConstructor | undefined => {
  if (!('ImageDecoder' in globalThis) || typeof globalThis.ImageDecoder !== 'function') return undefined;
  const candidate = globalThis.ImageDecoder;
  if (!('isTypeSupported' in candidate) || typeof candidate.isTypeSupported !== 'function') return undefined;
  return candidate as GifDecoderConstructor;
};

export const createGifPlayback = (invalidate: () => void, reportIssue: (message: string) => void): GifPlayback => {
  const entries = new Map<string, GifEntry>();
  const queue: GifEntry[] = [];
  const pending = new Set<GifEntry>();
  const reported = new WeakSet<File>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = 0;
  let disposed = false;
  const current = (entry: GifEntry) => !disposed && entries.get(entry.id) === entry;
  const close = (entry: GifEntry) => {
    if (entry.state.kind !== 'unavailable') entry.state.decoder?.close();
    if (entry.state.kind === 'ready') {
      entry.state.surface.width = 0;
      entry.state.surface.height = 0;
    }
    entry.state = { kind: 'unavailable' };
  };
  const fail = (entry: GifEntry) => {
    close(entry);
    if (!reported.has(entry.file)) {
      reported.add(entry.file);
      reportIssue('Animated GIF preview is unavailable in this browser or for this file. The first frame is shown. Original GIF downloads remain available.');
    }
    invalidate();
  };
  const decode = async (entry: GifEntry) => {
    if (entry.state.kind !== 'ready') return;
    const state = entry.state;
    const result = await state.decoder.decode({ frameIndex: state.nextIndex, completeFramesOnly: true });
    try {
      if (!current(entry) || entry.state !== state) return;
      const frame = result.image;
      const context = state.surface.getContext('2d');
      if (!context) throw new Error('GIF preview canvas is unavailable.');
      if (state.surface.width !== frame.displayWidth || state.surface.height !== frame.displayHeight) {
        state.surface.width = frame.displayWidth;
        state.surface.height = frame.displayHeight;
      }
      context.clearRect(0, 0, state.surface.width, state.surface.height);
      context.drawImage(frame, 0, 0);
      const duration = typeof frame.duration === 'number' && Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration / 1000 : 100;
      state.nextIndex += 1;
      const lastFrame = state.nextIndex >= state.frameCount;
      if (lastFrame) {
        state.nextIndex = 0;
        state.repeats += 1;
      }
      const ended = state.frameCount <= 1 || (lastFrame && state.repeats > state.repetitionCount);
      state.due = ended ? Infinity : performance.now() + duration;
      invalidate();
    } finally {
      result.image.close();
    }
  };
  const open = async (entry: GifEntry) => {
    const Decoder = nativeDecoder();
    if (!Decoder || !await Decoder.isTypeSupported('image/gif')) throw new Error('GIF decoding is unsupported.');
    if (!current(entry)) return;
    const file = await ensureRealSnapshotFile(entry.file);
    if (!current(entry)) return;
    const decoder = new Decoder({ data: file.stream(), type: 'image/gif', preferAnimation: true });
    entry.state = { kind: 'opening', decoder };
    void decoder.completed.catch(() => {});
    await decoder.tracks.ready;
    await decoder.completed;
    if (!current(entry)) return;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 1) throw new Error('GIF has no decodable frames.');
    entry.state = { kind: 'ready', decoder, surface: document.createElement('canvas'), frameCount: track.frameCount, repetitionCount: track.repetitionCount, nextIndex: 0, repeats: 0, due: Infinity };
    await decode(entry);
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (disposed) return;
    let due = Infinity;
    entries.forEach(entry => {
      if (entry.state.kind === 'ready' && !pending.has(entry)) due = Math.min(due, entry.state.due);
    });
    if (Number.isFinite(due)) timer = setTimeout(tick, Math.max(0, due - performance.now()));
  };
  const pump = () => {
    while (!disposed && running < 2 && queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      if (!current(entry)) { pending.delete(entry); continue; }
      running += 1;
      void (entry.state.kind === 'opening' ? open(entry) : decode(entry))
        .catch(() => { if (current(entry)) fail(entry); })
        .finally(() => {
          pending.delete(entry);
          running -= 1;
          pump();
          schedule();
        });
    }
  };
  const enqueue = (entry: GifEntry) => {
    if (pending.has(entry)) return;
    pending.add(entry);
    queue.push(entry);
  };
  function tick() {
    timer = undefined;
    const now = performance.now();
    entries.forEach(entry => {
      if (entry.state.kind === 'ready' && entry.state.due <= now) enqueue(entry);
    });
    pump();
    schedule();
  }
  return {
    reconcile(images, isVisible, hidden) {
      if (disposed) return;
      const visible = new Map(images.filter(image => !hidden && isGifImage(image) && isVisible(image)).map(image => [image.id, image]));
      entries.forEach((entry, id) => {
        if (visible.get(id)?.file === entry.file) return;
        entries.delete(id);
        const queuedIndex = queue.indexOf(entry);
        if (queuedIndex !== -1) { queue.splice(queuedIndex, 1); pending.delete(entry); }
        close(entry);
      });
      visible.forEach(image => {
        if (entries.has(image.id)) return;
        const entry: GifEntry = { id: image.id, file: image.file, state: { kind: 'opening' } };
        entries.set(image.id, entry);
        enqueue(entry);
      });
      pump();
      schedule();
    },
    getSource(image) {
      const entry = entries.get(image.id);
      return entry?.file === image.file && entry.state.kind === 'ready' && entry.state.surface.width > 0 ? entry.state.surface : undefined;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      entries.forEach(close);
      entries.clear();
      queue.length = 0;
      pending.clear();
    },
  };
};
