import React, { useEffect, useMemo, useState } from 'react';
import { MetadataIcon, CancelIcon } from './Icons';
import {
  CAMERA_BODIES,
  LENS_FAMILIES,
  FOCAL_LENGTHS,
  cloneCameraSelection,
  EMPTY_CAMERA_SELECTION,
  buildCameraSelectionSummary,
  sortFocalLengthIds,
  type CameraSettingsSelection,
  type FocalLengthOption,
} from '../utils/cameraSettings';

type CameraSettingsPopoverProps = {
  isOpen: boolean;
  selection: CameraSettingsSelection;
  onApply: (selection: CameraSettingsSelection) => void;
  onClose: () => void;
};

export const CameraSettingsPopover: React.FC<CameraSettingsPopoverProps> = ({
  isOpen,
  selection,
  onApply,
  onClose,
}) => {
  const [draft, setDraft] = useState<CameraSettingsSelection>(() => cloneCameraSelection(selection));

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setDraft(cloneCameraSelection(selection));
  }, [isOpen, selection]);

  const summary = useMemo(() => buildCameraSelectionSummary(draft), [draft]);

  if (!isOpen) {
    return null;
  }

  const updateCamera = (cameraId: CameraSettingsSelection['cameraId']) => {
    setDraft(prev => ({ ...prev, cameraId }));
  };

  const updateLens = (lensId: CameraSettingsSelection['lensId']) => {
    setDraft(prev => ({ ...prev, lensId }));
  };

  const toggleFocalLength = (id: FocalLengthOption['id']) => {
    setDraft(prev => {
      const exists = prev.focalLengthIds.includes(id);
      const nextIds = exists
        ? prev.focalLengthIds.filter(item => item !== id)
        : [...prev.focalLengthIds, id];
      return {
        ...prev,
        focalLengthIds: sortFocalLengthIds(nextIds),
      };
    });
  };

  const handleConfirm = () => {
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    setDraft(cloneCameraSelection(EMPTY_CAMERA_SELECTION));
  };

  return (
    <div
      role="dialog"
      aria-label="Camera settings"
      className="absolute left-1/2 top-full z-30 mt-4 w-[min(92vw,1200px)] -translate-x-1/2 rounded-2xl border border-amber-700/40 bg-black/95 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-amber-700/30 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Camera Settings</h2>
          <p className="text-sm text-amber-200/70">Configure your camera package and lens kit</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800/80 text-white transition hover:bg-amber-500 hover:text-black"
          aria-label="Close camera settings"
        >
          <CancelIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid max-h-[60vh] min-h-0 grid-cols-1 divide-y divide-amber-700/20 overflow-hidden md:grid-cols-3 md:divide-x md:divide-y-0">
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-amber-700/20 px-5 py-3">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-base font-semibold text-white">Camera Body</h3>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {CAMERA_BODIES.map(option => {
              const isSelected = draft.cameraId === option.id;
              return (
                <label
                  key={option.id}
                  aria-label={`${option.label}, ${option.description}`}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_18px_rgba(251,146,60,0.2)]'
                      : 'border-amber-700/30 bg-zinc-900/60 hover:border-amber-500/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="camera-body"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => updateCamera(option.id)}
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      isSelected ? 'border-amber-400 bg-amber-400/20' : 'border-amber-700/60 bg-black/40'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-amber-400' : 'bg-transparent'}`} />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">{option.label}</span>
                    <span className="text-xs text-amber-200/70">{option.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-amber-700/20 px-5 py-3">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-base font-semibold text-white">Lens Family</h3>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {LENS_FAMILIES.map(option => {
              const isSelected = draft.lensId === option.id;
              return (
                <label
                  key={option.id}
                  aria-label={`${option.label}, ${option.description}`}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_18px_rgba(251,146,60,0.2)]'
                      : 'border-amber-700/30 bg-zinc-900/60 hover:border-amber-500/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="lens-family"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => updateLens(option.id)}
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      isSelected ? 'border-amber-400 bg-amber-400/20' : 'border-amber-700/60 bg-black/40'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-amber-400' : 'bg-transparent'}`} />
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{option.label}</span>
                      {option.tag && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                          {option.tag}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-amber-200/70">{option.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-amber-700/20 px-5 py-3">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-base font-semibold text-white">Focal Lengths</h3>
            <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
              Multi-select
            </span>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto px-5 py-4">
            {FOCAL_LENGTHS.map(option => {
              const isSelected = draft.focalLengthIds.includes(option.id);
              return (
                <label key={option.id} className="cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => toggleFocalLength(option.id)}
                  />
                  <div
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-center transition ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_18px_rgba(251,146,60,0.2)]'
                        : 'border-zinc-800 bg-zinc-900/70 hover:border-amber-500/50'
                    }`}
                  >
                    <span className="text-base font-semibold text-white">{option.label}</span>
                    {option.tStop && <span className="text-xs text-amber-200/70">{option.tStop}</span>}
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4 border-t border-amber-700/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
            <MetadataIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-medium text-white">Selection Summary</p>
            <p className="text-sm text-amber-200/70">{summary}</p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={handleClear}
            className="h-10 rounded-lg border border-amber-700/40 px-4 text-sm font-semibold text-amber-200 transition hover:border-amber-400 hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-amber-700/40 px-4 text-sm font-semibold text-amber-200 transition hover:border-amber-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="h-10 rounded-lg bg-amber-500 px-5 text-sm font-semibold text-black shadow-[0_0_24px_rgba(251,146,60,0.35)] transition hover:bg-amber-400"
          >
            Confirm Package
          </button>
        </div>
      </div>
    </div>
  );
};
