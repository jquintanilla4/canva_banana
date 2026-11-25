import { Tool } from '../types';
import { buildAnnotationCanvas, canvasToBlobWithinMaxBytes, imageToCanvas } from './fal/media';
import { parseSeedream55LayerItems } from './fal/seedream55';
import type { FalImageGenerationResult, FalLayerizeResult, FalPhaseOptions, GenerateImageEditParams } from './fal/types';
import { getSeedream55VolcengineSize, SEEDREAM_55_LAYERIZE_MAX_BYTES, validateSeedream55LayerizeDimensions } from './seedream55Config';
import type { Seedream55RunSettings } from './seedream55RunSettings';
import { ensureRealSnapshotFile } from './snapshotService';
import { getVolcengineActionHeaders, getVolcengineApiBaseUrl } from './volcengineService';
import { getWorkspaceSignal, workspaceFetch } from './workspaceSession';

type ImageRequest =
  | { operation: 'text_to_image'; prompt: string }
  | { operation: 'image_edit'; edit: GenerateImageEditParams };

const readImageData = (image: unknown) => {
  if (!image || typeof image !== 'object' || !('b64_json' in image) || typeof image.b64_json !== 'string' || !image.b64_json
    || !('output_format' in image) || (image.output_format !== 'png' && image.output_format !== 'jpeg')) {
    throw new Error('Volcengine returned an invalid Seedream image.');
  }
  return { base64: image.b64_json, dataUrl: `data:image/${image.output_format};base64,${image.b64_json}` };
};

const requestImages = async (body: FormData, options: FalPhaseOptions) => {
  const signal = options.abortSignal ?? getWorkspaceSignal();
  signal?.throwIfAborted();
  const baseUrl = getVolcengineApiBaseUrl();
  options.onPhaseUpdate?.({ phase: 'processing', message: 'Generating image...' });
  const response = await workspaceFetch(`${baseUrl}/api/volcengine/images/generations`, {
    method: 'POST', body, headers: getVolcengineActionHeaders(baseUrl), signal,
  }).catch(error => {
    signal?.throwIfAborted();
    throw new Error(`Seedream 5.5 could not reach the local Volcengine backend at ${baseUrl}.`, { cause: error });
  });
  const result: unknown = await response.json().catch(() => undefined);
  signal?.throwIfAborted();
  if (!response.ok) {
    const detail = result && typeof result === 'object' && 'detail' in result ? result.detail : undefined;
    throw new Error(typeof detail === 'string' ? detail : `Volcengine image request failed (HTTP ${response.status}).`);
  }
  if (!result || typeof result !== 'object' || !('data' in result) || !Array.isArray(result.data) || result.data.length === 0) {
    throw new Error('Volcengine did not return any Seedream images.');
  }
  const requestId = 'requestId' in result && typeof result.requestId === 'string' ? result.requestId : undefined;
  options.onPhaseUpdate?.({ phase: 'downloading', message: 'Preparing generated images...', requestId });
  const images: unknown[] = result.data;
  return { images, requestId };
};

const encodeCanvas = async (canvas: HTMLCanvasElement, layerize: boolean): Promise<Blob> => {
  const blob = await canvasToBlobWithinMaxBytes(canvas, SEEDREAM_55_LAYERIZE_MAX_BYTES, layerize ? ['image/jpeg'] : undefined);
  if (blob.size > SEEDREAM_55_LAYERIZE_MAX_BYTES) throw new Error('Seedream 5.5 (VE) input images must be 30 MB or smaller.');
  return blob;
};

const appendImage = (body: FormData, image: Blob) => {
  const extension = image.type === 'image/jpeg' ? 'jpg' : image.type === 'image/webp' ? 'webp' : 'png';
  body.append('images', image, `image.${extension}`);
};

export const generateVolcengineSeedream55Image = async (
  request: ImageRequest, settings: Seedream55RunSettings, options: FalPhaseOptions = {},
): Promise<FalImageGenerationResult> => {
  const signal = options.abortSignal ?? getWorkspaceSignal();
  signal?.throwIfAborted();
  const body = new FormData();
  body.set('operation', request.operation);
  body.set('prompt', request.operation === 'image_edit' ? request.edit.prompt : request.prompt);
  body.set('size', getSeedream55VolcengineSize(settings.imageSizeSelection));
  body.set('background', settings.background);
  body.set('output_format', settings.outputFormat);
  if (request.operation === 'image_edit') {
    const { image, tool, paths, imageDimensions, referenceImages = [] } = request.edit;
    const annotated = tool === Tool.ANNOTATE;
    if (1 + Number(annotated) + referenceImages.length > 10) throw new Error('Seedream 5.5 (VE) supports up to 10 input images.');
    options.onPhaseUpdate?.({ phase: 'uploading', message: 'Preparing source images...' });
    appendImage(body, await encodeCanvas(imageToCanvas(image), false));
    if (annotated) appendImage(body, await encodeCanvas(buildAnnotationCanvas(image, paths, imageDimensions), false));
    for (const reference of referenceImages) {
      signal?.throwIfAborted();
      appendImage(body, await encodeCanvas(imageToCanvas(reference), false));
    }
  }
  const { images, requestId } = await requestImages(body, { ...options, abortSignal: signal });
  if (images.length !== 1) throw new Error('Volcengine Seedream should return one image per generation or edit.');
  const { base64, dataUrl } = readImageData(images[0]);
  return { requestId, imageBase64: base64, imagesBase64: [base64], imageDataUrls: [dataUrl], text: '' };
};

export const layerizeVolcengineSeedream55Image = async (
  { image, sourceFile, prompt }: { image: HTMLImageElement; sourceFile?: File; prompt: string },
  options: FalPhaseOptions = {},
): Promise<FalLayerizeResult> => {
  const signal = options.abortSignal ?? getWorkspaceSignal();
  signal?.throwIfAborted();
  validateSeedream55LayerizeDimensions(image);
  const body = new FormData();
  body.set('operation', 'layerize');
  body.set('prompt', prompt);
  options.onPhaseUpdate?.({ phase: 'uploading', message: 'Preparing source image...' });
  const source = sourceFile && ['image/png', 'image/jpeg'].includes(sourceFile.type) && sourceFile.size <= SEEDREAM_55_LAYERIZE_MAX_BYTES
    ? await ensureRealSnapshotFile(sourceFile)
    : await encodeCanvas(imageToCanvas(image), true);
  appendImage(body, source);
  const { images, requestId } = await requestImages(body, { ...options, abortSignal: signal });
  const layers = parseSeedream55LayerItems(images, item => readImageData(item).dataUrl);
  return { requestId, layers: layers.map(({ url: dataUrl, bounds, name }) => ({ dataUrl, bounds, ...(name ? { name } : {}) })) };
};
