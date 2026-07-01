import React, { useEffect, useMemo, useState } from 'react';
import { CancelIcon, ConfirmIcon } from './Icons';
import type { DesktopAppIconState } from '../services/runtimeConfig';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';

type DesktopAppIconModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const getAppIconBridge = () => (
  typeof window !== 'undefined' ? window.canvaBananaDesktop?.appIcon : undefined
);

export const DesktopAppIconModal: React.FC<DesktopAppIconModalProps> = ({ isOpen, onClose }) => {
  const [state, setState] = useState<DesktopAppIconState | null>(null);
  const [draftIconId, setDraftIconId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let isActive = true;
    setState(null); // Reopen must not render a cancelled draft.
    setDraftIconId(null); // Reset pending selection before fresh bridge state.
    setIsApplying(false); // Reopen starts with no in-flight apply action.
    setMessage(null); // Hide prior success text on a new open.
    setError(null); // Hide prior errors before reloading state.
    const loadState = async () => {
      const bridge = getAppIconBridge();
      if (!bridge?.getState) {
        setError('App icon settings are unavailable.');
        return;
      }
      try {
        const nextState = await bridge.getState();
        if (!isActive) {
          return;
        }
        setState(nextState);
        setDraftIconId(nextState.selectedIconId);
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Failed to load app icons.');
        }
      }
    };
    void loadState();
    return () => {
      isActive = false; // Ignore late bridge responses after close.
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedOption = useMemo(
    () => state?.options.find(option => option.id === draftIconId) ?? null,
    [draftIconId, state?.options],
  );
  const canApply = Boolean(state && draftIconId && draftIconId !== state.selectedIconId && !isApplying);

  if (!isOpen) {
    return null;
  }

  const handleApply = async () => {
    const bridge = getAppIconBridge();
    if (!bridge?.setSelected || !draftIconId) {
      setError('App icon settings are unavailable.');
      return;
    }
    setIsApplying(true);
    setMessage(null);
    setError(null);
    try {
      const nextState = await bridge.setSelected(draftIconId);
      setState(nextState);
      setDraftIconId(nextState.selectedIconId);
      setMessage('Icon changed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change icon.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${OVERLAY_LAYER_CLASS_NAMES.blockingModal} flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm`} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-app-icon-title"
        className="flex max-h-full w-full max-w-xl flex-col rounded-lg border border-white/10 bg-slate-950 text-slate-100 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="desktop-app-icon-title" className="text-base font-semibold text-white">Change Icon</h2>
            <p className="mt-1 text-xs text-slate-400">{selectedOption?.label ?? 'Loading icons...'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close change icon"
          >
            <CancelIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state && !state.supportsDockIcon && (
            <p className="mb-4 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              Dock icon changes are unavailable on this platform.
            </p>
          )}

          <div role="radiogroup" aria-label="App icons" className="grid gap-3 sm:grid-cols-2">
            {state?.options.map(option => {
              const isCurrent = option.id === state.selectedIconId;
              const isSelected = option.id === draftIconId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setDraftIconId(option.id);
                    setMessage(null);
                    setError(null);
                  }}
                  className={`flex min-h-40 flex-col items-start gap-3 rounded-md border p-3 text-left transition-colors ${isSelected ? 'border-cyan-300/70 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                >
                  <span className="flex w-full items-start gap-3">
                    <img
                      src={option.previewDataUrl}
                      alt={`${option.label} icon preview`}
                      className="h-16 w-16 shrink-0 rounded-[18px] border border-white/10 bg-black/25 object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold text-white">{option.label}</span>
                      <span className="mt-1 block break-words text-xs text-slate-400">{option.description}</span>
                    </span>
                  </span>
                  <span className={`mt-auto rounded-full px-2.5 py-1 text-xs font-semibold ${isCurrent ? 'bg-emerald-300/15 text-emerald-100' : isSelected ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/5 text-slate-400'}`}>
                    {isCurrent ? 'Current' : isSelected ? 'Selected' : 'Available'}
                  </span>
                </button>
              );
            })}
          </div>

          {!state && !error && (
            <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">Loading icons...</p>
          )}

          {(message || error) && (
            <p className={`mt-4 rounded-md border px-3 py-2 text-xs ${error ? 'border-red-300/20 bg-red-300/10 text-red-100' : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'}`}>
              {error ?? message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
          >
            <CancelIcon className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="flex items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/16 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ConfirmIcon className="h-3.5 w-3.5" />
            {isApplying ? 'Applying' : 'Apply Icon'}
          </button>
        </div>
      </div>
    </div>
  );
};
