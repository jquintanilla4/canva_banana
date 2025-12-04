import React from 'react';
import type { ApiProviderId } from '../types';

type ProviderSwitcherProps = {
  providers: ApiProviderId[];
  activeProvider: ApiProviderId;
  labels: Record<ApiProviderId, string>;
  disabled?: boolean;
  onSelect: (provider: ApiProviderId) => void;
};

export const ProviderSwitcher: React.FC<ProviderSwitcherProps> = ({
  providers,
  activeProvider,
  labels,
  disabled = false,
  onSelect,
}) => {
  return (
    <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-2">
      {providers.map((provider) => {
        const isActive = activeProvider === provider;
        return (
          <button
            key={provider}
            type="button"
            onClick={() => onSelect(provider)}
            disabled={disabled}
            aria-pressed={isActive}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed`}
          >
            {labels[provider]}
          </button>
        );
      })}
    </div>
  );
};
