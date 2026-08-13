import { describe, expect, it } from 'vitest';
import { normalizeSnapshotImageMetadata } from '../snapshotService';

describe('snapshotService (Seedance 2.5)', () => {
  it('preserves valid replay settings and ordered reference ids', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: '@Video1 follows @Image1 while @Audio1 plays',
        provider: 'fal',
        modelId: 'bytedance/seedance-2.5',
        modelLabel: 'Seedance 2.5 (FAL) Reference',
        modelMode: 'video',
        referenceImageIds: ['image-1'],
        referenceVideoIds: ['video-1'],
        referenceAudioIds: ['audio-1'],
        falOptions: {
          seedance25Variant: 'reference',
          seedance25AspectRatio: '21:9',
          seedance25Resolution: '480p',
          seedance25Duration: '30',
          seedance25GenerateAudio: false,
        },
      },
    });

    expect(metadata?.generation).toMatchObject({
      modelId: 'bytedance/seedance-2.5',
      referenceImageIds: ['image-1'],
      referenceVideoIds: ['video-1'],
      referenceAudioIds: ['audio-1'],
      falOptions: {
        seedance25Variant: 'reference',
        seedance25AspectRatio: '21:9',
        seedance25Resolution: '480p',
        seedance25Duration: '30',
        seedance25GenerateAudio: false,
      },
    });
  });

  it('drops invalid Seedance 2.5 replay values', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'Invalid saved settings',
        provider: 'fal',
        modelId: 'bytedance/seedance-2.5',
        modelMode: 'video',
        falOptions: {
          seedance25Variant: 'standard',
          seedance25AspectRatio: 'source',
          seedance25Resolution: '1080p',
          seedance25Duration: '31',
          seedance25GenerateAudio: 'yes',
        },
      },
    } as never);

    expect(metadata?.generation?.falOptions?.seedance25Variant).toBeUndefined();
    expect(metadata?.generation?.falOptions?.seedance25AspectRatio).toBeUndefined();
    expect(metadata?.generation?.falOptions?.seedance25Resolution).toBeUndefined();
    expect(metadata?.generation?.falOptions?.seedance25Duration).toBeUndefined();
    expect(metadata?.generation?.falOptions?.seedance25GenerateAudio).toBeUndefined();
  });

  it('preserves Volcengine Seedance 2.5 replay settings', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'A 30 second flythrough',
        provider: 'volcengine',
        modelId: 'volcengine/seedance-2',
        modelLabel: 'Seedance 2.5 (VE) Smart',
        modelMode: 'video',
        volcengineOptions: {
          seedance2Variant: 'smart',
          seedance2VolcengineModel: 'seedance25',
          seedance2AspectRatio: 'adaptive',
          seedance2Resolution: '720p',
          seedance2Duration: 'auto',
          seedance2GenerateAudio: true,
          seedance2CameraFixed: false,
          seedance2OutputFormat: 'mov',
        },
      },
    });

    expect(metadata?.generation?.volcengineOptions).toMatchObject({
      seedance2VolcengineModel: 'seedance25',
      seedance2AspectRatio: 'adaptive',
      seedance2Duration: 'auto',
      seedance2OutputFormat: 'mov',
    });
  });

  it('keeps Auto but drops other 2.5-only replay values for a 2.0 pick', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'Legacy 2.0 rerun',
        provider: 'volcengine',
        modelId: 'volcengine/seedance-2',
        modelMode: 'video',
        volcengineOptions: {
          seedance2Variant: 'smart',
          seedance2VolcengineModel: 'fast',
          seedance2Resolution: '4k',
          seedance2Duration: 'auto',
          seedance2OutputFormat: 'mov',
        },
      },
    });

    expect(metadata?.generation?.volcengineOptions).toMatchObject({
      seedance2VolcengineModel: 'fast',
      seedance2Resolution: '720p', // Fast caps at 720p.
      seedance2Duration: 'auto', // Volcengine 2.0 reruns preserve provider-selected duration.
    });
    expect(metadata?.generation?.volcengineOptions?.seedance2OutputFormat).toBeUndefined();
  });
});
