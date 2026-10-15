import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCanvasHistory, type AppState } from '../useCanvasHistory';
import type { CanvasImage } from '../../types';

const empty = (): AppState => ({ images: [], paths: [], notes: [], videoPromptAreas: [], videoPromptBars: [] });
const audio = (url: string, owned = true): CanvasImage => {
  const audioElement = document.createElement('audio');
  audioElement.src = url;
  if (owned) Object.assign(audioElement, { __audioObjectUrl: url });
  return { id: url, element: document.createElement('img'), audioElement, mediaType: 'audio',
    x: 0, y: 0, rotation: 0, width: 100, height: 40, naturalWidth: 100, naturalHeight: 40,
    file: new File(['audio'], 'audio.wav', { type: 'audio/wav' }) };
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('releases removed owned audio URLs without revoking shared snapshot URLs', () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const { result } = renderHook(() => useCanvasHistory({ ...empty(), images: [audio('blob:owned'), audio('blob:shared', false)] }));
  act(() => result.current.resetHistory(empty()));
  expect(revoke.mock.calls).toEqual([['blob:owned']]);
});

it('keeps checkpoint audio URLs alive through history replacement and restore', () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const checkpoint = { ...empty(), images: [audio('blob:checkpoint')] };
  const { result } = renderHook(() => useCanvasHistory(checkpoint));
  result.current.retainedStates.current.add(checkpoint);
  act(() => result.current.resetHistory(empty()));
  expect(revoke).not.toHaveBeenCalled();
  act(() => result.current.resetHistory(checkpoint));
  result.current.retainedStates.current.delete(checkpoint);
  expect(revoke).not.toHaveBeenCalled();
  act(() => result.current.resetHistory(empty()));
  expect(revoke.mock.calls).toEqual([['blob:checkpoint']]);
});

it('preserves audio through StrictMode replay and releases it on the real unmount', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const initial = { ...empty(), images: [audio('blob:strict')] };
  const { unmount } = renderHook(() => useCanvasHistory(initial), {
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  await act(async () => { await Promise.resolve(); });
  expect(revoke).not.toHaveBeenCalled();
  unmount();
  await Promise.resolve();
  expect(revoke.mock.calls).toEqual([['blob:strict']]);
});
