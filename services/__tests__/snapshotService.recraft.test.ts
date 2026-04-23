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

describe('snapshotService (Kling O3 metadata)', () => {
  it('normalizes Kling O3 options from snapshots', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'kling prompt',
        provider: 'fal',
        modelId: 'fal-ai/kling-video/o3/pro/reference-to-video',
        modelMode: 'video',
        falOptions: {
          klingO3Variant: 'edit',
          klingO3Duration: '12',
          klingO3GenerateAudio: true,
          klingO3KeepAudio: false,
        },
      },
    } as unknown as CanvasImageMetadata);

    expect(metadata?.generation?.falOptions?.klingO3Variant).toBe('edit');
    expect(metadata?.generation?.falOptions?.klingO3Duration).toBe('12');
    expect(metadata?.generation?.falOptions?.klingO3GenerateAudio).toBe(true);
    expect(metadata?.generation?.falOptions?.klingO3KeepAudio).toBe(false);
  });

  it('keeps legacy Kling O1 ref-v2v snapshots as video reference reruns', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'legacy kling prompt',
        provider: 'fal',
        modelId: 'fal-ai/kling-video/o1/video-to-video/reference',
        modelMode: 'video',
        falOptions: {
          klingO1Variant: 'refV2V',
          klingO1KeepAudio: false,
        },
      },
    } as unknown as CanvasImageMetadata);

    expect(metadata?.generation?.falOptions?.klingO1Variant).toBe('refV2V');
    expect(metadata?.generation?.falOptions?.klingO3KeepAudio).toBe(false);
  });
});
