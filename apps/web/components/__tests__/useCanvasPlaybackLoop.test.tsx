import { render, waitFor } from '@testing-library/react';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type CanvasImage } from '../../types';
import { useCanvasPlaybackLoop } from '../canvas/hooks/useCanvasPlaybackLoop';

const buildAudioImage = (overrides: Partial<CanvasImage> = {}): CanvasImage => {
  const waveform = document.createElement('img');
  const audio = document.createElement('audio');
  audio.play = vi.fn().mockResolvedValue(undefined); // Avoid real browser media work in hook tests.
  audio.pause = vi.fn(); // Keep the fixture complete for audio media guards.

  return {
    id: 'audio-1',
    element: waveform,
    mediaType: 'audio',
    x: 10,
    y: 10,
    width: 100,
    height: 40,
    rotation: 0,
    naturalWidth: 100,
    naturalHeight: 40,
    file: new File(['audio'], 'audio.wav', { type: 'audio/wav' }),
    isPlaying: false,
    hasAudio: true,
    audioElement: audio,
    audioDuration: 10,
    currentPlaybackTime: 2,
    ...overrides,
  }; // Audio fixture shaped like canvas state.
};

const PlaybackLoopHarness = ({
  images,
  initialTimes,
  observedTimesRef,
}: {
  images: CanvasImage[];
  initialTimes: Record<string, number>;
  observedTimesRef: MutableRefObject<Record<string, number> | null>;
}) => {
  const audioPlaybackTimesRef = useRef<Record<string, number>>(initialTimes);
  useEffect(() => {
    observedTimesRef.current = audioPlaybackTimesRef.current; // Expose the mutable cache for assertions.
  }, [observedTimesRef]);
  useCanvasPlaybackLoop({
    images,
    scheduleDraw: vi.fn(),
    isPlayingMediaVisible: () => true,
    audioPlaybackTimesRef,
  });
  return null;
};

describe('useCanvasPlaybackLoop', () => {
  it('reconciles paused audio cache from image state when the image is restored', async () => {
    const observedTimesRef: MutableRefObject<Record<string, number> | null> = { current: null };

    render(
      <PlaybackLoopHarness
        images={[buildAudioImage({ currentPlaybackTime: 2 })]}
        initialTimes={{ 'audio-1': 8 }}
        observedTimesRef={observedTimesRef}
      />,
    );

    await waitFor(() => {
      expect(observedTimesRef.current?.['audio-1']).toBe(2);
    });
  });

  it('drops cached playback times for removed audio items', async () => {
    const observedTimesRef: MutableRefObject<Record<string, number> | null> = { current: null };

    render(
      <PlaybackLoopHarness
        images={[]}
        initialTimes={{ 'audio-1': 8 }}
        observedTimesRef={observedTimesRef}
      />,
    );

    await waitFor(() => {
      expect(observedTimesRef.current).toEqual({});
    });
  });
});
