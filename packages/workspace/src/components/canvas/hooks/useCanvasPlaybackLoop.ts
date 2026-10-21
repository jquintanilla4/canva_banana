import { useEffect, type RefObject } from 'react';
import type { CanvasImage } from '../../../types';

// While every playing item is offscreen, poll visibility at this interval instead of
// redrawing the whole scene at display rate.
const OFFSCREEN_VISIBILITY_POLL_MS = 250;

type UseCanvasPlaybackLoopArgs = {
  images: CanvasImage[];
  scheduleDraw: () => void; // Stable coalesced repaint request that is safe every frame.
  isPlayingMediaVisible: () => boolean; // Reports whether playing media intersects the viewport.
  audioPlaybackTimesRef: RefObject<Record<string, number>>;
};

export const useCanvasPlaybackLoop = ({
  images,
  scheduleDraw,
  isPlayingMediaVisible,
  audioPlaybackTimesRef,
}: UseCanvasPlaybackLoopArgs): void => {
  useEffect(() => {
    const audioIds = new Set<string>(); // Track current audio IDs so removed media cannot leak cached times.
    images.forEach(img => {
      if (img.mediaType !== 'audio') {
        return;
      }
      audioIds.add(img.id);
      if (!img.isPlaying) {
        if (typeof img.currentPlaybackTime === 'number') {
          audioPlaybackTimesRef.current[img.id] = img.currentPlaybackTime; // Paused audio follows saved React state.
        } else {
          delete audioPlaybackTimesRef.current[img.id]; // Missing saved time should not keep an old live value.
        }
      } else if (audioPlaybackTimesRef.current[img.id] === undefined && typeof img.currentPlaybackTime === 'number') {
        audioPlaybackTimesRef.current[img.id] = img.currentPlaybackTime; // Seed live drawing until the next RAF tick.
      }
    });
    Object.keys(audioPlaybackTimesRef.current).forEach(id => {
      if (!audioIds.has(id)) {
        delete audioPlaybackTimesRef.current[id]; // Drop stale playhead values after removal.
      }
    });
  }, [audioPlaybackTimesRef, images]);

  useEffect(() => {
    const hasPlayingMedia = images.some(img =>
      (img.mediaType === 'video' || img.mediaType === 'audio') && img.isPlaying
    );
    if (!hasPlayingMedia) {
      return;
    }

    let rafId: number | null = null;
    let timeoutId: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      rafId = null;
      timeoutId = null;
      images.forEach(img => {
        if (img.mediaType === 'audio' && img.isPlaying && img.audioElement) {
          audioPlaybackTimesRef.current[img.id] = img.audioElement.currentTime; // Store live time without React state.
        }
      });
      if (isPlayingMediaVisible()) {
        scheduleDraw();
        rafId = requestAnimationFrame(tick);
      } else {
        // Offscreen media keeps playing; only the redraw work is skipped until it
        // scrolls back into view.
        timeoutId = window.setTimeout(tick, OFFSCREEN_VISIBILITY_POLL_MS);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [audioPlaybackTimesRef, images, isPlayingMediaVisible, scheduleDraw]);
};
