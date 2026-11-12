import type { CanvasImage } from '../types';

export const GIF_MIME_TYPE = 'image/gif';
export const isGifFile = (file: Pick<File, 'type' | 'name'>): boolean =>
  file.type.split(';', 1)[0].toLowerCase() === GIF_MIME_TYPE || /\.gif$/i.test(file.name);
export const isGifImage = (image: CanvasImage): boolean => image.mediaType === 'image' && isGifFile(image.file);
