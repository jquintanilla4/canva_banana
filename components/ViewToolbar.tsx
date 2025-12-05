import React from 'react';
import { MetadataIcon, ZoomToFitIcon } from './Icons';

interface ViewToolbarProps {
  onZoomToFit: () => void;
  disabled: boolean;
  metadataVisible: boolean;
  onToggleMetadata: () => void;
}

export const ViewToolbar: React.FC<ViewToolbarProps> = ({
  onZoomToFit,
  disabled,
  metadataVisible,
  onToggleMetadata,
}) => {
  // Lightweight view controls separate from the main tool palette.
  const metadataButtonClasses = metadataVisible
    ? 'bg-blue-500 hover:bg-blue-400'
    : 'bg-gray-700 hover:bg-gray-600';

  return (
    <div className="absolute bottom-4 right-4 z-10 flex items-center space-x-2">
      <button
        type="button"
        onClick={onToggleMetadata}
        aria-pressed={metadataVisible}
        className={`p-2 rounded-md border-none outline-none focus:outline-none focus:ring-0 shadow-none transition-colors duration-200 text-white ${metadataButtonClasses}`}
        title={metadataVisible ? 'Hide Generation Prompt Metadata' : 'Show Generation Prompt Metadata'}
      >
        <MetadataIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={onZoomToFit}
        disabled={disabled}
        className="p-2 rounded-md border-none outline-none focus:outline-none focus:ring-0 shadow-none transition-colors duration-200 bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        title="Zoom to Fit (.)"
      >
        <ZoomToFitIcon className="w-5 h-5" />
      </button>
    </div>
  );
};
