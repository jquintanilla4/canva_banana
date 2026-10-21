type FileSystemPermissionMode = 'read' | 'readwrite';

type FileSystemHandlePermissionDescriptor = {
  mode?: FileSystemPermissionMode;
};

type PermissionAwareFileHandle = FileSystemFileHandle & {
  requestPermission?: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
};

type FileSystemFileHandleCandidate = {
  name?: unknown;
  getFile?: unknown;
  createWritable?: unknown;
};

export const isFileSystemFileHandle = (value: unknown): value is FileSystemFileHandle => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as FileSystemFileHandleCandidate;
  return typeof candidate.name === 'string'
    && typeof candidate.getFile === 'function'
    && typeof candidate.createWritable === 'function'; // Picker results must expose the file operations used by snapshot I/O.
};

export const getAutosaveApprovedFileHandle = async (
  handle: FileSystemFileHandle,
): Promise<FileSystemFileHandle | null> => {
  const permissionHandle = handle as PermissionAwareFileHandle;
  if (typeof permissionHandle.requestPermission !== 'function') return null; // Unknown implementations stay read-only instead of failing later.

  try {
    const permission = await permissionHandle.requestPermission({ mode: 'readwrite' });
    return permission === 'granted' ? handle : null; // Only explicit write approval enables background overwrites.
  } catch {
    return null; // Permission API failures must not prevent a read-only import.
  }
};
