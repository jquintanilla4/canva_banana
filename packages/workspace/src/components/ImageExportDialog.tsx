import { useEffect, useId, useRef, useState } from 'react';
import type { SvgDownloadFormat } from '../services/imageOperations';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';

interface ImageExportDialogProps { onResolve: (format: SvgDownloadFormat | null) => void }
const choices: readonly { value: SvgDownloadFormat; label: string }[] = [
  { value: 'image/svg+xml', label: 'SVG at canvas size (keeps vectors)' },
  { value: 'original', label: 'Original SVG (before crop/resize/rotation)' },
  { value: 'image/png', label: 'PNG raster copy' },
  { value: 'image/jpeg', label: 'JPEG raster copy (white background)' },
  { value: 'image/webp', label: 'WebP raster copy' },
];
export function ImageExportDialog({ onResolve }: ImageExportDialogProps) {
  const [format, setFormat] = useState<SvgDownloadFormat>('image/svg+xml');
  const panel = useRef<HTMLFormElement>(null);
  const settled = useRef(false);
  const titleId = useId();
  const finish = (value: SvgDownloadFormat | null) => {
    if (settled.current) return;
    settled.current = true;
    onResolve(value);
  };
  useEffect(() => {
    const previousFocus = document.activeElement;
    panel.current?.querySelector('input')?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  return <div className={`fixed inset-0 ${OVERLAY_LAYER_CLASS_NAMES.blockingModal} flex items-center justify-center bg-black/60 px-4`}
    onClick={event => { if (event.target === event.currentTarget) finish(null); }}>
    <form ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-5 text-white shadow-xl"
      onSubmit={event => { event.preventDefault(); finish(format); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
        if (event.key === 'Tab') {
          const controls = panel.current?.querySelectorAll<HTMLElement>('input:checked, button');
          const first = controls?.[0];
          const last = controls?.[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <h2 id={titleId} className="text-base font-semibold">Download SVG images</h2>
      <p className="mt-2 text-sm text-gray-400">Choose the format for SVG assets. Other selected media keeps its original format.</p>
      <fieldset className="my-4 space-y-3"><legend className="sr-only">SVG export format</legend>
        {choices.map(choice => <label key={choice.value} className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="radio" name="svg-export-format" value={choice.value} checked={format === choice.value} onChange={() => setFormat(choice.value)} />
          {choice.label}
        </label>)}
      </fieldset>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => finish(null)} className="rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-gray-800">Cancel</button>
        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500">Download</button>
      </div>
    </form>
  </div>;
}
