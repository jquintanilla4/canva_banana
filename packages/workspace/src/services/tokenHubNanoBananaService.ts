import { Tool } from '../types';
import { buildAnnotationCanvas, imageToCanvas } from './fal/media';
import type { FalImageGenerationResult, GenerateImageEditParams } from './fal/types';
import { requestTokenHubImages, type TokenHubImageTransportOptions } from './tokenHubImageService';
import { serializeTokenHubNanoBananaInput, type TokenHubNanoBananaRunSettings } from './tokenHubNanoBananaRunSettings';

type TokenHubNanoBananaRequestOptions<Kind extends 'text_to_image' | 'image_edit'> = TokenHubImageTransportOptions & {
  settings: TokenHubNanoBananaRunSettings<Kind>;
};

export const generateTokenHubNanoBanana = (
  prompt: string,
  options: TokenHubNanoBananaRequestOptions<'text_to_image'>,
): Promise<FalImageGenerationResult> => requestTokenHubImages('/api/tokenhub/images/generations', {
  prompt,
  ...serializeTokenHubNanoBananaInput(options.settings),
}, options);

const imageElementToDataUrl = (image: HTMLImageElement): string => imageToCanvas(image).toDataURL('image/png');

export const generateTokenHubNanoBananaEdit = async (
  { prompt, image, tool, paths, imageDimensions, referenceImages }: GenerateImageEditParams,
  options: TokenHubNanoBananaRequestOptions<'image_edit'>,
): Promise<FalImageGenerationResult> => {
  options.abortSignal?.throwIfAborted();
  const images = [imageElementToDataUrl(image)];
  if (tool === Tool.ANNOTATE) {
    images.push(buildAnnotationCanvas(image, paths, imageDimensions, 'composite').toDataURL('image/png'));
  }
  images.push(...(referenceImages ?? []).map(imageElementToDataUrl));
  return requestTokenHubImages('/api/tokenhub/images/edits', {
    prompt,
    images: images.reverse(),
    ...serializeTokenHubNanoBananaInput(options.settings),
  }, options);
};
