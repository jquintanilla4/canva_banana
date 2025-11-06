import { fal } from '@fal-ai/client';
import {
  Tool,
  Path,
  ImageDimensions,
  InpaintMode,
  FalImageSizeOption,
  FalAspectRatioOption,
} from '../types';
import { addDebugLog } from './debugLog';

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

export interface FalQueueUpdate {
  requestId: string;
  status: FalQueueStatus;
  position?: number;
  eta?: number;
  logs?: Array<{ message?: string }>;
  [key: string]: unknown;
}

interface GenerateImageEditOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  modelId?: string;
  imageSize?: FalImageSizeOption;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
}

interface GenerateImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  modelId?: string;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  imageSize?: FalImageSizeOption;
  seed?: number;
}

interface UpscaleImageOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
}

const FAL_MODEL_ID = process.env.FAL_MODEL_ID || 'fal-ai/nano-banana/edit';
const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit';
const NANO_BANANA_MODEL_ID = 'fal-ai/nano-banana/edit';
const NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana';
const SEEDREAM_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v4/text-to-image';
const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image';
const CRYSTAL_UPSCALER_MODEL_ID = 'fal-ai/crystal-upscaler';
const SIMA_UPSCALER_MODEL_ID = 'simalabs/sima-upscaler';
const SEEDVR_UPSCALER_MODEL_ID = 'fal-ai/seedvr/upscale/image';

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

const uploadImageElementToFal = async (image: HTMLImageElement): Promise<string> => {
  const canvas = imageToCanvas(image);
  return uploadCanvasToFal(canvas);
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

  const modelId = options.modelId || FAL_MODEL_ID;
  const imageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const numImagesOption = options.numImages;

  const body: {
    prompt: string;
    image_urls: string[];
    output_format?: 'png';
    sync_mode: boolean;
    image_size?: { width: number; height: number } | string;
    num_images?: number;
    aspect_ratio?: string;
  } = {
    prompt,
    image_urls: imageUrls,
    sync_mode: modelId !== SEEDREAM_MODEL_ID,
  };

  if (modelId !== SEEDREAM_MODEL_ID) {
    body.output_format = 'png';
  }

  let latestRequestId: string | undefined;

  if (modelId === SEEDREAM_MODEL_ID) {
    if (imageSizeOption === 'default') {
      body.image_size = {
        width: imageDimensions.width,
        height: imageDimensions.height,
      };
    } else {
      body.image_size = imageSizeOption;
    }
  } else if (modelId === NANO_BANANA_MODEL_ID) {
    if (aspectRatioOption !== 'default') {
      body.aspect_ratio = aspectRatioOption;
    }
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
        const queueUpdate = update as FalQueueUpdate;
        if (queueUpdate.requestId) {
          latestRequestId = queueUpdate.requestId;
        }
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: queueUpdate.requestId || latestRequestId,
          logs: queueUpdate.logs?.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: queueUpdate.requestId || latestRequestId || '',
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
  options: UpscaleImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image);
  const sanitizedScale = Number.isFinite(scaleFactor) ? Math.round(scaleFactor) : 2;
  const normalizedScale = Math.min(200, Math.max(1, sanitizedScale));

  let latestRequestId: string | undefined;

  logFalEvent('outbound', CRYSTAL_UPSCALER_MODEL_ID, 'Outbound request (fal.subscribe)', {
    input: {
      image_url: imageUrl,
      scale_factor: normalizedScale,
    },
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(CRYSTAL_UPSCALER_MODEL_ID, {
      input: {
        image_url: imageUrl,
        scale_factor: normalizedScale,
      },
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as FalQueueUpdate;
        if (queueUpdate.requestId) {
          latestRequestId = queueUpdate.requestId;
        }
        logFalEvent('inbound', CRYSTAL_UPSCALER_MODEL_ID, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: queueUpdate.requestId || latestRequestId,
          logs: queueUpdate.logs?.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: queueUpdate.requestId || latestRequestId || '',
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

export const upscaleSimaImage = async (
  image: HTMLImageElement,
  scaleFactor: number,
  options: UpscaleImageOptions = {},
): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image);
  const sanitizedScale = Number.isFinite(scaleFactor) ? Math.round(scaleFactor) : 4;
  const normalizedScale = Math.min(4, Math.max(2, sanitizedScale));

  let latestRequestId: string | undefined;

  logFalEvent('outbound', SIMA_UPSCALER_MODEL_ID, 'Outbound request (fal.subscribe)', {
    input: {
      image_url: imageUrl,
      scale: normalizedScale,
    },
  });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(SIMA_UPSCALER_MODEL_ID, {
      input: {
        image_url: imageUrl,
        scale: normalizedScale,
      },
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as FalQueueUpdate;
        if (queueUpdate.requestId) {
          latestRequestId = queueUpdate.requestId;
        }
        logFalEvent('inbound', SIMA_UPSCALER_MODEL_ID, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: queueUpdate.requestId || latestRequestId,
          logs: queueUpdate.logs?.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: queueUpdate.requestId || latestRequestId || '',
        });
      },
    });
  } catch (error) {
    logFalEvent('error', SIMA_UPSCALER_MODEL_ID, 'Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logFalEvent('inbound', SIMA_UPSCALER_MODEL_ID, 'Result received', {
    requestId: result?.requestId || latestRequestId,
    data: (result?.data as Record<string, unknown>) ?? undefined,
  });

  const data = result?.data as { image?: string | { url?: string } } | undefined;
  const imageEntry = data?.image;
  if (!imageEntry) {
    throw new Error('Fal.ai Sima Upscaler did not return an image.');
  }

  const upscaledUrl = typeof imageEntry === 'string'
    ? imageEntry
    : typeof imageEntry.url === 'string'
      ? imageEntry.url
      : null;

  if (!upscaledUrl) {
    throw new Error('Unexpected image reference returned by Fal.ai Sima Upscaler.');
  }

  const inlineData = await extractInlineData(upscaledUrl);
  const base64 = inlineData.split(',')[1];
  if (!base64) {
    throw new Error('Failed to extract image data from Fal.ai Sima Upscaler response.');
  }

  const requestId = result?.requestId || latestRequestId;

  return {
    imageBase64: base64,
    imagesBase64: [base64],
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
        const queueUpdate = update as FalQueueUpdate;
        if (queueUpdate.requestId) {
          latestRequestId = queueUpdate.requestId;
        }
        logFalEvent('inbound', SEEDVR_UPSCALER_MODEL_ID, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: queueUpdate.requestId || latestRequestId,
          logs: queueUpdate.logs?.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: queueUpdate.requestId || latestRequestId || '',
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

  const modelId = options.modelId || NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID;
  const isSeedreamTextToImage = modelId === SEEDREAM_TEXT_TO_IMAGE_MODEL_ID;
  const supportsAspectRatio = modelId === NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID || modelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const numImagesOption = options.numImages;
  const imageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';

  const body: {
    prompt: string;
    sync_mode: boolean;
    output_format?: 'png';
    num_images?: number;
    aspect_ratio?: string;
    image_size?: { width: number; height: number } | string;
    seed?: number;
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
    if (imageSizeOption !== 'default') {
      body.image_size = imageSizeOption;
    }
  } else if (supportsAspectRatio && aspectRatioOption !== 'default') {
    body.aspect_ratio = aspectRatioOption;
  }

  let latestRequestId: string | undefined;

  logFalEvent('outbound', modelId, 'Outbound request (fal.subscribe)', { input: body });

  let result: Awaited<ReturnType<typeof fal.subscribe>>;
  try {
    result = await fal.subscribe(modelId, {
      input: body,
      logs: true,
      onQueueUpdate: update => {
        const queueUpdate = update as FalQueueUpdate;
        if (queueUpdate.requestId) {
          latestRequestId = queueUpdate.requestId;
        }
        logFalEvent('inbound', modelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: queueUpdate.requestId || latestRequestId,
          logs: queueUpdate.logs?.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: queueUpdate.requestId || latestRequestId || '',
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
        const queueUpdate = update as FalQueueUpdate;
        if (queueUpdate.requestId) {
          latestRequestId = queueUpdate.requestId;
        }
        logFalEvent('inbound', backgroundModelId, 'Queue update', {
          status: queueUpdate.status,
          position: queueUpdate.position,
          eta: queueUpdate.eta,
          requestId: queueUpdate.requestId || latestRequestId,
          logs: queueUpdate.logs?.map(log => log?.message ?? ''),
        });
        options.onQueueUpdate?.({
          ...queueUpdate,
          requestId: queueUpdate.requestId || latestRequestId || '',
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
