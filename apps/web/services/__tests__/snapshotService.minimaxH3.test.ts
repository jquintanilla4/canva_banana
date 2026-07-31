import { describe, expect, it } from 'vitest';
import { normalizeSnapshotImageMetadata } from '../snapshotService';

describe('snapshotService (MiniMax H3)', () => {
  it('preserves valid H3 replay options and reference ids', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: '@Image1 crosses the room',
        provider: 'fal',
        modelId: 'minimax/h3',
        modelLabel: 'MiniMax H3 Reference',
        modelMode: 'video',
        referenceImageIds: ['image-1'],
        referenceVideoIds: ['video-1'],
        referenceAudioIds: ['audio-1'],
        falOptions: {
          miniMaxH3Variant: 'reference',
          miniMaxH3AspectRatio: 'adaptive',
          miniMaxH3Duration: '15',
        },
      },
    });

    expect(metadata?.generation?.modelId).toBe('minimax/h3');
    expect(metadata?.generation?.referenceImageIds).toEqual(['image-1']);
    expect(metadata?.generation?.referenceVideoIds).toEqual(['video-1']);
    expect(metadata?.generation?.referenceAudioIds).toEqual(['audio-1']);
    expect(metadata?.generation?.falOptions).toEqual(expect.objectContaining({
      miniMaxH3Variant: 'reference',
      miniMaxH3AspectRatio: 'adaptive',
      miniMaxH3Duration: '15',
    }));
  });

  it('drops invalid H3 replay values', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'Invalid saved options',
        provider: 'fal',
        modelId: 'minimax/h3',
        modelMode: 'video',
        falOptions: {
          miniMaxH3Variant: 'smart',
          miniMaxH3AspectRatio: 'source',
          miniMaxH3Duration: '4',
        },
      },
    } as never);

    expect(metadata?.generation?.falOptions?.miniMaxH3Variant).toBeUndefined();
    expect(metadata?.generation?.falOptions?.miniMaxH3AspectRatio).toBeUndefined();
    expect(metadata?.generation?.falOptions?.miniMaxH3Duration).toBeUndefined();
  });
});
