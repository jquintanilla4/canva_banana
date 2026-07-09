import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATION_CANVAS_NOTIFICATION_DURATION_MS,
  useGenerationCanvasNotifications,
} from '../useGenerationCanvasNotifications';

const uuid = (tail: string) => `00000000-0000-4000-8000-${tail}` as ReturnType<Crypto['randomUUID']>;

describe('useGenerationCanvasNotifications', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stacks generation notifications independently and removes them after one minute', () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(uuid('000000000001'))
      .mockReturnValueOnce(uuid('000000000002'));

    const { result } = renderHook(() => useGenerationCanvasNotifications());

    act(() => {
      result.current.notifyGenerationPlaced({ mediaIds: ['image-1'], mediaType: 'image', modelLabel: 'Model A' });
      vi.advanceTimersByTime(10_000);
      result.current.notifyGenerationPlaced({ mediaIds: ['video-1'], mediaType: 'video', modelLabel: 'Model B' });
    });

    expect(result.current.notifications.map(notification => notification.id)).toEqual([
      uuid('000000000002'),
      uuid('000000000001'),
    ]);

    act(() => {
      vi.advanceTimersByTime(GENERATION_CANVAS_NOTIFICATION_DURATION_MS - 10_000);
    });

    expect(result.current.notifications.map(notification => notification.id)).toEqual([uuid('000000000002')]);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.notifications).toEqual([]);
  });

  it('clears a notification timer when it is manually dismissed', () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid('000000000001'));

    const { result } = renderHook(() => useGenerationCanvasNotifications());

    act(() => {
      result.current.notifyGenerationPlaced({ mediaIds: ['image-1'], mediaType: 'image' });
    });
    act(() => {
      result.current.dismissGenerationNotification(uuid('000000000001'));
      vi.advanceTimersByTime(GENERATION_CANVAS_NOTIFICATION_DURATION_MS);
    });

    expect(result.current.notifications).toEqual([]);
  });
});
