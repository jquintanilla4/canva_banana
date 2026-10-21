import type { ReactNode } from 'react';
import type { WorkspaceRuntimeOptions } from './services/runtimeConfig';
import type { SnapshotStreamingWritable, SnapshotByteSource } from './services/snapshotService';

export interface WorkspaceCheckpoint {
  readonly id: string; // Opaque, session-owned token; release it when the host no longer needs reject/restore.
}

export interface WorkspaceHandle {
  loadMedia: (file: File, options?: { prompt?: string }) => Promise<void>;
  setPrompt: (prompt: string) => void;
  createCheckpoint: () => Promise<WorkspaceCheckpoint>;
  restoreCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  releaseCheckpoint: (checkpoint: WorkspaceCheckpoint) => void;
  exportImage: (type?: 'image/png' | 'image/jpeg' | 'image/webp') => Promise<Blob>;
  writeSnapshot: (destination: SnapshotStreamingWritable) => Promise<void>;
  importSnapshot: (source: SnapshotByteSource) => Promise<void>;
}

export interface WorkspaceState {
  mediaCount: number;
  busy: boolean;
  error: string | null;
}

export interface WorkspaceProps extends WorkspaceRuntimeOptions {
  className?: string;
  children?: ReactNode; // Host-owned controls such as accept/reject can overlay the editor.
  onStateChange?: (state: WorkspaceState) => void;
}
