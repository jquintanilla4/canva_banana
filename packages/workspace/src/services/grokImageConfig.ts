export const GROK_IMAGINE_IMAGE_MODEL_ID = 'xai/grok-imagine-image/v2.0/text-to-image' as const;
export const GROK_IMAGINE_IMAGE_EDIT_MODEL_ID = 'xai/grok-imagine-image/v2.0/edit' as const;
export const GROK_IMAGE_MAX_OUTPUT_IMAGES = 10;
export const GROK_IMAGE_NUM_IMAGE_OPTIONS = Array.from({ length: GROK_IMAGE_MAX_OUTPUT_IMAGES }, (_, index) => index + 1);
export const GROK_IMAGE_MAX_INPUTS = 5;

export const GROK_IMAGE_DEFAULTS = {
  aspectRatio: '1:1',
  resolution: '1k',
  quality: 'medium',
  outputFormat: 'png',
  imagePassthrough: false,
  enableSafetyChecker: true,
} as const;

export const FAL_GROK_ASPECT_RATIO_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '2:1', label: '2:1' },
  { value: '21:9', label: '21:9' },
  { value: '5:2', label: '5:2' },
  { value: '20:9', label: '20:9' },
  { value: '19.5:9', label: '19.5:9' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
  { value: '9:19.5', label: '9:19.5' },
  { value: '9:20', label: '9:20' },
  { value: '1:2', label: '1:2' },
] as const;
export type GrokImageAspectRatio = typeof FAL_GROK_ASPECT_RATIO_OPTIONS[number]['value'];

export const GROK_IMAGE_RESOLUTION_OPTIONS = [
  { value: '1k', label: '1K' },
  { value: '1.5k', label: '1.5K' },
  { value: '2k', label: '2K' },
] as const;
export type GrokImageResolution = typeof GROK_IMAGE_RESOLUTION_OPTIONS[number]['value'];

export const GROK_IMAGE_QUALITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'auto', label: 'Auto' },
] as const;
export type GrokImageQuality = typeof GROK_IMAGE_QUALITY_OPTIONS[number]['value'];

export const GROK_IMAGE_OUTPUT_FORMAT_OPTIONS = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
] as const;
export type GrokImageOutputFormat = typeof GROK_IMAGE_OUTPUT_FORMAT_OPTIONS[number]['value'];

export const getGrokImageSelectorModelId = (value: string | undefined): typeof GROK_IMAGINE_IMAGE_MODEL_ID | undefined =>
  value === GROK_IMAGINE_IMAGE_MODEL_ID || value === GROK_IMAGINE_IMAGE_EDIT_MODEL_ID
    || value === 'xai/grok-imagine-image' || value === 'xai/grok-imagine-image/edit'
    ? GROK_IMAGINE_IMAGE_MODEL_ID : undefined;

export const isGrokImageAspectRatio = (value: unknown): value is GrokImageAspectRatio =>
  FAL_GROK_ASPECT_RATIO_OPTIONS.some(option => option.value === value);

export const isGrokImageResolution = (value: unknown): value is GrokImageResolution =>
  GROK_IMAGE_RESOLUTION_OPTIONS.some(option => option.value === value);

export const isGrokImageQuality = (value: unknown): value is GrokImageQuality =>
  GROK_IMAGE_QUALITY_OPTIONS.some(option => option.value === value);

export const isGrokImageOutputFormat = (value: unknown): value is GrokImageOutputFormat =>
  GROK_IMAGE_OUTPUT_FORMAT_OPTIONS.some(option => option.value === value);
