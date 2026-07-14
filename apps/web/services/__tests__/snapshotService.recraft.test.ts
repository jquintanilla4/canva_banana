import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSnapshotBinaryFromState, getSnapshotBinaryByteLength, normalizeSnapshotImageMetadata, parseBinarySnapshotFile, restoreSnapshotFromFile, writeSnapshotBinaryStreaming, type SnapshotByteSource, type SnapshotMetaState } from '../snapshotService';
import { createDesktopSnapshotSource } from '../desktopSnapshotSource';
import type { CanvasImageMetadata } from '../../types';

const audioServiceMocks = vi.hoisted(() => ({
  generateWaveformImage: vi.fn(),
  loadAudioFromBlob: vi.fn(),
  loadAudioFromUrl: vi.fn(),
}));

vi.mock('../audioService', () => audioServiceMocks);

const snapshotTestEncoder = new TextEncoder(); // Encodes binary snapshot fixtures.
const snapshotMagicBytes = snapshotTestEncoder.encode('BANANA_SNAPSHOT_V2\n'); // Binary snapshot magic header.

const writeTestUint32BE = (value: number): Uint8Array => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, false);
  return new Uint8Array(buffer);
}; // Writes fixture section lengths.

const writeTestUint64BE = (value: number): Uint8Array => {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, BigInt(value), false);
  return new Uint8Array(buffer);
}; // Writes fixture media lengths.

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}; // Builds compact binary fixtures.

const cloneArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}; // Returns an exact ArrayBuffer slice.

afterEach(() => {
  vi.restoreAllMocks();
  audioServiceMocks.generateWaveformImage.mockReset();
  audioServiceMocks.loadAudioFromBlob.mockReset();
  audioServiceMocks.loadAudioFromUrl.mockReset();
  window.canvaBananaDesktop = undefined;
  vi.unstubAllGlobals();
});

describe('snapshotService (binary metadata bounds)', () => {
  it('rejects oversized manifest JSON before reading it into memory', async () => {
    const manifestLength = 64 * 1024 * 1024 + 1;
    const headerBytes = concatBytes([snapshotMagicBytes, writeTestUint32BE(manifestLength)]);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset === 0 && length === headerBytes.byteLength) {
        return cloneArrayBuffer(headerBytes);
      }
      throw new Error(`Unexpected read: ${offset}:${length}`);
    }); // Fails if the parser tries the oversized metadata read.
    const source: SnapshotByteSource = {
      fileName: 'oversized-manifest.bcsnap',
      size: headerBytes.byteLength + manifestLength,
      type: 'application/octet-stream',
      readRange,
    };

    await expect(parseBinarySnapshotFile(source)).rejects.toThrow('Snapshot manifest length is invalid.');

    expect(readRange).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized image metadata JSON before reading it into memory', async () => {
    const imageManifest = {
      id: 'image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'image.png',
      fileType: 'image/png',
      fileSize: 1,
      mediaType: 'image',
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const metaLength = 64 * 1024 * 1024 + 1;
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(metaLength),
    ]);
    const sourceSize = fixtureBytes.byteLength + metaLength + 8 + 1;
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset === 0 && length === snapshotMagicBytes.byteLength + 4) {
        return cloneArrayBuffer(fixtureBytes.subarray(0, snapshotMagicBytes.byteLength + 4));
      }
      if (offset === snapshotMagicBytes.byteLength + 4 && length === manifestBytes.byteLength) {
        return cloneArrayBuffer(manifestBytes);
      }
      if (offset === snapshotMagicBytes.byteLength + 4 + manifestBytes.byteLength && length === 4) {
        return cloneArrayBuffer(writeTestUint32BE(metaLength));
      }
      throw new Error(`Unexpected read: ${offset}:${length}`);
    }); // Fails if the parser tries the oversized image metadata read.
    const source: SnapshotByteSource = {
      fileName: 'oversized-image-metadata.bcsnap',
      size: sourceSize,
      type: 'application/octet-stream',
      readRange,
    };

    await expect(parseBinarySnapshotFile(source)).rejects.toThrow('Snapshot image 1 metadata is invalid.');

    expect(readRange.mock.calls.some(([, length]) => length === metaLength)).toBe(false);
  });

  it('reads large binary media as bounded chunks', async () => {
    const imageManifest = {
      id: 'image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'large.png',
      fileType: 'image/png',
      fileSize: 8 * 1024 * 1024 + 3,
      mediaType: 'image',
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const dataLength = 8 * 1024 * 1024 + 3;
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(dataLength),
    ]);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset + length <= fixtureBytes.byteLength) {
        return cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length));
      }
      return cloneArrayBuffer(new Uint8Array(length));
    }); // Serves media reads without creating a full snapshot fixture.
    const source: SnapshotByteSource = {
      fileName: 'large-media.bcsnap',
      size: fixtureBytes.byteLength + dataLength,
      type: 'application/octet-stream',
      readRange,
    };

    const parsed = await parseBinarySnapshotFile(source);

    expect(parsed.images[0]?.blob.size).toBe(dataLength);
    expect(readRange.mock.calls.some(([, length]) => length === dataLength)).toBe(false);
    expect(readRange.mock.calls.filter(([, length]) => length === 8 * 1024 * 1024)).toHaveLength(1);
  });

  it('applies custom range-source media caps before reading media bytes', async () => {
    const imageManifest = {
      id: 'image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'capped.png',
      fileType: 'image/png',
      fileSize: 5,
      mediaType: 'image',
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const dataLength = 5;
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(dataLength),
    ]);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset + length <= fixtureBytes.byteLength) {
        return cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length));
      }
      throw new Error(`Unexpected media read: ${offset}:${length}`);
    }); // Fails if the parser reads media after the source-specific cap is exceeded.
    const source: SnapshotByteSource = {
      fileName: 'capped-media.bcsnap',
      size: fixtureBytes.byteLength + dataLength,
      type: 'application/octet-stream',
      maxMediaBytes: 4,
      readRange,
    };

    await expect(parseBinarySnapshotFile(source)).rejects.toThrow('Snapshot media is too large to import safely.');

    expect(readRange.mock.calls.some(([offset]) => offset >= fixtureBytes.byteLength)).toBe(false);
  });

  it('rejects oversized IPC-backed media before materializing it into a Blob', async () => {
    const imageManifest = {
      id: 'image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'huge-video.mp4',
      fileType: 'video/mp4',
      fileSize: 512 * 1024 * 1024 + 1,
      mediaType: 'video',
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const dataLength = 512 * 1024 * 1024 + 1;
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(dataLength),
    ]);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset + length <= fixtureBytes.byteLength) {
        return cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length));
      }
      throw new Error(`Unexpected media read: ${offset}:${length}`);
    }); // Fails if the parser starts reading oversized media chunks.
    const source: SnapshotByteSource = {
      fileName: 'huge-media.bcsnap',
      size: fixtureBytes.byteLength + dataLength,
      type: 'application/octet-stream',
      readRange,
    };

    await expect(parseBinarySnapshotFile(source)).rejects.toThrow('Snapshot media is too large to import safely.');

    expect(readRange.mock.calls.some(([, length]) => length === 8 * 1024 * 1024)).toBe(false);
  });

  it('keeps desktop URL-backed media lazy even above the renderer media cap', async () => {
    const imageManifest = {
      id: 'video-1',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      fileName: 'huge-video.mp4',
      fileType: 'video/mp4',
      fileSize: 512 * 1024 * 1024 + 1,
      mediaType: 'video',
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const dataLength = 512 * 1024 * 1024 + 1;
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(dataLength),
    ]);
    const readSnapshotRange = vi.fn(async ({ offset, length }: { offset: number; length: number }) => {
      if (offset + length <= fixtureBytes.byteLength) {
        return cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length));
      }
      throw new Error(`Unexpected media read: ${offset}:${length}`);
    }); // Desktop media URLs should prevent parser-side media materialization.
    const getSnapshotMediaUrl = vi.fn(async () => 'canva-banana-snapshot://media/source-1/0/1/huge-video.mp4?type=video%2Fmp4');
    window.canvaBananaDesktop = {
      fileMenu: {
        readSnapshotRange,
        getSnapshotMediaUrl,
      },
    };
    const source = createDesktopSnapshotSource({
      sourceId: 'source-1',
      fileName: 'huge-media.bcsnap',
      size: fixtureBytes.byteLength + dataLength,
      type: 'application/octet-stream',
    });

    const parsed = await parseBinarySnapshotFile(source);

    expect(parsed.images[0]?.blob.size).toBe(dataLength);
    expect(parsed.images[0]?.blob.snapshotObjectUrl).toContain('canva-banana-snapshot://media/source-1');
    expect(getSnapshotMediaUrl).toHaveBeenCalledWith({
      sourceId: 'source-1',
      offset: fixtureBytes.byteLength,
      length: dataLength,
      type: 'video/mp4',
      fileName: 'huge-video.mp4',
    });
    expect(readSnapshotRange.mock.calls.some(([payload]) => payload.offset >= fixtureBytes.byteLength)).toBe(false);
  });

  it('restores every lazy media item with bounded ordered loading', async () => {
    const imageManifests = Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`,
      x: index,
      y: index,
      width: 1,
      height: 1,
      fileName: `image-${index}.png`,
      fileType: 'image/png',
      fileSize: 1,
      mediaType: 'image' as const,
    }));
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: imageManifests, notes: [], paths: [] },
    }));
    const imageRecords = imageManifests.flatMap(imageManifest => {
      const metadata = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
      return [writeTestUint32BE(metadata.byteLength), metadata, writeTestUint64BE(1), new Uint8Array([1])];
    });
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      ...imageRecords,
    ]);
    const getMediaUrl = vi.fn(async (_offset: number, _length: number, _type: string, fileName: string) => `canva-banana-snapshot://media/source-1/${fileName}`);
    const source: SnapshotByteSource = {
      fileName: 'many-media.bcsnap',
      size: fixtureBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length)),
      getMediaUrl,
    };
    let activeLoads = 0;
    let peakLoads = 0;
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';
      naturalWidth = 1;
      naturalHeight = 1;

      set src(_value: string) {
        activeLoads += 1;
        peakLoads = Math.max(peakLoads, activeLoads);
        queueMicrotask(() => {
          activeLoads -= 1;
          this.onload?.();
        });
      }
    } as unknown as typeof Image);

    const restored = await restoreSnapshotFromFile(source, {
      brushSize: 8,
      eraserSize: 8,
      brushColor: '#ff0000',
    });

    expect(restored.images.map(image => image.id)).toEqual(imageManifests.map(image => image.id));
    expect(getMediaUrl).toHaveBeenCalledTimes(imageManifests.length);
    expect(peakLoads).toBe(4);
    expect(restored.sourceRetention).toBe('required');
  });

  it('restores many desktop videos without starting their protocol streams', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); // jsdom does not implement media playback.
    const videoManifests = Array.from({ length: 40 }, (_, index) => ({
      id: `video-${index}`,
      x: index,
      y: index,
      width: 640,
      height: 360,
      naturalWidth: index === 0 ? undefined : 1920,
      naturalHeight: index === 0 ? undefined : 1080,
      fileName: `video-${index}.mp4`,
      fileType: 'video/mp4',
      fileSize: 1,
      mediaType: 'video' as const,
      videoDuration: index + 2,
    }));
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-13T00:00:00.000Z',
      state: { images: videoManifests, notes: [], paths: [] },
    }));
    const videoRecords = videoManifests.flatMap(videoManifest => {
      const metadata = snapshotTestEncoder.encode(JSON.stringify(videoManifest));
      return [writeTestUint32BE(metadata.byteLength), metadata, writeTestUint64BE(1), new Uint8Array([1])];
    });
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      ...videoRecords,
    ]);
    const getMediaUrl = vi.fn(async (_offset: number, _length: number, _type: string, fileName: string) => (
      `canva-banana-snapshot://media/source-many-videos/${fileName}`
    ));
    const source: SnapshotByteSource = {
      fileName: 'many-videos.bcsnap',
      size: fixtureBytes.byteLength,
      type: 'application/octet-stream',
      readRange: async (offset, length) => cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length)),
      getMediaUrl,
    };

    const restored = await restoreSnapshotFromFile(source, {
      brushSize: 8,
      eraserSize: 8,
      brushColor: '#ff0000',
    });

    expect(restored.images).toHaveLength(videoManifests.length);
    expect(restored.images.every(image => image.element instanceof HTMLVideoElement)).toBe(true);
    expect(restored.images.every(image => (image.element as HTMLVideoElement).preload === 'none')).toBe(true);
    expect(restored.images.every(image => image.width === 640 && image.height === 360)).toBe(true);
    expect(restored.images.map(image => image.naturalWidth)).toEqual(videoManifests.map(image => image.naturalWidth ?? image.width));
    expect(restored.images.map(image => image.naturalHeight)).toEqual(videoManifests.map(image => image.naturalHeight ?? image.height));
    expect(restored.images.map(image => image.videoDuration)).toEqual(videoManifests.map(image => image.videoDuration));
    expect(getMediaUrl).toHaveBeenCalledTimes(videoManifests.length);
  });

  it('persists loaded video metadata for future lazy restores', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 7.5 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    const binary = await buildSnapshotBinaryFromState({
      images: [{
        id: 'video-duration',
        element: video,
        mediaType: 'video',
        x: 0,
        y: 0,
        width: 640,
        height: 360,
        rotation: 0,
        naturalWidth: 640,
        naturalHeight: 360,
        file: new File(['video'], 'video.mp4', { type: 'video/mp4' }),
      }],
      notes: [],
      paths: [],
      videoPromptAreas: [],
      videoPromptBars: [],
      meta: {} as SnapshotMetaState,
    });

    expect(binary.manifest.state.images[0]?.videoDuration).toBe(7.5);
    expect(binary.images[0]?.manifest.videoDuration).toBe(7.5);
    expect(binary.manifest.state.images[0]?.naturalWidth).toBe(1920);
    expect(binary.manifest.state.images[0]?.naturalHeight).toBe(1080);
    expect(binary.images[0]?.manifest.naturalWidth).toBe(1920);
    expect(binary.images[0]?.manifest.naturalHeight).toBe(1080);
  });

  it('streams desktop URL-backed media when writing snapshots', async () => {
    const imageManifest = {
      id: 'image-1',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileName: 'large.png',
      fileType: 'image/png',
      fileSize: 8 * 1024 * 1024 + 3,
      mediaType: 'image',
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const dataLength = 8 * 1024 * 1024 + 3;
    const fixtureBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(dataLength),
    ]);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset + length <= fixtureBytes.byteLength) {
        return cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length));
      }
      return cloneArrayBuffer(new Uint8Array(length));
    }); // Media reads happen only when the writer asks for bounded slices.
    const source: SnapshotByteSource = {
      fileName: 'large-media.bcsnap',
      size: fixtureBytes.byteLength + dataLength,
      type: 'application/octet-stream',
      getMediaUrl: async () => 'canva-banana-snapshot://media/source-1/0/1/large.png?type=image%2Fpng',
      readRange,
    };
    const parsed = await parseBinarySnapshotFile(source);
    const writeSizes: number[] = [];

    await writeSnapshotBinaryStreaming(parsed, {
      write: async data => {
        if (typeof data === 'string') {
          writeSizes.push(snapshotTestEncoder.encode(data).byteLength);
          return;
        }
        if ('size' in data) {
          for (let offset = 0; offset < data.size; offset += 8 * 1024 * 1024) {
            await data.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer();
          }
          writeSizes.push(data.size);
          return;
        }
        writeSizes.push(data.byteLength);
      },
    });

    expect(getSnapshotBinaryByteLength(parsed)).toBe(fixtureBytes.byteLength + dataLength);
    expect(writeSizes).toContain(dataLength);
    expect(readRange.mock.calls.some(([, length]) => length === dataLength)).toBe(false);
    expect(readRange.mock.calls.filter(([, length]) => length === 8 * 1024 * 1024).length).toBeGreaterThan(0);
  });

  it('rejects oversized non-binary snapshots before text fallback reads the whole source', async () => {
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset === 0 && length === snapshotMagicBytes.byteLength) {
        return cloneArrayBuffer(new Uint8Array(snapshotMagicBytes.byteLength));
      }
      throw new Error(`Unexpected text fallback read: ${offset}:${length}`);
    }); // Fails if legacy JSON fallback reads the full oversized source.
    const source: SnapshotByteSource = {
      fileName: 'legacy-shaped.bcsnap',
      size: 512 * 1024 * 1024 + 1,
      type: 'application/octet-stream',
      readRange,
    };

    await expect(restoreSnapshotFromFile(source, {
      brushSize: 8,
      eraserSize: 8,
      brushColor: '#ff0000',
    })).rejects.toThrow('Snapshot file is too large to import safely.');

    expect(readRange).toHaveBeenCalledTimes(1);
  });

  it('reads legacy JSON range sources as bounded chunks', async () => {
    const chunkBytes = 8 * 1024 * 1024;
    const raw = JSON.stringify({
      state: {
        images: [],
        notes: [],
        paths: [],
      },
      padding: 'x'.repeat(chunkBytes + 17),
    });
    const bytes = snapshotTestEncoder.encode(raw);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (length > chunkBytes) {
        throw new Error(`Oversized read: ${length}`);
      }
      return cloneArrayBuffer(bytes.subarray(offset, offset + length));
    }); // Fails if JSON fallback asks IPC for the whole file in one range.
    const source: SnapshotByteSource = {
      fileName: 'legacy-large.json',
      size: bytes.byteLength,
      type: 'application/json',
      readRange,
    };

    const restored = await restoreSnapshotFromFile(source, {
      brushSize: 8,
      eraserSize: 8,
      brushColor: '#ff0000',
    });

    expect(restored.images).toEqual([]);
    expect(readRange.mock.calls.some(([, length]) => length > chunkBytes)).toBe(false);
    expect(readRange.mock.calls.filter(([, length]) => length === chunkBytes).length).toBeGreaterThan(0);
  });
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

describe('snapshotService (Flux 2 Max metadata)', () => {
  const buildMetadata = (flux2MaxImageSize: unknown) => normalizeSnapshotImageMetadata({
    source: 'generated',
    generation: {
      kind: 'text_to_image',
      prompt: 'flux prompt',
      provider: 'fal',
      modelId: 'fal-ai/flux-2-max',
      falOptions: { flux2MaxImageSize },
    },
  } as CanvasImageMetadata); // Exercises the untrusted snapshot normalization boundary.

  it.each([
    'landscape_4_3',
    'landscape_16_9',
    'portrait_4_3',
    'portrait_16_9',
    'square',
    'square_hd',
  ] as const)('preserves the saved %s output dimensions', flux2MaxImageSize => {
    expect(buildMetadata(flux2MaxImageSize)?.generation?.falOptions?.flux2MaxImageSize).toBe(flux2MaxImageSize);
  });

  it('rejects an invalid saved output size', () => {
    expect(buildMetadata('oversized')?.generation?.falOptions?.flux2MaxImageSize).toBeUndefined();
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

  it('uses desktop media URLs for lazy audio playback while reading waveform data by range', async () => {
    const audioElement = document.createElement('audio');
    const audioBytes = snapshotTestEncoder.encode('audio-bytes');
    const imageManifest = {
      id: 'audio-1',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      fileName: 'audio.wav',
      fileType: 'audio/wav',
      fileSize: audioBytes.byteLength,
      mediaType: 'audio',
      currentPlaybackTime: 2,
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: {
        images: [imageManifest],
        notes: [],
        paths: [],
      },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const headerBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(audioBytes.byteLength),
    ]);
    const fixtureBytes = concatBytes([headerBytes, audioBytes]);
    const readSnapshotRange = vi.fn(async ({ offset, length }: { offset: number; length: number }) => (
      cloneArrayBuffer(fixtureBytes.subarray(offset, offset + length))
    ));
    const getSnapshotMediaUrl = vi.fn(async () => 'canva-banana-snapshot://media/source-1/0/11/audio.wav?type=audio%2Fwav');
    window.canvaBananaDesktop = {
      fileMenu: {
        readSnapshotRange,
        getSnapshotMediaUrl,
      },
    };
    Object.defineProperty(audioElement, 'duration', { value: 5, configurable: true });
    audioServiceMocks.loadAudioFromUrl.mockResolvedValue(audioElement);
    audioServiceMocks.generateWaveformImage.mockImplementation(async (source: Pick<Blob, 'arrayBuffer'>) => {
      await source.arrayBuffer();
      return { dataUrl: 'data:image/png;base64,AA==', duration: 5 };
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
    const source = createDesktopSnapshotSource({
      sourceId: 'source-1',
      fileName: 'audio-scene.bcsnap',
      size: fixtureBytes.byteLength,
      type: 'application/octet-stream',
    });

    const restored = await restoreSnapshotFromFile(source, {
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
    });

    expect(audioServiceMocks.loadAudioFromUrl).toHaveBeenCalledWith('canva-banana-snapshot://media/source-1/0/11/audio.wav?type=audio%2Fwav');
    expect(audioServiceMocks.loadAudioFromBlob).not.toHaveBeenCalled();
    expect(getSnapshotMediaUrl).toHaveBeenCalledWith({
      sourceId: 'source-1',
      offset: headerBytes.byteLength,
      length: audioBytes.byteLength,
      type: 'audio/wav',
      fileName: 'audio.wav',
    });
    expect(readSnapshotRange.mock.calls.some(([payload]) => payload.offset >= headerBytes.byteLength)).toBe(true);
    expect(restored.images[0]?.file.name).toBe('audio.wav');
  });

  it('keeps oversized desktop audio playable without materializing it for waveform decoding', async () => {
    const audioElement = document.createElement('audio');
    Object.defineProperty(audioElement, 'duration', { value: 3600, configurable: true });
    audioServiceMocks.loadAudioFromUrl.mockResolvedValue(audioElement);
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 400;
      naturalHeight = 80;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.()); // Simulate placeholder image loading.
      }
    } as unknown as typeof Image);
    const audioBytes = 64 * 1024 * 1024 + 1;
    const imageManifest = {
      id: 'audio-large',
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      fileName: 'long-recording.wav',
      fileType: 'audio/wav',
      fileSize: audioBytes,
      mediaType: 'audio' as const,
      audioDuration: 3600,
    };
    const manifestBytes = snapshotTestEncoder.encode(JSON.stringify({
      version: 2,
      createdAt: '2026-07-09T00:00:00.000Z',
      state: { images: [imageManifest], notes: [], paths: [] },
    }));
    const imageMetaBytes = snapshotTestEncoder.encode(JSON.stringify(imageManifest));
    const headerBytes = concatBytes([
      snapshotMagicBytes,
      writeTestUint32BE(manifestBytes.byteLength),
      manifestBytes,
      writeTestUint32BE(imageMetaBytes.byteLength),
      imageMetaBytes,
      writeTestUint64BE(audioBytes),
    ]);
    const readRange = vi.fn(async (offset: number, length: number) => {
      if (offset + length <= headerBytes.byteLength) {
        return cloneArrayBuffer(headerBytes.subarray(offset, offset + length));
      }
      throw new Error('Oversized audio data must not be read for waveform generation.');
    });
    const getMediaUrl = vi.fn(async () => 'canva-banana-snapshot://media/source-large/0/1/long-recording.wav');
    const source: SnapshotByteSource = {
      fileName: 'large-audio.bcsnap',
      size: headerBytes.byteLength + audioBytes,
      type: 'application/octet-stream',
      readRange,
      getMediaUrl,
    };

    const restored = await restoreSnapshotFromFile(source, {
      brushSize: 20,
      eraserSize: 20,
      brushColor: '#ff0000',
    });

    expect(audioServiceMocks.loadAudioFromUrl).toHaveBeenCalledTimes(1);
    expect(audioServiceMocks.generateWaveformImage).not.toHaveBeenCalled();
    expect(readRange.mock.calls.every(([offset, length]) => offset + length <= headerBytes.byteLength)).toBe(true);
    expect(restored.images[0]?.audioDuration).toBe(3600);
    expect(restored.images[0]?.waveformImageData).toContain('Waveform%20preview%20unavailable');
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
