import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { AppState } from './useCanvasHistory';
import type { WorkspaceCheckpoint, WorkspaceHandle, WorkspaceProps } from '../workspaceTypes';
import { getNaturalSize, loadMediaFromBlob } from '../services/mediaService';
import type { SnapshotByteSource, SnapshotStreamingWritable, SnapshotSourceLeaseProvider } from '../services/snapshotService';

interface WorkspaceApiOptions {
  editorRef?: Ref<WorkspaceHandle>;
  state: AppState;
  prompt: string;
  busy: boolean;
  error: string | null;
  setPrompt: (value: string) => void;
  replaceState: (state: AppState) => void;
  clearSelection: () => void;
  detachSnapshotTarget: () => void;
  zoomToFit: () => void;
  retainedStates: React.MutableRefObject<Set<AppState>>;
  historyStatesRef: React.MutableRefObject<AppState[]>;
  writeSnapshot: (destination: SnapshotStreamingWritable) => Promise<void>;
  importSnapshot: (source: SnapshotByteSource) => Promise<void>;
  onStateChange?: WorkspaceProps['onStateChange'];
}

export const useWorkspaceApi = (options: WorkspaceApiOptions): void => {
  const current = useRef(options);
  useLayoutEffect(() => { current.current = options; });
  const checkpoints = useRef(new Map<WorkspaceCheckpoint, { state: AppState; prompt: string; releases: (() => Promise<void>)[] }>());
  const pendingReleases = useRef<{ state: AppState; releases: (() => Promise<void>)[] }[]>([]);
  const active = useRef(true);
  const operation = useRef(0);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current += 1;
      for (const checkpoint of checkpoints.current.values()) {
        checkpoint.releases.forEach(release => void release().catch(console.error));
      }
      pendingReleases.current.forEach(checkpoint => checkpoint.releases.forEach(release => void release().catch(console.error)));
      pendingReleases.current = [];
      checkpoints.current.clear();
      options.retainedStates.current.clear();
    };
  }, []);

  useEffect(() => {
    pendingReleases.current = pendingReleases.current.filter(checkpoint => {
      const files = new Set(checkpoint.state.images.map(image => image.file));
      const referenced = [...options.historyStatesRef.current, ...options.retainedStates.current]
        .some(state => state.images.some(image => files.has(image.file)));
      if (!referenced) checkpoint.releases.forEach(release => void release().catch(console.error));
      return referenced;
    }); // Restoring a checkpoint transfers its source leases to history until the last reference disappears.
  }, [options.state, options.historyStatesRef, options.retainedStates]);

  useEffect(() => {
    current.current.onStateChange?.({ mediaCount: options.state.images.length, busy: options.busy, error: options.error });
  }, [options.state.images.length, options.busy, options.error]);

  useImperativeHandle(options.editorRef, () => {
    const assertReady = () => {
      if (!active.current) throw new Error('Workspace is closed.');
      if (current.current.busy) throw new Error('Wait for the active workspace operation to finish.');
    };
    return {
      async loadMedia(file, settings = {}) {
        assertReady();
        if (!file.type.startsWith('image/')) throw new Error('Host loadMedia currently accepts still images. Use canvas import for video or audio.');
        const request = ++operation.current;
        const element = await loadMediaFromBlob(file, 'image');
        if (!active.current || request !== operation.current) throw new Error('Media load was superseded or the workspace closed.');
        const { naturalWidth, naturalHeight } = getNaturalSize(element);
        current.current.detachSnapshotTarget();
        current.current.replaceState({ images: [{ id: crypto.randomUUID(), element, mediaType: 'image', x: 0, y: 0, rotation: 0,
          width: naturalWidth, height: naturalHeight, naturalWidth, naturalHeight, file, metadata: { source: 'imported' } }],
          notes: [], paths: [], videoPromptAreas: [], videoPromptBars: [] });
        current.current.clearSelection();
        current.current.setPrompt(settings.prompt ?? '');
        current.current.zoomToFit();
      },
      setPrompt(value) { assertReady(); current.current.setPrompt(value); },
      async createCheckpoint() {
        assertReady();
        const { state, prompt, retainedStates } = current.current;
        const sources = [...new Set(state.images.flatMap(image => {
          const source = (image.file as File & { snapshotLeaseSource?: SnapshotSourceLeaseProvider }).snapshotLeaseSource;
          return source ? [source] : [];
        }))];
        const pendingState = { ...state };
        retainedStates.current.add(pendingState); // Keep playback URLs alive while lazy-source leases are acquired.
        const settled = await Promise.allSettled(sources.map(async source => source.acquireLease()));
        retainedStates.current.delete(pendingState);
        const releases = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        const failure = settled.find(result => result.status === 'rejected');
        if (failure || !active.current) {
          await Promise.allSettled(releases.map(release => release()));
          throw failure?.reason ?? new Error('Workspace is closed.');
        }
        const token = Object.freeze({ id: crypto.randomUUID() });
        retainedStates.current.add(state); // History cleanup keeps checkpoint video URLs alive until release.
        checkpoints.current.set(token, { state, prompt, releases });
        return token;
      },
      restoreCheckpoint(token) {
        assertReady();
        const checkpoint = checkpoints.current.get(token);
        if (!checkpoint) throw new Error('Checkpoint belongs to another session or has been released.');
        operation.current += 1;
        current.current.detachSnapshotTarget();
        current.current.replaceState(checkpoint.state);
        current.current.setPrompt(checkpoint.prompt);
        current.current.clearSelection();
        current.current.zoomToFit();
      },
      releaseCheckpoint(token) {
        const checkpoint = checkpoints.current.get(token);
        if (!checkpoint) return;
        checkpoints.current.delete(token);
        if (![...checkpoints.current.values()].some(value => value.state === checkpoint.state)) {
          current.current.retainedStates.current.delete(checkpoint.state); // shortcut: Playback URLs sweep on the next history update/unmount; add an explicit sweep for idle-editor memory pressure.
        }
        const files = new Set(checkpoint.state.images.map(image => image.file));
        const referenced = [...current.current.historyStatesRef.current, ...current.current.retainedStates.current]
          .some(state => state.images.some(image => files.has(image.file)));
        if (referenced) pendingReleases.current.push(checkpoint);
        else checkpoint.releases.forEach(release => void release().catch(console.error));
      },
      async exportImage(type = 'image/png') {
        assertReady();
        const first = current.current.state.images[0];
        if (!first || first.mediaType !== 'image') throw new Error('The first canvas item must be an image.');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new Error('Unsupported export image type.');
        const canvas = document.createElement('canvas');
        const size = getNaturalSize(first.element);
        canvas.width = size.naturalWidth;
        canvas.height = size.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas export is unavailable.');
        context.drawImage(first.element, 0, 0);
        return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), type));
      },
      async writeSnapshot(destination) { assertReady(); return current.current.writeSnapshot(destination); },
      async importSnapshot(source) { assertReady(); operation.current += 1; return current.current.importSnapshot(source); },
    };
  }, []);
};
