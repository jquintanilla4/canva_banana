import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Flux3KeyframeTiming } from '../types';
import { CANVAS_INTERACTION_BOUNDARY_PROPS } from '../utils/canvasInteractionBoundary';
import { getIntrinsicElementSize, getViewportMenuPosition, type VerticalMenuPlacement } from '../utils/viewportMenuPosition';

interface Flux3KeyframesPopoverProps {
  id: string;
  label: string;
  ariaLabel: string;
  entries: ReadonlyArray<Flux3KeyframeTiming>;
  durationSeconds: number;
  disabled: boolean;
  errorMessage?: string;
  onChange: (imageId: string, timestampSeconds: number) => void;
}

const formatTimestamp = (seconds: number): string => (
  Number.isFinite(seconds) ? String(Number(seconds.toFixed(3))) : '0'
);

const parseTimestamp = (raw: string): number | null => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && raw.trim() !== '' ? parsed : null;
};

export const Flux3KeyframesPopover: React.FC<Flux3KeyframesPopoverProps> = ({
  id, label, ariaLabel, entries, durationSeconds, disabled, errorMessage, onChange,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [timingDrafts, setTimingDrafts] = useState<Record<string, string>>({});
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 0, placement: 'top' as VerticalMenuPlacement });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const intrinsicSize = getIntrinsicElementSize(panel);
      const next = getViewportMenuPosition({
        anchorRect: rect,
        menuWidth: intrinsicSize.width,
        menuHeight: intrinsicSize.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        gapPx: 12,
        marginPx: 8,
        preferredPlacement: 'top',
      });
      setPosition({ left: next.left, top: next.top, maxHeight: next.maxHeight, placement: next.placement });
    };
    place();
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', closeOnPointerDown);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', closeOnPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={errorMessage}
        onClick={() => setOpen(current => !current)}
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          errorMessage
            ? 'border-rose-300/55 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15 focus:ring-rose-300/50'
            : 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-300/15 focus:ring-cyan-300/50'
        }`}
      >
        {label}
      </button>
      {open ? createPortal(
        <div
          {...CANVAS_INTERACTION_BOUNDARY_PROPS}
          ref={panelRef}
          role="dialog"
          aria-label="Flux 3 keyframe timing"
          data-placement={position.placement}
          className="fixed z-[10000] w-72 overflow-y-auto rounded-2xl border border-cyan-200/25 bg-[#111820]/95 p-3 text-white shadow-2xl shadow-black/50 backdrop-blur-xl"
          style={{ left: position.left, top: position.top, maxHeight: position.maxHeight || undefined }}
        >
          <div className="mb-3 flex items-baseline justify-between border-b border-white/10 pb-2">
            <span className="text-sm font-semibold">Keyframe timing</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">24 fps</span>
          </div>
          {errorMessage ? (
            <p role="alert" className="mb-2 rounded-lg border border-rose-300/20 bg-rose-400/10 px-2.5 py-2 text-[11px] leading-4 text-rose-100">
              {errorMessage}
            </p>
          ) : null}
          {entries.length === 0 ? (
            <p className="text-xs leading-5 text-slate-300">Select still images on the canvas to place keyframes.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {entries.map((entry, index) => (
                <label key={entry.imageId} className="grid grid-cols-[1fr_5.75rem] items-center gap-3 rounded-xl bg-white/[0.045] px-3 py-2">
                  <span className="text-xs font-medium text-slate-200">@Image{index + 1}</span>
                  <span className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={timingDrafts[entry.imageId] ?? formatTimestamp(entry.timestampSeconds)}
                      onChange={event => {
                        const raw = event.target.value;
                        setTimingDrafts(current => ({ ...current, [entry.imageId]: raw }));
                        const parsed = parseTimestamp(raw);
                        if (parsed !== null && !raw.trim().endsWith('.')) onChange(entry.imageId, parsed); // Skip incomplete decimals so the field can accept 2.5.
                      }}
                      onBlur={() => {
                        const raw = timingDrafts[entry.imageId];
                        if (raw === undefined) return;
                        const parsed = parseTimestamp(raw);
                        if (parsed !== null) onChange(entry.imageId, Math.min(durationSeconds, Math.max(0, parsed)));
                        setTimingDrafts(current => {
                          const next = { ...current };
                          delete next[entry.imageId];
                          return next;
                        });
                      }}
                      className="w-full rounded-lg border border-white/15 bg-black/25 py-1.5 pl-2 pr-5 text-right font-mono text-xs text-white outline-none focus:border-cyan-300/60"
                      aria-label={`@Image${index + 1} timestamp in seconds`}
                    />
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">s</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>,
        document.body,
      ) : null}
    </>
  );
};
