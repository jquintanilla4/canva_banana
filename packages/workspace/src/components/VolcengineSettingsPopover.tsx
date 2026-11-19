import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getWorkspacePortal } from '../services/runtimeConfig';
import type { VolcengineAssetReference, VolcengineSettings } from '../services/volcengineSettings';
import { CANVAS_INTERACTION_BOUNDARY_PROPS } from '../utils/canvasInteractionBoundary';
import { getIntrinsicElementSize, getViewportMenuPosition, type VerticalMenuPlacement } from '../utils/viewportMenuPosition';
import { VolcengineAssetsEditor } from './VolcengineAssetsEditor';

interface VolcengineSettingsPopoverProps {
  id: string;
  settings: VolcengineSettings;
  supportsDraft: boolean;
  assetMediaTypes: readonly VolcengineAssetReference['mediaType'][];
  onSettingsChange: (settings: VolcengineSettings) => void;
  disabled: boolean;
}

interface PriorityInputProps {
  value: number | undefined;
  disabled: boolean;
  onChange: (value: number | undefined) => void;
}

const PriorityInput: React.FC<PriorityInputProps> = ({ value, disabled, onChange }) => {
  const [draft, setDraft] = useState<string>();
  useEffect(() => setDraft(undefined), [value]);
  const raw = draft ?? (value === undefined ? '' : String(value));
  const parsed = Number(raw);
  const invalid = raw.trim() !== '' && (!Number.isInteger(parsed) || parsed < 0 || parsed > 9);
  return (
    <label className="block space-y-1 text-xs text-slate-200">
      <span>Priority</span>
      <input type="text" inputMode="numeric" aria-invalid={invalid} placeholder="Default" value={raw} disabled={disabled} onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (next.trim() === '') onChange(undefined);
        else {
          const nextValue = Number(next);
          if (Number.isInteger(nextValue) && nextValue >= 0 && nextValue <= 9) onChange(nextValue);
        }
      }} className="w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-300/60 disabled:opacity-50" />
      {invalid ? <span role="alert" className="block text-[10px] leading-4 text-rose-200">Use a whole number from 0 to 9.</span> : null}
    </label>
  );
};

export const VolcengineSettingsPopover: React.FC<VolcengineSettingsPopoverProps> = ({ id, settings, supportsDraft, assetMediaTypes, onSettingsChange, disabled }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; placement: VerticalMenuPlacement }>({ left: 8, top: 8, maxHeight: 0, placement: 'top' });

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

  const toggle = (key: 'draft' | 'webSearch' | 'returnLastFrame' | 'watermark', label: string, description?: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.045]">
      <span><span className="block text-xs text-slate-100">{label}</span>{description ? <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{description}</span> : null}</span>
      <input type="checkbox" checked={settings[key] ?? false} disabled={disabled} onChange={event => onSettingsChange({ ...settings, [key]: event.target.checked })} className="h-3.5 w-3.5 shrink-0 accent-cyan-300 disabled:opacity-50" />
    </label>
  );

  return (
    <>
      <button ref={buttonRef} id={id} type="button" disabled={disabled} aria-label="Ark advanced settings" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(current => !current)} className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50">Advanced</button>
      {open ? createPortal(
        <div {...CANVAS_INTERACTION_BOUNDARY_PROPS} ref={panelRef} id={`${id}-panel`} role="dialog" aria-label="Ark advanced settings" data-placement={position.placement} className="fixed z-[10000] w-80 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-cyan-200/25 bg-[#111820]/95 p-3 text-white shadow-2xl shadow-black/50 backdrop-blur-xl" style={{ left: position.left, top: position.top, maxHeight: position.maxHeight || undefined }}>
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2"><h2 className="text-sm font-semibold">Ark advanced settings</h2><button type="button" aria-label="Close Ark advanced settings" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} className="rounded px-1.5 text-lg leading-5 text-slate-400 hover:bg-white/10 hover:text-white">×</button></div>
          <div className="mb-3">
            {supportsDraft ? toggle('draft', 'Draft mode', 'Preview at 480p, then render the preview at 1080p or 4K.') : null}
            {toggle('returnLastFrame', 'Return last frame', 'Save the final frame for your next shot.')}
            {toggle('webSearch', 'Web search', 'Use current information from the web.')}
            {toggle('watermark', 'Watermark')}
          </div>
          <div className="mb-3">
            <PriorityInput value={settings.priority} disabled={disabled} onChange={priority => onSettingsChange({ ...settings, priority })} />
          </div>
          <VolcengineAssetsEditor assets={settings.assets ?? []} mediaTypes={assetMediaTypes} disabled={disabled} onChange={assets => onSettingsChange({ ...settings, assets })} />
        </div>, getWorkspacePortal(),
      ) : null}
    </>
  );
};
