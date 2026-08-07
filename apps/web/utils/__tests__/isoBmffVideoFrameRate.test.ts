import { describe, expect, it, vi } from 'vitest';
import { readIsoBmffVideoFrameRate } from '../isoBmffVideoFrameRate';

const uint32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

const joinBytes = (...parts: Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  parts.forEach(part => {
    bytes.set(part, offset);
    offset += part.byteLength;
  });
  return bytes;
};

const box = (type: string, ...bodyParts: Uint8Array[]): Uint8Array => {
  const body = joinBytes(...bodyParts);
  return joinBytes(
    uint32(body.byteLength + 8),
    Uint8Array.from(type.split('').map(character => character.charCodeAt(0))),
    body,
  );
};

const buildVideoFileBytes = (sampleCount: number, sampleDelta: number, timescale: number): Uint8Array => {
  const mediaHeader = box('mdhd', new Uint8Array(12), uint32(timescale), uint32(sampleCount * sampleDelta));
  const handler = box('hdlr', new Uint8Array(8), Uint8Array.from([118, 105, 100, 101])); // "vide" marks the video track.
  const timeToSample = box('stts', new Uint8Array(4), uint32(1), uint32(sampleCount), uint32(sampleDelta));
  const movie = box('moov', box('trak', box('mdia', mediaHeader, handler, box('minf', box('stbl', timeToSample)))));
  return joinBytes(box('mdat', new Uint8Array(32)), movie); // Put moov last to cover non-fast-start files.
};

describe('readIsoBmffVideoFrameRate', () => {
  it('reads the video timing table through bounded file slices', async () => {
    const bytes = buildVideoFileBytes(300, 1000, 30000);
    const slice = vi.fn((start = 0, end = bytes.byteLength) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }));
    const lazyFile = {
      name: 'reference.mp4',
      type: 'video/mp4',
      size: bytes.byteLength,
      lastModified: 1,
      webkitRelativePath: '',
      slice,
    } as unknown as File;

    await expect(readIsoBmffVideoFrameRate(lazyFile)).resolves.toBeCloseTo(30);
    expect(slice).toHaveBeenCalled();
  });

  it('returns null when timing metadata is unavailable', async () => {
    const file = new File([box('mdat', new Uint8Array(16))], 'reference.mov', { type: 'video/quicktime' });

    await expect(readIsoBmffVideoFrameRate(file)).resolves.toBeNull();
  });
});
