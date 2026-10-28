import type { GenerationFalOptions } from '../types';
import {
  GROK_IMAGINE_IMAGE_MODEL_ID, GROK_IMAGINE_IMAGE_EDIT_MODEL_ID, GROK_IMAGE_MAX_OUTPUT_IMAGES, GROK_IMAGE_DEFAULTS,
  isGrokImageAspectRatio, isGrokImageResolution, isGrokImageQuality, isGrokImageOutputFormat,
  type GrokImageAspectRatio, type GrokImageResolution, type GrokImageQuality, type GrokImageOutputFormat,
} from './grokImageConfig';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettings, type ImageRunSettingsValidation } from './imageRunSettings';

const ENDPOINTS = { text_to_image: GROK_IMAGINE_IMAGE_MODEL_ID, image_edit: GROK_IMAGINE_IMAGE_EDIT_MODEL_ID } as const;
interface GrokImageSettingsForKind<Kind extends ImageRunKind> extends ImageRunSettings<Kind> {
  readonly endpoint: typeof ENDPOINTS[Kind];
  readonly aspectRatio: GrokImageAspectRatio;
  readonly resolution: GrokImageResolution;
  readonly quality: GrokImageQuality;
  readonly outputFormat: GrokImageOutputFormat;
  readonly imagePassthrough: boolean;
  readonly enableSafetyChecker: boolean;
}
export type GrokImageRunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? GrokImageSettingsForKind<Kind> : never;

export interface GrokImageRunSettingsInput<Kind extends ImageRunKind = ImageRunKind> {
  kind: Kind;
  aspectRatio?: unknown;
  numImages?: unknown;
  resolution?: unknown;
  quality?: unknown;
  outputFormat?: unknown;
  imagePassthrough?: unknown;
  enableSafetyChecker?: unknown;
}

export const resolveGrokImageRunSettings = <Kind extends ImageRunKind>(
  input: GrokImageRunSettingsInput<Kind>,
  validation: ImageRunSettingsValidation = 'strict',
): GrokImageRunSettings<Kind> => {
  const validAspectRatio = isGrokImageAspectRatio(input.aspectRatio);
  if (!validAspectRatio && input.aspectRatio !== undefined && input.aspectRatio !== 'default' && validation === 'strict') {
    throw new Error('Please select a supported Grok Imagine aspect ratio.');
  }
  if (!isGrokImageResolution(input.resolution) && input.resolution !== undefined && validation === 'strict') {
    throw new Error('Please select a supported Grok Imagine resolution.');
  }
  if (!isGrokImageQuality(input.quality) && input.quality !== undefined && validation === 'strict') {
    throw new Error('Please select a supported Grok Imagine quality.');
  }
  if (!isGrokImageOutputFormat(input.outputFormat) && input.outputFormat !== undefined && validation === 'strict') {
    throw new Error('Please select a supported Grok Imagine output format.');
  }
  const aspectRatio = isGrokImageAspectRatio(input.aspectRatio) ? input.aspectRatio
    : (input.aspectRatio === undefined || input.aspectRatio === 'default') && input.kind === 'image_edit'
      ? 'auto' : GROK_IMAGE_DEFAULTS.aspectRatio; // Legacy edits without an explicit ratio preserve the source shape.
  const numImages = resolveImageRunOutputCount(input.numImages, GROK_IMAGE_MAX_OUTPUT_IMAGES, validation);
  return {
    kind: input.kind,
    endpoint: ENDPOINTS[input.kind],
    aspectRatio,
    resolution: isGrokImageResolution(input.resolution) ? input.resolution : GROK_IMAGE_DEFAULTS.resolution,
    quality: isGrokImageQuality(input.quality) ? input.quality : GROK_IMAGE_DEFAULTS.quality,
    outputFormat: isGrokImageOutputFormat(input.outputFormat) ? input.outputFormat : GROK_IMAGE_DEFAULTS.outputFormat,
    imagePassthrough: typeof input.imagePassthrough === 'boolean' ? input.imagePassthrough : GROK_IMAGE_DEFAULTS.imagePassthrough,
    enableSafetyChecker: typeof input.enableSafetyChecker === 'boolean' ? input.enableSafetyChecker : GROK_IMAGE_DEFAULTS.enableSafetyChecker,
    ...(numImages !== undefined ? { numImages } : {}),
  } as GrokImageRunSettings<Kind>; // Each operation maps to its matching endpoint.
};

export const serializeGrokImageGenerationOptions = (settings: GrokImageRunSettings): GenerationFalOptions => ({
  grokImageAspectRatio: settings.aspectRatio,
  ...(settings.aspectRatio !== 'auto' && settings.aspectRatio !== '5:2' ? { aspectRatioSelection: settings.aspectRatio } : {}),
  grokImageResolution: settings.resolution,
  grokImageQuality: settings.quality,
  grokImageOutputFormat: settings.outputFormat,
  grokImagePassthrough: settings.imagePassthrough,
  grokImageEnableSafetyChecker: settings.enableSafetyChecker,
  ...(settings.numImages !== undefined ? { numImages: settings.numImages } : {}),
});
