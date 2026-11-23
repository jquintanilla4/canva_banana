import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getWorkspacePortal } from '../services/runtimeConfig';
import type { VolcengineAssetMention, VolcengineSettings } from '../services/volcengineSettings';
import { CANVAS_INTERACTION_BOUNDARY_PROPS } from '../utils/canvasInteractionBoundary';
import { getIntrinsicElementSize, getViewportMenuPosition, type VerticalMenuPlacement } from '../utils/viewportMenuPosition';

interface VolcengineSettingsPopoverProps {
  id: string;
  settings: VolcengineSettings;
  supportsDraft: boolean;
  assetMentions?: readonly VolcengineAssetMention[];
  onSettingsChange: (settings: VolcengineSettings) => void;
  disabled: boolean;
}

const resetButtonClass = 'w-full rounded-lg px-2 py-2 text-left text-xs text-gray-300 hover:bg-white/10 hover:text-white focus-visible:outline-blue-400 disabled:opacity-50';

export const VolcengineSettingsPopover: React.FC<VolcengineSettingsPopoverProps> = ({ id, settings, supportsDraft, assetMentions = [], onSettingsChange, disabled }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; placement: VerticalMenuPlacement }>({ left: 8, top: 8, maxHeight: 0, placement: 'top' });
  const inactiveAssets = settings.assets?.filter(asset =>
    !assetMentions.some(active => active.mediaType === asset.mediaType && active.assetId === asset.assetId),
  ) ?? [];

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const intrinsicSize = getIntrinsicElementSize(panel);
      const next = getViewportMenuPosition({ anchorRect: rect, menuWidth: intrinsicSize.width, menuHeight: intrinsicSize.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, gapPx: 12, marginPx: 8, preferredPlacement: 'top' });
      setPosition({ left: next.left, top: next.top, maxHeight: next.maxHeight, placement: next.placement });
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    if (panelRef.current) observer?.observe(panelRef.current);
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const clearSavedSetting = (key: 'assets' | 'priority') => {
    const next = { ...settings };
    delete next[key];
    onSettingsChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const toggle = (key: 'draft' | 'webSearch' | 'returnLastFrame' | 'watermark', label: string, description?: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.045]">
      <input type="checkbox" checked={settings[key] ?? false} disabled={disabled} onChange={event => onSettingsChange({ ...settings, [key]: event.target.checked })} className="mt-px h-3.5 w-3.5 shrink-0 accent-blue-500 focus-visible:outline-blue-400 disabled:opacity-50" />
      <span><span className="block text-xs text-white">{label}</span>{description ? <span className="mt-0.5 block text-[11px] leading-4 text-gray-400">{description}</span> : null}</span>
    </label>
  );

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label="Ark advanced settings"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(current => !current)}
        className={`rounded-full px-3 py-1 text-xs font-semibold text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'bg-blue-700 hover:bg-blue-600 active:bg-blue-800' : 'bg-blue-600 hover:bg-[color-mix(in_oklab,var(--color-blue-600)_75%,var(--color-blue-500))] active:bg-blue-700'}`}
      >
        Advanced
      </button>
      {open ? createPortal(
        <div {...CANVAS_INTERACTION_BOUNDARY_PROPS} ref={panelRef} id={`${id}-panel`} role="dialog" aria-label="Ark advanced settings" data-placement={position.placement} className="fixed z-[10000] w-80 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900/95 p-3 text-white shadow-2xl shadow-black/50 backdrop-blur-xl scheme-dark" style={{ left: position.left, top: position.top, maxHeight: position.maxHeight || undefined }}>
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2"><h2 className="text-sm font-semibold">Ark advanced settings</h2><button type="button" aria-label="Close Ark advanced settings" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} className="rounded px-1.5 text-lg leading-5 text-gray-300 hover:bg-white/10 hover:text-white focus-visible:outline-blue-400">×</button></div>
          {supportsDraft ? toggle('draft', 'Draft mode', 'Preview at 480p, then render the preview at 1080p or 4K.') : null}
          {toggle('returnLastFrame', 'Return last frame', 'Save the final frame for your next shot.')}
          {toggle('webSearch', 'Web search', 'Use current information from the web.')}
          {toggle('watermark', 'Watermark')}
          {(settings.assets?.length || settings.priority !== undefined) ? (
            <div className="mt-2 border-t border-white/10 pt-2">
              {Boolean(settings.assets?.length) && (
                <dl aria-label="Saved Ark reference IDs" className="space-y-1 px-2 py-1 text-xs">
                  {assetMentions.map(({ mention, assetId }) => (
                    <div key={mention} className="flex gap-2">
                      <dt className="shrink-0 font-semibold">{mention}</dt>
                      <dd className="min-w-0 break-all text-gray-300">{assetId}</dd>
                    </div>
                  ))}
                  {inactiveAssets.map(({ mediaType, assetId }, index) => (
                    <div key={`${mediaType}:${assetId}:${index}`} className="flex gap-2">
                      <dt className="shrink-0 text-gray-400">Inactive {mediaType}</dt>
                      <dd className="min-w-0 break-all text-gray-300">{assetId}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {Boolean(settings.assets?.length) && (
                <button type="button" disabled={disabled} onClick={() => clearSavedSetting('assets')} className={resetButtonClass}>
                  Clear saved Ark references
                </button>
              )}
              {settings.priority !== undefined && (
                <button type="button" disabled={disabled} onClick={() => clearSavedSetting('priority')} className={resetButtonClass}>
                  Reset saved Priority
                </button>
              )}
            </div>
          ) : null}
        </div>, getWorkspacePortal(),
      ) : null}
    </>
  );
};
