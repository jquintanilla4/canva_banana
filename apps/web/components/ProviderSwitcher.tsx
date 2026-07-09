import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiProviderId } from '../types';
import { Tooltip } from './Tooltip';
import { FLOATING_EDGE_CONTROL_BOTTOM_OFFSET, FLOATING_EDGE_CONTROL_SIDE_OFFSET } from '../utils/promptBarFooterLayout';

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
  // Auto-dismiss the provider popout so it doesn't linger after the click.
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);
  const hideTimeoutRef = useRef<number | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Keep the popout open briefly, then reset visibility after the timeout.
  const showPopout = useCallback(() => {
    if (disabled) {
      return;
    }
    setIsPopoutOpen(true);
    clearHideTimeout();
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsPopoutOpen(false);
      hideTimeoutRef.current = null;
    }, 2500);
  }, [clearHideTimeout, disabled]);

  useEffect(() => () => clearHideTimeout(), [clearHideTimeout]);

  const handleSelect = (provider: ApiProviderId) => {
    if (disabled) {
      return;
    }
    onSelect(provider);
    showPopout();
  };

  return (
    <div
      className="absolute z-20"
      style={{ bottom: FLOATING_EDGE_CONTROL_BOTTOM_OFFSET, left: FLOATING_EDGE_CONTROL_SIDE_OFFSET }}
      data-testid="provider-switcher-root"
    >
      <div className="relative flex items-center">
        {/* Cloud label stays fixed while provider details appear in the temporary popout */}
        <Tooltip label="Cloud Provider" placement="top">
          <button
            type="button"
            onClick={showPopout}
            disabled={disabled}
            aria-label="Cloud"
            aria-expanded={isPopoutOpen}
            className="rounded-md border border-slate-500/60 bg-slate-900/90 px-3 py-1.5 text-sm font-semibold uppercase tracking-[0.06em] text-slate-100 shadow-lg transition-colors duration-200 hover:border-slate-300/80 hover:text-white disabled:border-slate-500/40 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            Cloud
          </button>
        </Tooltip>
        <div
          className={`absolute left-full top-1/2 ml-3 -translate-y-1/2 transition-all duration-200 ${isPopoutOpen ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0 pointer-events-none'}`}
        >
          <div className="flex items-center gap-2 rounded-md border border-yellow-300/40 bg-black/80 px-3 py-1.5 shadow-xl backdrop-blur">
            {providers.map((provider) => {
              const isActive = activeProvider === provider;
              return (
                <Tooltip key={provider} label={`Use ${labels[provider]}`} placement="top">
                  <button
                    type="button"
                    onClick={() => handleSelect(provider)}
                    disabled={disabled}
                    aria-pressed={isActive}
                    className={`text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors duration-150 ${isActive ? 'text-yellow-300' : 'text-yellow-300/55 hover:text-yellow-200'} disabled:text-yellow-300/30 disabled:cursor-not-allowed`}
                  >
                    {labels[provider].toUpperCase()}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
