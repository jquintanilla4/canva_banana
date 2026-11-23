import type { CanvasRect } from '../../types';
import { SEEDREAM_55_ENDPOINTS } from '../seedream55Config';
import { resolveSeedream55RunSettings, type Seedream55RunSettings } from '../seedream55RunSettings';
import { getWorkspaceSignal } from '../workspaceSession';
import { ensureFalClientConfigured } from './client';
import { uploadBlobToFal, uploadImageElementToFal } from './media';
import { ensureRealSnapshotFile } from '../snapshotService';
import { mapWithConcurrency } from '../../utils/mapWithConcurrency';
import { emitFalPhase } from './phase';
import { subscribeFalImage } from './queue';
import { extractInlineData, runFalDownloadStep } from './responses';
import type { FalLayerizeResult, GenerateImageOptions, LayerizeSeedream55Options } from './types';

type Seedream55ImageRunKind = 'text_to_image' | 'image_edit';
type Seedream55RequestOptions = Pick<GenerateImageOptions, 'imageSize' | 'numImages' | 'seedream55Background' | 'seedream55OutputFormat'> & {
  seedream55RunSettings?: Seedream55RunSettings<Seedream55ImageRunKind>;
};
export function resolveSeedream55SettingsForRequest(kind: 'text_to_image', options: Seedream55RequestOptions): Seedream55RunSettings<'text_to_image'>;
export function resolveSeedream55SettingsForRequest(kind: 'image_edit', options: Seedream55RequestOptions): Seedream55RunSettings<'image_edit'>;
export function resolveSeedream55SettingsForRequest(kind: Seedream55ImageRunKind, options: Seedream55RequestOptions): Seedream55RunSettings<Seedream55ImageRunKind> {
  const settings = options.seedream55RunSettings;
  if (settings) {
    if (settings.kind !== kind) throw new Error('Seedream 5.5 settings do not match the requested operation.');
    return settings;
  }
  return resolveSeedream55RunSettings(kind, {
    imageSizeSelection: options.imageSize, numImages: options.numImages,
    seedream55Background: options.seedream55Background, seedream55OutputFormat: options.seedream55OutputFormat,
  });
}
export const serializeSeedream55Input = (settings: Seedream55RunSettings<Seedream55ImageRunKind>) => ({
  image_size: settings.imageSizeSelection, num_images: settings.numImages,
  background: settings.background, output_format: settings.outputFormat, sync_mode: false,
});

interface Seedream55Layer {
  url: string;
  zIndex: number;
  bounds: CanvasRect | null;
  name?: string;
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseLayerBounds = (value: unknown): CanvasRect => {
  if (!isRecord(value) || !Array.isArray(value.absolute) || value.absolute.length !== 4) throw new Error('Seedream 5.5 returned a layer without valid absolute bounds.');
  const [left, top, right, bottom]: unknown[] = value.absolute;
  if (typeof left !== 'number' || typeof top !== 'number' || typeof right !== 'number' || typeof bottom !== 'number'
    || ![left, top, right, bottom].every(Number.isInteger) || left < 0 || top < 0 || right <= left || bottom <= top) {
    throw new Error('Seedream 5.5 returned malformed layer bounds.');
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
};
export const parseSeedream55Layers = (data: unknown): Seedream55Layer[] => {
  if (!isRecord(data) || !Array.isArray(data.layers) || data.layers.length === 0) throw new Error('Seedream 5.5 did not return layers.');
  const layers = data.layers.map((value: unknown): Seedream55Layer => {
    if (!isRecord(value) || !isRecord(value.image) || typeof value.image.url !== 'string' || !value.image.url.trim()
      || typeof value.z_index !== 'number' || !Number.isInteger(value.z_index) || value.z_index < 0) {
      throw new Error('Seedream 5.5 returned a malformed layer.');
    }
    return {
      url: value.image.url, zIndex: value.z_index,
      bounds: value.z_index === 0 ? null : parseLayerBounds(value.bounding_box),
      ...(typeof value.name === 'string' && value.name.trim() ? { name: value.name.trim() } : {}),
    };
  }).sort((first, second) => first.zIndex - second.zIndex);
  if (layers[0]?.zIndex !== 0 || new Set(layers.map(layer => layer.zIndex)).size !== layers.length) throw new Error('Seedream 5.5 returned invalid layer stacking order.');
  return layers;
};

export const layerizeSeedream55Image = async (
  { image, sourceFile, prompt }: { image: HTMLImageElement; sourceFile?: File; prompt: string },
  suppliedOptions: LayerizeSeedream55Options = {},
): Promise<FalLayerizeResult> => {
  const options = { ...suppliedOptions, abortSignal: suppliedOptions.abortSignal ?? getWorkspaceSignal() };
  options.abortSignal?.throwIfAborted();
  const { naturalWidth: width, naturalHeight: height } = image;
  const pixels = width * height;
  if (pixels < 512 ** 2 || pixels > 6000 ** 2 || width > 16 * height || height > 16 * width) {
    throw new Error('Resize the image to between 262,144 and 36,000,000 total pixels with an aspect ratio between 1:16 and 16:1 to use Layerize.');
  }
  ensureFalClientConfigured();
  const uploadOptions = {
    ...options, label: 'source image', maxBytes: 30_000_000,
    maxBytesError: 'Seedream 5.5 Layerize input must be 30 MB or smaller.',
  };
  const originalTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
  const imageUrl = sourceFile && originalTypes.includes(sourceFile.type) && sourceFile.size <= uploadOptions.maxBytes
    ? await uploadBlobToFal(await ensureRealSnapshotFile(sourceFile), uploadOptions)
    : await uploadImageElementToFal(image, uploadOptions);
  const modelId = SEEDREAM_55_ENDPOINTS.layerize;
  const input = { image_url: imageUrl, ...(prompt.trim() ? { prompt: prompt.trim() } : {}) };
  const result = await subscribeFalImage(modelId, input, options);
  const requestId = result.requestId;
  const layers = await runFalDownloadStep(requestId, async () => parseSeedream55Layers(result.data));
  emitFalPhase(options, modelId, { phase: 'downloading', message: 'Downloading generated layers...', requestId });
  const downloads = new AbortController();
  const downloadSignal = options.abortSignal ? AbortSignal.any([options.abortSignal, downloads.signal]) : downloads.signal;
  const downloadedLayers = await runFalDownloadStep(requestId, () => mapWithConcurrency(layers, 3, async layer => {
    downloadSignal.throwIfAborted();
    const dataUrl = await extractInlineData(layer.url, downloadSignal).catch(error => {
      downloads.abort(error);
      throw error;
    });
    return { dataUrl, bounds: layer.bounds, ...(layer.name ? { name: layer.name } : {}) };
  }));
  return { requestId, layers: downloadedLayers };
};
