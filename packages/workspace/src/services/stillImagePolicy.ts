import type { CanvasImage } from '../types';
import { isGifImage } from './gifMedia';
import { isSvgImage } from './svgMedia';

export const preservesOriginalImage = (image: CanvasImage): boolean => isSvgImage(image) || isGifImage(image);
export const confirmRasterCopies = (images: readonly CanvasImage[], operation: string): boolean => {
  const sources = [...new Map(images.filter(preservesOriginalImage).map(image => [image.file, image])).values()];
  if (sources.length === 0) return true;
  const gifCount = sources.filter(isGifImage).length;
  const svgCount = sources.length - gifCount;
  const formats = [svgCount > 0 ? `${svgCount} SVG image${svgCount === 1 ? '' : 's'}` : '', gifCount > 0 ? `${gifCount} GIF image${gifCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  const firstFrame = gifCount > 0 ? ' GIF copies use the first frame only, without animation.' : '';
  return window.confirm(`${operation} requires raster copies of ${formats}.${firstFrame} Your originals stay on the canvas. Continue?`);
};
