import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { CanvasImage, Point } from '../../../types';
import { getImageBounds } from '../geometry';
import { createGifPlayback, type GifPlayback } from '../render/gifPlayback';

interface GifPlaybackInput {
  images: readonly CanvasImage[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scaleRef: RefObject<number>;
  panRef: RefObject<Point>;
  scheduleDraw: () => void;
  onError?: (message: string) => void;
}
export const useGifPlayback = ({ images, canvasRef, scaleRef, panRef, scheduleDraw, onError }: GifPlaybackInput) => {
  const playbackRef = useRef<GifPlayback | null>(null);
  const inputRef = useRef({ images, scheduleDraw, onError });
  const lastView = useRef<{ images: readonly CanvasImage[]; key: string } | null>(null);
  useLayoutEffect(() => { inputRef.current = { images, scheduleDraw, onError }; }, [images, scheduleDraw, onError]);
  const reconcile = useCallback(() => {
    const canvas = canvasRef.current;
    const playback = playbackRef.current;
    if (!canvas || !playback) return;
    const scale = Math.max(0.0001, scaleRef.current);
    const pan = panRef.current;
    const currentImages = inputRef.current.images;
    const key = `${pan.x},${pan.y},${scale},${canvas.width},${canvas.height},${document.hidden}`;
    if (lastView.current?.images === currentImages && lastView.current.key === key) return;
    lastView.current = { images: currentImages, key };
    const viewport = { minX: -pan.x / scale, minY: -pan.y / scale, maxX: (canvas.width - pan.x) / scale, maxY: (canvas.height - pan.y) / scale };
    playback.reconcile(currentImages, image => {
      const bounds = getImageBounds(image);
      return bounds.minX <= viewport.maxX && bounds.maxX >= viewport.minX && bounds.minY <= viewport.maxY && bounds.maxY >= viewport.minY;
    }, document.hidden);
  }, [canvasRef, scaleRef, panRef]);
  useLayoutEffect(() => {
    playbackRef.current = createGifPlayback(() => inputRef.current.scheduleDraw(), message => inputRef.current.onError?.(message));
    lastView.current = null;
    const onVisibility = () => { reconcile(); inputRef.current.scheduleDraw(); };
    document.addEventListener('visibilitychange', onVisibility);
    inputRef.current.scheduleDraw();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      playbackRef.current?.dispose();
      playbackRef.current = null;
      lastView.current = null;
    };
  }, [reconcile]);
  useLayoutEffect(() => { reconcile(); }, [images, reconcile]);
  return { playbackRef, reconcile };
};
