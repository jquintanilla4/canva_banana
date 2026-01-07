import { fal } from '@fal-ai/client';
import {
  Tool,
  Path,
  ImageDimensions,
  FalImageSizeOption,
  FalAspectRatioOption,
  FalResolutionOption,
  FalVideoDuration,
} from '../types';
import { addDebugLog } from './debugLog';
import {
  KLING_26_CONTROL_VIDEO_MODEL_ID,
  KLING_26_CONTROL_VIDEO_PRO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT,
  SCAIL_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  WAN_ANIMATE_MOVE_MODEL_ID,
  INFINITALK_DURATION_TO_NUM_FRAMES,
  type InfinitalkDurationSelectionValue,
  type LipsyncAudioMode,
  type LipsyncEmotion,
  type LipsyncModelMode,
} from './modelConfig';

// Wrapper around @fal-ai/client that normalizes queue updates and surfaces debug logs for the UI.
interface GenerateImageEditParams {
  prompt: string;
  image: HTMLImageElement;
  tool: Tool;
  paths: Path[];
  imageDimensions: ImageDimensions;
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

const subscribeForVideoUrl = async (
  modelId: string,
  inputPayload: Record<string, unknown>,
  options: Pick<GenerateVideoOptions, 'onQueueUpdate'>,
): Promise<{ videoUrl: string; requestId?: string }> => {
  let latestRequestId: string | undefined;

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

interface GenerateImageEditOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
  modelId?: string;
  imageSize?: FalImageSizeOption;
  aspectRatio?: FalAspectRatioOption;
  numImages?: number;
  resolution?: FalResolutionOption;
  wan26ImageSize?: string;
  wan26ImageMaxImages?: string;
  negativePrompt?: string;
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
  flux2MaxImageSize?: string;
  wan26ImageSize?: string;
  wan26ImageMaxImages?: string;
  negativePrompt?: string;
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
  numInferenceSteps?: number;
  resolution?: '480p' | '580p' | '720p';
  seed?: number;
  acceleration?: 'none' | 'regular' | 'high';
  shift?: number;
  videoQuality?: 'high' | 'maximum';
  useTurbo?: boolean;
  targetResolution?: '720p' | '1080p';
  creativity?: number;
  cfgScale?: number;
  tailImage?: HTMLImageElement;
  generateAudio?: boolean;
  referenceImages?: HTMLImageElement[];
  elementImages?: HTMLImageElement[];
  klingO1Variant?: string;
  sourceVideoUrl?: string;
  sourceAudioUrl?: string;
  keepAudio?: boolean;
  keepOriginalSound?: boolean;
  characterOrientation?: 'image' | 'video';
  aspectRatio?: FalAspectRatioOption;
  lipsyncEmotion?: LipsyncEmotion;
  lipsyncModelMode?: LipsyncModelMode;
  lipsyncAudioMode?: LipsyncAudioMode;
  infinitalkDuration?: InfinitalkDurationSelectionValue;
  wan26Resolution?: '720p' | '1080p';
  wan26Duration?: '5' | '10' | '15';
  wan26PromptExpansion?: boolean;
  wan26MultiShots?: boolean;
  seedance15AspectRatio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  seedance15Resolution?: '480p' | '720p';
  seedance15Duration?: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
  seedance15CameraFixed?: boolean;
  seedance15Audio?: boolean;
}

const NANO_BANANA_PRO_EDIT_MODEL_ID = 'fal-ai/nano-banana-pro/edit';
const NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana-pro';
const LEGACY_NANO_BANANA_EDIT_MODEL_ID = 'fal-ai/nano-banana/edit';
const LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/nano-banana';

const normalizeModelId = (modelId: string | undefined): string | undefined => {
  if (modelId === LEGACY_NANO_BANANA_EDIT_MODEL_ID) {
    return NANO_BANANA_PRO_EDIT_MODEL_ID;
  }
  if (modelId === LEGACY_NANO_BANANA_TEXT_TO_IMAGE_MODEL_ID) {
    return NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  }
  return modelId;
};

const FAL_MODEL_ID = normalizeModelId(process.env.FAL_MODEL_ID) || NANO_BANANA_PRO_EDIT_MODEL_ID;
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
const SEEDREAM_CUSTOM_SIZE_MAP = {
  '2560x1440': { width: 2560, height: 1440 },
  '1440x2560': { width: 1440, height: 2560 },
} as const;
type SeedreamCustomSizeKey = keyof typeof SEEDREAM_CUSTOM_SIZE_MAP;
const isSeedreamCustomSize = (value: unknown): value is SeedreamCustomSizeKey =>
  value === '2560x1440' || value === '1440x2560';
const getSeedreamCustomSize = (value: string | undefined) =>
  isSeedreamCustomSize(value) ? SEEDREAM_CUSTOM_SIZE_MAP[value] : undefined;
const resolveSeedreamCustomSizeForModel = (
  _modelId: string | undefined,
  imageSizeOption: FalImageSizeOption | FalAspectRatioOption,
): { width: number; height: number } | undefined => {
  const baseSize = getSeedreamCustomSize(imageSizeOption);
  if (!baseSize) {
    return undefined;
  }
  return baseSize;
};
const REVE_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/reve/text-to-image';
const REVE_EDIT_MODEL_ID = 'fal-ai/reve/edit';
const REVE_REMIX_MODEL_ID = 'fal-ai/reve/remix';
const FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/flux-2-max';
const FLUX2_MAX_EDIT_MODEL_ID = 'fal-ai/flux-2-max/edit';

// Convert @Image1, @Image2, etc. to Reve's XML format <img>0</img>, <img>1</img>, etc.
// User-facing mentions are 1-indexed, API expects 0-indexed
const convertReveImageMentionsToXml = (prompt: string): string => {
  return prompt.replace(/@Image(\d+)/g, (_, num) => {
    const index = parseInt(num, 10) - 1; // Convert 1-indexed to 0-indexed
    return `<img>${index}</img>`;
  });
};
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
export const KLING_O1_VIDEO_REF_V2V_MODEL_ID = 'fal-ai/kling-video/o1/video-to-video/reference';
export const KLING_O1_VIDEO_FFLF_MODEL_ID = 'fal-ai/kling-video/o1/image-to-video';
export const WAN_ANIMATE_REPLACE_MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/replace';
export const WAN_ANIMATE_MODEL_ID = WAN_ANIMATE_REPLACE_MODEL_ID;
export const WAN_VISION_ENHANCER_MODEL_ID = 'fal-ai/wan-vision-enhancer';
export const INFINITALK_VIDEO_MODEL_ID = 'fal-ai/infinitalk/video-to-video';
export const WAN_26_I2V_MODEL_ID = 'wan/v2.6/image-to-video';
export const WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID = 'wan/v2.6/text-to-image';
export const WAN_26_IMAGE_IMAGE_TO_IMAGE_MODEL_ID = 'wan/v2.6/image-to-image';
export const SEEDANCE_15_VIDEO_MODEL_ID = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video';

// Convert @Image1, @Image2, etc. to Wan 2.6 Image's format "image 1", "image 2", etc.
// User-facing mentions are 1-indexed, API expects 1-indexed "image N" format
const convertWan26ImageMentions = (prompt: string): string => {
  return prompt.replace(/@Image(\d+)/g, (_, num) => `image ${num}`);
};

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
  referenceImages,
}: GenerateImageEditParams, options: GenerateImageEditOptions = {}): Promise<{ imageBase64: string; imagesBase64: string[]; text: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const modelId = normalizeModelId(options.modelId) || FAL_MODEL_ID;
  const isSeedreamAnnotateSingle = tool === Tool.ANNOTATE && isSeedreamEditModelId(modelId);
  const imageUrls: string[] = [];
  let annotationImageUrl: string | undefined;

  const baseImageUrl = await uploadImageElementToFal(image);
  if (!isSeedreamAnnotateSingle) {
    imageUrls.push(baseImageUrl);
  }

  if (tool === Tool.ANNOTATE) {
    const annotationCanvas = buildAnnotationCanvas(image, paths, imageDimensions);
    annotationImageUrl = await uploadCanvasToFal(annotationCanvas);
    imageUrls.push(annotationImageUrl);
  }

  if (referenceImages && referenceImages.length > 0) {
    const referenceUrls = await collectReferenceUploadUrls(referenceImages);
    imageUrls.push(...referenceUrls);
  }

  // Reve model - detect whether to use edit (single image) or remix (multiple images)
  const isReveModel = modelId === REVE_TEXT_TO_IMAGE_MODEL_ID;
  if (isReveModel) {
    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    const numImagesOption = options.numImages;
    const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
    let latestRequestId: string | undefined;

    // Remix mode: multiple images selected (base + references)
    if (hasReferenceImages) {
      // Build image URLs array: base image first, then reference images
      const allImageUrls = [baseImageUrl];
      const referenceUrls = await collectReferenceUploadUrls(referenceImages);
      allImageUrls.push(...referenceUrls);

      // Limit to 6 images as per API spec
      if (allImageUrls.length > 6) {
        throw new Error('Reve remix supports up to 6 images. Please reduce the number of selected images.');
      }

      // Convert @Image1, @Image2, etc. to <img>0</img>, <img>1</img>, etc.
      const convertedPrompt = convertReveImageMentionsToXml(prompt);

      const remixBody: {
        prompt: string;
        image_urls: string[];
        aspect_ratio?: '16:9' | '9:16' | '3:2' | '2:3' | '4:3' | '3:4' | '1:1';
        num_images?: number;
        output_format?: 'png' | 'jpeg' | 'webp';
        sync_mode?: boolean;
      } = {
        prompt: convertedPrompt,
        image_urls: allImageUrls,
        output_format: 'png',
        sync_mode: false,
      };

      // Only add aspect_ratio if it's a valid Reve remix aspect ratio
      const validReveRemixAspectRatios = ['16:9', '9:16', '3:2', '2:3', '4:3', '3:4', '1:1'] as const;
      if (aspectRatioOption !== 'default' && validReveRemixAspectRatios.includes(aspectRatioOption as typeof validReveRemixAspectRatios[number])) {
        remixBody.aspect_ratio = aspectRatioOption as typeof validReveRemixAspectRatios[number];
      }

      if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
        const normalized = Math.min(4, Math.max(1, Math.floor(numImagesOption)));
        if (normalized >= 1) {
          remixBody.num_images = normalized;
        }
      }

      logFalEvent('outbound', REVE_REMIX_MODEL_ID, 'Outbound request (fal.subscribe)', { input: remixBody });

      let result: Awaited<ReturnType<typeof fal.subscribe>>;
      try {
        result = await fal.subscribe(REVE_REMIX_MODEL_ID, {
          input: remixBody,
          logs: true,
          onQueueUpdate: update => {
            const queueUpdate = update as unknown as FalQueueUpdate;
            const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
            const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
            if (resolvedRequestId) {
              latestRequestId = resolvedRequestId;
            }
            logFalEvent('inbound', REVE_REMIX_MODEL_ID, 'Queue update', {
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
        logFalEvent('error', REVE_REMIX_MODEL_ID, 'Request failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      logFalEvent('inbound', REVE_REMIX_MODEL_ID, 'Result received', {
        requestId: result?.requestId || latestRequestId,
        data: (result?.data as Record<string, unknown>) ?? undefined,
      });

      const data = result?.data as { images?: Array<{ url: string }> } | undefined;
      const images = data?.images;
      if (!images || images.length === 0) {
        throw new Error('Fal.ai Reve remix API did not return an image.');
      }

      const inlineDataList = await Promise.all(images.map(img => extractInlineData(img.url)));
      const base64List = inlineDataList.map(dataUrl => {
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          throw new Error('Failed to extract image data from Fal.ai Reve remix response.');
        }
        return base64;
      });

      const [primaryBase64] = base64List;
      if (!primaryBase64) {
        throw new Error('Failed to extract image data from Fal.ai Reve remix response.');
      }

      const requestId = result?.requestId || latestRequestId;
      return { imageBase64: primaryBase64, imagesBase64: base64List, text: '', requestId };
    }

    // Edit mode: single image only (no reference images)
    const reveBody: {
      prompt: string;
      image_url: string;
      num_images?: number;
      output_format?: 'png' | 'jpeg' | 'webp';
      sync_mode?: boolean;
    } = {
      prompt,
      image_url: baseImageUrl,
      output_format: 'png',
      sync_mode: false,
    };

    if (typeof numImagesOption === 'number' && Number.isFinite(numImagesOption)) {
      const normalized = Math.min(4, Math.max(1, Math.floor(numImagesOption)));
      if (normalized >= 1) {
        reveBody.num_images = normalized;
      }
    }

    logFalEvent('outbound', REVE_EDIT_MODEL_ID, 'Outbound request (fal.subscribe)', { input: reveBody });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(REVE_EDIT_MODEL_ID, {
        input: reveBody,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', REVE_EDIT_MODEL_ID, 'Queue update', {
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
      logFalEvent('error', REVE_EDIT_MODEL_ID, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', REVE_EDIT_MODEL_ID, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { images?: Array<{ url: string }> } | undefined;
    const images = data?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai Reve edit API did not return an image.');
    }

    const inlineDataList = await Promise.all(images.map(img => extractInlineData(img.url)));
    const base64List = inlineDataList.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Failed to extract image data from Fal.ai Reve edit response.');
      }
      return base64;
    });

    const [primaryBase64] = base64List;
    if (!primaryBase64) {
      throw new Error('Failed to extract image data from Fal.ai Reve edit response.');
    }

    const requestId = result?.requestId || latestRequestId;
    return { imageBase64: primaryBase64, imagesBase64: base64List, text: '', requestId };
  }

  // Flux2 Max edit model - uses @Image1, @Image2 mentions directly (no conversion)
  const isFlux2MaxModel = modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
  if (isFlux2MaxModel) {
    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    let latestRequestId: string | undefined;

    // Build image URLs array: base or annotation image first, then reference images
    const primaryImageUrl = tool === Tool.ANNOTATE && annotationImageUrl
      ? annotationImageUrl
      : baseImageUrl;
    const allImageUrls = [primaryImageUrl];
    if (hasReferenceImages) {
      const referenceUrls = await collectReferenceUploadUrls(referenceImages);
      allImageUrls.push(...referenceUrls);
    }

    // Limit to 8 images as per API spec
    if (allImageUrls.length > 8) {
      throw new Error('Flux2 Max edit supports up to 8 images. Please reduce the number of selected images.');
    }

    const flux2Body: {
      prompt: string;
      image_urls: string[];
      image_size?: string;
      output_format?: 'png' | 'jpeg';
      safety_tolerance?: '5';
      sync_mode?: boolean;
    } = {
      prompt, // Keep @Image1, @Image2, etc. as-is
      image_urls: allImageUrls,
      image_size: 'auto',
      output_format: 'png',
      safety_tolerance: '5', // Most permissive
      sync_mode: false,
    };

    logFalEvent('outbound', FLUX2_MAX_EDIT_MODEL_ID, 'Outbound request (fal.subscribe)', { input: flux2Body });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(FLUX2_MAX_EDIT_MODEL_ID, {
        input: flux2Body,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', FLUX2_MAX_EDIT_MODEL_ID, 'Queue update', {
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
      logFalEvent('error', FLUX2_MAX_EDIT_MODEL_ID, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', FLUX2_MAX_EDIT_MODEL_ID, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { images?: Array<{ url: string }> } | undefined;
    const images = data?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai Flux2 Max edit API did not return an image.');
    }

    const inlineDataList = await Promise.all(images.map(img => extractInlineData(img.url)));
    const base64List = inlineDataList.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Failed to extract image data from Fal.ai Flux2 Max edit response.');
      }
      return base64;
    });

    const [primaryBase64] = base64List;
    if (!primaryBase64) {
      throw new Error('Failed to extract image data from Fal.ai Flux2 Max edit response.');
    }

    const requestId = result?.requestId || latestRequestId;
    return { imageBase64: primaryBase64, imagesBase64: base64List, text: '', requestId };
  }

  // Wan 2.6 Image I2I model - uses image_urls array with @Image → "image N" conversion
  const isWan26ImageModel = modelId === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  if (isWan26ImageModel) {
    const hasReferenceImages = referenceImages && referenceImages.length > 0;
    let latestRequestId: string | undefined;

    // Build image URLs array: base image first, then reference images
    const allImageUrls = [baseImageUrl];
    if (hasReferenceImages) {
      const referenceUrls = await collectReferenceUploadUrls(referenceImages);
      allImageUrls.push(...referenceUrls);
    }

    // Limit to 3 images as per API spec (I2I endpoint)
    if (allImageUrls.length > 3) {
      throw new Error('Wan 2.6 Image supports up to 3 images total. Please reduce the number of selected images.');
    }

    // Convert @Image1, @Image2, etc. to "image 1", "image 2", etc.
    const convertedPrompt = convertWan26ImageMentions(prompt);

    const wan26Body: {
      prompt: string;
      image_urls: string[];
      image_size?: string;
      num_images?: number;
      negative_prompt?: string;
      enable_prompt_expansion?: boolean;
      enable_safety_checker?: boolean;
    } = {
      prompt: convertedPrompt,
      image_urls: allImageUrls,
      image_size: options.wan26ImageSize ?? 'landscape_16_9',
      enable_safety_checker: true,
    };

    // num_images for I2I is capped at 4
    const numImages = parseInt(options.wan26ImageMaxImages ?? '1', 10);
    wan26Body.num_images = Math.min(4, Math.max(1, numImages));

    if (options.negativePrompt) {
      wan26Body.negative_prompt = options.negativePrompt;
    }

    const i2iModelId = WAN_26_IMAGE_IMAGE_TO_IMAGE_MODEL_ID;
    logFalEvent('outbound', i2iModelId, 'Outbound request (fal.subscribe)', { input: wan26Body });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(i2iModelId, {
        input: wan26Body,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', i2iModelId, 'Queue update', {
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
      logFalEvent('error', i2iModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', i2iModelId, 'Result received', {
      requestId: result?.requestId || latestRequestId,
      data: (result?.data as Record<string, unknown>) ?? undefined,
    });

    const data = result?.data as { images?: Array<{ url: string }> } | undefined;
    const images = data?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai Wan 2.6 Image I2I API did not return an image.');
    }

    const inlineDataList = await Promise.all(images.map(img => extractInlineData(img.url)));
    const base64List = inlineDataList.map(dataUrl => {
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Failed to extract image data from Fal.ai Wan 2.6 Image I2I response.');
      }
      return base64;
    });

    const [primaryBase64] = base64List;
    if (!primaryBase64) {
      throw new Error('Failed to extract image data from Fal.ai Wan 2.6 Image I2I response.');
    }

    const requestId = result?.requestId || latestRequestId;
    return { imageBase64: primaryBase64, imagesBase64: base64List, text: '', requestId };
  }

  const isSeedreamModel = isSeedreamEditModelId(modelId);
  const referenceImageCount = referenceImages?.length ?? 0;
  if (isSeedreamModel && referenceImageCount > 0) {
    const auxiliaryImageCount = tool === Tool.ANNOTATE ? 1 : 0;
    const baseImageCount = isSeedreamAnnotateSingle ? 0 : 1;
    const expectedImageCount = baseImageCount + auxiliaryImageCount + referenceImageCount;
    if (imageUrls.length < expectedImageCount) {
      logFalEvent('error', modelId, 'Seedream edit missing reference images', {
        expectedImageCount,
        actualImageCount: imageUrls.length,
      });
      throw new Error('Seedream edit expected reference images to be included in image_urls.');
    }
  }
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption = rawImageSizeOption;
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const seedreamCustomSize = isSeedreamModel
    ? (resolveSeedreamCustomSizeForModel(modelId, imageSizeOption)
      ?? resolveSeedreamCustomSizeForModel(modelId, aspectRatioOption))
    : undefined;
  const numImagesOption = options.numImages;
  const resolutionOption: FalResolutionOption = options.resolution ?? '1K';
  const isKlingModel = modelId === KLING_IMAGE_MODEL_ID;
  const isNanoBananaProModel = modelId === NANO_BANANA_PRO_EDIT_MODEL_ID;
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
  } else if (isNanoBananaProModel || isKlingModel) {
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

  const modelId = normalizeModelId(options.modelId) || NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  const isSeedreamTextToImage = isSeedreamTextToImageModelId(modelId);
  const isNanoBananaTextToImage = modelId === NANO_BANANA_PRO_TEXT_TO_IMAGE_MODEL_ID;
  const isKlingTextToImage = modelId === KLING_IMAGE_MODEL_ID;
  const isFlux2MaxTextToImage = modelId === FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID;
  const isWan26ImageTextToImage = modelId === WAN_26_IMAGE_TEXT_TO_IMAGE_MODEL_ID;
  const supportsAspectRatio = isNanoBananaTextToImage || modelId === REVE_TEXT_TO_IMAGE_MODEL_ID || isKlingTextToImage;
  const supportsResolution = isNanoBananaTextToImage || isKlingTextToImage;
  const numImagesOption = options.numImages;
  const rawImageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const imageSizeOption: FalImageSizeOption = rawImageSizeOption;
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
    safety_tolerance?: '5';
  } = {
    prompt,
    sync_mode: !isSeedreamTextToImage,
  };

  if (!isSeedreamTextToImage) {
    body.output_format = 'png';
  }

  // Flux2 Max specific settings
  if (isFlux2MaxTextToImage) {
    body.safety_tolerance = '5'; // Most permissive
    body.output_format = 'png';
    const flux2ImageSize = options.flux2MaxImageSize ?? 'landscape_4_3';
    body.image_size = flux2ImageSize;
  }

  // Wan 2.6 Image T2I specific settings
  if (isWan26ImageTextToImage) {
    const wan26Body = body as Record<string, unknown>;
    wan26Body.image_size = options.wan26ImageSize ?? 'landscape_16_9';
    const maxImages = parseInt(options.wan26ImageMaxImages ?? '1', 10);
    wan26Body.max_images = Math.min(5, Math.max(1, maxImages));
    if (options.negativePrompt) {
      wan26Body.negative_prompt = options.negativePrompt;
    }
    wan26Body.enable_safety_checker = true;
    delete wan26Body.output_format;
    delete wan26Body.sync_mode;
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
  } else if (isNanoBananaTextToImage || isKlingTextToImage) {
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
  const isKlingO1VideoModel = modelId === KLING_O1_REFERENCE_TO_VIDEO_MODEL_ID
    || modelId === KLING_O1_VIDEO_EDIT_MODEL_ID
    || modelId === KLING_O1_VIDEO_REF_V2V_MODEL_ID
    || modelId === KLING_O1_VIDEO_FFLF_MODEL_ID;
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages : [];
  const elementImages = Array.isArray(options.elementImages) ? options.elementImages : [];
  const isEditVariant = options.klingO1Variant === 'edit';
  const isRefV2VVariant = options.klingO1Variant === 'refV2V';
  const isKlingO1FflfVariant = options.klingO1Variant === 'fflf';

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

  // Kling O1 Video Ref-v2v variant - requires video_url, supports duration and aspect_ratio
  if (isKlingO1VideoModel && isRefV2VVariant) {
    if (!options.sourceVideoUrl) {
      throw new Error('Kling O1 Video Ref-v2v requires a source video.');
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
      throw new Error('Kling O1 Video Ref-v2v supports up to 4 images total (references + elements).');
    }

    let latestRequestId: string | undefined;

    const aspectRatioValue = options.aspectRatio && options.aspectRatio !== 'default' ? options.aspectRatio : 'auto';

    const inputPayload: Record<string, unknown> = {
      prompt,
      video_url: options.sourceVideoUrl,
      ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
      ...(elementsPayload.length ? { elements: elementsPayload } : {}),
      ...(typeof options.keepAudio === 'boolean' ? { keep_audio: options.keepAudio } : {}),
      ...(duration ? { duration } : {}),
      aspect_ratio: aspectRatioValue,
    };

    const refV2VModelId = KLING_O1_VIDEO_REF_V2V_MODEL_ID;
    logFalEvent('outbound', refV2VModelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(refV2VModelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', refV2VModelId, 'Queue update', {
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
      logFalEvent('error', refV2VModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', refV2VModelId, 'Result received', {
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

  const isWan26I2VModel = modelId === WAN_26_I2V_MODEL_ID;
  if (isWan26I2VModel) {
    if (!image) {
      throw new Error('Wan 2.6 requires an image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Wan 2.6 requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image);

    const resolution = options.wan26Resolution === '720p' || options.wan26Resolution === '1080p'
      ? options.wan26Resolution
      : '720p';
    const videoDuration = options.wan26Duration === '5' || options.wan26Duration === '10' || options.wan26Duration === '15'
      ? options.wan26Duration
      : '5';
    const enablePromptExpansion = typeof options.wan26PromptExpansion === 'boolean'
      ? options.wan26PromptExpansion
      : true;
    const multiShots = typeof options.wan26MultiShots === 'boolean'
      ? options.wan26MultiShots
      : false;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      image_url: imageUrl,
      resolution,
      duration: videoDuration,
      enable_prompt_expansion: enablePromptExpansion,
      multi_shots: multiShots,
      ...(options.sourceAudioUrl ? { audio_url: options.sourceAudioUrl } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isSeedance15Model = modelId === SEEDANCE_15_VIDEO_MODEL_ID;
  if (isSeedance15Model) {
    if (!image) {
      throw new Error('Seedance 1.5 requires an image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Seedance 1.5 requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image);
    const tailImage = options.tailImage;
    const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage) : undefined;

    const aspectRatio = options.seedance15AspectRatio ?? '16:9';
    const resolution = options.seedance15Resolution ?? '720p';
    const videoDuration = options.seedance15Duration ?? '5';
    const cameraFixed = options.seedance15CameraFixed ?? false;
    const generateAudio = options.seedance15Audio ?? false;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      resolution,
      duration: videoDuration,
      camera_fixed: cameraFixed,
      generate_audio: generateAudio,
      ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isInfinitalkModel = modelId === INFINITALK_VIDEO_MODEL_ID;
  if (isInfinitalkModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Infinitalk requires a source video.');
    }
    if (!options.sourceAudioUrl) {
      throw new Error('Infinitalk requires a source audio.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Infinitalk requires a prompt.');
    }

    const resolution = options.resolution === '480p' || options.resolution === '720p'
      ? options.resolution
      : undefined;
    const acceleration = options.acceleration === 'none' || options.acceleration === 'regular' || options.acceleration === 'high'
      ? options.acceleration
      : undefined;
    const seed = typeof options.seed === 'number' && Number.isFinite(options.seed)
      ? Math.floor(options.seed)
      : undefined;
    const numFrames = options.infinitalkDuration
      ? INFINITALK_DURATION_TO_NUM_FRAMES[options.infinitalkDuration]
      : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      audio_url: options.sourceAudioUrl,
      prompt: trimmedPrompt,
      ...(resolution ? { resolution } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(acceleration ? { acceleration } : {}),
      ...(numFrames !== undefined ? { num_frames: numFrames } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isOneToAllAnimateModel = modelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
  if (isOneToAllAnimateModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('1-to-All Animate requires a source video.');
    }
    if (!image) {
      throw new Error('1-to-All Animate requires a still image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('1-to-All Animate requires a prompt.');
    }

    const negativePrompt = typeof options.negativePrompt === 'string'
      ? options.negativePrompt.trim()
      : ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT;

    const imageUrl = await uploadImageElementToFal(image);

    const resolution = options.resolution === '480p' || options.resolution === '580p' || options.resolution === '720p'
      ? options.resolution
      : undefined;

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      negative_prompt: negativePrompt,
      image_url: imageUrl,
      video_url: options.sourceVideoUrl,
      ...(resolution ? { resolution } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isScailModel = modelId === SCAIL_VIDEO_MODEL_ID;
  if (isScailModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Scail requires a source video.');
    }
    if (!image) {
      throw new Error('Scail requires a reference image.');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Scail requires a prompt.');
    }

    const imageUrl = await uploadImageElementToFal(image);

    const inputPayload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      image_url: imageUrl,
      video_url: options.sourceVideoUrl,
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  // Lip Sync (React-1) - requires video_url and audio_url
  const isLipsyncModel = modelId === SYNC_LIPSYNC_MODEL_ID;
  if (isLipsyncModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Lip Sync requires a source video.');
    }
    if (!options.sourceAudioUrl) {
      throw new Error('Lip Sync requires a source audio.');
    }

    const emotion = options.lipsyncEmotion || 'neutral';
    const modelMode = options.lipsyncModelMode || 'face';
    const lipsyncMode = options.lipsyncAudioMode || 'bounce';

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      audio_url: options.sourceAudioUrl,
      emotion,
      model_mode: modelMode,
      lipsync_mode: lipsyncMode,
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isWanAnimateEndpoint = modelId === WAN_ANIMATE_REPLACE_MODEL_ID || modelId === WAN_ANIMATE_MOVE_MODEL_ID;
  if (isWanAnimateEndpoint) {
    if (!options.sourceVideoUrl) {
      throw new Error('Wan Animate requires a source video.');
    }
    if (!image) {
      throw new Error('Wan Animate requires a still image.');
    }

    const imageUrl = await uploadImageElementToFal(image);

    const numInferenceStepsRaw = typeof options.numInferenceSteps === 'number'
      ? options.numInferenceSteps
      : Number(options.numInferenceSteps);
    const numInferenceSteps = Number.isFinite(numInferenceStepsRaw)
      ? Math.min(40, Math.max(2, Math.round(numInferenceStepsRaw)))
      : undefined;

    const resolution = options.resolution === '480p' || options.resolution === '580p' || options.resolution === '720p'
      ? options.resolution
      : undefined;

    const shiftRaw = typeof options.shift === 'number' ? options.shift : Number(options.shift);
    const shift = Number.isFinite(shiftRaw)
      ? Math.min(10, Math.max(1, Math.round(shiftRaw * 10) / 10))
      : undefined;

    const videoQuality = options.videoQuality === 'maximum' ? 'maximum' : options.videoQuality === 'high' ? 'high' : undefined;
    const useTurbo = typeof options.useTurbo === 'boolean' ? options.useTurbo : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      image_url: imageUrl,
      ...(numInferenceSteps !== undefined ? { num_inference_steps: numInferenceSteps } : {}),
      ...(resolution ? { resolution } : {}),
      ...(shift !== undefined ? { shift } : {}),
      ...(videoQuality ? { video_quality: videoQuality } : {}),
      ...(useTurbo !== undefined ? { use_turbo: useTurbo } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  const isWanVisionEnhancerModel = modelId === WAN_VISION_ENHANCER_MODEL_ID;
  if (isWanVisionEnhancerModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Wan Vision Enhancer requires a source video.');
    }

    let latestRequestId: string | undefined;
    const trimmedPrompt = prompt.trim();
    const negativePrompt = typeof options.negativePrompt === 'string' ? options.negativePrompt.trim() : undefined;
    const targetResolution = options.targetResolution === '720p' || options.targetResolution === '1080p'
      ? options.targetResolution
      : undefined;
    const creativity = typeof options.creativity === 'number' && Number.isFinite(options.creativity)
      ? Math.min(4, Math.max(0, Math.round(options.creativity)))
      : undefined;

    const inputPayload: Record<string, unknown> = {
      video_url: options.sourceVideoUrl,
      ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(targetResolution ? { target_resolution: targetResolution } : {}),
      ...(creativity !== undefined ? { creativity } : {}),
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
  }

  const isKling26ControlModel = modelId === KLING_26_CONTROL_VIDEO_MODEL_ID
    || modelId === KLING_26_CONTROL_VIDEO_PRO_MODEL_ID;
  if (isKling26ControlModel) {
    if (!options.sourceVideoUrl) {
      throw new Error('Kling 2.6 Control requires a source video.');
    }
    if (!image) {
      throw new Error('Kling 2.6 Control requires a character image.');
    }

    const trimmedPrompt = prompt.trim();
    const imageUrl = await uploadImageElementToFal(image);
    const characterOrientation = options.characterOrientation === 'image' ? 'image' : 'video';
    const keepOriginalSound = typeof options.keepOriginalSound === 'boolean' ? options.keepOriginalSound : undefined;

    const inputPayload: Record<string, unknown> = {
      image_url: imageUrl,
      video_url: options.sourceVideoUrl,
      character_orientation: characterOrientation,
      ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
      ...(keepOriginalSound !== undefined ? { keep_original_sound: keepOriginalSound } : {}),
    };

    return subscribeForVideoUrl(modelId, inputPayload, options);
  }

  // Non-edit/refV2V variants require an image
  if (!image) {
    throw new Error('Image is required for video generation.');
  }
  const imageUrl = await uploadImageElementToFal(image);

  if (isKlingO1VideoModel && isKlingO1FflfVariant) {
    if (referenceImages.length > 0 || elementImages.length > 0) {
      throw new Error('Kling O1 FFLF only supports a start and end frame. Remove reference or element images.');
    }
    const tailImage = options.tailImage;
    const tailImageUrl = tailImage ? await uploadImageElementToFal(tailImage) : undefined;
    let latestRequestId: string | undefined;

    const inputPayload: Record<string, unknown> = {
      prompt,
      start_image_url: imageUrl,
      ...(tailImageUrl ? { end_image_url: tailImageUrl } : {}),
      ...(duration ? { duration } : {}),
    };

    const fflfModelId = KLING_O1_VIDEO_FFLF_MODEL_ID;
    logFalEvent('outbound', fflfModelId, 'Outbound request (fal.subscribe)', {
      input: inputPayload,
    });

    let result: Awaited<ReturnType<typeof fal.subscribe>>;
    try {
      result = await fal.subscribe(fflfModelId, {
        input: inputPayload,
        logs: true,
        onQueueUpdate: update => {
          const queueUpdate = update as unknown as FalQueueUpdate;
          const normalizedLogs = normalizeQueueLogs(queueUpdate.logs);
          const resolvedRequestId = resolveQueueRequestId(queueUpdate, latestRequestId);
          if (resolvedRequestId) {
            latestRequestId = resolvedRequestId;
          }
          logFalEvent('inbound', fflfModelId, 'Queue update', {
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
      logFalEvent('error', fflfModelId, 'Request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logFalEvent('inbound', fflfModelId, 'Result received', {
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
