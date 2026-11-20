import { Tool } from '../types';
import { buildAnnotationCanvas, imageToCanvas } from './fal/media';
import { getSecureBackendApiBaseUrl, getSecureBackendAuthHeaders } from './secureBackendService';
import { workspaceFetch } from './workspaceSession';
import { serializeTokenHubGptImage25Input, type TokenHubGptImage25RunSettings } from './tokenHubGptImage25RunSettings';
import type { FalImageGenerationResult, FalPhaseUpdate, GenerateImageEditParams } from './fal/types';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

export type TokenHubImageTransportOptions = {
  abortSignal?: AbortSignal;
  onPhaseUpdate?: (update: FalPhaseUpdate) => void;
};

export type TokenHubImageRequestOptions<Kind extends 'text_to_image' | 'image_edit'> = TokenHubImageTransportOptions & {
  settings: TokenHubGptImage25RunSettings<Kind>;
};

export class TokenHubImageRequestError extends Error {
  constructor(message: string, readonly requestId?: string) {
    super(message);
    this.name = 'TokenHubImageRequestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const nonemptyText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

export const requestTokenHubImages = async (
  path: '/api/tokenhub/images/generations' | '/api/tokenhub/images/edits',
  payload: Record<string, unknown>,
  options: TokenHubImageTransportOptions,
): Promise<FalImageGenerationResult> => {
  options.abortSignal?.throwIfAborted();
  options.onPhaseUpdate?.({ phase: 'submitting', message: 'Generating with TokenHub; this can take a minute or more...' });
  const response = await workspaceFetch(`${getSecureBackendApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getSecureBackendAuthHeaders() },
    body: JSON.stringify(payload),
    signal: options.abortSignal,
  });
  const body: unknown = await response.json().catch(() => undefined);
  const result = isRecord(body) ? body : undefined;
  const error = isRecord(result?.error) ? result.error : undefined;
  const requestId = nonemptyText(error?.requestID) ?? nonemptyText(result?.request_id);
  if (!response.ok) {
    const statusText = nonemptyText(response.statusText) ?? (response.status === 502 ? 'Bad Gateway' : '');
    const status = `HTTP ${response.status}${statusText ? ` ${statusText}` : ''}`;
    const detail = nonemptyText(result?.detail) ?? nonemptyText(error?.message);
    const message = detail ? `${status}: ${detail}` : `TokenHub image request failed with ${status}.`;
    throw new TokenHubImageRequestError(message, requestId);
  }
  const data = Array.isArray(result?.data) ? result.data : [];
  const images = data.flatMap((item: unknown) => {
    if (!isRecord(item)) return [];
    const base64 = nonemptyText(item.b64_json);
    return base64 ? [{ base64, revisedPrompt: nonemptyText(item.revised_prompt) }] : [];
  });
  if (images.length === 0 || images.length !== data.length) {
    throw new TokenHubImageRequestError('TokenHub returned no base64 image data.', requestId);
  }
  const imagesBase64 = images.map(item => item.base64);
  options.onPhaseUpdate?.({ phase: 'completed', message: 'Image ready', requestId });
  return {
    imageBase64: imagesBase64[0],
    imagesBase64,
    imageDataUrls: imagesBase64.map(image => `${PNG_DATA_URL_PREFIX}${image}`),
    text: images.find(item => item.revisedPrompt)?.revisedPrompt ?? '',
    requestId,
  };
};

export const generateTokenHubImage = (
  prompt: string,
  options: TokenHubImageRequestOptions<'text_to_image'>,
): Promise<FalImageGenerationResult> => requestTokenHubImages('/api/tokenhub/images/generations', {
  prompt,
  ...serializeTokenHubGptImage25Input(options.settings),
}, options);

const imageElementToDataUrl = (image: HTMLImageElement): string => imageToCanvas(image).toDataURL('image/png');

export const generateTokenHubImageEdit = async (
  { prompt, image, tool, paths, imageDimensions, referenceImages }: GenerateImageEditParams,
  options: TokenHubImageRequestOptions<'image_edit'>,
): Promise<FalImageGenerationResult> => {
  options.abortSignal?.throwIfAborted();
  const images = [image, ...(referenceImages ?? [])].map(imageElementToDataUrl);
  const markup = tool === Tool.ANNOTATE
    ? buildAnnotationCanvas(image, paths, imageDimensions, 'transparent').toDataURL('image/png')
    : undefined;
  return requestTokenHubImages('/api/tokenhub/images/edits', {
    prompt,
    images,
    ...(markup ? { markup } : {}),
    ...serializeTokenHubGptImage25Input(options.settings),
  }, options);
};
