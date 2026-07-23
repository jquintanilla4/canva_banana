import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTrackpadMode } from '../useTrackpadMode';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useTrackpadMode', () => {
  it('defaults off and remembers an enabled preference', () => {
    const firstRender = renderHook(() => useTrackpadMode());

    expect(firstRender.result.current.trackpadMode).toBe(false);
    act(() => firstRender.result.current.toggleTrackpadMode());
    expect(firstRender.result.current.trackpadMode).toBe(true);
    firstRender.unmount();

    const secondRender = renderHook(() => useTrackpadMode());

    expect(secondRender.result.current.trackpadMode).toBe(true);
  });

  it('falls back to disabled when stored preferences cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable.', 'SecurityError');
    });

    const { result } = renderHook(() => useTrackpadMode());

    expect(result.current.trackpadMode).toBe(false);
  });

  it('still toggles in memory when stored preferences cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable.', 'SecurityError');
    });
    const { result } = renderHook(() => useTrackpadMode());

    act(() => result.current.toggleTrackpadMode());

    expect(result.current.trackpadMode).toBe(true);
  });
});
