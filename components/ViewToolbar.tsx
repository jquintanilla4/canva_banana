import React from 'react';
import { MetadataIcon, ZoomToFitIcon, BlindTestIcon } from './Icons';
import { FLOATING_EDGE_CONTROL_BOTTOM_OFFSET, FLOATING_EDGE_CONTROL_SIDE_OFFSET } from '../utils/promptBarFooterLayout';

interface ViewToolbarProps {
  onZoomToFit: () => void;
  disabled: boolean;
  metadataVisible: boolean;
  onToggleMetadata: () => void;
  blindTestEnabled: boolean;
  openSourceAliasEnabled: boolean;
  onToggleBlindTest: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ViewToolbar: React.FC<ViewToolbarProps> = ({
  onZoomToFit,
  disabled,
  metadataVisible,
  onToggleMetadata,
  blindTestEnabled,
  openSourceAliasEnabled,
  onToggleBlindTest,
}) => {
  // Lightweight view controls separate from the main tool palette.
  const metadataButtonClasses = metadataVisible
    ? 'bg-blue-500 hover:bg-blue-400'
    : 'bg-gray-700 hover:bg-gray-600';
  const blindTestActive = blindTestEnabled || openSourceAliasEnabled;
  const blindTestButtonClasses = blindTestActive
    ? 'bg-blue-500 hover:bg-blue-400'
    : 'bg-gray-700 hover:bg-gray-600';
  const blindTestTitle = blindTestEnabled
    ? 'Disable Blind Test Mode'
    : openSourceAliasEnabled
      ? 'Disable Open Source Alias Mode'
      : 'Enable Blind Test Mode (Option/Alt + click for aliases)';

  return (
    <div
      className="absolute z-40 flex items-center space-x-2"
      style={{ bottom: FLOATING_EDGE_CONTROL_BOTTOM_OFFSET, right: FLOATING_EDGE_CONTROL_SIDE_OFFSET }}
      data-testid="view-toolbar-root"
    >
      <button
        type="button"
        onClick={onToggleBlindTest}
        aria-pressed={blindTestActive}
        className={`p-2 rounded-md border-none outline-none focus:outline-none focus:ring-0 shadow-none transition-colors duration-200 text-white ${blindTestButtonClasses}`}
        title={blindTestTitle}
      >
        <BlindTestIcon className="w-5 h-5" />
      </button>
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
