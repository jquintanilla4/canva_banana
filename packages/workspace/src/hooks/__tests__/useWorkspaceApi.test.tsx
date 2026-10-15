import { createRef } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceApi } from '../useWorkspaceApi';
import { useCanvasHistory, type AppState } from '../useCanvasHistory';
import type { WorkspaceHandle } from '../../workspaceTypes';

const media = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../services/mediaService', async () => ({
  ...await vi.importActual<typeof import('../../services/mediaService')>('../../services/mediaService'),
  loadMediaFromBlob: media.load,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); media.load.mockReset(); });
const empty = (): AppState => ({ images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });

const setup = () => {
  const ref = createRef<WorkspaceHandle>();
  const setPrompt = vi.fn();
  const writeSnapshot = vi.fn(async () => {});
  const hook = renderHook(() => {
    const history = useCanvasHistory(empty());
    const state = { images: history.displayedImages, notes: history.displayedNotes, paths: history.displayedPaths,
      videoPromptAreas: history.displayedVideoPromptAreas, videoPromptBars: history.displayedVideoPromptBars };
    useWorkspaceApi({ editorRef: ref, state, prompt: 'original prompt', busy: false, error: null, setPrompt,
      replaceState: history.resetHistory, retainedStates: history.retainedStates, historyStatesRef: history.historyStatesRef,
      clearSelection: vi.fn(), detachSnapshotTarget: vi.fn(), zoomToFit: vi.fn(), writeSnapshot, importSnapshot: vi.fn(async () => {}) });
    return history;
  });
  return { ref, setPrompt, writeSnapshot, ...hook };
};

describe('public workspace host operations', () => {
  it('loads a shot, exports its first image, restores a checkpoint and rejects released tokens', async () => {
    const image = document.createElement('img');
    Object.defineProperties(image, { naturalWidth: { value: 4 }, naturalHeight: { value: 3 } });
    media.load.mockResolvedValue(image);
    const host = setup();
    const checkpoint = await host.ref.current!.createCheckpoint();
    await act(async () => host.ref.current!.loadMedia(new File(['png'], 'shot.png', { type: 'image/png' }), { prompt: 'new prompt' }));
    expect(host.result.current.images[0].file.name).toBe('shot.png');
    expect(host.setPrompt).toHaveBeenLastCalledWith('new prompt');
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['edited'], { type: 'image/png' })));
    expect((await host.ref.current!.exportImage()).type).toBe('image/png');
    act(() => host.ref.current!.restoreCheckpoint(checkpoint));
    expect(host.result.current.images).toEqual([]);
    expect(host.setPrompt).toHaveBeenLastCalledWith('original prompt');
    host.ref.current!.releaseCheckpoint(checkpoint);
    expect(() => host.ref.current!.restoreCheckpoint(checkpoint)).toThrow('released');
    const destination = { write: vi.fn(async () => {}) };
    await host.ref.current!.writeSnapshot(destination);
    expect(host.writeSnapshot).toHaveBeenCalledWith(destination);
  });

  it('retains media while checkpoint leases are pending and releases it after replacement', async () => {
    media.load.mockResolvedValue(document.createElement('img'));
    const host = setup();
    const file = new File(['png'], 'lazy.png', { type: 'image/png' });
    const release = vi.fn(async () => {});
    let resolveLease!: (value: () => Promise<void>) => void;
    Object.defineProperty(file, 'snapshotLeaseSource', { value: { acquireLease: () => new Promise<() => Promise<void>>(done => { resolveLease = done; }) } });
    await act(async () => host.ref.current!.loadMedia(file));
    const pending = host.ref.current!.createCheckpoint();
    expect([...host.result.current.retainedStates.current][0].images[0].file).toBe(file);
    await act(async () => host.ref.current!.loadMedia(new File(['png'], 'replacement.png', { type: 'image/png' })));
    resolveLease(release);
    const token = await pending;
    host.ref.current!.releaseCheckpoint(token);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('cleans a pending checkpoint when a source lease throws synchronously', async () => {
    media.load.mockResolvedValue(document.createElement('img'));
    const host = setup();
    const file = new File(['a'], 'first.png', { type: 'image/png' });
    const second = new File(['b'], 'second.png', { type: 'image/png' });
    const release = vi.fn(async () => {});
    Object.defineProperty(file, 'snapshotLeaseSource', { value: { acquireLease: () => release } });
    Object.defineProperty(second, 'snapshotLeaseSource', { value: { acquireLease: () => { throw new Error('Source closed'); } } });
    await act(async () => host.ref.current!.loadMedia(file));
    act(() => host.result.current.setState(state => ({ ...state, images: [state.images[0], { ...state.images[0], id: 'second', file: second }] })));
    await expect(host.ref.current!.createCheckpoint()).rejects.toThrow('Source closed');
    expect(release).toHaveBeenCalledTimes(1);
    expect(host.result.current.retainedStates.current.size).toBe(0);
  });

  it('rejects promised snapshot operations on a closed handle instead of throwing synchronously', async () => {
    const host = setup();
    const handle = host.ref.current!;
    host.unmount();
    await expect(handle.writeSnapshot({ write: async () => {} })).rejects.toThrow('closed');
    await expect(handle.importSnapshot(new File([], 'project.bcsnap'))).rejects.toThrow('closed');
  });

  it('does not activate a late media load after the host unmounts', async () => {
    let resolve!: (image: HTMLImageElement) => void;
    media.load.mockReturnValue(new Promise<HTMLImageElement>(done => { resolve = done; }));
    const host = setup();
    const load = host.ref.current!.loadMedia(new File(['png'], 'shot.png', { type: 'image/png' }));
    host.unmount();
    resolve(document.createElement('img'));
    await expect(load).rejects.toThrow('closed');
  });
});
