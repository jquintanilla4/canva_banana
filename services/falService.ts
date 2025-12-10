import { fal } from '@fal-ai/client';
import {
  Tool,
  Path,
  ImageDimensions,
  InpaintMode,
  FalImageSizeOption,
  FalAspectRatioOption,
  FalResolutionOption,
  FalVideoDuration,
} from '../types';
import { addDebugLog } from './debugLog';

// Wrapper around @fal-ai/client that normalizes queue updates and surfaces debug logs for the UI.
interface GenerateImageEditParams {
  prompt: string;
  image: HTMLImageElement;
  tool: Tool;
  paths: Path[];
  imageDimensions: ImageDimensions;
  inpaintMode: InpaintMode;
  referenceImages?: HTMLImageElement[];
}

const ensureFalApiKey = () => {
  const key = process.env.FAL_API_KEY;
  if (!key) {
    throw new Error('FAL_API_KEY environment variable is not set');
  }
  return key;
};

type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'CANCELED';

type FalQueueLogs = Array<{ message?: string }> | Record<string, unknown> | string | undefined;

export interface FalQueueUpdate {
  requestId?: string;
  status: FalQueueStatus;
  position?: number;
  eta?: number;
  logs?: FalQueueLogs;
  [key: string]: unknown;
}

const normalizeQueueLogs = (logs: FalQueueLogs): Array<{ message?: string }> => {
  if (!logs) {
    return [];
  }
  if (Array.isArray(logs)) {
    return logs
      .map(entry => {
        if (typeof entry === 'string') {
          return { message: entry };
        }
        if (entry && typeof entry === 'object') {
          const message = (entry as { message?: unknown }).message;
          return typeof message === 'string' ? { message } : entry as { message?: string };
        }
        return null;
      })
      .filter(Boolean) as Array<{ message?: string }>;
  }
  if (typeof logs === 'object') {
    return Object.values(logs)
      .flatMap(value => normalizeQueueLogs(value as FalQueueLogs));
  }
  if (typeof logs === 'string') {
    return [{ message: logs }];
  }
  return [];
};

const resolveQueueRequestId = (update: FalQueueUpdate, fallback?: string): string | undefined => {
  const requestId = typeof update.requestId === 'string'
    ? update.requestId
    : typeof (update as { request_id?: unknown }).request_id === 'string'
      ? (update as { request_id?: string }).request_id
      : undefined;
  return requestId || fallback;
};

interface GenerateImageEditOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  modelId?: string;
  imageSize?: FalImageSizeOption;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  resolution?: FalResolutionOption;
}

interface GenerateImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  modelId?: string;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  imageSize?: FalImageSizeOption;
  seed?: number;
  resolution?: FalResolutionOption;
  referenceImages?: HTMLImageElement[];
}

interface UpscaleImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
}

interface GenerateVideoOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  promptOptimizer?: boolean;
  modelId?: string;
  duration?: FalVideoDuration;
  negativePrompt?: string;
  cfgScale?: number;
  tailImage?: HTMLImageElement;
  generateAudio?: boolean;
  referenceImages?: HTMLImageElement[];
  elementImages?: HTMLImageElement[];
  klingO1Variant?: string;
  sourceVideoUrl?: string;
  keepAudio?: boolean;
}

const GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID = 'fal-ai/gemini-3-pro-image-preview/edit';
const GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/gemini-3-pro-image-preview';
const LEGACY_NANO_BANANA_EDIT_MODEL_ID = 'fal-ai/nano-banana/edit';
const LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana';

const normalizeModelId = (modelId: string | undefined): string | undefined => {
  if (modelId === LEGACY_NANO_BANANA_EDIT_MODEL_ID) {
    return GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
  }
  if (modelId === LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID) {
    return GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID;
  }
  return modelId;
};

const FAL_MODEL_ID = normalizeModelId(process.env.FAL_MODEL_ID) || GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID;
const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit';
const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image';
const SEEDREAM_V45_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/edit';
const SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4.5/text-to-image';
const SEEDREAM_EDIT_MODEL_IDS = [SEEDREAM_MODEL_ID, SEEDREAM_V45_MODEL_ID] as const;
type SeedreamEditModelId = typeof SEEDREAM_EDIT_MODEL_IDS[number];
const isSeedreamEditModelId = (modelId: string | undefined): modelId is SeedreamEditModelId =>
  !!modelId && (SEEDREAM_EDIT_MODEL_IDS as readonly string[]).includes(modelId);
const SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS = [SEEDREAM_TEXT_TO_IMAGE_MODEL_ID, SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID] as const;
const isSeedreamTextToImageModelId = (modelId: string | undefined): boolean =>
  !!modelId && (SEEDREAM_TEXT_TO_IMAGE_MODEL_IDS as readonly string[]).includes(modelId);
const isSeedreamV45ModelId = (modelId: string | undefined): boolean =>
  modelId === SEEDREAM_V45_MODEL_ID || modelId === SEEDREAM_V45_TEXT_TO_IMAGE_MODEL_ID;
const SEEDREAM_CUSTOM_SIZE_MAP = {
  '1280x720': { width: 1280, height: 720 },
  '1920x1080': { width: 1920, height: 1080 },
} as const;
type SeedreamCustomSizeKey = keyof typeof SEEDREAM_CUSTOM_SIZE_MAP;
const isSeedreamCustomSize = (value: unknown): value is SeedreamCustomSizeKey =>
  value === '1280x720' || value === '1920x1080';
const getSeedreamCustomSize = (value: string | undefined) =>
  isSeedreamCustomSize(value) ? SEEDREAM_CUSTOM_SIZE_MAP[value] : undefined;
const resolveSeedreamCustomSizeForModel = (
  modelId: string | undefined,
  imageSizeOption: FalImageSizeOption | FalAspectRatioOption,
): { width: number; height: number } | undefined => {
  if (isSeedreamV45ModelId(modelId)) {
    return undefined;
  }
  const baseSize = getSeedreamCustomSize(imageSizeOption);
  if (!baseSize) {
    return undefined;
  }
  return baseSize;
};
const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image';
const KLING_IMAGE_MODEL_ID = 'fal-ai/kling-image/o1';
const CRYSTAL_UPSCALER_MODEL_ID = 'clarityai/crystal-upscaler';
const SEEDVR_UPSCALER_MODEL_ID = 'fal-ai/seedvr/upscale/image';
export const HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video';
export const HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video';
export const HAILUO_IMAGE_TO_VIDEO_MODEL_ID = HAILUO_IMAGE_TO_VIDEO_PRO_MODEL_ID;
export const KLING_IMAGE_TO_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/image-to-video';
export const KLING_IMAGE_TO_VIDEO_STANDARD_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video';
export const KLING_IMAGE_TO_VIDEO_PRO_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
export const KLING_26_IMAGE_TO_VIDEO_MODEL_ID = 'fal-ai/kling-video/v2.6/pro/image-to-video';
export const KLING_O1_REFERENCE_TO_VIDEO_MODEL_ID = 'fal-ai/kling-video/o1/reference-to-video';
export const KLING_O1_VIDEO_EDIT_MODEL_ID = 'fal-ai/kling-video/o1/video-to-video/edit';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && Object.getPrototypeOf(value) === Object.prototype;
};

const summarizeLogValue = (value: unknown, depth = 0): unknown => {
  if (depth > 2) {
    return '[nested]';
  }
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      return '[data-uri]';
    }
    const trimmed = value.trim();
    if (trimmed.length > 160) {
      return `${trimmed.slice(0, 157)}…`;
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const summarized = value.slice(0, 5).map(entry => summarizeLogValue(entry, depth + 1));
    if (value.length > 5) {
      summarized.push(`…(+${value.length - 5} more)`);
    }
    return summarized;
  }
  if (value instanceof Blob) {
    return `[Blob size=${value.size}]`;
  }
  if (typeof File !== 'undefined' && value instanceof File) {
    return `[File name=${value.name} size=${value.size}]`;
  }
  if (typeof URL !== 'undefined' && value instanceof URL) {
    return value.toString();
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const summarized: Record<string, unknown> = {};
    entries.slice(0, 10).forEach(([key, entryValue]) => {
      summarized[key] = summarizeLogValue(entryValue, depth + 1);
    });
    if (entries.length > 10) {
      summarized.__truncated = `+${entries.length - 10} more keys`;
    }
    return summarized;
  }
  return String(value);
};

const summarizeForLog = (payload?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!payload) {
    return undefined;
  }
  const summary: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    summary[key] = summarizeLogValue(value);
  });
  return summary;
};

const logFalEvent = (
  direction: 'outbound' | 'inbound' | 'info' | 'error',
  endpointId: string,
  message: string,
  payload?: Record<string, unknown>,
) => {
  addDebugLog({
    direction,
    source: 'fal',
    title: endpointId,
    message,
    data: summarizeForLog(payload),
  });
};

const createRandomSeed = (): number => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
};

let falConfigured = false;

const ensureFalClientConfigured = () => {
  const key = ensureFalApiKey();
  if (!falConfigured) {
    const proxyUrl = process.env.FAL_API_URL;
    fal.config({
      credentials: key,
      suppressLocalCredentialsWarning: true,
      ...(proxyUrl ? { proxyUrl } : {}),
    });
    falConfigured = true;
  }
};

const imageToCanvas = (image: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create canvas context');
  }
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string = 'image/png'): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to Blob.'));
        return;
      }
      resolve(blob);
    }, mimeType);
  });
};

const uploadCanvasToFal = async (canvas: HTMLCanvasElement): Promise<string> => {
  const blob = await canvasToBlob(canvas);
  return fal.storage.upload(blob);
};

const createTransparentPlaceholderUrl = async (): Promise<string> => {
  const canvas = document.createElement('canvas');
  // Kling O1 enforces a minimum 300px dimension for each reference image,
  // so we generate a sufficiently large transparent placeholder.
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create placeholder image.');
  }
  ctx.clearRect(0, 0, size, size);
  return uploadCanvasToFal(canvas);
};

const uploadImageElementToFal = async (image: HTMLImageElement): Promise<string> => {
  const canvas = imageToCanvas(image);
  return uploadCanvasToFal(canvas);
};

// Upload a video file to FAL storage and return the URL
export const uploadVideoToFal = async (videoFile: File): Promise<string> => {
  ensureFalClientConfigured();
  return fal.storage.upload(videoFile);
};

const buildAnnotationCanvas = (baseImage: HTMLImageElement, paths: Path[], dimensions: ImageDimensions) => {
  const canvas = document.createElement('canvas');
  const width = dimensions.width || baseImage.naturalWidth || baseImage.width || 1;
  const height = dimensions.height || baseImage.naturalHeight || baseImage.height || 1;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create annotation canvas context');
  }

  const baseWidth = baseImage.naturalWidth || baseImage.width || width;
  const baseHeight = baseImage.naturalHeight || baseImage.height || height;
  ctx.drawImage(baseImage, 0, 0, baseWidth, baseHeight);

  paths.forEach(path => {
    if (path.points.length === 0) return;

    ctx.lineWidth = path.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (path.tool === Tool.ERASE) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = path.color;
    }

    ctx.beginPath();
    path.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  });

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
};

const buildMaskCanvas = (paths: Path[], dimensions: ImageDimensions) => {
  const canvas = document.createElement('canvas');
  const width = dimensions.width || 1;
  const height = dimensions.height || 1;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create mask canvas context');
  }

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  paths.forEach(path => {
    if (path.points.length === 0) return;

    if (path.tool === Tool.ERASE) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'white';
    }

    ctx.lineWidth = path.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  });

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
};

const collectReferenceUploadUrls = async (referenceImages: HTMLImageElement[] = []) => {
  return Promise.all(referenceImages.map(img => uploadImageElementToFal(img)));
};

const FAL_HOSTED_URL_REGEX = /^https?:\/\/[^/]*fal\.(ai|run)\b/i;

const extractInlineData = async (url: string): Promise<string> => {
  if (url.startsWith('data:')) {
    return url;
  }

  const requestOptions: RequestInit = {};

  if (FAL_HOSTED_URL_REGEX.test(url)) {
    requestOptions.headers = {
      Authorization: `Key ${ensureFalApiKey()}`,
    };
    logFalEvent('outbound', 'fal-storage', 'Fetching hosted image', { url });
  }

  let response: Response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    if (FAL_HOSTED_URL_REGEX.test(url)) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch image from Fal.ai response. ${message}`);
  }

  if (!response.ok) {
    if (FAL_HOSTED_URL_REGEX.test(url)) {
      logFalEvent('error', 'fal-storage', 'Failed to fetch hosted image', {
        url,
        status: response.status,
      });
    }
    throw new Error(`Failed to download image from Fal.ai response. HTTP ${response.status}`);
  }
  if (FAL_HOSTED_URL_REGEX.test(url)) {
    logFalEvent('inbound', 'fal-storage', 'Fetched hosted image', {
      url,
      status: response.status,
    });
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to read image blob.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
};

export const generateImageEdit = async ({
  prompt,
  image,
  tool,
  paths,
  imageDimensions,
  inpaintMode,
  referenceImages,
}: GenerateImageEditParams, options: GenerateImageEditOptions = {}): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrls: string[] = [];

  const baseImageUrl = await uploadImageElementToFal(image);
  imageUrls.push(baseImageUrl);

  if (tool === Tool.ANNOTATE) {
    const annotationCanvas = buildAnnotationCanvas(image, paths, imageDimensions);
    imageUrls.push(await uploadCanvasToFal(annotationCanvas));
  } else if (tool === Tool.INPAINT) {
    const maskCanvas = buildMaskCanvas(paths, imageDimensions);
    const maskUrl = await uploadCanvasToFal(maskCanvas);
    const modePrefix = inpaintMode === 'STRICT' ? '[REPLACE_ONLY_MASKED_REGION] ' : '';
    prompt = `${modePrefix}${prompt}`;
    imageUrls.push(maskUrl);
  }

  if (referenceImages && referenceImages.length > 0) {
    const referenceUrls = await collectReferenceUploadUrls(referenceImages);
    imageUrls.push(...referenceUrls);
  }

  const modelId = normalizeModelId(options.modelId) || FAL_MODEL_ID;
  const isSeedreamModel = isSeedreamEditModelId(modelId);
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption =
    isSeedreamModel && isSeedreamV45ModelId(modelId) && isSeedreamCustomSize(rawImageSizeOption)
      ? 'default'
      : rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamModel
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;
  const numImagesOption = options.numImages;
  const resolutionOption: FalResolutionOption = options.resolution ?? '1K';
  const isKlingModel = modelId === KLING_IMAGE_MODEL_ID;
  const normalizedResolutionOption: FalResolutionOption = isKlingModel && resolutionOption === '4K' ? '2K' : resolutionOption;

  const body: {
    prompt: string;
    image_urls: string[];
    output_format?: 'png';
    sync_mode: boolean;
    image_size?: { width: number; height: number } | string;
    num_images?: number;
    aspect_ratio?: string;
    resolution?: FalResolutionOption;
  } = {
    prompt,
    image_urls: imageUrls,
    sync_mode: !isSeedreamModel,
  };

  if (!isSeedreamModel) {
    body.output_format = 'png';
  }

  let latestRequestId: string | undefined;

  if (isSeedreamModel) {
    if (seedreamCustomSize) {
      body.image_size = seedreamCustomSize;
    } else if (imageSizeOption === 'default') {
      body.image_size = {
        width: imageDimensions.width,
        height: imageDimensions.height,
      };
    } else {
      body.image_size = imageSizeOption;
    }
  } else if (modelId === GEMINI_IMAGE_PREVIEW_EDIT_MODEL_ID || isKlingModel) {
    if (aspectRatioOption !== 'default') {
      body.aspect_ratio = aspectRatioOption;
    }
    body.resolution = isKlingModel ? normalizedResolutionOption : resolutionOption;
  }

  if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
    const normalized = Math.min(4, Math.max(1, Math.floor(numImagesOption)));
    if (normalized >= 1) {
      body.num_images = normalized;
    }
  }

  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', { input: body });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: body,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', modelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', modelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { images?: Array<{ url: string }>; description?: string } | undefined;
  const images = data?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai API did not return an image.');
  }

  const inlineDataList = await Promise.all(images.map(image => extractInlineData(image.url)));
  const base64List = inlineDataList.map(dataUrl => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      throw new Error('Failed to extract image data from Fal.ai response.');
    }
    return base64;
  });

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract image data from Fal.ai response.');
  }

  const description: string = typeof data?.description === 'string' ? data.description : '';

  const requestId = result?.requestId || latestRequestId;

  return { imageBase64: primaryBase64, imagesBase64: base64List, text: description, requestId };
};

export const upscaleCrystalImage = async (
  image: HTMLImageElement,
  scaleFactor: number,
  creativity: number,
  options: UpscaleImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image);
  const sanitizedScale = Number.isFinite(scaleFactor) ? Math.round(scaleFactor) : 2;
  const normalizedScale = Math.min(200, Math.max(1, sanitizedScale));
  const sanitizedCreativity = Number.isFinite(creativity) ? creativity : 0;
  const roundedCreativity = Math.round(sanitizedCreativity * 2) / 2;
  const normalizedCreativity = Math.min(10, Math.max(0, roundedCreativity));

  let latestRequestId: string | undefined;

  logFalEvent('outbound', CRYSTAL_UPSCALER_MODEL_ID, 'Outbound request (fal.subscribe)', {
    input: {
      image_url: imageUrl,
      scale_factor: normalizedScale,
      creativity: normalizedCreativity,
    },
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(CRYSTAL_UPSCALER_MODEL_ID, {
      input: {
        image_url: imageUrl,
        scale_factor: normalizedScale,
        creativity: normalizedCreativity,
      },
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        logFalEvent('inbound', CRYSTAL_UPSCALER_MODEL_ID, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', CRYSTAL_UPSCALER_MODEL_ID, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', CRYSTAL_UPSCALER_MODEL_ID, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { images?: Array<string | { url: string }> } | undefined;
  const images = data?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai Crystal Upscaler did not return an image.');
  }

  const imageUrls = images.map(imageEntry => {
    if (typeof imageEntry === 'string') {
      return imageEntry;
    }
    if (imageEntry && typeof imageEntry.url === 'string') {
      return imageEntry.url;
    }
    throw new Error('Unexpected image reference returned by Fal.ai Crystal Upscaler.');
  });

  const inlineDataList = await Promise.all(imageUrls.map(url => extractInlineData(url)));
  const base64List = inlineDataList.map(dataUrl => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      throw new Error('Failed to extract image data from Fal.ai Crystal Upscaler response.');
    }
    return base64;
  });

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract primary image data from Fal.ai Crystal Upscaler response.');
  }

  const requestId = result?.requestId || latestRequestId;

  return {
    imageBase64: primaryBase64,
    imagesBase64: base64List,
    text: '',
    requestId,
  };
};

export const upscaleSeedvrImage = async (
  image: HTMLImageElement,
  scaleFactor: number,
  noiseScale: number,
  options: UpscaleImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image);
  const sanitizedScale = Number.isFinite(scaleFactor) ? Math.round(scaleFactor) : 2;
  const normalizedScale = Math.min(10, Math.max(1, sanitizedScale));
  const sanitizedNoise = Number.isFinite(noiseScale) ? noiseScale : 0.1;
  const roundedNoise = Math.round(sanitizedNoise * 10) / 10;
  const normalizedNoise = Math.min(1, Math.max(0.1, roundedNoise));
  const seedValue = createRandomSeed();

  let latestRequestId: string | undefined;

  const inputPayload = {
    image_url: imageUrl,
    upscale_mode: 'factor',
    upscale_factor: normalizedScale,
    noise_scale: normalizedNoise,
    output_format: 'png' as const,
    seed: seedValue,
  };

  logFalEvent('outbound', SEEDVR_UPSCALER_MODEL_ID, 'Outbound request (fal.subscribe)', {
    input: inputPayload,
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(SEEDVR_UPSCALER_MODEL_ID, {
      input: inputPayload,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        logFalEvent('inbound', SEEDVR_UPSCALER_MODEL_ID, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', SEEDVR_UPSCALER_MODEL_ID, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', SEEDVR_UPSCALER_MODEL_ID, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { image?: string | { url?: string } } | undefined;
  const imageEntry = data?.image;
  if (!imageEntry) {
    throw new Error('SeedVR2 Upscaler did not return an image.');
  }

  const upscaledUrl = typeof imageEntry === 'string'
    ? imageEntry
    : typeof imageEntry.url === 'string'
      ? imageEntry.url
      : null;

  if (!upscaledUrl) {
    throw new Error('Unexpected image reference returned by SeedVR2 Upscaler.');
  }

  const inlineData = await extractInlineData(upscaledUrl);
  const base64 = inlineData.split(',')[1];
  if (!base64) {
    throw new Error('Failed to extract image data from SeedVR2 Upscaler response.');
  }

  const requestId = result?.requestId || latestRequestId;

  return {
    imageBase64: base64,
    imagesBase64: [base64],
    text: '',
    requestId,
  };
};

interface RemoveBackgroundOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
}

export const generateImage = async (
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const modelId = normalizeModelId(options.modelId) || GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID;
  const isSeedreamTextToImage = isSeedreamTextToImageModelId(modelId);
  const isGeminiTextToImage = modelId === GEMINI_IMAGE_PREVIEW_TEXT_TO_IMAGE_MODEL_ID;
  const isKlingTextToImage = modelId === KLING_IMAGE_MODEL_ID;
  const supportsAspectRatio = isGeminiTextToImage || modelId === REVE_TEXT_TO_IMAGE_MODEL_ID || isKlingTextToImage;
  const supportsResolution = isGeminiTextToImage || isKlingTextToImage;
  const numImagesOption = options.numImages;
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption =
    isSeedreamTextToImage && isSeedreamV45ModelId(modelId) && isSeedreamCustomSize(rawImageSizeOption)
      ? 'default'
      : rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamTextToImage
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;
  const resolutionOption: FalResolutionOption = options.resolution ?? '1K';
  const normalizedResolutionOption: FalResolutionOption = isKlingTextToImage && resolutionOption === '4K' ? '2K' : resolutionOption;
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : [];
  const shouldSendReferenceImages = isKlingTextToImage;

  const body: {
    prompt: string;
    sync_mode: boolean;
    output_format?: 'png';
    num_images?: number;
    aspect_ratio?: string;
    image_size?: { width: number; height: number } | string;
    seed?: number;
    resolution?: FalResolutionOption;
    image_urls?: string[];
  } = {
    prompt,
    sync_mode: !isSeedreamTextToImage,
  };

  if (!isSeedreamTextToImage) {
    body.output_format = 'png';
  }

  if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
    const normalized = Math.min(4, Math.max(1, Math.floor(numImagesOption)));
    if (normalized >= 1) {
      body.num_images = normalized;
    }
  }

  if (isSeedreamTextToImage) {
    const seedOption = Number.isFinite(options.seed) ? Math.floor(options.seed as number) : createRandomSeed();
    body.seed = seedOption;
    if (seedreamCustomSize) {
      body.image_size = seedreamCustomSize;
    } else if (imageSizeOption !== 'default') {
      body.image_size = imageSizeOption;
    }
  } else if (isGeminiTextToImage || isKlingTextToImage) {
    if (aspectRatioOption !== 'default') {
      body.aspect_ratio = aspectRatioOption;
    }
    if (supportsResolution) {
      body.resolution = isKlingTextToImage ? normalizedResolutionOption : resolutionOption;
    }
  } else if (supportsAspectRatio && aspectRatioOption !== 'default') {
    body.aspect_ratio = aspectRatioOption;
  }

  if (shouldSendReferenceImages) {
    let referenceUrls: string[] = [];
    if (referenceImages.length > 0) {
      referenceUrls = await collectReferenceUploadUrls(referenceImages);
    }
    if (referenceUrls.length === 0) {
      referenceUrls = [await createTransparentPlaceholderUrl()];
    }
    body.image_urls = referenceUrls;
  }

  let latestRequestId: string | undefined;

  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', { input: body });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: body,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', modelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', modelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { images?: Array<{ url: string }>; description?: string } | undefined;
  const images = data?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai API did not return an image.');
  }

  const inlineDataList = await Promise.all(images.map(image => extractInlineData(image.url)));
  const base64List = inlineDataList.map(dataUrl => {
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      throw new Error('Failed to extract image data from Fal.ai response.');
    }
    return base64;
  });

  const [primaryBase64] = base64List;
  if (!primaryBase64) {
    throw new Error('Failed to extract image data from Fal.ai response.');
  }

  const description: string = typeof data?.description === 'string' ? data.description : '';

  const requestId = result?.requestId || latestRequestId;

  return { imageBase64: primaryBase64, imagesBase64: base64List, text: description, requestId };
};

export const generateImageToVideo = async (
  prompt: string,
  image: HTMLImageElement | null,
  options: GenerateVideoOptions = {},
): Promise<{ videoUrl: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const modelId = options.modelId || HAILUO_IMAGE_TO_VIDEO_STANDARD_MODEL_ID;
  const duration = options.duration;
  const isKlingO1VideoModel = modelId === KLING_O1_REFERENCE_TO_VIDEO_MODEL_ID || modelId === KLING_O1_VIDEO_EDIT_MODEL_ID;
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : [];
  const elementImages = Array.isArray(options.elementImages) ? options.elementImages : [];
  const isEditVariant = options.klingO1Variant === 'edit';

  // Kling O1 Video Edit variant - requires video_url, optional image_urls and elements
  if (isKlingO1VideoModel && isEditVariant) {
    if (!options.sourceVideoUrl) {
      throw new Error('Kling O1 Video Edit requires a source video.');
    }

    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      reference_image_urls: [url],
    }));

    // Max 4 total (elements + reference images) when using video
    const totalImageCount = referenceUrls.length + elementsPayload.length;
    if (totalImageCount > 4) {
      throw new Error('Kling O1 Video Edit supports up to 4 images total (references + elements).');
    }

    let latestRequestId: string | undefined;

    const inputPayload: Record<string, unknown> = {
      prompt,
      video_url: options.sourceVideoUrl,
      ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      ...(typeof options.keepAudio === 'boolean' ? { keep_audio: options.keepAudio } : {}),
    };

    const editModelId = KLING_O1_VIDEO_EDIT_MODEL_ID;
    logFalEvent('outbound', editModelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(editModelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', editModelId, 'Queue update', {
            status: queueUpdate.status,
            position: queueUpdate.position,
            eta: queueUpdate.eta,
            requestId: resolvedRequestId,
            logs: normalizedLogs.map(log => log?.message ?? ''),
          });
          options.onQueueUpdate?.({
            ...queueUpdate,
            requestId: resolvedRequestId || '',
            logs: normalizedLogs,
          });
        },
      });
    } catch (error) {
      logFalEvent('error', editModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', editModelId, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { video?: string | { url?: string } } | undefined;
    const videoEntry = data?.video;
    const videoUrl = typeof videoEntry === 'string'
      ? videoEntry
      : videoEntry && typeof videoEntry.url === 'string'
        ? videoEntry.url
        : null;

    if (!videoUrl) {
      throw new Error('Fal.ai API did not return a video.');
    }

    const requestId = result?.requestId || latestRequestId;

    return { videoUrl, requestId };
  }

  // Non-edit variants require an image
  if (!image) {
    throw new Error('Image is required for video generation.');
  }
  const imageUrl = await uploadImageElementToFal(image);

  if (isKlingO1VideoModel) {
    const referenceUrls = referenceImages.length > 0 ? await collectReferenceUploadUrls(referenceImages) : [];
    const elementUrls = await Promise.all(elementImages.map(img => uploadImageElementToFal(img)));
    const elementsPayload = elementUrls.map(url => ({
      frontal_image_url: url,
      // API expects reference_image_urls; reuse the frontal view when no alternates exist.
      reference_image_urls: [url],
    }));
    const totalImages = 1 + referenceUrls.length + elementsPayload.length;
    if (totalImages > 7) {
      throw new Error('Kling O1 Video supports up to 7 images (start + references + elements).');
    }

    let latestRequestId: string | undefined;

    const variant = options.klingO1Variant;
    const inputPayload: Record<string, unknown> = {
      prompt,
      image_urls: [imageUrl, ...referenceUrls],
      ...(duration ? { duration } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      ...(variant ? { variant } : {}),
    };

    logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
      ...(variant ? { variant } : {}),
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(modelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', modelId, 'Queue update', {
            status: queueUpdate.status,
            position: queueUpdate.position,
            eta: queueUpdate.eta,
            requestId: resolvedRequestId,
            logs: normalizedLogs.map(log => log?.message ?? ''),
          });
          options.onQueueUpdate?.({
            ...queueUpdate,
            requestId: resolvedRequestId || '',
            logs: normalizedLogs,
          });
        },
      });
    } catch (error) {
      logFalEvent('error', modelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', modelId, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { video?: string | { url?: string } } | undefined;
    const videoEntry = data?.video;
    const videoUrl = typeof videoEntry === 'string'
      ? videoEntry
      : videoEntry && typeof videoEntry.url === 'string'
        ? videoEntry.url
        : null;

    if (!videoUrl) {
      throw new Error('Fal.ai API did not return a video.');
    }

    const requestId = result?.requestId || latestRequestId;

    return { videoUrl, requestId };
  }

  const isHailuoVideoModel = modelId.includes('hailuo-2.3');
  const promptOptimizer = options.promptOptimizer ?? (isHailuoVideoModel ? true : undefined);
  const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;
  const cfgScale = typeof options.cfgScale === 'number' && Number.isFinite(options.cfgScale)
    ? options.cfgScale
    : undefined;
  const tailImage = options.tailImage;
  const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage) : undefined;
  const generateAudio = typeof options.generateAudio === 'boolean' ? options.generateAudio : undefined;
  let latestRequestId: string | undefined;

  const inputPayload: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    ...(promptOptimizer !== undefined ? { prompt_optimizer: promptOptimizer } : {}),
    ...(duration ? { duration } : {}),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    ...(cfgScale !== undefined ? { cfg_scale: cfgScale } : {}),
    ...(tailImageUrl ? { tail_image_url: tailImageUrl } : {}),
    ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
  };

  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', {
    input: inputPayload,
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: inputPayload,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', modelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', modelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { video?: string | { url?: string } } | undefined;
  const videoEntry = data?.video;
  const videoUrl = typeof videoEntry === 'string'
    ? videoEntry
    : videoEntry && typeof videoEntry.url === 'string'
      ? videoEntry.url
      : null;

  if (!videoUrl) {
    throw new Error('Fal.ai API did not return a video.');
  }

  const requestId = result?.requestId || latestRequestId;

  return { videoUrl, requestId };
};

export const removeBackground = async (
  image: HTMLImageElement,
  options: RemoveBackgroundOptions = {},
): Promise<{ imageBase64: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image);

  let latestRequestId: string | undefined;

  const backgroundModelId = 'fal-ai/bria/background/remove';
  logFalEvent('outbound', backgroundModelId, 'Outbound request (fal.subscribe)', {
    input: {
      image_url: imageUrl,
      sync_mode: true,
    },
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(backgroundModelId, {
      input: {
        image_url: imageUrl,
        sync_mode: true,
      },
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as unknown as FalQueueUpdate;
        const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
        const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
        if (resolvedRequestId) {
          latestRequestId = resolvedRequestId;
        }
        logFalEvent('inbound', backgroundModelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: resolvedRequestId,
          logs: normalizedLogs.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: resolvedRequestId || '',
          logs: normalizedLogs,
        });
      },
    });
  } catch (error) {
    logFalEvent('error', backgroundModelId, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', backgroundModelId, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { image?: { url?: string } } | undefined;
  const outputUrl = data?.image?.url;
  if (!outputUrl) {
    throw new Error('Fal.ai background removal API did not return an image.');
  }

  const inlineData = await extractInlineData(outputUrl);
  const base64 = inlineData.split(',')[1];
  if (!base64) {
    throw new Error('Failed to extract image data from background removal response.');
  }

  const requestId = result?.requestId || latestRequestId;

  return { imageBase64: base64, requestId };
};
