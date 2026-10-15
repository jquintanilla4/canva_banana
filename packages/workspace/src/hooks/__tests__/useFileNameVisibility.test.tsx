import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFileNameVisibility } from '../useFileNameVisibility';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useFileNameVisibility', () => {
  it('shows file names by default and remembers a hidden preference', () => {
    const firstRender = renderHook(() => useFileNameVisibility());

    expect(firstRender.result.current.showFileName).toBe(true);
    act(() => firstRender.result.current.toggleFileName());
    expect(firstRender.result.current.showFileName).toBe(false);
    firstRender.unmount();

    const secondRender = renderHook(() => useFileNameVisibility());

    expect(secondRender.result.current.showFileName).toBe(false);
  });

  it('falls back to visible when stored preferences cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable.', 'SecurityError');
    });

    const { result } = renderHook(() => useFileNameVisibility());

    expect(result.current.showFileName).toBe(true);
  });

  it('still toggles in memory when stored preferences cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable.', 'SecurityError');
    });
    const { result } = renderHook(() => useFileNameVisibility());

    act(() => result.current.toggleFileName());

    expect(result.current.showFileName).toBe(false);
  });
});
