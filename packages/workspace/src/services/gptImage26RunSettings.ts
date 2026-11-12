import type { GenerationFalOptions } from '../types';
import {
  GPT_IMAGE_26_DEFAULTS, GPT_IMAGE_26_MODEL_ID, GPT_IMAGE_26_IMAGE_SIZE_OPTIONS, GPT_IMAGE_26_MAX_OUTPUT_IMAGES,
  isGptImage26Quality, isGptImage26Background, isGptImage26ReasoningEffort, isGptImage26OutputFormat,
  type GptImage26Quality, type GptImage26Background, type GptImage26ReasoningEffort,
  type GptImage26ImageSize, type GptImage26RasterFormat,
} from './gptImage26Config';
import { resolveImageRunOutputCount, type ImageRunKind, type ImageRunSettingsValidation } from './imageRunSettings';

interface GptImage26SharedSettings {
  readonly quality: GptImage26Quality;
  readonly background: GptImage26Background;
  readonly reasoningEffort: GptImage26ReasoningEffort;
  readonly imageSizeSelection: GptImage26ImageSize;
}
interface GptImage26AnimationSettings {
  readonly outputFormat: 'gif';
  readonly frameCount: number;
  readonly frameDurationMs: number;
}
type GptImage26Operation =
  | (GptImage26AnimationSettings & { readonly kind: 'text_to_image'; readonly endpoint: `${typeof GPT_IMAGE_26_MODEL_ID}/text-to-image`; readonly numImages: number })
  | (GptImage26AnimationSettings & { readonly kind: 'image_edit'; readonly endpoint: `${typeof GPT_IMAGE_26_MODEL_ID}/edit`; readonly numImages: number })
  | { readonly kind: 'text_to_image'; readonly endpoint: `${typeof GPT_IMAGE_26_MODEL_ID}/text-to-image`; readonly outputFormat: 'svg'; readonly numImages: 1 }
  | { readonly kind: 'text_to_image'; readonly endpoint: `${typeof GPT_IMAGE_26_MODEL_ID}/text-to-image`; readonly outputFormat: GptImage26RasterFormat; readonly numImages: number }
  | { readonly kind: 'image_edit'; readonly endpoint: `${typeof GPT_IMAGE_26_MODEL_ID}/edit`; readonly outputFormat: GptImage26RasterFormat; readonly numImages: number };
export type GptImage26RunSettings<Kind extends ImageRunKind = ImageRunKind> = GptImage26SharedSettings & Extract<GptImage26Operation, { kind: Kind }>;
export interface GptImage26RunSettingsInput {
  kind: ImageRunKind;
  quality?: unknown;
  background?: unknown;
  reasoningEffort?: unknown;
  outputFormat?: unknown;
  frameCount?: unknown;
  frameDurationMs?: unknown;
  imageSizeSelection?: unknown;
  numImages?: unknown;
}
const resolveAnimationInteger = (value: unknown, fallback: number, min: number, max: number, label: string, validation: ImageRunSettingsValidation): number => {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value;
  if (validation === 'strict') throw new Error(`GPT Image 2.6 ${label} must be an integer from ${min} to ${max}.`);
  return fallback;
};
export function resolveGptImage26RunSettings(input: GptImage26RunSettingsInput & { kind: 'text_to_image' }, validation?: ImageRunSettingsValidation): GptImage26RunSettings<'text_to_image'>;
export function resolveGptImage26RunSettings(input: GptImage26RunSettingsInput & { kind: 'image_edit' }, validation?: ImageRunSettingsValidation): GptImage26RunSettings<'image_edit'>;
export function resolveGptImage26RunSettings(input: GptImage26RunSettingsInput, validation?: ImageRunSettingsValidation): GptImage26RunSettings;
export function resolveGptImage26RunSettings(input: GptImage26RunSettingsInput, validation: ImageRunSettingsValidation = 'strict'): GptImage26RunSettings {
  const selectedSize = input.imageSizeSelection === undefined || input.imageSizeSelection === 'default' ? 'auto' : input.imageSizeSelection;
  const size = GPT_IMAGE_26_IMAGE_SIZE_OPTIONS.find(option => option.value === selectedSize);
  if (!size && validation === 'strict') throw new Error('Please select a supported GPT Image 2.6 image size.');
  let outputFormat = isGptImage26OutputFormat(input.outputFormat) ? input.outputFormat : GPT_IMAGE_26_DEFAULTS.gptImage26OutputFormat;
  const numImages = resolveImageRunOutputCount(input.numImages, GPT_IMAGE_26_MAX_OUTPUT_IMAGES, validation) ?? 1;
  if (outputFormat === 'svg' && input.kind === 'image_edit') {
    if (validation === 'strict') throw new Error('GPT Image 2.6 editing supports PNG, JPEG, WebP, or GIF output.');
    outputFormat = 'png';
  }
  if (outputFormat === 'svg' && numImages !== 1 && validation === 'strict') throw new Error('GPT Image 2.6 SVG output supports one image.');
  const shared: GptImage26SharedSettings = {
    quality: isGptImage26Quality(input.quality) ? input.quality : GPT_IMAGE_26_DEFAULTS.gptImage26Quality,
    background: isGptImage26Background(input.background) ? input.background : GPT_IMAGE_26_DEFAULTS.gptImage26Background,
    reasoningEffort: isGptImage26ReasoningEffort(input.reasoningEffort) ? input.reasoningEffort : GPT_IMAGE_26_DEFAULTS.gptImage26ReasoningEffort,
    imageSizeSelection: size?.value ?? 'auto',
  };
  if (outputFormat === 'gif') {
    const animation = { outputFormat, frameCount: resolveAnimationInteger(input.frameCount, GPT_IMAGE_26_DEFAULTS.gptImage26FrameCount, 2, 16, 'frame count', validation), frameDurationMs: Math.round(resolveAnimationInteger(input.frameDurationMs, GPT_IMAGE_26_DEFAULTS.gptImage26FrameDurationMs, 20, 2000, 'frame duration', validation) / 10) * 10 } as const;
    return input.kind === 'image_edit'
      ? { ...shared, ...animation, kind: 'image_edit', endpoint: `${GPT_IMAGE_26_MODEL_ID}/edit`, numImages }
      : { ...shared, ...animation, kind: 'text_to_image', endpoint: `${GPT_IMAGE_26_MODEL_ID}/text-to-image`, numImages };
  }
  if (input.kind === 'image_edit' && outputFormat !== 'svg') return { ...shared, kind: 'image_edit', endpoint: `${GPT_IMAGE_26_MODEL_ID}/edit`, outputFormat, numImages };
  if (outputFormat === 'svg') return { ...shared, kind: 'text_to_image', endpoint: `${GPT_IMAGE_26_MODEL_ID}/text-to-image`, outputFormat, numImages: 1 };
  return { ...shared, kind: 'text_to_image', endpoint: `${GPT_IMAGE_26_MODEL_ID}/text-to-image`, outputFormat, numImages };
}
export const serializeGptImage26GenerationOptions = (settings: GptImage26RunSettings): GenerationFalOptions => ({
  gptImage26Quality: settings.quality, gptImage26Background: settings.background,
  gptImage26ReasoningEffort: settings.reasoningEffort, gptImage26OutputFormat: settings.outputFormat,
  imageSizeSelection: settings.imageSizeSelection, numImages: settings.numImages,
  ...(settings.outputFormat === 'gif' ? { gptImage26FrameCount: settings.frameCount, gptImage26FrameDurationMs: settings.frameDurationMs } : {}),
});
