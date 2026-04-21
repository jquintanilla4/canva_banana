import { describe, expect, it } from 'vitest';
import { normalizeSnapshotImageMetadata } from '../snapshotService';
import type { CanvasImageMetadata } from '../../types';

describe('snapshotService (Recraft metadata)', () => {
  it('normalizes Recraft color options from snapshots', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'text_to_image',
        prompt: 'recraft prompt',
        provider: 'fal',
        modelId: 'fal-ai/recraft/v4/pro/text-to-image',
        falOptions: {
          recraftImageSize: 'landscape_16_9',
          recraftBackgroundColor: { r: -1, g: 127.6, b: 999 },
          recraftColors: [
            { r: 1, g: 2, b: 3 },
            { r: 4, g: 5, b: 6 },
            { r: 7, g: 8, b: 9 },
            { r: 10, g: 11, b: 12 },
            { r: 13, g: 14, b: 15 },
            { r: 16, g: 17, b: 18 },
          ],
        },
      },
    });

    expect(metadata?.generation?.falOptions?.recraftImageSize).toBe('landscape_16_9');
    expect(metadata?.generation?.falOptions?.recraftBackgroundColor).toEqual({ r: 0, g: 128, b: 255 });
    expect(metadata?.generation?.falOptions?.recraftColors).toEqual([
      { r: 1, g: 2, b: 3 },
      { r: 4, g: 5, b: 6 },
      { r: 7, g: 8, b: 9 },
      { r: 10, g: 11, b: 12 },
      { r: 13, g: 14, b: 15 },
    ]);
  });
});

describe('snapshotService (Sync v3 metadata)', () => {
  it('normalizes legacy lip sync audio mode snapshots into sync mode', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: '',
        provider: 'fal',
        modelId: 'fal-ai/sync-lipsync/react-1',
        modelMode: 'video',
        falOptions: {
          lipsyncAudioMode: 'remap',
        },
      },
    } as unknown as CanvasImageMetadata);

    expect(metadata?.generation?.falOptions?.lipsyncSyncMode).toBe('remap');
  });
});
