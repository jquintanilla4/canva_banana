import { getNaturalSize, loadMediaFromBlob } from './mediaService';
import { workspaceFetch } from './workspaceSession';
import type { CanvasImage } from '../types';

export const hasVolcengineLastFrame = (images: readonly CanvasImage[], taskId: string): boolean =>
  images.some(image => image.mediaType === 'image' && image.metadata?.volcengineLastFrameTaskId === taskId);

export const downloadVolcengineLastFrame = async (url: string, signal?: AbortSignal): Promise<CanvasImage> => {
  const response = await workspaceFetch(url, { signal });
  if (!response.ok) throw new Error(`Final frame download failed (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (blob.type && blob.type !== 'image/jpeg') throw new Error('Ark returned an invalid final frame.');
  const file = new File([blob], 'seedance-last-frame.jpg', { type: 'image/jpeg' });
  const element = await loadMediaFromBlob(file, 'image');
  signal?.throwIfAborted();
  const { naturalWidth, naturalHeight } = getNaturalSize(element);
  return {
    id: crypto.randomUUID(), element, mediaType: 'image', file, x: 0, y: 0, rotation: 0,
    width: naturalWidth, height: naturalHeight, naturalWidth, naturalHeight,
    metadata: { source: 'generated', modelLabel: 'Seedance final frame' },
  };
};
