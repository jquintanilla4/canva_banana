import { GIF_MIME_TYPE, isGifFile } from './gifMedia';
import type { CanvasImage } from '../types';

export const SVG_MIME_TYPE = 'image/svg+xml';
export const isSvgFile = (file: Pick<File, 'type' | 'name'>): boolean =>
  file.type.split(';', 1)[0].toLowerCase() === SVG_MIME_TYPE || /\.svg$/i.test(file.name);
export const isSvgImage = (image: CanvasImage): boolean => image.mediaType === 'image' && isSvgFile(image.file);

export const readBlobBytes = (blob: Blob): Promise<ArrayBuffer> => typeof blob.arrayBuffer === 'function'
  ? blob.arrayBuffer()
  : new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image source could not be read.'));
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('The image source could not be read.'));
    reader.readAsArrayBuffer(blob);
  });

export const decodeSvgBytes = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const encoding = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0)
    ? 'utf-16le' : (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c)
      ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(buffer);
};

export const parseSvg = (text: string): SVGSVGElement => {
  const document = new DOMParser().parseFromString(text, SVG_MIME_TYPE);
  const root = document.documentElement;
  if (document.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
    throw new Error('Invalid SVG image: expected a well-formed SVG document.');
  }
  if (!(root instanceof SVGSVGElement)) throw new Error('Invalid SVG image root.');
  return root;
};

export const normalizeImageFile = async (file: File): Promise<File> => {
  if (isGifFile(file)) {
    const signature = new TextDecoder().decode(await readBlobBytes(file.slice(0, 6)));
    if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('Invalid GIF image: expected a GIF source file.');
    return file.type === GIF_MIME_TYPE ? file : new File([file], file.name, { type: GIF_MIME_TYPE, lastModified: file.lastModified });
  }
  if (!isSvgFile(file)) return file;
  parseSvg(decodeSvgBytes(await readBlobBytes(file)));
  return file.type === SVG_MIME_TYPE ? file : new File([file], file.name, { type: SVG_MIME_TYPE, lastModified: file.lastModified });
};
