import type { GenerationFalOptions } from '../types';
import type { FalImageGenerationResult, GenerateImageEditParams } from './fal/types';
import type { ImageRunKind, ImageRunSettingsValidation } from './imageRunSettings';
import { TOKENHUB_GPT_IMAGE_25_MODEL_ID } from './tokenHubGptImage25Config';
import { resolveTokenHubGptImage25RunSettingsFromOptions, serializeTokenHubGptImage25GenerationOptions } from './tokenHubGptImage25RunSettings';
import { generateTokenHubImage, generateTokenHubImageEdit, type TokenHubImageTransportOptions } from './tokenHubImageService';
import { TOKENHUB_NANO_BANANA_21_MODEL_ID } from './tokenHubNanoBananaConfig';
import { resolveTokenHubNanoBananaRunSettingsFromOptions, serializeTokenHubNanoBananaGenerationOptions } from './tokenHubNanoBananaRunSettings';
import { generateTokenHubNanoBanana, generateTokenHubNanoBananaEdit } from './tokenHubNanoBananaService';

type TokenHubImageModelId = typeof TOKENHUB_GPT_IMAGE_25_MODEL_ID | typeof TOKENHUB_NANO_BANANA_21_MODEL_ID;

export const isTokenHubImageModel = (modelId: string | undefined): modelId is TokenHubImageModelId =>
  modelId === TOKENHUB_GPT_IMAGE_25_MODEL_ID || modelId === TOKENHUB_NANO_BANANA_21_MODEL_ID;

export type TokenHubImageOperation = {
  numImages: number;
  savedOptions: GenerationFalOptions;
} & (
  | { kind: 'text_to_image'; execute: (prompt: string, transport: TokenHubImageTransportOptions) => Promise<FalImageGenerationResult> }
  | { kind: 'image_edit'; execute: (params: GenerateImageEditParams, transport: TokenHubImageTransportOptions) => Promise<FalImageGenerationResult> }
);

export const resolveTokenHubImageOperation = ({
  modelId, kind, options, validation,
}: {
  modelId: TokenHubImageModelId;
  kind: ImageRunKind;
  options: GenerationFalOptions;
  validation: ImageRunSettingsValidation;
}): TokenHubImageOperation => {
  if (modelId === TOKENHUB_NANO_BANANA_21_MODEL_ID) {
    const settings = resolveTokenHubNanoBananaRunSettingsFromOptions(kind, options, validation);
    const shared = { numImages: settings.numImages, savedOptions: serializeTokenHubNanoBananaGenerationOptions(settings) };
    return settings.kind === 'text_to_image'
      ? { ...shared, kind: settings.kind, execute: (prompt, transport) => generateTokenHubNanoBanana(prompt, { ...transport, settings }) }
      : { ...shared, kind: settings.kind, execute: (params, transport) => generateTokenHubNanoBananaEdit(params, { ...transport, settings }) };
  }

  const settings = resolveTokenHubGptImage25RunSettingsFromOptions(kind, options, validation);
  const shared = { numImages: settings.numImages, savedOptions: serializeTokenHubGptImage25GenerationOptions(settings) };
  return settings.kind === 'text_to_image'
    ? { ...shared, kind: settings.kind, execute: (prompt, transport) => generateTokenHubImage(prompt, { ...transport, settings }) }
    : { ...shared, kind: settings.kind, execute: (params, transport) => generateTokenHubImageEdit(params, { ...transport, settings }) };
};
