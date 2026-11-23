import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tool, type CanvasImage } from '../../types';
import { createLazyVideoFromUrl, isVideoPlaybackUnavailable, markVideoPlaybackUnavailable, playVideoFromUserGesture } from '../mediaService';
import { buildSnapshotBinaryFromState, restoreSnapshotFromFile, snapshotBinaryToBlob } from '../snapshotService';
import { syncCanvasMediaElementPlayback } from '../../utils/canvasMediaPlayback';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const readFileBytes = (file: File): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => reader.result instanceof ArrayBuffer
    ? resolve(new Uint8Array(reader.result))
    : reject(new Error('Expected binary video bytes.'));
  reader.readAsArrayBuffer(file);
});

const buildUnavailableVideo = (): CanvasImage => {
  const video = createLazyVideoFromUrl('blob:original-video', 1920, 1080);
  markVideoPlaybackUnavailable(video);
  return {
    id: 'volcengine-video',
    element: video,
    mediaType: 'video',
    x: 40,
    y: 60,
    width: 640,
    height: 360,
    rotation: 0,
    naturalWidth: 1920,
    naturalHeight: 1080,
    file: new File([new Uint8Array([0, 255, 1, 128])], 'generated.mov', { type: 'video/quicktime' }),
    isPlaying: true,
    videoDuration: 8,
    metadata: {
      source: 'generated',
      generation: {
        kind: 'video',
        prompt: 'Test video',
        provider: 'volcengine',
        modelId: 'volcengine/seedance-2',
      },
    },
  };
};

describe('Volcengine original video snapshot preservation', () => {
  it('preserves the original video and only retries decoding after Play', async () => {
    vi.stubGlobal('URL', Object.assign(Object.create(URL), {
      createObjectURL: vi.fn(() => 'blob:restored-video'),
      revokeObjectURL: vi.fn(),
    }));
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const video = buildUnavailableVideo();
    const binary = await buildSnapshotBinaryFromState({
      images: [video],
      notes: [],
      paths: [],
      videoPromptAreas: [],
      videoPromptBars: [],
      meta: {
        appMode: 'CANVAS',
        tool: Tool.SELECTION,
        brushSize: 8,
        eraserSize: 8,
        brushColor: '#ffffff',
        prompt: '',
        apiProvider: 'fal',
        falModelId: '',
        falImageSizeSelection: '',
        falAspectRatioSelection: '',
        falResolutionSelection: '',
        falNumImages: 1,
        falScaleFactor: 1,
        falNoiseScale: 0,
        falCreativity: 0,
        selectedImageIds: [],
        referenceImageIds: [],
      },
    });
    expect(binary.images[0].blob).toBe(video.file);
    expect(binary.images[0].manifest.videoPlaybackUnavailable).toBe(true);
    const snapshot = new File([snapshotBinaryToBlob(binary)], 'video.bcsnap');

    const restored = await restoreSnapshotFromFile(snapshot, { brushSize: 8, eraserSize: 8, brushColor: '#ffffff' });
    const result = restored.images[0];

    expect(result.mediaType).toBe('video');
    expect(result.file.name).toBe('generated.mov');
    expect(result.file.type).toBe('video/quicktime');
    expect(await readFileBytes(result.file)).toEqual(await readFileBytes(video.file));
    expect(result).toMatchObject({ width: 640, height: 360, naturalWidth: 1920, naturalHeight: 1080, isPlaying: false });
    expect(result.element).toBeInstanceOf(HTMLVideoElement);
    expect(result.element instanceof HTMLVideoElement && isVideoPlaybackUnavailable(result.element)).toBe(true);
    expect(load).not.toHaveBeenCalled();

    const element = result.element as HTMLVideoElement;
    const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
    await playVideoFromUserGesture(element);
    expect(load).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    expect(isVideoPlaybackUnavailable(element)).toBe(false);
  });

  it('does not play an unavailable original even if playback state is set', () => {
    const video = buildUnavailableVideo();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onRejected = vi.fn();

    syncCanvasMediaElementPlayback(video, onRejected);

    expect(play).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });
});
