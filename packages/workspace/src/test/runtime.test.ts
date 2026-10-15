import { getWorkspaceSignal } from '../services/workspaceSession';
import { describe, expect, it } from 'vitest';
import { getDesktopBridge, getRuntimeConfig, isWorkspaceEventTarget, mountWorkspaceRuntime, workspaceStorageKey } from '../services/runtimeConfig';

describe('workspace runtime ownership', () => {
  it('isolates host settings and input, rejects overlapping instances and releases configuration', () => {
    const host = document.createElement('button');
    const root = document.createElement('div');
    const input = root.appendChild(document.createElement('input'));
    const portal = document.createElement('div');
    const popup = portal.appendChild(document.createElement('button'));
    const release = mountWorkspaceRuntime({ config: { secureBackendApiBaseUrl: 'https://backend.test' }, storageNamespace: 'project-a' }, root, portal);
    const signal = getWorkspaceSignal();
    expect(signal?.aborted).toBe(false);
    try {
      expect(getRuntimeConfig().secureBackendApiBaseUrl).toBe('https://backend.test');
      expect(getDesktopBridge()).toBeUndefined();
      expect(workspaceStorageKey('backups')).toBe('canva-banana:project-a:backups');
      expect(isWorkspaceEventTarget(host)).toBe(false);
      expect(isWorkspaceEventTarget(input)).toBe(true);
      expect(isWorkspaceEventTarget(popup)).toBe(true);
      expect(() => mountWorkspaceRuntime({}, root, portal)).toThrow('Only one workspace');
    } finally { release(); }
    expect(signal?.aborted).toBe(true);
    const releaseNext = mountWorkspaceRuntime({ storageNamespace: 'project-b' }, root, portal);
    expect(getWorkspaceSignal()).not.toBe(signal);
    expect(getWorkspaceSignal()?.aborted).toBe(false);
    releaseNext();
    expect(getRuntimeConfig().secureBackendApiBaseUrl).toBeUndefined();
    expect(workspaceStorageKey('backups')).toBe('backups');
  });
});
