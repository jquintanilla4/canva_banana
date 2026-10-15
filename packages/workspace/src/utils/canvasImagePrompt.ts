import type { CanvasImage } from '../types';

export const getCanvasImagePrompt = (image: CanvasImage | null | undefined): string => (
  image?.metadata?.prompt?.trim() || image?.metadata?.generation?.prompt?.trim() || ''
); // Prefer the display prompt, then fall back to saved generation inputs.
