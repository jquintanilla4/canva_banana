import { fal } from '@fal-ai/client';
import {
  Tool,
  Path,
  ImageDimensions,
  InpaintMode,
  FalImageSizeOption,
  FalAspectRatioOption,
} from '../types';

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

const FAL_MODEL_ID = process.env.FAL_MODEL_ID || 'fal-ai/nano-banana/edit';
const SEEDREAM_MODEL_ID = 'fal-ai/bytedance/seedream/v4/edit';
const NANO_BANANA_MODEL_ID = 'fal-ai/nano-banana/edit';

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
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create canvas context');
  }
  ctx.drawImage(image, 0, 0);
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
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create annotation canvas context');
  }

  ctx.drawImage(baseImage, 0, 0, dimensions.width, dimensions.height);

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
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
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

const extractInlineData = async (url: string): Promise<string> => {
  if (url.startsWith('data:')) {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to download image from Fal.ai response.');
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

  const body: {
    prompt: string;
    image_urls: string[];
    output_format: 'png';
    sync_mode: true;
    image_size?: { width: number; height: number } | string;
    num_images?: number;
    aspect_ratio?: string;
  } = {
    prompt,
    image_urls: imageUrls,
    output_format: 'png' as const,
    sync_mode: true,
  };

  let latestRequestId: string | undefined;

  const modelId = options.modelId || FAL_MODEL_ID;
  const imageSizeOption: FalImageSizeOption = options.imageSize ?? 'default';
  const aspectRatioOption: FalAspectRatioOption = options.aspectRatio ?? 'default';
  const numImagesOption = options.numImages;

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

  const result = await fal.subscribe(modelId, {
    input: body,
    logs: true,
    onQueueUpdate: update => {
      const queueUpdate = update as FalQueueUpdate;
      if (queueUpdate.requestId) {
        latestRequestId = queueUpdate.requestId;
      }
      options.onQueueUpdate?.({
        ...queueUpdate,
        requestId: queueUpdate.requestId || latestRequestId || '',
      });
    },
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

interface RemoveBackgroundOptions {
  onQueueUpdate?: (update: FalQueueUpdate) => void;
}

export const removeBackground = async (
  image: HTMLImageElement,
  options: RemoveBackgroundOptions = {},
): Promise<{ imageBase64: string; requestId?: string }> => {
  ensureFalClientConfigured();

  const imageUrl = await uploadImageElementToFal(image);

  let latestRequestId: string | undefined;

  const result = await fal.subscribe('fal-ai/bria/background/remove', {
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
      options.onQueueUpdate?.({
        ...queueUpdate,
        requestId: queueUpdate.requestId || latestRequestId || '',
      });
    },
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
