interface SnapshotFileNameProps {
  fileName: string;
}

export const SnapshotFileName = ({ fileName }: SnapshotFileNameProps) => (
  <div
    aria-label={`Current snapshot file: ${fileName}`}
    className="pointer-events-auto flex min-w-0 max-w-full items-center rounded-md border border-white/10 bg-gray-950/75 px-3 py-1.5 text-xs font-medium text-gray-200 shadow-lg shadow-black/20 backdrop-blur-sm"
    data-testid="snapshot-file-name"
    title={fileName}
  >
    <span className="truncate">{fileName}</span>
  </div>
);
