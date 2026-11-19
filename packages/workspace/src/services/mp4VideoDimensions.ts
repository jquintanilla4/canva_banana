type VideoDimensions = { width: number; height: number };

type Mp4Box = { type: string; contentStart: number; end: number };

const readBlobBytes = async (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error('Unable to read video dimensions.'));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read video dimensions.'));
    reader.readAsArrayBuffer(blob);
  });
};

const readBox = async (blob: Pick<Blob, 'size' | 'slice'>, start: number, limit: number): Promise<Mp4Box | undefined> => {
  if (start + 8 > limit) return undefined;
  const bytes = new DataView(await readBlobBytes(blob.slice(start, Math.min(start + 16, limit))));
  if (bytes.byteLength < 8) return undefined;
  const type = String.fromCharCode(...new Uint8Array(bytes.buffer, 4, 4));
  const shortSize = bytes.getUint32(0);
  const headerSize = shortSize === 1 ? 16 : 8;
  if (bytes.byteLength < headerSize) return undefined;
  const size = shortSize === 1 ? Number(bytes.getBigUint64(8)) : shortSize || limit - start;
  if (!Number.isSafeInteger(size) || size < headerSize || start + size > limit) return undefined;
  return { type, contentStart: start + headerSize, end: start + size };
};

export const readMp4VideoDimensions = async (blob: Pick<Blob, 'size' | 'slice'>): Promise<VideoDimensions | undefined> => {
  const pending = [{ start: 0, end: blob.size, depth: 0 }];
  let inspectedBoxes = 0;
  while (pending.length > 0) {
    const range = pending.pop();
    if (!range) break;
    let cursor = range.start;
    while (cursor < range.end && inspectedBoxes < 10000) {
      inspectedBoxes += 1;
      const box = await readBox(blob, cursor, range.end);
      if (!box) break;
      if (box.type === 'tkhd' && box.end - box.contentStart >= 84) {
        const bytes = new DataView(await readBlobBytes(blob.slice(box.end - 8, box.end)));
        const width = bytes.getUint32(0) / 65536;
        const height = bytes.getUint32(4) / 65536;
        if (width > 0 && height > 0) return { width, height };
      }
      if ((box.type === 'moov' || box.type === 'trak') && range.depth < 2) {
        pending.push({ start: box.contentStart, end: box.end, depth: range.depth + 1 });
      }
      cursor = box.end;
    }
  }
  return undefined;
};
