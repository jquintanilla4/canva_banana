import type { BlobWriter, TempStream } from '@zip.js/zip.js';
import type { CanvasImage } from '../types';
import { withSnapshotMediaLease, type SnapshotMediaBlob } from './snapshotService';

const ARCHIVE_CHUNK_BYTES = 4 * 1024 * 1024; // Keep each desktop IPC write at or below the native bridge limit.

export type ZipModule = typeof import('@zip.js/zip.js');

export type ArchiveDestination = {
  writer: BlobWriter | WritableStream<Uint8Array>;
  finish: (zipOutput: unknown) => Promise<void>;
  abort: () => Promise<void>;
};

export type StagedMedia = {
  readable: ReadableStream<Uint8Array>;
  dispose: () => Promise<void>;
};

type FileSystemSaveHandle = {
  createWritable: () => Promise<WritableStream<Uint8Array>>;
};

type FileSystemSavePickerWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<FileSystemSaveHandle>;
};

export class CanvasMediaDownloadCancelledError extends Error {
  readonly code = 'cancelled';

  constructor() {
    super('The download was canceled.');
    this.name = 'CanvasMediaDownloadCancelledError';
  }
}

export const getRenderedCanvasMediaSource = (image: CanvasImage): string => {
  const element = image.mediaType === 'audio' ? image.audioElement : image.element;
  if (!element) return '';
  return element instanceof HTMLVideoElement || element instanceof HTMLAudioElement
    ? element.currentSrc || element.src
    : element.src;
}; // Current source wins when a media element selected a source other than src.

export const clickDownloadLink = (href: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}; // A DOM-attached anchor preserves browser and Electron download behavior.

const isAbortError = (error: unknown): boolean => (
  typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name === 'AbortError'
    : (error as { name?: unknown })?.name === 'AbortError'
);

export const createTempStreamFactories = (zipModule: ZipModule): {
  preferred: () => TempStream | Promise<TempStream>;
  fallback: () => TempStream | Promise<TempStream>;
} => {
  const blobFactory = zipModule.createBlobTempStream();
  const storage = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } }).storage;
  if (typeof storage?.getDirectory !== 'function') return { preferred: blobFactory, fallback: blobFactory };
  return { preferred: zipModule.createOPFSTempStream(), fallback: blobFactory };
};

const writeReadableToTemp = async (
  createReadable: () => Promise<ReadableStream<Uint8Array>>,
  createTempStream: () => TempStream | Promise<TempStream>,
): Promise<StagedMedia> => {
  const tempStream = await createTempStream();
  try {
    await (await createReadable()).pipeTo(tempStream.writable as WritableStream<Uint8Array>);
    return {
      readable: tempStream.readable as ReadableStream<Uint8Array>,
      dispose: async () => { await tempStream.dispose?.(); },
    };
  } catch (error) {
    await tempStream.dispose?.();
    throw error;
  }
};

const writeReadableToPreferredTemp = async (
  createReadable: () => Promise<ReadableStream<Uint8Array>>,
  preferredFactory: () => TempStream | Promise<TempStream>,
  fallbackFactory: () => TempStream | Promise<TempStream>,
): Promise<StagedMedia> => {
  try {
    return await writeReadableToTemp(createReadable, preferredFactory);
  } catch (error) {
    if (preferredFactory === fallbackFactory) throw error;
    return writeReadableToTemp(createReadable, fallbackFactory); // Retry in memory if the preferred staging attempt fails for any reason.
  }
};

const createBlobReadable = async (blob: Blob): Promise<ReadableStream<Uint8Array>> => {
  if (typeof blob.stream === 'function') return blob.stream();
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The media file could not be read.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}; // Legacy Blob implementations fall back to FileReader; modern browsers keep large files streaming.

const getStageCandidates = (
  image: CanvasImage,
  preferredFactory: () => TempStream | Promise<TempStream>,
  fallbackFactory: () => TempStream | Promise<TempStream>,
): Array<() => Promise<StagedMedia>> => {
  const candidates: Array<() => Promise<StagedMedia>> = [];
  if (image.file instanceof Blob) {
    candidates.push(() => writeReadableToPreferredTemp(() => createBlobReadable(image.file!), preferredFactory, fallbackFactory));
  } else if (image.file) {
    const lazyFile = image.file as unknown as SnapshotMediaBlob;
    candidates.push(() => withSnapshotMediaLease(
      lazyFile,
      () => writeReadableToPreferredTemp(async () => lazyFile.stream(), preferredFactory, fallbackFactory),
    ));
  }
  const renderedSource = getRenderedCanvasMediaSource(image);
  if (renderedSource) {
    candidates.push(() => writeReadableToPreferredTemp(async () => {
      const response = await fetch(renderedSource);
      if (!response.ok || !response.body) throw new Error('The rendered media source could not be read.');
      return response.body;
    }, preferredFactory, fallbackFactory));
  }
  return candidates;
};

export const stageCanvasMedia = async (
  image: CanvasImage,
  preferredFactory: () => TempStream | Promise<TempStream>,
  fallbackFactory: () => TempStream | Promise<TempStream>,
): Promise<StagedMedia> => {
  let lastError: unknown;
  for (const stageCandidate of getStageCandidates(image, preferredFactory, fallbackFactory)) {
    try {
      return await stageCandidate();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No downloadable source found for this item.');
};

const createDesktopArchiveDestination = async (archiveName: string): Promise<ArchiveDestination | null> => {
  const fileMenu = window.canvaBananaDesktop?.fileMenu;
  if (!fileMenu?.beginMediaArchiveWrite || !fileMenu.writeMediaArchiveChunk || !fileMenu.finishMediaArchiveWrite || !fileMenu.abortMediaArchiveWrite) {
    return null;
  }
  const result = await fileMenu.beginMediaArchiveWrite({ suggestedName: archiveName });
  if (result.canceled === true) throw new CanvasMediaDownloadCancelledError();
  const writeId = result.writeId;
  let settled = false;
  const writable = new WritableStream<Uint8Array>({
    write: async (chunk) => {
      for (let offset = 0; offset < chunk.byteLength; offset += ARCHIVE_CHUNK_BYTES) {
        const part = chunk.slice(offset, Math.min(chunk.byteLength, offset + ARCHIVE_CHUNK_BYTES));
        await fileMenu.writeMediaArchiveChunk!({ writeId, data: part.buffer as ArrayBuffer });
      }
    },
  });
  return {
    writer: writable,
    finish: async () => {
      await fileMenu.finishMediaArchiveWrite!({ writeId });
      settled = true;
    },
    abort: async () => {
      if (!settled) await fileMenu.abortMediaArchiveWrite!({ writeId });
      settled = true;
    },
  };
};

const createWebArchiveDestination = async (
  archiveName: string,
  zipModulePromise: Promise<ZipModule>,
): Promise<ArchiveDestination> => {
  const pickerWindow = window as FileSystemSavePickerWindow;
  if (typeof pickerWindow.showSaveFilePicker === 'function') {
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: archiveName,
        types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }],
      });
      const fileWriter = (await handle.createWritable()).getWriter();
      let settled = false;
      const writable = new WritableStream<Uint8Array>({
        write: chunk => fileWriter.write(chunk),
        close: async () => {
          await fileWriter.close();
          settled = true;
        },
        abort: async reason => {
          await fileWriter.abort(reason);
          settled = true;
        },
      });
      return {
        writer: writable,
        finish: async () => {}, // ZipWriter closes and commits the File System Access stream.
        abort: async () => {
          if (!settled) await fileWriter.abort();
          settled = true;
        },
      };
    } catch (error) {
      if (isAbortError(error)) throw new CanvasMediaDownloadCancelledError();
      throw error;
    }
  }
  /*
   * Safari and Firefox use this Blob fallback because they lack showSaveFilePicker.
   * It is acceptable for normal exports; revisit if very large archives fail in those browsers.
   */
  const { BlobWriter: BlobWriterConstructor } = await zipModulePromise;
  const blobWriter = new BlobWriterConstructor('application/zip');
  return {
    writer: blobWriter,
    finish: async (zipOutput) => {
      if (!(zipOutput instanceof Blob)) throw new Error('The ZIP archive could not be created.');
      const objectUrl = URL.createObjectURL(zipOutput);
      clickDownloadLink(objectUrl, archiveName);
      const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
      setTimeout(() => revokeObjectUrl(objectUrl), 0);
    },
    abort: async () => {},
  };
};

export const createCanvasMediaArchiveDestination = async (
  archiveName: string,
  zipModulePromise: Promise<ZipModule>,
): Promise<ArchiveDestination> => (
  await createDesktopArchiveDestination(archiveName) ?? await createWebArchiveDestination(archiveName, zipModulePromise)
);
