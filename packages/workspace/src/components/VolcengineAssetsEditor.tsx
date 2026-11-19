import React, { useId, useState } from 'react';
import { normalizeArkAssetId, type VolcengineAssetReference } from '../services/volcengineSettings';

interface VolcengineAssetsEditorProps {
  assets: readonly VolcengineAssetReference[];
  mediaTypes: readonly VolcengineAssetReference['mediaType'][];
  disabled: boolean;
  onChange: (assets: VolcengineAssetReference[]) => void;
}

const mediaLabel = (mediaType: VolcengineAssetReference['mediaType']): string => (
  `${mediaType[0].toUpperCase()}${mediaType.slice(1)}`
);

export const VolcengineAssetsEditor: React.FC<VolcengineAssetsEditorProps> = ({ assets, mediaTypes, disabled, onChange }) => {
  const errorId = useId();
  const [assetId, setAssetId] = useState('');
  const [mediaType, setMediaType] = useState<VolcengineAssetReference['mediaType']>('image');
  const [submitted, setSubmitted] = useState(false);
  const selectedMediaType = mediaTypes.includes(mediaType) ? mediaType : mediaTypes[0];
  const normalizedId = normalizeArkAssetId(assetId);
  const invalid = (submitted || assetId.trim() !== '') && !normalizedId;

  const addAsset = () => {
    setSubmitted(true);
    if (!normalizedId || !selectedMediaType) return;
    onChange([...assets, { mediaType: selectedMediaType, assetId: normalizedId }]);
    setAssetId('');
    setSubmitted(false);
  };

  const moveAsset = (index: number, direction: -1 | 1) => {
    const next = [...assets];
    const target = index + direction;
    const currentAsset = next[index];
    const targetAsset = next[target];
    if (!currentAsset || !targetAsset) return;
    next[index] = targetAsset;
    next[target] = currentAsset;
    onChange(next);
  };

  if (mediaTypes.length === 0) return null;

  return (
    <section className="space-y-2 border-t border-white/10 pt-3" aria-label="Reusable Ark assets">
      <h3 className="text-xs font-semibold text-slate-100">Reusable Ark assets</h3>
      <p className="text-[11px] leading-4 text-slate-400">Paste an Ark asset ID or asset:// URI. References are numbered after canvas files of the same type, in this order.</p>
      {assets.length > 0 ? (
        <ol className="space-y-1.5">
          {assets.map((asset, index) => (
            <li key={`${asset.mediaType}-${asset.assetId}-${index}`} className="flex items-center gap-1 rounded-lg bg-white/[0.045] p-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-medium text-cyan-200">{index + 1}. {mediaLabel(asset.mediaType)}</span>
                <span className="block truncate font-mono text-[11px] text-slate-200" title={asset.assetId}>{asset.assetId}</span>
              </span>
              <button type="button" disabled={disabled || index === 0} onClick={() => moveAsset(index, -1)} aria-label={`Move asset ${index + 1} up`} className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-30">↑</button>
              <button type="button" disabled={disabled || index === assets.length - 1} onClick={() => moveAsset(index, 1)} aria-label={`Move asset ${index + 1} down`} className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-30">↓</button>
              <button type="button" disabled={disabled} onClick={() => onChange(assets.filter((_, assetIndex) => assetIndex !== index))} aria-label={`Remove asset ${index + 1}`} className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-30">×</button>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex gap-1.5">
        <select aria-label="Ark asset media type" value={selectedMediaType} disabled={disabled} onChange={event => {
          const nextMediaType = mediaTypes.find(type => type === event.target.value);
          if (nextMediaType) setMediaType(nextMediaType);
        }} className="min-w-0 rounded-lg border border-white/15 bg-[#111820] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-300/60 disabled:opacity-50">
          {mediaTypes.map(type => <option key={type} value={type}>{mediaLabel(type)}</option>)}
        </select>
        <input aria-label="Ark asset ID" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} value={assetId} disabled={disabled} placeholder="asset://…" onChange={event => setAssetId(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addAsset();
          }
        }} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-300/60 disabled:opacity-50" />
        <button type="button" disabled={disabled} onClick={addAsset} className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-50">Add</button>
      </div>
      {invalid ? <p id={errorId} role="alert" className="text-[11px] text-rose-200">Enter a valid Ark asset ID, with an optional asset:// prefix.</p> : null}
    </section>
  );
};
