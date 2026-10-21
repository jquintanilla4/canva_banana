import React from 'react';
import type { Flux3KeyframeTiming } from '../types';
import { Flux3KeyframesPopover } from './Flux3KeyframesPopover';
import { PromptBarPicker } from './PromptBarPicker';

export interface PromptBarControlOption {
  value: string;
  label: string;
  highlightColor?: string;
  tooltip?: string;
  disabled?: boolean;
}

export interface PromptBarSelectControl {
  kind?: 'select';
  id: string;
  prefixLabel?: string;
  hideSelectedValue?: boolean;
  ariaLabel: string;
  options: ReadonlyArray<PromptBarControlOption>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
  tooltip?: string;
}

export interface PromptBarColorControl {
  kind: 'color';
  id: string;
  prefixLabel: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  errorMessage?: string;
}

export interface PromptBarActionControl {
  kind: 'action';
  id: string;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  disabled: boolean;
  errorMessage?: string;
}

export interface PromptBarKeyframesControl {
  kind: 'keyframes';
  id: string;
  label: string;
  ariaLabel: string;
  entries: ReadonlyArray<Flux3KeyframeTiming>;
  durationSeconds: number;
  onTimingChange: (imageId: string, timestampSeconds: number) => void;
  disabled: boolean;
  errorMessage?: string;
}

export type PromptBarControl = PromptBarSelectControl | PromptBarColorControl | PromptBarActionControl | PromptBarKeyframesControl;

export const getPromptBarControlSignature = (control: PromptBarControl): string => {
  if (control.kind === 'action') return `${control.id}-${control.disabled}-${control.label}`;
  if (control.kind === 'color') return `${control.id}-${control.value}-${control.disabled}`;
  if (control.kind === 'keyframes') {
    return `${control.id}-${control.entries.map(entry => `${entry.imageId}:${entry.timestampSeconds}`).join('~')}-${control.disabled}-${control.errorMessage ?? ''}`;
  }
  return `${control.id}-${control.value}-${control.options.map(option => option.label).join('~')}`;
};

const getControlTooltip = (control: PromptBarSelectControl): string | undefined =>
  control.tooltip ?? control.options.find(option => option.value === control.value)?.tooltip; // Prefer selected option guidance.

export const PromptBarModelControlList: React.FC<{ controls?: ReadonlyArray<PromptBarControl> }> = ({ controls }) => (
  <>
    {controls?.map(control => {
      if (control.kind === 'keyframes') {
        return <Flux3KeyframesPopover key={control.id} {...control} onChange={control.onTimingChange} />;
      }
      if (control.kind === 'action') {
        return (
          <button
            key={control.id}
            id={control.id}
            type="button"
            onClick={control.onClick}
            disabled={control.disabled}
            className="text-sm text-white px-[0.4rem] py-[0.34rem] focus:outline-none focus:ring-0 disabled:text-gray-400 disabled:cursor-not-allowed"
            aria-label={control.ariaLabel}
          >
            {control.label}
          </button>
        );
      }
      if (control.kind === 'color') {
        return (
          <div className="relative flex items-center gap-2" key={control.id}>
            <span className="text-sm text-gray-200">{control.prefixLabel}</span>
            <label className="sr-only" htmlFor={control.id}>{control.ariaLabel}</label>
            <input
              id={control.id}
              type="color"
              value={control.value}
              onChange={event => control.onChange(event.target.value)}
              disabled={control.disabled}
              className="h-7 w-7 cursor-pointer appearance-none rounded-md border border-white/20 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ colorScheme: 'light dark' }}
              aria-label={control.ariaLabel}
            />
          </div>
        );
      }

      const controlTooltip = getControlTooltip(control);
      return (
        <div className="relative flex items-center gap-1" key={control.id} title={controlTooltip}>
          {control.hideSelectedValue ? (
            <div className={`inline-flex items-center focus-within:outline-none ${control.disabled ? 'opacity-60' : ''}`} title={controlTooltip}>
              <PromptBarPicker
                id={control.id}
                ariaLabel={control.ariaLabel}
                options={control.options}
                value={control.value}
                onChange={control.onChange}
                disabled={control.disabled}
                displayLabel={control.prefixLabel ?? ''}
                title={controlTooltip}
              />
            </div>
          ) : (
            <>
              {control.prefixLabel && <span className="text-sm text-gray-200">{control.prefixLabel}</span>}
              <PromptBarPicker
                id={control.id}
                ariaLabel={control.ariaLabel}
                options={control.options}
                value={control.value}
                onChange={control.onChange}
                disabled={control.disabled}
                title={controlTooltip}
              />
            </>
          )}
        </div>
      );
    })}
  </>
);

export const PromptBarModelControlErrors: React.FC<{ controls?: ReadonlyArray<PromptBarControl> }> = ({ controls }) => (
  <>
    {controls?.map(control => control.errorMessage ? (
      <p key={`${control.id}-error`} className="text-xs text-red-400">{control.errorMessage}</p>
    ) : null)}
  </>
);
