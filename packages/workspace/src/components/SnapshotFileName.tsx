import type { CSSProperties } from 'react';

interface SnapshotFileNameProps {
  fileName: string;
}

const FILE_NAME_HALO_STYLE: CSSProperties = {
  WebkitTextStroke: '2px rgba(3, 7, 18, 0.92)',
  paintOrder: 'stroke fill',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.85)',
}; // A dark halo preserves contrast over arbitrary canvas media without restoring the old container.

export const SnapshotFileName = ({ fileName }: SnapshotFileNameProps) => (
  <div
    aria-label={`Current snapshot file: ${fileName}`}
    className="pointer-events-auto flex min-w-0 max-w-full items-center px-3 py-1.5 text-[15px] font-medium text-gray-200"
    data-testid="snapshot-file-name"
    title={fileName}
  >
    <span className="truncate" style={FILE_NAME_HALO_STYLE}>{fileName}</span>
  </div>
);
