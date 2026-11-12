import { isGifImage } from './gifMedia';
import type { CanvasImage } from '../types';
import { getNaturalSize, loadMediaFromBlob } from './mediaService';
import { ensureRealSnapshotFile } from './snapshotService';
import { decodeSvgBytes, isSvgImage, normalizeImageFile, parseSvg, readBlobBytes, SVG_MIME_TYPE } from './svgMedia';

export type RasterImageExportFormat = 'image/png' | 'image/jpeg' | 'image/webp';
export type ImageExportFormat = RasterImageExportFormat | 'image/svg+xml';
export type ImageExportRequest =
  | { format: ImageExportFormat; geometry: 'current' | 'intrinsic' }
  | { format: 'original'; geometry?: never };
export type SvgDownloadFormat = ImageExportFormat | 'original';
export interface LocalImageCrop { x: number; y: number; width: number; height: number }

const SVG_NS = 'http://www.w3.org/2000/svg';
const CROP_ROLE = 'canvas-banana-crop-v1';
const extension = (format: ImageExportFormat): string => format === SVG_MIME_TYPE ? 'svg' : format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
const outputName = (image: CanvasImage, suffix: string, format: ImageExportFormat): string => `${image.file.name.replace(/\.[^.]+$/, '') || 'image'}${suffix}.${extension(format)}`;
const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;
const nearInteger = (value: number): number => Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value;

const createRoot = (width: number, height: number, viewBox: readonly number[]): SVGSVGElement => {
  const root = document.implementation.createDocument(SVG_NS, 'svg', null).documentElement;
  if (!(root instanceof SVGSVGElement)) throw new Error('SVG serialization is unavailable.');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', viewBox.join(' '));
  root.setAttribute('preserveAspectRatio', 'none');
  return root;
};
const svgFile = (root: SVGSVGElement, name: string): File => new File([new XMLSerializer().serializeToString(root)], name, { type: SVG_MIME_TYPE });
const base64Bytes = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
};
interface SvgSource { file: File; width: number; height: number; viewport: LocalImageCrop }
const getSvgSource = async (image: CanvasImage): Promise<SvgSource> => {
  const file = await normalizeImageFile(await ensureRealSnapshotFile(image.file));
  const root = parseSvg(decodeSvgBytes(await readBlobBytes(file)));
  const { naturalWidth, naturalHeight } = getNaturalSize(image.element);
  const retainedSource: SvgSource = { file, width: naturalWidth, height: naturalHeight, viewport: { x: 0, y: 0, width: naturalWidth, height: naturalHeight } };
  const children = Array.from(root.childNodes).filter(node => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
  if (root.getAttribute('data-canvas-role') === CROP_ROLE && children.length === 1 && children[0] instanceof SVGElement) {
    const child = children[0];
    const allowedRoot = ['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'data-canvas-role', 'data-source-name'];
    const allowedImage = ['href', 'width', 'height', 'preserveAspectRatio'];
    const viewBox = (root.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    const width = Number(child.getAttribute('width'));
    const height = Number(child.getAttribute('height'));
    const href = child.getAttribute('href') || '';
    if (child.localName === 'image' && child.childNodes.length === 0 &&
        Array.from(root.attributes).every(attribute => allowedRoot.includes(attribute.name)) &&
        Array.from(child.attributes).every(attribute => allowedImage.includes(attribute.name)) &&
        root.getAttribute('preserveAspectRatio') === 'none' && child.getAttribute('preserveAspectRatio') === 'none' &&
        viewBox.length === 4 && viewBox.every(Number.isFinite) && finitePositive(viewBox[2]) && finitePositive(viewBox[3]) &&
        finitePositive(width) && finitePositive(height) && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]*={0,2}$/.test(href)) {
      try {
        const payload = Uint8Array.from(atob(href.split(',')[1]), character => character.charCodeAt(0));
        const source = await normalizeImageFile(new File([payload], root.getAttribute('data-source-name') || 'original.svg', { type: SVG_MIME_TYPE }));
        return { file: source, width, height, viewport: { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] } };
      } catch {
        return retainedSource;
      }
    }
  }
  return retainedSource;
};
const embedSource = async (root: SVGSVGElement, source: File, width: number, height: number): Promise<SVGImageElement> => {
  const child = root.ownerDocument.createElementNS(SVG_NS, 'image');
  child.setAttribute('href', `data:${SVG_MIME_TYPE};base64,${base64Bytes(new Uint8Array(await readBlobBytes(source)))}`);
  child.setAttribute('width', String(width));
  child.setAttribute('height', String(height));
  child.setAttribute('preserveAspectRatio', 'none');
  root.appendChild(child);
  return child;
};
const encodeCanvas = (canvas: HTMLCanvasElement, format: RasterImageExportFormat): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob(blob => {
    if (!blob) reject(new Error('Image export failed.'));
    else if (blob.type !== format) reject(new Error(`The ${format} encoder is unavailable.`));
    else resolve(blob);
  }, format);
});

export const exportCanvasImage = async (image: CanvasImage, request: ImageExportRequest): Promise<File> => {
  if (image.mediaType !== 'image') throw new Error('Image export requires a still image.');
  if (request.format === 'original') {
    if (isGifImage(image)) return ensureRealSnapshotFile(image.file);
    if (!isSvgImage(image)) throw new Error('Original source export requires an SVG or GIF image.');
    return (await getSvgSource(image)).file;
  }
  if (!['image/png', 'image/jpeg', 'image/webp', SVG_MIME_TYPE].includes(request.format)) throw new Error('Unsupported export image type.');
  const intrinsic = getNaturalSize(image.element);
  const width = request.geometry === 'current' ? image.width : intrinsic.naturalWidth;
  const height = request.geometry === 'current' ? image.height : intrinsic.naturalHeight;
  const rotation = request.geometry === 'current' ? image.rotation ?? 0 : 0;
  if (!finitePositive(width) || !finitePositive(height) || !Number.isFinite(rotation)) throw new Error('Image geometry is invalid.');
  const boundsWidth = nearInteger(Math.abs(Math.cos(rotation)) * width + Math.abs(Math.sin(rotation)) * height);
  const boundsHeight = nearInteger(Math.abs(Math.sin(rotation)) * width + Math.abs(Math.cos(rotation)) * height);
  if (request.format === SVG_MIME_TYPE) {
    if (!isSvgImage(image)) throw new Error('SVG export requires an SVG source; raster images cannot be traced.');
    const source = await normalizeImageFile(await ensureRealSnapshotFile(image.file));
    const root = createRoot(boundsWidth, boundsHeight, [0, 0, boundsWidth, boundsHeight]);
    root.setAttribute('data-canvas-role', 'canvas-banana-export-v1');
    const child = await embedSource(root, source, width, height);
    child.setAttribute('transform', `translate(${boundsWidth / 2} ${boundsHeight / 2}) rotate(${rotation * 180 / Math.PI}) translate(${-width / 2} ${-height / 2})`);
    return svgFile(root, outputName(image, '-export', SVG_MIME_TYPE));
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(boundsWidth));
  canvas.height = Math.max(1, Math.ceil(boundsHeight));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable.');
  if (request.format === 'image/jpeg') {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.translate(boundsWidth / 2, boundsHeight / 2);
  context.rotate(rotation);
  context.drawImage(image.element, -width / 2, -height / 2, width, height);
  const blob = await encodeCanvas(canvas, request.format);
  return new File([blob], outputName(image, '-export', request.format), { type: blob.type });
};

export const cropCanvasImage = async (image: CanvasImage, crop: LocalImageCrop): Promise<CanvasImage> => {
  if (image.mediaType !== 'image' || ![crop.x, crop.y].every(Number.isFinite) || ![crop.width, crop.height, image.width, image.height].every(finitePositive) ||
      crop.x < 0 || crop.y < 0 || crop.x + crop.width > image.width + 1e-6 || crop.y + crop.height > image.height + 1e-6) throw new Error('The image crop is invalid.');
  let file: File;
  if (isSvgImage(image)) {
    const source = await getSvgSource(image);
    const viewBox = [source.viewport.x + crop.x / image.width * source.viewport.width,
      source.viewport.y + crop.y / image.height * source.viewport.height,
      crop.width / image.width * source.viewport.width, crop.height / image.height * source.viewport.height];
    const root = createRoot(crop.width, crop.height, viewBox);
    root.setAttribute('data-canvas-role', CROP_ROLE);
    root.setAttribute('data-source-name', source.file.name);
    await embedSource(root, source.file, source.width, source.height);
    file = svgFile(root, outputName(image, '-cropped', SVG_MIME_TYPE));
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to crop image.');
    const natural = getNaturalSize(image.element);
    context.drawImage(image.element, crop.x * natural.naturalWidth / image.width, crop.y * natural.naturalHeight / image.height,
      crop.width * natural.naturalWidth / image.width, crop.height * natural.naturalHeight / image.height, 0, 0, canvas.width, canvas.height);
    const blob = await encodeCanvas(canvas, 'image/png');
    file = new File([blob], outputName(image, '-cropped', 'image/png'), { type: blob.type });
  }
  const element = await loadMediaFromBlob(file, 'image');
  const natural = getNaturalSize(element);
  const offsetX = crop.x + crop.width / 2 - image.width / 2;
  const offsetY = crop.y + crop.height / 2 - image.height / 2;
  const rotation = image.rotation ?? 0;
  return { ...image, file, element, ...natural, width: crop.width, height: crop.height,
    x: image.x + image.width / 2 + Math.cos(rotation) * offsetX - Math.sin(rotation) * offsetY - crop.width / 2,
    y: image.y + image.height / 2 + Math.sin(rotation) * offsetX + Math.cos(rotation) * offsetY - crop.height / 2,
    metadata: { ...image.metadata, source: image.metadata?.source ?? 'derived' } };
};
