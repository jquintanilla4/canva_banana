import type { PromptBarSelectControl } from '../../components/promptBarControls';
import type { KlingV4Variant, KlingV4Resolution, KlingV4AspectRatio, KlingV4Duration } from '../../types';
import {
  KLING_V4_DEFAULTS,
  KLING_V4_VARIANT_OPTIONS,
  KLING_V4_RESOLUTION_OPTIONS,
  KLING_V4_ASPECT_RATIO_OPTIONS,
  KLING_V4_DURATION_OPTIONS,
} from '../klingV4Config';

export interface KlingV4ControlsInput {
  idPrefix?: string;
  isLoading: boolean;
  variant?: KlingV4Variant;
  resolution?: KlingV4Resolution;
  aspectRatio?: KlingV4AspectRatio;
  duration?: KlingV4Duration;
  onVariantChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onDurationChange: (value: string) => void;
}

export const buildKlingV4Controls = (input: KlingV4ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const variant = input.variant ?? KLING_V4_DEFAULTS.klingV4Variant;
  const duration = input.duration ?? (variant === 'edit' ? 'source' : KLING_V4_DEFAULTS.klingV4Duration);
  const id = (name: string) => `${input.idPrefix ? `${input.idPrefix}-` : ''}kling-v4-${name}-select`;
  const controls: PromptBarSelectControl[] = [{
    id: id('variant'),
    prefixLabel: 'Variant',
    ariaLabel: 'Select Kling v4 variant',
    options: KLING_V4_VARIANT_OPTIONS,
    value: variant,
    onChange: input.onVariantChange,
    disabled: input.isLoading,
  }];
  if (variant === 'generate') {
    controls.push({
      id: id('aspect-ratio'),
      prefixLabel: 'AR',
      ariaLabel: 'Select Kling v4 aspect ratio',
      options: KLING_V4_ASPECT_RATIO_OPTIONS,
      value: input.aspectRatio ?? KLING_V4_DEFAULTS.klingV4AspectRatio,
      onChange: input.onAspectRatioChange,
      disabled: input.isLoading,
    });
  }
  controls.push({
    id: id('resolution'),
    prefixLabel: 'Resolution',
    ariaLabel: 'Select Kling v4 resolution',
    options: KLING_V4_RESOLUTION_OPTIONS,
    value: input.resolution ?? KLING_V4_DEFAULTS.klingV4Resolution,
    onChange: input.onResolutionChange,
    disabled: input.isLoading,
  }, {
    id: id('duration'),
    ariaLabel: 'Select Kling v4 duration',
    options: KLING_V4_DURATION_OPTIONS.filter(option => variant === 'edit' || option.value !== 'source'),
    value: variant === 'generate' && duration === 'source' ? KLING_V4_DEFAULTS.klingV4Duration : duration,
    onChange: input.onDurationChange,
    disabled: input.isLoading,
  });
  return controls;
};
