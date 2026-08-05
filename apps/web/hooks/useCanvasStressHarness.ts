import { useEffect } from 'react';
import type { CanvasImage } from '../types';
import type { CommitOverrides } from './useCanvasHistory';

const DEFAULT_STRESS_ITEM_COUNT = 500;
const STRESS_SOURCE_POOL_LIMIT = 8;
const STRESS_ITEM_WIDTH = 2048;
const STRESS_ITEM_HEIGHT = 1152;
const STRESS_ITEM_GAP = 100;

type CanvasStressWindow = Window & {
  __stressCanvas?: (count?: number) => string;
};

type CanvasCommit = (overrides?: CommitOverrides) => void;

const createStressSources = (sourceCount: number): HTMLImageElement[] => (
  Array.from({ length: sourceCount }, (_, sourceIndex) => {
    const tile = document.createElement('canvas');
    tile.width = STRESS_ITEM_WIDTH;
    tile.height = STRESS_ITEM_HEIGHT;
    const tileCtx = tile.getContext('2d');
    if (tileCtx) {
      tileCtx.fillStyle = `hsl(${(sourceIndex * 47) % 360}, 60%, 40%)`;
      tileCtx.fillRect(0, 0, tile.width, tile.height);
      tileCtx.fillStyle = '#ffffff';
      tileCtx.font = '200px sans-serif';
      tileCtx.fillText(String(sourceIndex), 120, 640);
    }
    Object.defineProperty(tile, 'naturalWidth', { value: tile.width }); // The LOD cache reads image-like dimensions.
    Object.defineProperty(tile, 'naturalHeight', { value: tile.height });
    return tile as unknown as HTMLImageElement; // Canvas is drawable anywhere the stress-only image source is used.
  })
);

const createStressImages = (count: number): CanvasImage[] => {
  const itemCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const columns = Math.ceil(Math.sqrt(itemCount));
  const sourceCount = Math.min(itemCount, STRESS_SOURCE_POOL_LIMIT); // Reuse a small source pool instead of allocating gigabytes.
  const sources = createStressSources(sourceCount);
  return Array.from({ length: itemCount }, (_, index) => ({
    id: `stress-${index}`,
    element: sources[index % sourceCount],
    mediaType: 'image',
    x: (index % columns) * (STRESS_ITEM_WIDTH + STRESS_ITEM_GAP),
    y: Math.floor(index / columns) * (STRESS_ITEM_HEIGHT + STRESS_ITEM_GAP),
    width: STRESS_ITEM_WIDTH,
    height: STRESS_ITEM_HEIGHT,
    rotation: 0,
    naturalWidth: STRESS_ITEM_WIDTH,
    naturalHeight: STRESS_ITEM_HEIGHT,
    file: new File([''], `stress-${index}.png`, { type: 'image/png' }),
  } as CanvasImage));
};

export const useCanvasStressHarness = (handleCommit: CanvasCommit): void => {
  useEffect(() => {
    const isDevBuild = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
    if (!isDevBuild) return;
    const devWindow = window as CanvasStressWindow;
    devWindow.__stressCanvas = (count = DEFAULT_STRESS_ITEM_COUNT) => {
      const items = createStressImages(count);
      handleCommit({ images: items });
      return `${items.length} synthetic items committed`;
    };
    return () => {
      delete devWindow.__stressCanvas;
    };
  }, [handleCommit]);
};
