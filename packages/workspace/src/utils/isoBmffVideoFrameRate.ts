type IsoBmffBox = {
  type: string;
  dataStart: number;
  end: number;
};

const BOX_HEADER_BYTES = 8;
const EXTENDED_BOX_HEADER_BYTES = 16;
const STTS_ENTRY_BYTES = 8;
const STTS_ENTRIES_PER_READ = 4096; // Keep timing-table reads bounded for large snapshot videos.

const readFileRange = async (file: File, start: number, byteLength: number): Promise<Uint8Array> => {
  const end = Math.min(file.size, start + byteLength);
  if (start < 0 || byteLength <= 0 || end <= start) {
    return new Uint8Array();
  }
  return new Uint8Array(await file.slice(start, end).arrayBuffer()); // Lazy snapshot files support the same range contract.
};

const readBoxType = (bytes: Uint8Array): string =>
  String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);

const readBoxHeader = async (
  file: File,
  offset: number,
  parentEnd: number,
): Promise<IsoBmffBox | null> => {
  const baseHeader = await readFileRange(file, offset, BOX_HEADER_BYTES);
  if (baseHeader.byteLength < BOX_HEADER_BYTES) {
    return null;
  }
  const baseView = new DataView(baseHeader.buffer, baseHeader.byteOffset, baseHeader.byteLength);
  const size32 = baseView.getUint32(0);
  const type = readBoxType(baseHeader);
  let headerBytes = BOX_HEADER_BYTES;
  let boxSize = size32;

  if (size32 === 1) {
    const extendedHeader = await readFileRange(file, offset, EXTENDED_BOX_HEADER_BYTES);
    if (extendedHeader.byteLength < EXTENDED_BOX_HEADER_BYTES) {
      return null;
    }
    const extendedView = new DataView(extendedHeader.buffer, extendedHeader.byteOffset, extendedHeader.byteLength);
    boxSize = extendedView.getUint32(8) * 2 ** 32 + extendedView.getUint32(12);
    headerBytes = EXTENDED_BOX_HEADER_BYTES;
  } else if (size32 === 0) {
    boxSize = parentEnd - offset; // A zero-sized box consumes the rest of its parent.
  }

  const boxEnd = offset + boxSize;
  if (!Number.isSafeInteger(boxSize) || boxSize < headerBytes || boxEnd > parentEnd) {
    return null;
  }
  return { type, dataStart: offset + headerBytes, end: boxEnd };
};

const findChildBoxes = async (
  file: File,
  start: number,
  end: number,
  type: string,
): Promise<IsoBmffBox[]> => {
  const matches: IsoBmffBox[] = [];
  let offset = start;
  while (offset + BOX_HEADER_BYTES <= end) {
    const box = await readBoxHeader(file, offset, end);
    if (!box) {
      break;
    }
    if (box.type === type) {
      matches.push(box);
    }
    offset = box.end;
  }
  return matches;
};

const findFirstChildBox = async (
  file: File,
  parent: IsoBmffBox,
  type: string,
): Promise<IsoBmffBox | null> =>
  (await findChildBoxes(file, parent.dataStart, parent.end, type))[0] ?? null;

const readHandlerType = async (file: File, handlerBox: IsoBmffBox): Promise<string | null> => {
  const body = await readFileRange(file, handlerBox.dataStart, 12);
  if (body.byteLength < 12) {
    return null;
  }
  return String.fromCharCode(body[8], body[9], body[10], body[11]);
};

const readMediaTimescale = async (file: File, mediaHeaderBox: IsoBmffBox): Promise<number | null> => {
  const body = await readFileRange(file, mediaHeaderBox.dataStart, 24);
  if (body.byteLength < 20) {
    return null;
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const timescaleOffset = body[0] === 1 ? 20 : 12; // Version 1 uses 64-bit creation and modification timestamps.
  if (body.byteLength < timescaleOffset + 4) {
    return null;
  }
  const timescale = view.getUint32(timescaleOffset);
  return timescale > 0 ? timescale : null;
};

const readTimeToSampleFrameRate = async (
  file: File,
  timeToSampleBox: IsoBmffBox,
  timescale: number,
): Promise<number | null> => {
  const header = await readFileRange(file, timeToSampleBox.dataStart, 8);
  if (header.byteLength < 8) {
    return null;
  }
  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const entryCount = headerView.getUint32(4);
  const entriesByteLength = entryCount * STTS_ENTRY_BYTES;
  if (!Number.isSafeInteger(entriesByteLength) || timeToSampleBox.dataStart + 8 + entriesByteLength > timeToSampleBox.end) {
    return null;
  }

  let totalSamples = 0;
  let totalDurationUnits = 0;
  let processedEntries = 0;
  while (processedEntries < entryCount) {
    const entriesToRead = Math.min(STTS_ENTRIES_PER_READ, entryCount - processedEntries);
    const chunk = await readFileRange(
      file,
      timeToSampleBox.dataStart + 8 + processedEntries * STTS_ENTRY_BYTES,
      entriesToRead * STTS_ENTRY_BYTES,
    );
    if (chunk.byteLength !== entriesToRead * STTS_ENTRY_BYTES) {
      return null;
    }
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let index = 0; index < entriesToRead; index += 1) {
      const sampleCount = view.getUint32(index * STTS_ENTRY_BYTES);
      const sampleDelta = view.getUint32(index * STTS_ENTRY_BYTES + 4);
      totalSamples += sampleCount;
      totalDurationUnits += sampleCount * sampleDelta;
      if (!Number.isSafeInteger(totalSamples) || !Number.isSafeInteger(totalDurationUnits)) {
        return null;
      }
    }
    processedEntries += entriesToRead;
  }

  if (totalSamples <= 0 || totalDurationUnits <= 0) {
    return null;
  }
  const frameRate = totalSamples / totalDurationUnits * timescale;
  return Number.isFinite(frameRate) && frameRate > 0 ? frameRate : null;
};

const readVideoTrackFrameRate = async (file: File, trackBox: IsoBmffBox): Promise<number | null> => {
  const mediaBox = await findFirstChildBox(file, trackBox, 'mdia');
  if (!mediaBox) {
    return null;
  }
  const handlerBox = await findFirstChildBox(file, mediaBox, 'hdlr');
  if (!handlerBox || await readHandlerType(file, handlerBox) !== 'vide') {
    return null;
  }
  const mediaHeaderBox = await findFirstChildBox(file, mediaBox, 'mdhd');
  const mediaInfoBox = await findFirstChildBox(file, mediaBox, 'minf');
  const sampleTableBox = mediaInfoBox ? await findFirstChildBox(file, mediaInfoBox, 'stbl') : null;
  const timeToSampleBox = sampleTableBox ? await findFirstChildBox(file, sampleTableBox, 'stts') : null;
  if (!mediaHeaderBox || !timeToSampleBox) {
    return null;
  }
  const timescale = await readMediaTimescale(file, mediaHeaderBox);
  return timescale ? readTimeToSampleFrameRate(file, timeToSampleBox, timescale) : null;
};

export const readIsoBmffVideoFrameRate = async (file: File): Promise<number | null> => {
  try {
    const movieBox = (await findChildBoxes(file, 0, file.size, 'moov'))[0];
    if (!movieBox) {
      return null;
    }
    const trackBoxes = await findChildBoxes(file, movieBox.dataStart, movieBox.end, 'trak');
    for (const trackBox of trackBoxes) {
      const frameRate = await readVideoTrackFrameRate(file, trackBox);
      if (frameRate !== null) {
        return frameRate;
      }
    }
    return null;
  } catch {
    return null; // Corrupt or unsupported containers remain eligible for Fal's authoritative validation.
  }
};
