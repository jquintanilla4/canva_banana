import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn() },
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import {
  FAL_VIDEO_MODEL_OPTIONS,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  isFalModelId,
  LEGACY_SYNC_LIPSYNC_REACT_MODEL_ID,
  normalizeFalModelId,
  SYNC_LIPSYNC_MODEL_ID,
} from '../modelConfig';
import { generateImageToVideo } from '../falService';
import { extractHeygenClipIntent } from '../moonshotIntentService';

describe('falService (Sync v3)', () => {
  beforeEach(() => {
    process.env.FAL_API_KEY = 'test'; // Legacy env value; the browser SDK now uses the Node proxy.
    vi.clearAllMocks(); // Keep call assertions isolated per test.
  });

  afterEach(() => vi.unstubAllGlobals());

  it('exposes Sync v3 in the video model selector', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === SYNC_LIPSYNC_MODEL_ID);

    expect(option?.label).toBe('Sync 3 Lipsync');
    expect(isFalModelId(SYNC_LIPSYNC_MODEL_ID)).toBe(true);
  });

  it('normalizes legacy Sync React-1 ids to Sync v3', () => {
    expect(normalizeFalModelId(LEGACY_SYNC_LIPSYNC_REACT_MODEL_ID)).toBe(SYNC_LIPSYNC_MODEL_ID);
  });

  it('routes lip sync requests to Sync v3 with the v3 payload shape', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        video: { url: 'https://example.com/sync-v3-output.mp4' },
      },
      requestId: 'req-sync-v3',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImageToVideo('', null, {
      modelId: SYNC_LIPSYNC_MODEL_ID,
      sourceVideoUrl: 'https://example.com/input.mp4',
      sourceAudioUrl: 'https://example.com/input.wav',
      lipsyncSyncMode: 'remap',
    });

    expect(fal.subscribe).toHaveBeenCalledWith(SYNC_LIPSYNC_MODEL_ID, expect.objectContaining({
      input: {
        video_url: 'https://example.com/input.mp4',
        audio_url: 'https://example.com/input.wav',
        sync_mode: 'remap',
      },
    }));
    expect(result).toEqual({
      videoUrl: 'https://example.com/sync-v3-output.mp4',
      requestId: 'req-sync-v3',
    });
  });

  it('exposes HeyGen V3 Lipsync in the video model selector', () => {
    const option = FAL_VIDEO_MODEL_OPTIONS.find(model => model.value === HEYGEN_V3_LIPSYNC_MODEL_ID);

    expect(option?.label).toBe('HeyGen V3 Lipsync');
    expect(isFalModelId(HEYGEN_V3_LIPSYNC_MODEL_ID)).toBe(true);
  });

  it('routes HeyGen V3 lipsync requests with the precision payload shape', async () => {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: {
        video: { url: 'https://example.com/heygen-v3-output.mp4' },
      },
      requestId: 'req-heygen-v3',
    } as unknown as Awaited<ReturnType<typeof fal.subscribe>>);

    const result = await generateImageToVideo('', null, {
      modelId: HEYGEN_V3_LIPSYNC_MODEL_ID,
      sourceVideoUrl: 'https://example.com/input.mp4',
      sourceAudioUrl: 'https://example.com/input.wav',
      heygenEnableCaption: true,
      heygenEnableDynamicDuration: false,
      heygenDisableMusicTrack: true,
      heygenEnableSpeechEnhancement: true,
      heygenStartTime: 3.25,
      heygenEndTime: 8.5,
    });

    expect(fal.subscribe).toHaveBeenCalledWith(HEYGEN_V3_LIPSYNC_MODEL_ID, expect.objectContaining({
      input: {
        video_url: 'https://example.com/input.mp4',
        audio_url: 'https://example.com/input.wav',
        enable_caption: true,
        enable_dynamic_duration: false,
        disable_music_track: true,
        enable_speech_enhancement: true,
        start_time: 3.25,
        end_time: 8.5,
      },
    }));
    expect(result).toEqual({
      videoUrl: 'https://example.com/heygen-v3-output.mp4',
      requestId: 'req-heygen-v3',
    });
  });

  it.each([
    { prompt: 'Sync from the beginning', startTime: 0 },
    { prompt: 'Match the lip movements to the voice', startTime: null },
  ])('preserves timing intent in the HeyGen request for "$prompt"', async ({ prompt, startTime }) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ start_time: startTime, end_time: null })));
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: { video: { url: 'https://example.com/heygen-v3-output.mp4' } },
      requestId: 'req-heygen-v3',
    });

    const intent = await extractHeygenClipIntent(prompt);
    await generateImageToVideo(prompt, null, {
      modelId: HEYGEN_V3_LIPSYNC_MODEL_ID,
      sourceVideoUrl: 'https://example.com/input.mp4',
      sourceAudioUrl: 'https://example.com/input.wav',
      heygenStartTime: intent.startTime,
      heygenEndTime: intent.endTime,
    });

    const request = vi.mocked(fal.subscribe).mock.lastCall;
    expect(request?.[0]).toBe(HEYGEN_V3_LIPSYNC_MODEL_ID);
    const input = request?.[1].input;
    if (startTime === null) {
      expect(input).not.toHaveProperty('start_time');
    } else {
      expect(input).toHaveProperty('start_time', 0);
    }
    expect(input).not.toHaveProperty('end_time');
  });
});
