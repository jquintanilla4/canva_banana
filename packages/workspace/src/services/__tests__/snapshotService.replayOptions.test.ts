import { describe, expect, it } from 'vitest';
import { normalizeSnapshotImageMetadata } from '../snapshotService';

const buildMetadata = (falOptions: Record<string, unknown>) => normalizeSnapshotImageMetadata({
  source: 'generated',
  generation: {
    kind: 'video',
    prompt: 'Replay these settings',
    provider: 'fal',
    modelId: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    modelMode: 'video',
    falOptions,
  },
}); // Only falOptions vary between these cases.

describe('snapshotService replay options', () => {
  it('keeps Seedance 1.5, Infinitalk and Kling Control settings across a reopen', () => {
    const metadata = buildMetadata({
      seedance15AspectRatio: '9:16',
      seedance15Resolution: '1080p',
      seedance15Duration: '10',
      seedance15CameraFixed: true,
      seedance15Audio: true,
      infinitalkDuration: '10s',
      klingV3ControlKeepSound: false,
      klingV3ControlOrientation: 'image',
    });

    expect(metadata?.generation?.falOptions).toEqual(expect.objectContaining({
      seedance15AspectRatio: '9:16',
      seedance15Resolution: '1080p',
      seedance15Duration: '10',
      seedance15CameraFixed: true,
      seedance15Audio: true,
      infinitalkDuration: '10s',
      klingV3ControlKeepSound: false,
      klingV3ControlOrientation: 'image',
    })); // Dropping these silently replaced saved settings with model defaults on rerun and metadata transfer.
  });

  it('drops invalid values for the same controls', () => {
    const metadata = buildMetadata({
      seedance15Resolution: '4K',
      seedance15Duration: '99',
      seedance15Audio: 'yes',
      infinitalkDuration: '30s',
      klingV3ControlOrientation: 'sideways',
      klingV3ControlKeepSound: 'true',
    });

    expect(metadata?.generation?.falOptions?.seedance15Resolution).toBeUndefined();
    expect(metadata?.generation?.falOptions?.seedance15Duration).toBeUndefined();
    expect(metadata?.generation?.falOptions?.seedance15Audio).toBeUndefined();
    expect(metadata?.generation?.falOptions?.infinitalkDuration).toBeUndefined();
    expect(metadata?.generation?.falOptions?.klingV3ControlOrientation).toBeUndefined();
    expect(metadata?.generation?.falOptions?.klingV3ControlKeepSound).toBeUndefined();
  });
});
