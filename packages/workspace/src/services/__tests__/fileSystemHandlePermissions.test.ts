import { describe, expect, it, vi } from 'vitest';
import {
  getAutosaveApprovedFileHandle,
  isFileSystemFileHandle,
} from '../fileSystemHandlePermissions';

const buildFileHandle = (requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>) => ({
  name: 'scene.bcsnap',
  getFile: vi.fn(),
  createWritable: vi.fn(),
  requestPermission,
}) as unknown as FileSystemFileHandle;

describe('fileSystemHandlePermissions', () => {
  it('recognizes only handles with the required file operations', () => {
    expect(isFileSystemFileHandle(buildFileHandle())).toBe(true);
    expect(isFileSystemFileHandle({ name: 'scene.bcsnap', getFile: vi.fn() })).toBe(false);
    expect(isFileSystemFileHandle(null)).toBe(false);
  });

  it('returns the handle only after explicit readwrite approval', async () => {
    const requestPermission = vi.fn(async () => 'granted' as PermissionState);
    const handle = buildFileHandle(requestPermission);

    await expect(getAutosaveApprovedFileHandle(handle)).resolves.toBe(handle);
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('keeps denied and unsupported handles read-only', async () => {
    const deniedHandle = buildFileHandle(vi.fn(async () => 'denied' as PermissionState));
    const unsupportedHandle = buildFileHandle();

    await expect(getAutosaveApprovedFileHandle(deniedHandle)).resolves.toBeNull();
    await expect(getAutosaveApprovedFileHandle(unsupportedHandle)).resolves.toBeNull();
  });

  it('keeps permission API failures from blocking imports', async () => {
    const handle = buildFileHandle(vi.fn(async () => { throw new Error('Permission prompt failed.'); }));

    await expect(getAutosaveApprovedFileHandle(handle)).resolves.toBeNull();
  });
});
