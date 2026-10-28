import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fal } from '@fal-ai/client';
import { generateImageToVideo } from '../falService';
import { getFalErrorPhase, getFalErrorRequestId } from '../fal/errors';
import type { GenerateVideoOptions } from '../fal/types';
import {
  KLING_V4_EDIT_VIDEO_MODEL_ID,
  KLING_V4_IMAGE_TO_VIDEO_MODEL_ID,
  KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID,
  KLING_V4_TEXT_TO_VIDEO_MODEL_ID,
  KLING_V4_VIDEO_MODEL_ID,
} from '../klingV4Config';

vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), storage: { upload: vi.fn() }, subscribe: vi.fn() } }));

const createImage = (name?: string): HTMLImageElement => {
  const image = Object.assign(document.createElement('img'), { width: 512, height: 512 });
  if (name) image.src = `https://example.com/${name}.png`;
  return image;
};
const createVideo = (index = 1): File => new File(['video'], `reference-${index}.mp4`, { type: 'video/mp4' });
const legacyOptions: GenerateVideoOptions = { generateAudio: true, negativePrompt: 'no blur', cfgScale: 0.5, seed: 42, keepAudio: true, aspectRatio: '4:3', resolution: '480p', duration: '10' };
const lastInput = (): Record<string, unknown> => vi.mocked(fal.subscribe).mock.lastCall?.[1]?.input as Record<string, unknown>;

describe('Kling 4 public Fal video requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_API_KEY = 'test';
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['image'], { type: 'image/png' })));
    let imageIndex = 0;
    vi.mocked(fal.storage.upload).mockImplementation(async blob => blob instanceof File
      ? `https://example.com/${blob.name}` : `https://example.com/image-${++imageIndex}.png`);
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/output.mp4' } }, requestId: 'kling4-request',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);
  });

  afterEach(() => {
    for (const [, request] of vi.mocked(fal.subscribe).mock.calls) {
      for (const field of ['generate_audio', 'audio', 'audio_url', 'audio_urls', 'cfg_scale', 'negative_prompt', 'seed', 'keep_audio', 'keep_original_sound', 'multi_prompt']) {
        expect(request.input).not.toHaveProperty(field);
      }
    }
    vi.restoreAllMocks();
  });

  it.each([KLING_V4_VIDEO_MODEL_ID, KLING_V4_TEXT_TO_VIDEO_MODEL_ID, KLING_V4_IMAGE_TO_VIDEO_MODEL_ID, KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID])('smart-routes Generate alias %s without silently losing media', async modelId => {
    const options = { modelId, ...legacyOptions };
    const result = await generateImageToVideo('  A cinematic scene  ', null, options);
    expect(result).toEqual({ videoUrl: 'https://example.com/output.mp4', requestId: 'kling4-request' });
    expect(fal.subscribe).toHaveBeenLastCalledWith(KLING_V4_TEXT_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: { prompt: 'A cinematic scene', duration: 5, resolution: '1080p', aspect_ratio: '16:9' },
    }));
    expect(fal.storage.upload).not.toHaveBeenCalled();

    await generateImageToVideo('Animate', createImage(), options);
    expect(fal.subscribe).toHaveBeenLastCalledWith(KLING_V4_IMAGE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: { prompt: 'Animate', duration: 5, resolution: '1080p', start_image_url: 'https://example.com/image-1.png' },
    }));

    await generateImageToVideo('Use @ image 1', null, { ...options, referenceImages: [createImage()] });
    expect(fal.subscribe).toHaveBeenLastCalledWith(KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: { prompt: 'Use @Image1', duration: 5, resolution: '1080p', aspect_ratio: '16:9', image_urls: ['https://example.com/image-2.png'] },
    }));
  });

  it('passes numeric 30s, 720p, source fallback, and text auto-aspect fallback', async () => {
    await generateImageToVideo('A landscape', null, { modelId: KLING_V4_VIDEO_MODEL_ID, klingV4Duration: '30', klingV4Resolution: '720p', klingV4AspectRatio: '21:9' });
    expect(lastInput()).toEqual({ prompt: 'A landscape', duration: 30, resolution: '720p', aspect_ratio: '21:9' });
    await generateImageToVideo('A landscape', null, { modelId: KLING_V4_VIDEO_MODEL_ID, klingV4Duration: 'source', klingV4AspectRatio: 'auto' });
    expect(lastInput()).toEqual({ prompt: 'A landscape', duration: 5, resolution: '1080p', aspect_ratio: '16:9' });
  });

  it('uploads both first and last frames without sending image_urls or aspect_ratio', async () => {
    await generateImageToVideo('Animate both frames', createImage(), {
      modelId: KLING_V4_VIDEO_MODEL_ID, tailImage: createImage(), klingV4Duration: '3', klingV4AspectRatio: '21:9', ...legacyOptions,
    });
    expect(fal.storage.upload).toHaveBeenCalledTimes(2);
    expect(lastInput()).toEqual({ prompt: 'Animate both frames', resolution: '1080p', duration: 3, start_image_url: 'https://example.com/image-1.png', end_image_url: 'https://example.com/image-2.png' });
  });

  it('routes video-only references and preserves native mention labels', async () => {
    await generateImageToVideo('Use @video 1, not user@video1 or @Video1_suffix', null, {
      modelId: KLING_V4_VIDEO_MODEL_ID, referenceVideos: [createVideo()], klingV4AspectRatio: 'auto',
    });
    expect(fal.subscribe).toHaveBeenLastCalledWith(KLING_V4_REFERENCE_TO_VIDEO_MODEL_ID, expect.objectContaining({
      input: { prompt: 'Use @Video1, not user@video1 or @Video1_suffix', duration: 5, resolution: '1080p', aspect_ratio: 'auto', video_urls: ['https://example.com/reference-1.mp4'] },
    }));
  });

  it('keeps asymmetric image/video reference order even when image uploads finish out of order', async () => {
    const startingImage = createImage('start');
    const references = [createImage('second'), startingImage, createImage('third')];
    const originalReferences = [...references];
    let resolveFirst!: (url: string) => void;
    let resolveSecond!: (url: string) => void;
    let resolveThird!: (url: string) => void;
    vi.mocked(fal.storage.upload)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveThird = resolve; }));
    const pending = generateImageToVideo('Compare @ image 1 and @IMAGE2 with @ video 2', startingImage, {
      modelId: KLING_V4_VIDEO_MODEL_ID, referenceImages: references, referenceVideos: [createVideo(1), createVideo(2)], klingV4AspectRatio: 'auto',
    });
    await vi.waitFor(() => expect(fal.storage.upload).toHaveBeenCalledTimes(3));
    resolveThird('https://example.com/third.png');
    resolveSecond('https://example.com/second.png');
    resolveFirst('https://example.com/start.png');
    await pending;
    expect(fal.storage.upload).toHaveBeenCalledTimes(5);
    expect(references).toEqual(originalReferences);
    expect(lastInput()).toEqual({
      prompt: 'Compare @Image1 and @Image2 with @Video2', resolution: '1080p', duration: 5, aspect_ratio: 'auto',
      image_urls: ['https://example.com/start.png', 'https://example.com/second.png', 'https://example.com/third.png'],
      video_urls: ['https://example.com/reference-1.mp4', 'https://example.com/reference-2.mp4'],
    });
  });

  it('includes a separately loaded primary image only once at the front of image references', async () => {
    await generateImageToVideo('References', createImage('same'), {
      modelId: KLING_V4_VIDEO_MODEL_ID, referenceImages: [createImage('other'), createImage('same')],
    });
    expect(fal.storage.upload).toHaveBeenCalledTimes(2);
    expect(lastInput().image_urls).toEqual(['https://example.com/image-1.png', 'https://example.com/image-2.png']);
  });

  it('accepts the full 10-image plus 5-video reference budget with bounded uploads', async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(fal.storage.upload).mockImplementation(async blob => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 0));
      active -= 1;
      return blob instanceof File ? `https://example.com/${blob.name}` : 'https://example.com/image.png';
    });
    await generateImageToVideo('All references', null, {
      modelId: KLING_V4_VIDEO_MODEL_ID, referenceImages: Array.from({ length: 10 }, () => createImage()), referenceVideos: Array.from({ length: 5 }, (_, index) => createVideo(index + 1)),
    });
    expect(lastInput().image_urls).toHaveLength(10);
    expect(lastInput().video_urls).toHaveLength(5);
    expect(peak).toBe(3);
    expect(fal.storage.upload).toHaveBeenCalledTimes(15);
  });

  it.each([KLING_V4_VIDEO_MODEL_ID, KLING_V4_EDIT_VIDEO_MODEL_ID])('edits via %s, normalizes mentions, and inherits source duration only when selected', async modelId => {
    const options = { modelId, klingV4Variant: 'edit' as const, sourceVideoUrl: 'https://example.com/source.mp4', klingV4Duration: 'source' as const, klingV4AspectRatio: '21:9' as const, ...legacyOptions };
    await generateImageToVideo('Edit @ video 1 using @ image 1', null, { ...options, referenceImages: [createImage()] });
    expect(fal.subscribe).toHaveBeenLastCalledWith(KLING_V4_EDIT_VIDEO_MODEL_ID, expect.objectContaining({
      input: { prompt: 'Edit @Video1 using @Image1', video_url: options.sourceVideoUrl, resolution: '1080p', image_urls: ['https://example.com/image-1.png'] },
    }));
    await generateImageToVideo('Shorten @Video1', null, { ...options, klingV4Duration: '3' });
    expect(lastInput()).toEqual({ prompt: 'Shorten @Video1', video_url: options.sourceVideoUrl, duration: 3, resolution: '1080p' });
  });

  it('honors explicit edit endpoints despite a stale Generate variant and defaults to source duration', async () => {
    await generateImageToVideo('Edit source', null, { modelId: KLING_V4_EDIT_VIDEO_MODEL_ID, klingV4Variant: 'generate', sourceVideoUrl: 'https://example.com/source.mp4' });
    expect(lastInput()).toEqual({ prompt: 'Edit source', video_url: 'https://example.com/source.mp4', resolution: '1080p' });
  });

  it.each([
    { label: 'blank prompt', prompt: ' ', options: {}, message: 'requires a prompt' },
    { label: 'missing edit source', options: { klingV4Variant: 'edit' }, message: 'requires a source video' },
    { label: 'blank edit source', options: { klingV4Variant: 'edit', sourceVideoUrl: ' ' }, message: 'requires a source video' },
    { label: 'edit video references', options: { klingV4Variant: 'edit', sourceVideoUrl: 'https://example.com/source.mp4', referenceVideos: [createVideo()] }, message: 'image references only' },
    { label: 'audio references', options: { referenceAudios: [new File(['audio'], 'audio.wav', { type: 'audio/wav' })] }, message: 'audio references' },
    { label: 'edit audio references', options: { klingV4Variant: 'edit', sourceVideoUrl: 'https://example.com/source.mp4', sourceAudioUrl: 'https://example.com/source.wav' }, message: 'audio references' },
    { label: 'generate source video', options: { sourceVideoUrl: 'https://example.com/source.mp4' }, message: 'does not accept a source video' },
    { label: 'unrepresentable elements', options: { elementImages: [createImage()] }, message: 'element image inputs' },
    { label: 'eleven reference images', options: { referenceImages: Array.from({ length: 11 }, () => createImage()) }, message: '10 reference images' },
    { label: 'six reference videos', options: { referenceVideos: Array.from({ length: 6 }, () => createVideo()) }, message: '5 reference videos' },
  ] satisfies Array<{ label: string; prompt?: string; options: GenerateVideoOptions; message: string }>)('rejects $label before uploading or submitting', async ({ prompt, options, message }) => {
    await expect(generateImageToVideo(prompt ?? 'A scene', null, { modelId: KLING_V4_VIDEO_MODEL_ID, ...options })).rejects.toThrow(message);
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('counts the primary image toward the reference image limit', async () => {
    await expect(generateImageToVideo('Too many', createImage('primary'), {
      modelId: KLING_V4_VIDEO_MODEL_ID, referenceImages: Array.from({ length: 10 }, (_, index) => createImage(`reference-${index}`)),
    })).rejects.toThrow('10 reference images');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it.each(['images', 'videos', 'edit', 'missing start'] as const)('rejects an end frame with %s rather than dropping it', async mode => {
    const options: GenerateVideoOptions = { modelId: KLING_V4_VIDEO_MODEL_ID, tailImage: createImage() };
    if (mode === 'images') options.referenceImages = [createImage()];
    if (mode === 'videos') options.referenceVideos = [createVideo()];
    if (mode === 'edit') Object.assign(options, { klingV4Variant: 'edit', sourceVideoUrl: 'https://example.com/source.mp4' });
    await expect(generateImageToVideo('An end frame', mode === 'missing start' ? null : createImage(), options)).rejects.toThrow(mode === 'missing start' ? 'starting image' : 'end frame');
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('materializes lazy snapshot video references before passing them to Fal storage', async () => {
    const bytes = new TextEncoder().encode('snapshot-video');
    const slice = vi.fn((start: number, end: number) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer }));
    const lazyFile = { name: 'restored.mp4', type: 'video/mp4', size: bytes.byteLength, lastModified: 1, slice } as unknown as File;
    await generateImageToVideo('Use @Video1', null, { modelId: KLING_V4_VIDEO_MODEL_ID, referenceVideos: [lazyFile] });
    const uploaded = vi.mocked(fal.storage.upload).mock.calls[0][0];
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded).toHaveProperty('name', 'restored.mp4');
    expect(uploaded.size).toBe(bytes.byteLength);
    expect(slice).toHaveBeenCalled();
    expect(lastInput().video_urls).toEqual(['https://example.com/restored.mp4']);
  });

  it('reuses shared queue callbacks and request-id fallback', async () => {
    const onQueueUpdate = vi.fn();
    const onPhaseUpdate = vi.fn();
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_modelId, request) => {
      request.onQueueUpdate?.({ status: 'IN_PROGRESS', request_id: 'queued-id', logs: [{ message: 'Rendering' }] } as unknown as Parameters<NonNullable<typeof request.onQueueUpdate>>[0]);
      return { data: { video: 'https://example.com/output.mp4' } } as unknown as Awaited<ReturnType<typeof fal.subscribe>>;
    });
    await expect(generateImageToVideo('A scene', null, { modelId: KLING_V4_VIDEO_MODEL_ID, onQueueUpdate, onPhaseUpdate })).resolves.toEqual({ videoUrl: 'https://example.com/output.mp4', requestId: 'queued-id' });
    expect(onQueueUpdate).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'queued-id', status: 'IN_PROGRESS', logs: [{ message: 'Rendering' }] }));
    expect(onPhaseUpdate).toHaveBeenCalledWith(expect.objectContaining({ phase: 'submitting' }));
    expect(onPhaseUpdate).toHaveBeenCalledWith(expect.objectContaining({ phase: 'processing', requestId: 'queued-id' }));
  });

  it('retains phase-aware provider errors and queue request ids', async () => {
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_modelId, request) => {
      request.onQueueUpdate?.({ status: 'IN_PROGRESS', request_id: 'failed-id' } as unknown as Parameters<NonNullable<typeof request.onQueueUpdate>>[0]);
      throw new Error('Provider failed');
    });
    const error = await generateImageToVideo('A scene', null, { modelId: KLING_V4_VIDEO_MODEL_ID }).catch(error => error);
    expect(getFalErrorPhase(error)).toBe('processing');
    expect(getFalErrorRequestId(error)).toBe('failed-id');
  });

  it('rejects already-canceled work without uploads or submission', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(generateImageToVideo('A scene', createImage(), { modelId: KLING_V4_VIDEO_MODEL_ID, abortSignal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fal.storage.upload).not.toHaveBeenCalled();
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('does not submit after cancellation during uploads', async () => {
    const controller = new AbortController();
    vi.mocked(fal.storage.upload).mockImplementationOnce(async () => {
      controller.abort();
      return 'https://example.com/canceled.png';
    });
    await expect(generateImageToVideo('A scene', createImage(), { modelId: KLING_V4_VIDEO_MODEL_ID, abortSignal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fal.subscribe).not.toHaveBeenCalled();
  });

  it('forwards cancellation to the shared subscription and suppresses late queue updates', async () => {
    const controller = new AbortController();
    const onQueueUpdate = vi.fn();
    vi.mocked(fal.subscribe).mockImplementationOnce(async (_modelId, request) => {
      expect(request.abortSignal).toBe(controller.signal);
      controller.abort();
      request.onQueueUpdate?.({ status: 'IN_PROGRESS' } as unknown as Parameters<NonNullable<typeof request.onQueueUpdate>>[0]);
      return { data: { video: 'https://example.com/too-late.mp4' } } as unknown as Awaited<ReturnType<typeof fal.subscribe>>;
    });
    await expect(generateImageToVideo('A scene', null, { modelId: KLING_V4_VIDEO_MODEL_ID, abortSignal: controller.signal, onQueueUpdate })).rejects.toMatchObject({ name: 'AbortError' });
    expect(onQueueUpdate).not.toHaveBeenCalled();
  });
});
