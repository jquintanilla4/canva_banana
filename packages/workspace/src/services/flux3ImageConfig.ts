import type { Flux3ImageAspectRatio, Flux3ImageResolution } from '../types';

export const FLUX_3_TEXT_TO_IMAGE_MODEL_ID = 'blackforestlabs/flux-3/text-to-image' as const;
export const FLUX_3_EDIT_IMAGE_MODEL_ID = 'blackforestlabs/flux-3/edit-image' as const;
export const FLUX3_IMAGE_MAX_INPUTS = 10;

export const FLUX3_IMAGE_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: Flux3ImageAspectRatio; label: string }> = ([
  'auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2',
] as const).map(value => ({ value, label: value === 'auto' ? 'Auto' : value }));

export const FLUX3_IMAGE_RESOLUTION_OPTIONS: ReadonlyArray<{ value: Flux3ImageResolution; label: string }> = [
  { value: '768sq', label: '768' },
  { value: '1k', label: '1K' },
  { value: '1.5k', label: '1.5K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
];

export const isFlux3ImageAspectRatio = (value: unknown): value is Flux3ImageAspectRatio =>
  FLUX3_IMAGE_ASPECT_RATIO_OPTIONS.some(option => option.value === value);
export const isFlux3ImageResolution = (value: unknown): value is Flux3ImageResolution =>
  FLUX3_IMAGE_RESOLUTION_OPTIONS.some(option => option.value === value);

export const getFlux3ImageSelectorModelId = (value: string | undefined): typeof FLUX_3_TEXT_TO_IMAGE_MODEL_ID | undefined =>
  value === FLUX_3_TEXT_TO_IMAGE_MODEL_ID || value === FLUX_3_EDIT_IMAGE_MODEL_ID
    || value === 'fal-ai/flux-2-max' || value === 'fal-ai/flux-2-max/edit'
    ? FLUX_3_TEXT_TO_IMAGE_MODEL_ID : undefined; // Saved Flux 2 Max generations now run on Flux 3.

const LEGACY_SIZE_ASPECT_RATIOS = {
  landscape_4_3: '4:3',
  landscape_16_9: '16:9',
  portrait_4_3: '3:4',
  portrait_16_9: '9:16',
  square: '1:1',
  square_hd: '1:1',
} as const;

export const resolveFlux3ImageSettings = (options: {
  flux3ImageAspectRatio?: unknown;
  flux3ImageResolution?: unknown;
  flux2MaxImageSize?: unknown;
} = {}): { flux3ImageAspectRatio: Flux3ImageAspectRatio; flux3ImageResolution: Flux3ImageResolution } => {
  const legacySize = options.flux2MaxImageSize;
  const legacyAspectRatio = typeof legacySize === 'string' && Object.hasOwn(LEGACY_SIZE_ASPECT_RATIOS, legacySize)
    ? LEGACY_SIZE_ASPECT_RATIOS[legacySize as keyof typeof LEGACY_SIZE_ASPECT_RATIOS] : 'auto';
  return {
    flux3ImageAspectRatio: isFlux3ImageAspectRatio(options.flux3ImageAspectRatio) ? options.flux3ImageAspectRatio : legacyAspectRatio,
    flux3ImageResolution: isFlux3ImageResolution(options.flux3ImageResolution) ? options.flux3ImageResolution : '1k',
  };
};
