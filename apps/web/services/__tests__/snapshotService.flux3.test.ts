import { describe, expect, it } from 'vitest';
import { normalizeSnapshotImageMetadata, restoreSnapshotFromFile } from '../snapshotService';

describe('snapshotService (Flux 3)', () => {
  it('preserves valid Flux replay settings and timing-by-media-ID', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: '@Image1 becomes @Image2',
        provider: 'fal',
        modelId: 'blackforestlabs/flux-3',
        modelMode: 'video',
        referenceImageIds: ['image-1', 'image-2'],
        falOptions: {
          flux3Variant: 'keyframes',
          flux3AspectRatio: '2:1',
          flux3Resolution: '1080p',
          flux3Duration: '10',
          flux3GenerateAudio: false,
          flux3KeyframeTimings: [
            { imageId: 'image-1', timestampSeconds: 0 },
            { imageId: 'image-2', timestampSeconds: 10 },
          ],
        },
      },
    });

    expect(metadata?.generation?.falOptions).toEqual(expect.objectContaining({
      flux3Variant: 'keyframes',
      flux3AspectRatio: '2:1',
      flux3Resolution: '1080p',
      flux3Duration: '10',
      flux3GenerateAudio: false,
      flux3KeyframeTimings: [
        { imageId: 'image-1', timestampSeconds: 0 },
        { imageId: 'image-2', timestampSeconds: 10 },
      ],
    }));
  });

  it('drops malformed Flux replay values and timing rows', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'Invalid settings',
        provider: 'fal',
        modelId: 'blackforestlabs/flux-3',
        modelMode: 'video',
        falOptions: {
          flux3Variant: 'unknown',
          flux3AspectRatio: 'source',
          flux3Resolution: '4k',
          flux3Duration: '30',
          flux3GenerateAudio: 'yes',
          flux3KeyframeTimings: [{ imageId: '', timestampSeconds: -1 }],
        },
      },
    } as never);

    expect(metadata?.generation?.falOptions).toBeUndefined();
  });

  it('sanitizes malformed persisted timings at snapshot restore boundaries', async () => {
    const json = JSON.stringify({
      version: 1,
      createdAt: new Date(0).toISOString(),
      state: {
        images: [],
        notes: [],
        paths: [],
        meta: {
          flux3KeyframeTimings: [
            null,
            { imageId: 'meta-valid', timestampSeconds: 2 },
            { imageId: 'meta-valid', timestampSeconds: 3 },
            { imageId: 'meta-negative', timestampSeconds: -1 },
          ],
        },
        videoPromptBars: [{
          id: 'flux-bar',
          modelId: 'blackforestlabs/flux-3',
          falOptions: {
            flux3Variant: 'keyframes',
            flux3Duration: '10',
            flux3KeyframeTimings: [
              null,
              { imageId: 'bar-valid', timestampSeconds: 0 },
              { imageId: 'bar-valid', timestampSeconds: 5 },
              { imageId: '', timestampSeconds: 1 },
              { imageId: 'bar-invalid', timestampSeconds: '2' },
            ],
          },
        }],
      },
    });
    const file = new File([json], 'malformed-flux.json', { type: 'application/json' });
    if (typeof file.text !== 'function') {
      Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) }); // jsdom File lacks text().
    }

    const restored = await restoreSnapshotFromFile(file, {
      brushSize: 10,
      eraserSize: 10,
      brushColor: '#000000',
    });

    expect(restored.meta?.flux3KeyframeTimings).toEqual([
      { imageId: 'meta-valid', timestampSeconds: 2 },
    ]);
    expect(restored.videoPromptBars[0]?.falOptions?.flux3KeyframeTimings).toEqual([
      { imageId: 'bar-valid', timestampSeconds: 0 },
    ]);
  });
});
