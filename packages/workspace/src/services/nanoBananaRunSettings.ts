import type { FalResolutionOption, GenerationFalOptions, NanoBananaThinkingLevel } from '../types';
import { getNanoBananaSelectorModelId, getNanoBananaTextToImageModelId, isNanoBananaAspectRatio, isNanoBananaThinkingLevel, NANO_BANANA_DEFAULTS, NANO_BANANA_MAX_OUTPUT_IMAGES, NANO_BANANA_PRO_EDIT_MODEL_ID, NANO_BANANA_21_EDIT_MODEL_ID, NANO_BANANA_TEXT_TO_IMAGE_MAP, type NanoBananaAspectRatio, type NanoBananaEditModelId } from './nanoBananaConfig';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettings, type ImageRunSettingsValidation } from './imageRunSettings';

interface NanoBananaSettingsForKind<Kind extends ImageRunKind = ImageRunKind> extends ImageRunSettings<Kind> {
  readonly resolution: FalResolutionOption;
  readonly webSearch: boolean;
  readonly thinkingLevel: NanoBananaThinkingLevel;
}
export type NanoBananaRunSettings<Kind extends ImageRunKind = ImageRunKind> =
  Kind extends ImageRunKind ? {
    [Model in NanoBananaEditModelId]: NanoBananaSettingsForKind<Kind> & {
      readonly modelId: Model;
      readonly endpoint: Kind extends 'image_edit' ? Model : (typeof NANO_BANANA_TEXT_TO_IMAGE_MAP)[Model];
      readonly aspectRatioSelection: NanoBananaAspectRatio<Model>;
    }
  }[NanoBananaEditModelId] : never;
export interface NanoBananaRunSettingsInput<Kind extends ImageRunKind = ImageRunKind> {
  kind: Kind;
  modelId?: string;
  aspectRatioSelection?: unknown;
  resolution?: unknown;
  webSearch?: unknown;
  thinkingLevel?: unknown;
  numImages?: unknown;
}
export function resolveNanoBananaRunSettings<Kind extends ImageRunKind>(
  input: NanoBananaRunSettingsInput<Kind>, validation?: ImageRunSettingsValidation,
): NanoBananaRunSettings<Kind>;
// eslint-disable-next-line no-redeclare -- The overload preserves the caller's operation in the return type.
export function resolveNanoBananaRunSettings(
  input: NanoBananaRunSettingsInput, validation: ImageRunSettingsValidation = 'strict',
): NanoBananaRunSettings {
  const modelId = getNanoBananaSelectorModelId(input.modelId) ?? NANO_BANANA_PRO_EDIT_MODEL_ID;
  const aspectRatio = input.aspectRatioSelection === 'auto' ? 'default' : input.aspectRatioSelection ?? NANO_BANANA_DEFAULTS.aspectRatioSelection;
  const validAspectRatio = isNanoBananaAspectRatio(aspectRatio, modelId);
  const resolution = input.resolution ?? NANO_BANANA_DEFAULTS.resolutionSelection;
  const validResolution = resolution === '1K' || resolution === '2K' || resolution === '4K';
  if (validation === 'strict' && (!validAspectRatio || !validResolution)) {
    throw new Error('Please select a supported Nano Banana aspect ratio and resolution.');
  }
  const numImages = resolveImageRunOutputCount(input.numImages, NANO_BANANA_MAX_OUTPUT_IMAGES, validation);
  const commonSettings = {
    resolution: validResolution ? resolution : NANO_BANANA_DEFAULTS.resolutionSelection,
    webSearch: typeof input.webSearch === 'boolean' ? input.webSearch : NANO_BANANA_DEFAULTS.nanoBananaWebSearch,
    thinkingLevel: isNanoBananaThinkingLevel(input.thinkingLevel) ? input.thinkingLevel : NANO_BANANA_DEFAULTS.nanoBananaThinkingLevel,
    ...(numImages !== undefined ? { numImages } : {}),
  } satisfies Omit<NanoBananaSettingsForKind, 'kind'>;
  if (modelId === NANO_BANANA_21_EDIT_MODEL_ID) {
    const settings = { ...commonSettings, modelId, aspectRatioSelection: isNanoBananaAspectRatio(aspectRatio, modelId) ? aspectRatio : NANO_BANANA_DEFAULTS.aspectRatioSelection };
    return input.kind === 'image_edit'
      ? { ...settings, kind: input.kind, endpoint: modelId }
      : { ...settings, kind: input.kind, endpoint: getNanoBananaTextToImageModelId(modelId) };
  }
  const settings = { ...commonSettings, modelId, aspectRatioSelection: isNanoBananaAspectRatio(aspectRatio, modelId) ? aspectRatio : NANO_BANANA_DEFAULTS.aspectRatioSelection };
  return input.kind === 'image_edit'
    ? { ...settings, kind: input.kind, endpoint: modelId }
    : { ...settings, kind: input.kind, endpoint: getNanoBananaTextToImageModelId(modelId) };
}
export const serializeNanoBananaGenerationOptions = (settings: NanoBananaRunSettings): GenerationFalOptions => ({
  aspectRatioSelection: settings.aspectRatioSelection, resolutionSelection: settings.resolution,
  ...(settings.modelId === NANO_BANANA_21_EDIT_MODEL_ID ? {
    nanoBananaWebSearch: settings.webSearch, nanoBananaThinkingLevel: settings.thinkingLevel,
  } : {}),
  ...(settings.numImages !== undefined ? { numImages: settings.numImages } : {}),
});
