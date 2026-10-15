export interface SnapshotRangeReadable {
  size: number;
  readRange: (offset: number, length: number) => Promise<ArrayBuffer>;
}

export interface SnapshotRangeCursor {
  readonly position: number;
  read: (length: number) => Promise<ArrayBuffer>;
  readAhead: (maxBytes: number) => Promise<void>;
  skip: (length: number) => void;
}

interface SnapshotRangeCursorOptions {
  start: number;
}

const assertSafeRange = (offset: number, length: number, size: number): void => {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > size || length > size - offset) {
    throw new Error('Snapshot byte range is outside the file.');
  }
};

export const createSnapshotRangeCursor = (
  source: SnapshotRangeReadable,
  options: SnapshotRangeCursorOptions,
): SnapshotRangeCursor => {
  assertSafeRange(options.start, 0, source.size);
  let position = options.start;
  let cacheStart = options.start;
  let cache = new Uint8Array(0);

  const hasCachedRange = (length: number): boolean => (
    position >= cacheStart && length <= cache.byteLength - (position - cacheStart)
  );

  const read = async (length: number): Promise<ArrayBuffer> => {
    assertSafeRange(position, length, source.size);
    if (length === 0) return new ArrayBuffer(0);
    if (!hasCachedRange(length)) {
      const buffer = await source.readRange(position, length);
      if (buffer.byteLength !== length) {
        throw new Error('Snapshot byte range could not be read completely.');
      }
      cacheStart = position;
      cache = new Uint8Array(buffer);
    }
    const cacheOffset = position - cacheStart;
    const result = cache.slice(cacheOffset, cacheOffset + length).buffer;
    position += length;
    return result;
  };

  const readAhead = async (maxBytes: number): Promise<void> => {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error('Snapshot read-ahead size is invalid.');
    }
    const requestLength = Math.min(maxBytes, source.size - position);
    if (requestLength === 0 || hasCachedRange(requestLength)) return;
    const buffer = await source.readRange(position, requestLength);
    if (buffer.byteLength !== requestLength) {
      throw new Error('Snapshot byte range could not be read completely.');
    }
    cacheStart = position;
    cache = new Uint8Array(buffer);
  };

  const skip = (length: number): void => {
    assertSafeRange(position, length, source.size);
    position += length;
    if (position < cacheStart || position > cacheStart + cache.byteLength) {
      cacheStart = position;
      cache = new Uint8Array(0);
    }
  };

  return {
    get position() {
      return position;
    },
    read,
    readAhead,
    skip,
  };
};
