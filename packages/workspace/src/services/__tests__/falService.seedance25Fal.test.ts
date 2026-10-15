import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

vi.mock('../audioService', () => ({
  convertAudioBlobToWav: vi.fn(async () => new Blob(['converted-wav'], { type: 'audio/wav' })),
}));

import { fal } from '@fal-ai/client';
import { convertAudioBlobToWav } from '../audioService';
import {
  FAL_SEEDANCE_25_IMAGE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_REFERENCE_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_TEXT_TO_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FAL_VIDEO_MODEL_OPTIONS,
  isFalModelId,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';

const createTestImage = (): HTMLImageElement => {
  const image = document.createElement('img');
  image.width = 512;
  image.height = 512;
  return image; // Minimal dimensions let Fal uploads rasterize the image in tests.
};

const createVideo = (index = 1): File => new File(['video'], `reference-${index}.mp4`, { type: 'video/mp4' });
const createAudio = (index = 1): File => new File(['audio'], `reference-${index}.wav`, { type: 'audio/wav' });
const createFrameRateVideo = (frameRate: number): File => {
  const uint32 = (value: number) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value);
    return bytes;
  };
  const join = (...parts: Uint8Array[]) => {
    const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
    let offset = 0;
    parts.forEach(part => {
      bytes.set(part, offset);
      offset += part.byteLength;
    });
    return bytes;
  };
  const box = (type: string, ...bodyParts: Uint8Array[]) => {
    const body = join(...bodyParts);
    return join(uint32(body.byteLength + 8), Uint8Array.from(type.split('').map(character => character.charCodeAt(0))), body);
  };
  const timescale = 120000;
  const sampleCount = 120;
  const sampleDelta = Math.round(timescale / frameRate);
  const mediaHeader = box('mdhd', new Uint8Array(12), uint32(timescale), uint32(sampleCount * sampleDelta));
  const handler = box('hdlr', new Uint8Array(8), Uint8Array.from([118, 105, 100, 101]));
  const timeToSample = box('stts', new Uint8Array(4), uint32(1), uint32(sampleCount), uint32(sampleDelta));
  const movie = box('moov', box('trak', box('mdia', mediaHeader, handler, box('minf', box('stbl', timeToSample)))));
  return {
    name: 'high-frame-rate.mp4',
    type: 'video/mp4',
    size: movie.byteLength,
    lastModified: 1,
    webkitRelativePath: '',
    slice: (start = 0, end = movie.byteLength) => ({
      arrayBuffer: async () => movie.slice(start, end).buffer,
    }),
  } as unknown as File;
};
const createLazyVideo = (): File & { slice: ReturnType<typeof vi.fn> } => {
  const payload = new TextEncoder().encode('lazy-video');
  const slice = vi.fn((start: number, end: number) => ({
    arrayBuffer: async () => payload.slice(start, end).buffer,
  }));
  return {
    size: payload.byteLength,
    type: 'video/mp4',
    name: 'lazy-reference.mp4',
    lastModified: 1,
    webkitRelativePath: '',
    slice,
  } as unknown as File & { slice: ReturnType<typeof vi.fn> };
}; // Matches the lazy File shape restored from desktop snapshots.

const createLazyAudio = (index: number): File & { slice: ReturnType<typeof vi.fn> } => {
  const payload = new TextEncoder().encode(`lazy-audio-${index}`);
  const slice = vi.fn((start: number, end: number) => ({
    arrayBuffer: async () => payload.slice(start, end).buffer,
  }));
  return {
    size: payload.byteLength,
    type: 'audio/wav',
    name: `lazy-reference-${index}.wav`,
    lastModified: 1,
    webkitRelativePath: '',
    slice,
  } as unknown as File & { slice: ReturnType<typeof vi.fn> };
}; // Matches lazy snapshot audio without allocating its bytes up front.

describe('falService (Seedance 2.5 FAL)', () => {
  const originalToBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

  beforeEach(() => {
    process.env.FAL_API_KEY = 'test';
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => callback(new Blob(['test'], { type: 'image/png' })),
      configurable: true,
    });
    vi.mocked(fal.storage.upload).mockImplementation(async () => `https://example.com/reference-${vi.mocked(fal.storage.upload).mock.calls.length}`);
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/seedance-25-output.mp4' } },
      requestId: 'req-seedance-25-fal',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    if (originalToBlobDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlobDescriptor);
      return;
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: undefined, configurable: true });
  });

  it('registers the selector label and Fal model id', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === FAL_SEEDANCE_25_VIDEO_MODEL_ID);

    expect(option?.label).toBe('Seedance 2.5 (FAL)');
    expect(isFalModelId(FAL_SEEDANCE_25_VIDEO_MODEL_ID)).toBe(true);
  });

  it('routes Smart text requests with 30-second audio settings and no seed', async () => {
    await generateImageToVideo('Seedance 2.5 text request', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'smart',
      seedance25AspectRatio: '21:9',
      seedance25Resolution: '480p',
      seedance25Duration: '30',
      seedance25GenerateAudio: false,
      seed: 99,
    });

    const input = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;
    expect(fal.subscribe).toHaveBeenCalledWith(FAL_SEEDANCE_25_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: {
        prompt: 'Seedance 2.5 text request',
        aspect_ratio: '21:9',
        resolution: '480p',
        duration: '30',
        generate_audio: false,
      },
    }));
    expect(input).not.toHaveProperty('seed');
  });

  it('routes Smart image requests with an ending frame and the required automatic aspect ratio', async () => {
    vi.mocked(fal.storage.upload)
      .mockResolvedValueOnce('https://example.com/start.png')
      .mockResolvedValueOnce('https://example.com/end.png');

    await generateImageToVideo('Seedance 2.5 image request', createTestImage(), {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'smart',
      seedance25AspectRatio: '9:16',
      seedance25Resolution: '720p',
      seedance25Duration: 'auto',
      seedance25GenerateAudio: true,
      tailImage: createTestImage(),
    });

    expect(fal.subscribe).toHaveBeenCalledWith(FAL_SEEDANCE_25_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Seedance 2.5 image request',
        image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
        aspect_ratio: 'auto',
      }),
    }));
  });

  it('rejects Smart video and audio reference inputs', async () => {
    await expect(generateImageToVideo('Unsupported Smart input', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'smart',
      referenceVideos: [createVideo()],
      referenceAudios: [createAudio()],
    })).rejects.toThrow('Seedance 2.5 (FAL) Smart accepts text and still-image inputs only.');
  });

  it('rejects unsupported reference video frame rates before upload', async () => {
    await expect(generateImageToVideo('High frame rate', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceVideos: [createFrameRateVideo(120)],
    })).rejects.toThrow('Seedance 2.5 reference videos must use a frame rate between 24 and 60 FPS.');
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it('rejects rasterized input images larger than 30 MB before upload', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void) => {
        const blob = new Blob(['test'], { type: 'image/png' });
        Object.defineProperty(blob, 'size', { value: 30 * 1024 * 1024 + 1 });
        callback(blob);
      },
      configurable: true,
    });

    await expect(generateImageToVideo('Oversized image', createTestImage(), {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'smart',
    })).rejects.toThrow('Seedance 2.5 input images must be 30 MB or smaller.');
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it('compresses an oversized PNG rasterization before applying the image upload cap', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: (callback: (blob: Blob | null) => void, mimeType = 'image/png', quality = 1) => {
        const blob = new Blob(['encoded'], { type: mimeType });
        const encodedSize = mimeType === 'image/png'
          ? 30 * 1024 * 1024 + 1
          : Math.round(40 * 1024 * 1024 * quality);
        Object.defineProperty(blob, 'size', { value: encodedSize });
        callback(blob);
      },
      configurable: true,
    });

    await generateImageToVideo('Compress the starting image', createTestImage(), {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'smart',
    });

    const uploadedBlob = vi.mocked(fal.storage.upload).mock.calls[0]?.[0];
    expect(uploadedBlob?.type).toBe('image/webp');
    expect(uploadedBlob?.size).toBeLessThanOrEqual(30 * 1024 * 1024);
  });

  it('preserves image, video, and audio ordering in Reference payloads', async () => {
    const imageUrls = ['https://example.com/image-1.png', 'https://example.com/image-2.png'];
    vi.mocked(fal.storage.upload).mockImplementation(async blob => {
      if (blob.type === 'video/mp4') return 'https://example.com/video-1.mp4';
      if (blob.type === 'audio/wav') return 'https://example.com/audio-1.wav';
      return imageUrls.shift() ?? 'https://example.com/unexpected-image.png';
    }); // Concurrent media uploads may begin in a different cross-media order.

    await generateImageToVideo('Use @Image2, then @Video1 and @Audio1', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceImages: [createTestImage(), createTestImage()],
      referenceVideos: [createVideo()],
      referenceAudios: [createAudio()],
    });

    expect(fal.subscribe).toHaveBeenCalledWith(FAL_SEEDANCE_25_REFERENCE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: expect.objectContaining({
        prompt: 'Use @Image2, then @Video1 and @Audio1',
        aspect_ratio: 'auto',
        image_urls: ['https://example.com/image-1.png', 'https://example.com/image-2.png'],
        video_urls: ['https://example.com/video-1.mp4'],
        audio_urls: ['https://example.com/audio-1.wav'],
      }),
    }));
  });

  it('materializes lazy snapshot videos inside the Reference upload path', async () => {
    const lazyVideo = createLazyVideo();

    await generateImageToVideo('Use the lazy video', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceVideos: [lazyVideo],
    });

    expect(lazyVideo.slice).toHaveBeenCalledTimes(2); // One metadata range read plus one full materialization for upload.
    expect(vi.mocked(fal.storage.upload).mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  });

  it('materializes lazy snapshot audio only inside the bounded Reference upload pool', async () => {
    const lazyAudios = Array.from({ length: 10 }, (_, index) => createLazyAudio(index + 1));
    const heldUploadResolvers: Array<(url: string) => void> = [];
    let holdUploads = true;
    vi.mocked(fal.storage.upload).mockImplementation(blob => {
      const url = `https://example.com/reference-${vi.mocked(fal.storage.upload).mock.calls.length}`;
      if (!holdUploads) {
        return Promise.resolve(url);
      }
      return new Promise(resolve => heldUploadResolvers.push(resolve));
    });

    const generation = generateImageToVideo('Use the lazy audio', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceImages: [createTestImage()],
      referenceAudios: lazyAudios,
    });

    await vi.waitFor(() => expect(heldUploadResolvers).toHaveLength(3));
    expect(lazyAudios.reduce((count, file) => count + file.slice.mock.calls.length, 0)).toBe(2); // The third worker is uploading the image.

    holdUploads = false;
    heldUploadResolvers.splice(0).forEach((resolve, index) => resolve(`https://example.com/held-${index + 1}`));
    await generation;

    lazyAudios.forEach(file => expect(file.slice).toHaveBeenCalledTimes(1));
    const uploadedAudioBlobs = vi.mocked(fal.storage.upload).mock.calls
      .map(([blob]) => blob)
      .filter(blob => blob.type === 'audio/wav');
    expect(uploadedAudioBlobs).toHaveLength(10);
    uploadedAudioBlobs.forEach(blob => expect(blob).toBeInstanceOf(Blob));
  });

  it('converts provider-unsupported audio MIME variants to WAV inside the upload pool', async () => {
    const m4aAudio = new File(['m4a-audio'], 'renamed-reference.wav', { type: 'audio/mp4; codecs=mp4a.40.2' });
    vi.mocked(fal.storage.upload).mockImplementation(async blob => (
      blob.type === 'audio/wav' ? 'https://example.com/converted.wav' : 'https://example.com/reference.png'
    ));

    await generateImageToVideo('Use the converted audio', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceImages: [createTestImage()],
      referenceAudios: [m4aAudio],
    });

    expect(convertAudioBlobToWav).toHaveBeenCalledWith(m4aAudio);
    const input = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;
    expect(input.audio_urls).toEqual(['https://example.com/converted.wav']);
  });

  it('supports the full 50-reference profile', async () => {
    const referenceImages = Array.from({ length: 30 }, createTestImage);
    const referenceVideos = Array.from({ length: 10 }, (_, index) => createVideo(index));
    const referenceAudios = Array.from({ length: 10 }, (_, index) => createAudio(index));

    await generateImageToVideo('Use all references', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceImages,
      referenceVideos,
      referenceAudios,
    });

    const input = vi.mocked(fal.subscribe).mock.calls[0]?.[1]?.input as Record<string, unknown>;
    expect(fal.storage.upload).toHaveBeenCalledTimes(50);
    expect(input.image_urls).toHaveLength(30);
    expect(input.video_urls).toHaveLength(10);
    expect(input.audio_urls).toHaveLength(10);
  });

  it.each([
    ['the 31st image', { referenceImages: Array.from({ length: 31 }, createTestImage) }, /up to 30 images/],
    ['the 11th video', { referenceVideos: Array.from({ length: 11 }, (_, index) => createVideo(index)) }, /up to 30 images, 10 videos/],
    ['the 11th audio', { referenceImages: [createTestImage()], referenceAudios: Array.from({ length: 11 }, (_, index) => createAudio(index)) }, /10 audio clips/],
    ['a 51-file set overflowing images', {
      referenceImages: Array.from({ length: 31 }, createTestImage),
      referenceVideos: Array.from({ length: 10 }, (_, index) => createVideo(index)),
      referenceAudios: Array.from({ length: 10 }, (_, index) => createAudio(index)),
    }, /up to 30 images/], // Per-modality checks run first, so the over-cap modality is named before the total.
  ])('rejects %s before uploading', async (_label, references, expectedError) => {
    await expect(generateImageToVideo('Too many references', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      ...references,
    })).rejects.toThrow(expectedError);
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it('requires visual context when audio references are selected', async () => {
    await expect(generateImageToVideo('Audio only', null, {
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      seedance25Variant: 'reference',
      referenceAudios: [createAudio()],
    })).rejects.toThrow(/require at least one image or video reference/);
  });
});
