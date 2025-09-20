import { GoogleGenAI, Modality, Part } from "@google/genai";
import { Tool, Path, ImageDimensions, InpaintMode } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
}: GenerateImageEditParams): Promise<{ imageBase64: string, text: string }> => {
  const model = 'gemini-2.5-flash-image-preview';

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = imageDimensions.width;
  offscreenCanvas.height = imageDimensions.height;
  const ctx = offscreenCanvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create offscreen canvas context');
  }

  const parts: Part[] = [];

  if (tool === Tool.SELECTION) {
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
    ctx.drawImage(image, 0, 0, imageDimensions.width, imageDimensions.height);
    paths.forEach(path => {
      ctx.strokeStyle = path.color;
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
      ctx.strokeStyle = 'white';
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
    
    const { data: maskData, mimeType: maskMimeType } = getBase64FromCanvas(offscreenCanvas);
    
    parts.push({ inlineData: { data: originalData, mimeType: originalMimeType } });
    parts.push({ inlineData: { data: maskData, mimeType: maskMimeType } });

    const finalPrompt = inpaintMode === 'CREATIVE' ? `[INPAINT] ${prompt}` : `[INPAINT][PRESERVE_IMAGE] ${prompt}`;
    parts.push({ text: finalPrompt });

  } else {
    throw new Error("Invalid tool for generation");
  }

  if (referenceImages && referenceImages.length > 0) {
    // The text part is always last. Pop it, add reference images, then push it back.
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

  const response = await ai.models.generateContent({
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

  return { imageBase64: resultImageBase64, text: resultText };
};
