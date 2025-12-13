import React from 'react';
import { formatDuration } from '../services/audioService';

interface RecordingOverlayProps {
  duration: number;
  visible: boolean;
}

export const RecordingOverlay: React.FC<RecordingOverlayProps> = ({ duration, visible }) => {
  if (!visible) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center pointer-events-none
        transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div className="bg-black/80 rounded-2xl px-12 py-8 flex items-center gap-6 shadow-2xl">
        <div className="w-5 h-5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-7xl font-mono text-white tabular-nums">
          {formatDuration(duration)}
        </span>
      </div>
    </div>
  );
};
