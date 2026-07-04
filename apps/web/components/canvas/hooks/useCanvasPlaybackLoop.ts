import { useEffect, type RefObject } from 'react';
import type { CanvasImage } from '../../../types';

type UseCanvasPlaybackLoopArgs = {
  images: CanvasImage[];
  draw: () => void;
  audioPlaybackTimesRef: RefObject<Record<string, number>>;
};

export const useCanvasPlaybackLoop = ({
  images,
  draw,
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

    let rafId = requestAnimationFrame(() => {});

    const tick = () => {
      images.forEach(img => {
        if (img.mediaType === 'audio' && img.isPlaying && img.audioElement) {
          audioPlaybackTimesRef.current[img.id] = img.audioElement.currentTime; // Store live time without React state.
        }
      });
      draw();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioPlaybackTimesRef, draw, images]);
};
