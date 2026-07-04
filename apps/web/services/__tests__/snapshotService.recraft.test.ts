import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSnapshotImageMetadata, restoreSnapshotFromFile } from '../snapshotService';
import type { CanvasImageMetadata } from '../../types';

const audioServiceMocks = vi.hoisted(() => ({
  generateWaveformImage: vi.fn(),
  loadAudioFromBlob: vi.fn(),
}));

vi.mock('../audioService', () => audioServiceMocks);

afterEach(() => {
  audioServiceMocks.generateWaveformImage.mockReset();
  audioServiceMocks.loadAudioFromBlob.mockReset();
  vi.unstubAllGlobals();
});

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

describe('snapshotService (audio restore)', () => {
  it('seeks restored audio elements to the saved playback time', async () => {
    const audioElement = document.createElement('audio');
    Object.defineProperty(audioElement, 'duration', { value: 10, configurable: true });
    audioElement.currentTime = 0;
    audioServiceMocks.loadAudioFromBlob.mockResolvedValue(audioElement);
    audioServiceMocks.generateWaveformImage.mockResolvedValue({
      dataUrl: 'data:image/png;base64,AA==',
      duration: 10,
    });
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 40;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.()); // Simulate data URL image loading.
      }
    } as unknown as typeof Image);
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      state: {
        images: [{
          id: 'audio-1',
          dataUrl: 'data:audio/wav;base64,AA==',
          fileName: 'audio.wav',
          fileType: 'audio/wav',
          mediaType: 'audio',
          width: 100,
          height: 40,
          currentPlaybackTime: 8.5,
        }],
        notes: [],
        paths: [],
      },
    };
    const snapshotJson = JSON.stringify(snapshot);
    const file = new File([snapshotJson], 'canvas.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    file.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().

    const restored = await restoreSnapshotFromFile(file, {
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
    });

    expect(restored.images[0]?.currentPlaybackTime).toBe(8.5);
    expect(restored.images[0]?.audioElement?.currentTime).toBe(8.5);
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

describe('snapshotService (Jimeng metadata)', () => {
  it('preserves Jimeng Seedance options from snapshots', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'jimeng prompt',
        provider: 'jimeng',
        modelId: 'jimeng-cli/seedance-2',
        modelMode: 'video',
        jimengOptions: {
          seedance2Variant: 'reference',
          seedance2JimengModelVersion: 'seedance2.0_vip',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '1080p',
          seedance2Duration: '10',
          seedance2GenerateAudio: false,
          seedance2CameraFixed: true,
        },
      },
    } as unknown as CanvasImageMetadata);

    expect(metadata?.generation?.jimengOptions).toMatchObject({
      seedance2Variant: 'reference',
      seedance2JimengModelVersion: 'seedance2.0_vip',
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '1080p',
      seedance2Duration: '10',
      seedance2GenerateAudio: false,
      seedance2CameraFixed: true,
    });
  });

  it('restores embedded Jimeng prompt bar channel values from snapshots', async () => {
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      state: {
        images: [],
        notes: [],
        paths: [],
        videoPromptAreas: [],
        videoPromptBars: [{
          id: 'bar-1',
          assignedAreaId: 'area-1',
          x: 0,
          y: 0,
          width: 320,
          height: 72,
          prompt: 'jimeng area prompt',
          modelId: 'jimeng-cli/seedance-2',
          seedance2Variant: 'reference',
          seedance2JimengModelVersion: 'seedance2.0_vip',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '1080p',
          seedance2Duration: '10',
          seedance2GenerateAudio: false,
          seedance2CameraFixed: false,
        }],
      },
    };
    const snapshotJson = JSON.stringify(snapshot);
    const file = new File([snapshotJson], 'canvas.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    file.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().

    const restored = await restoreSnapshotFromFile(file, {
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
    });

    expect(restored.videoPromptBars[0]?.seedance2JimengModelVersion).toBe('seedance2.0_vip');
  });

  it('restores legacy embedded Jimeng prompt bar channel values from fal options', async () => {
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      state: {
        images: [],
        notes: [],
        paths: [],
        videoPromptAreas: [],
        videoPromptBars: [{
          id: 'bar-1',
          assignedAreaId: 'area-1',
          x: 0,
          y: 0,
          width: 320,
          height: 72,
          prompt: 'legacy jimeng area prompt',
          modelId: 'jimeng-cli/seedance-2',
          seedance2Variant: 'reference',
          seedance2AspectRatio: '16:9',
          seedance2Resolution: '1080p',
          seedance2Duration: '10',
          seedance2GenerateAudio: false,
          seedance2CameraFixed: false,
          falOptions: {
            seedance2JimengModelVersion: 'seedance2.0_vip',
          },
        }],
      },
    };
    const snapshotJson = JSON.stringify(snapshot);
    const file = new File([snapshotJson], 'canvas.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    file.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().

    const restored = await restoreSnapshotFromFile(file, {
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
    });

    expect(restored.videoPromptBars[0]?.seedance2JimengModelVersion).toBe('seedance2.0_vip');
    expect(restored.videoPromptBars[0]?.seedance2Resolution).toBe('1080p');
  });

  it('normalizes restored embedded Jimeng values that the CLI cannot submit', async () => {
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      state: {
        images: [],
        notes: [],
        paths: [],
        videoPromptAreas: [],
        videoPromptBars: [{
          id: 'bar-1',
          assignedAreaId: 'area-1',
          x: 0,
          y: 0,
          width: 320,
          height: 72,
          prompt: 'stale jimeng area prompt',
          modelId: 'jimeng-cli/seedance-2',
          seedance2Variant: 'reference',
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2AspectRatio: 'adaptive',
          seedance2Resolution: '1080p',
          seedance2Duration: '5',
          seedance2GenerateAudio: false,
          seedance2CameraFixed: false,
        }],
      },
    };
    const snapshotJson = JSON.stringify(snapshot);
    const file = new File([snapshotJson], 'canvas.json', { type: 'application/json' }) as File & { text: () => Promise<string> };
    file.text = () => Promise.resolve(snapshotJson); // Node's test File polyfill does not always include text().

    const restored = await restoreSnapshotFromFile(file, {
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
    });

    expect(restored.videoPromptBars[0]?.seedance2AspectRatio).toBe('16:9');
    expect(restored.videoPromptBars[0]?.seedance2Resolution).toBe('720p');
  });

  it('normalizes Jimeng generation metadata values that the CLI cannot resubmit', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'stale jimeng prompt',
        provider: 'jimeng',
        modelId: 'jimeng-cli/seedance-2',
        modelMode: 'video',
        jimengOptions: {
          seedance2Variant: 'reference',
          seedance2JimengModelVersion: 'seedance2.0fast',
          seedance2AspectRatio: 'adaptive',
          seedance2Resolution: '1080p',
          seedance2Duration: '5',
        },
      },
    } as unknown as CanvasImageMetadata);

    expect(metadata?.generation?.jimengOptions?.seedance2AspectRatio).toBe('16:9');
    expect(metadata?.generation?.jimengOptions?.seedance2Resolution).toBe('720p');
  });
});

describe('snapshotService (Krea 2 Large metadata)', () => {
  it('preserves Krea creativity and normalized style reference strengths', () => {
    const metadata = normalizeSnapshotImageMetadata({
      source: 'generated',
      generation: {
        kind: 'text_to_image',
        prompt: 'krea prompt',
        provider: 'fal',
        modelId: 'krea/v2/large/text-to-image',
        modelMode: 'image',
        referenceImageIds: ['ref-1', 'ref-2'],
        falOptions: {
          aspectRatioSelection: '2.35:1',
          krea2Creativity: 'high',
          krea2StyleReferenceStrengths: {
            'ref-1': -3,
            'ref-2': '0.14',
            'ref-bad': 'not-a-number',
          },
        },
      },
    } as unknown as CanvasImageMetadata);

    expect(metadata?.generation?.falOptions?.aspectRatioSelection).toBe('2.35:1');
    expect(metadata?.generation?.falOptions?.krea2Creativity).toBe('high');
    expect(metadata?.generation?.falOptions?.krea2StyleReferenceStrengths).toEqual({
      'ref-1': -2,
      'ref-2': 0.1,
    });
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
