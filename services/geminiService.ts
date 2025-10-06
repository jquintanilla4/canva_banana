import { GoogleGenAI, Modality, Part } from "@google/genai";
import { Tool, Path, ImageDimensions, InpaintMode } from '../types';

let cachedClient: GoogleGenAI | null = null;

const ensureClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
};

interface GenerateImageEditParams {
  prompt: string;
  image: HTMLImageElement;
  tool: Tool;
  paths: Path[];
  imageDimensions: ImageDimensions;
  mimeType: string;
  inpaintMode: InpaintMode;
  referenceImages?: HTMLImageElement[];
}

const getBase64FromCanvas = (canvas: HTMLCanvasElement): { data: string; mimeType: string } => {
  const dataUrl = canvas.toDataURL('image/png');
  return {
    data: dataUrl.split(',')[1],
    mimeType: 'image/png',
  };
};

export const generateImageEdit = async ({
  prompt,
  image,
  tool,
  paths,
  imageDimensions,
  mimeType,
  inpaintMode,
  referenceImages,
}: GenerateImageEditParams): Promise<{ imageBase64: string; imagesBase64: string[]; text: string }> => {
  const model = 'gemini-2.5-flash-image';

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = imageDimensions.width;
  offscreenCanvas.height = imageDimensions.height;
  const ctx = offscreenCanvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create offscreen canvas context');
  }

  const parts: Part[] = [];

  if (tool === Tool.SELECTION || tool === Tool.FREE_SELECTION) {
    const originalImageCanvas = document.createElement('canvas');
    originalImageCanvas.width = imageDimensions.width;
    originalImageCanvas.height = imageDimensions.height;
    const originalCtx = originalImageCanvas.getContext('2d');
    if (!originalCtx) throw new Error("Cannot get original image context");
    originalCtx.drawImage(image, 0, 0);
    const { data: originalData, mimeType: originalMimeType } = getBase64FromCanvas(originalImageCanvas);
    parts.push({ inlineData: { data: originalData, mimeType: originalMimeType } });
    parts.push({ text: prompt });

  } else if (tool === Tool.ANNOTATE) {
    const annotationCanvas = document.createElement('canvas');
    annotationCanvas.width = imageDimensions.width;
    annotationCanvas.height = imageDimensions.height;
    const annotationCtx = annotationCanvas.getContext('2d');
    if (!annotationCtx) throw new Error('Could not create annotation canvas context');

    paths.forEach(path => {
      if (path.tool === Tool.ERASE) {
        annotationCtx.globalCompositeOperation = 'destination-out';
        annotationCtx.strokeStyle = 'rgba(0,0,0,1)';
      } else { 
        annotationCtx.globalCompositeOperation = 'source-over';
        annotationCtx.strokeStyle = path.color;
      }
      
      annotationCtx.lineWidth = path.size;
      annotationCtx.lineCap = 'round';
      annotationCtx.lineJoin = 'round';
      annotationCtx.beginPath();
      path.points.forEach((point, index) => {
        if (index === 0) {
          annotationCtx.moveTo(point.x, point.y);
        } else {
          annotationCtx.lineTo(point.x, point.y);
        }
      });
      annotationCtx.stroke();
    });
    annotationCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(image, 0, 0, imageDimensions.width, imageDimensions.height);
    
    ctx.drawImage(annotationCanvas, 0, 0);

    const { data: rasterizedData, mimeType: rasterizedMimeType } = getBase64FromCanvas(offscreenCanvas);
    parts.push({ inlineData: { data: rasterizedData, mimeType: rasterizedMimeType } });
    parts.push({ text: prompt });

  } else if (tool === Tool.INPAINT) {
    const originalImageCanvas = document.createElement('canvas');
    originalImageCanvas.width = imageDimensions.width;
    originalImageCanvas.height = imageDimensions.height;
    const originalCtx = originalImageCanvas.getContext('2d');
    if (!originalCtx) throw new Error("Cannot get original image context");
    originalCtx.drawImage(image, 0, 0);
    const { data: originalData, mimeType: originalMimeType } = getBase64FromCanvas(originalImageCanvas);

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    paths.forEach(path => {
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
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
    
    const { data: maskData, mimeType: maskMimeType } = getBase64FromCanvas(offscreenCanvas);
    
    parts.push({ inlineData: { data: originalData, mimeType: originalMimeType } });
    parts.push({ inlineData: { data: maskData, mimeType: maskMimeType } });

    const finalPrompt = inpaintMode === 'CREATIVE' ? `[INPAINT] ${prompt}` : `[INPAINT][REPLACE_ONLY_MASKED_REGION] ${prompt}`;
    parts.push({ text: finalPrompt });

  } else {
    throw new Error("Invalid tool for generation");
  }

  if (referenceImages && referenceImages.length > 0) {
    const textPart = parts.pop();

    for (const refImage of referenceImages) {
        const refCanvas = document.createElement('canvas');
        refCanvas.width = refImage.width;
        refCanvas.height = refImage.height;
        const refCtx = refCanvas.getContext('2d');
        if (!refCtx) {
            console.warn("Could not create reference image canvas context, skipping image.");
            continue;
        };
        refCtx.drawImage(refImage, 0, 0);
        const { data: refData, mimeType: refMimeType } = getBase64FromCanvas(refCanvas);
        parts.push({ inlineData: { data: refData, mimeType: refMimeType } });
    }

    if (textPart) {
      parts.push(textPart);
    }
  }

  const client = ensureClient();

  const response = await client.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });
  
  let resultImageBase64 = '';
  let resultText = '';

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      resultImageBase64 = part.inlineData.data;
    } else if (part.text) {
      resultText = part.text;
    }
  }

  if (!resultImageBase64) {
    throw new Error("API did not return an image.");
  }

  return { imageBase64: resultImageBase64, imagesBase64: [resultImageBase64], text: resultText };
};
