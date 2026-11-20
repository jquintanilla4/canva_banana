import { Tool } from '../types';
import { mapWithConcurrency } from '../utils/mapWithConcurrency';
import { buildAnnotationCanvas, imageToCanvas } from './fal/media';
import type { FalImageGenerationResult, GenerateImageEditParams } from './fal/types';
import { requestTokenHubImages, TokenHubImageRequestError, type TokenHubImageTransportOptions } from './tokenHubImageService';
import { serializeTokenHubNanoBananaInput, type TokenHubNanoBananaRunSettings } from './tokenHubNanoBananaRunSettings';
import { getWorkspaceSignal } from './workspaceSession';

type TokenHubNanoBananaRequestOptions<Kind extends 'text_to_image' | 'image_edit'> = TokenHubImageTransportOptions & {
  settings: TokenHubNanoBananaRunSettings<Kind>;
};

export const generateTokenHubNanoBanana = async (
  prompt: string,
  options: TokenHubNanoBananaRequestOptions<'text_to_image'>,
): Promise<FalImageGenerationResult> => {
  const payload = {
    prompt,
    ...serializeTokenHubNanoBananaInput(options.settings),
    n: 1,
  };
  const count = options.settings.numImages ?? 1;
  if (count === 1) return requestTokenHubImages('/api/tokenhub/images/generations', payload, options, 'image/jpeg');
  const signals = [options.abortSignal, getWorkspaceSignal()].filter((signal): signal is AbortSignal => signal !== undefined);
  const abortSignal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
  abortSignal?.throwIfAborted();
  options.onPhaseUpdate?.({ phase: 'submitting', message: `Generating ${count} images with TokenHub; this can take a minute or more...` });
  const outcomes = await mapWithConcurrency(Array.from({ length: count }), 2, async () => {
    abortSignal?.throwIfAborted();
    try {
      const result = await requestTokenHubImages('/api/tokenhub/images/generations', payload, { abortSignal }, 'image/jpeg');
      return { kind: 'success', result } as const;
    } catch (error: unknown) {
      abortSignal?.throwIfAborted();
      return { kind: 'failure', error } as const;
    }
  });
  abortSignal?.throwIfAborted();
  const results = outcomes.flatMap(outcome => outcome.kind === 'success' ? [outcome.result] : []);
  const first = results[0];
  if (!first) {
    const failure = outcomes.find(outcome => outcome.kind === 'failure');
    throw failure?.error ?? new TokenHubImageRequestError('TokenHub returned no base64 image data.');
  }
  const imagesBase64 = results.flatMap(result => result.imagesBase64 ?? [result.imageBase64]).slice(0, count);
  options.onPhaseUpdate?.({
    phase: 'completed', message: `${imagesBase64.length} of ${count} images ready`, requestId: first.requestId,
  });
  return {
    imageBase64: first.imageBase64,
    imagesBase64,
    imageDataUrls: imagesBase64.map(image => `data:image/jpeg;base64,${image}`),
    text: results.find(result => result.text)?.text ?? '',
    requestId: first.requestId,
  };
};

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
  }, options, 'image/jpeg');
};
