import { Tool, Path, ImageDimensions, InpaintMode } from '../types';

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

const canvasToDataUrl = (canvas: HTMLCanvasElement, mimeType: string = 'image/png'): string => {
  return canvas.toDataURL(mimeType);
};

const imageToDataUrl = (image: HTMLImageElement): string => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create canvas context');
  }
  ctx.drawImage(image, 0, 0);
  return canvasToDataUrl(canvas);
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

const resolveFalEndpoint = () => {
  if (process.env.FAL_API_URL) {
    return process.env.FAL_API_URL;
  }
  return 'https://fal.run/fal-ai/nano-banana/edit';
};

const collectReferenceDataUrls = (referenceImages: HTMLImageElement[] = []) => {
  return referenceImages.map(img => imageToDataUrl(img));
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
}: GenerateImageEditParams): Promise<{ imageBase64: string; text: string }> => {
  const apiKey = ensureFalApiKey();

  const baseImageDataUrl = imageToDataUrl(image);
  const imageUrls: string[] = [baseImageDataUrl];

  if (tool === Tool.ANNOTATE) {
    const annotationCanvas = buildAnnotationCanvas(image, paths, imageDimensions);
    imageUrls.push(canvasToDataUrl(annotationCanvas));
  } else if (tool === Tool.INPAINT) {
    const maskCanvas = buildMaskCanvas(paths, imageDimensions);
    const maskDataUrl = canvasToDataUrl(maskCanvas);
    const modePrefix = inpaintMode === 'STRICT' ? '[REPLACE_ONLY_MASKED_REGION] ' : '';
    prompt = `${modePrefix}${prompt}`;
    imageUrls.push(maskDataUrl);
  }

  if (referenceImages && referenceImages.length > 0) {
    imageUrls.push(...collectReferenceDataUrls(referenceImages));
  }

  const endpoint = resolveFalEndpoint();

  const body = {
    prompt,
    image_urls: imageUrls,
    output_format: 'png' as const,
    sync_mode: true,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL API error: ${errorText || response.statusText}`);
  }

  const result = await response.json();

  const images: Array<{ url: string }> | undefined = result?.images;
  if (!images || images.length === 0) {
    throw new Error('Fal.ai API did not return an image.');
  }

  const inlineData = await extractInlineData(images[0].url);
  const base64 = inlineData.split(',')[1];
  if (!base64) {
    throw new Error('Failed to extract image data from Fal.ai response.');
  }

  const description: string = typeof result?.description === 'string' ? result.description : '';

  return { imageBase64: base64, text: description };
};
