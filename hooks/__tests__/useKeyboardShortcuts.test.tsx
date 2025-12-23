import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it('triggers zoom to fit on "."', () => {
    const onZoomToFit = vi.fn();
    const onGenerate = vi.fn();
    const setTool = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      setTool,
      requestZoomIn,
      requestZoomOut,
      onZoomToFit,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
    });

    expect(onZoomToFit).toHaveBeenCalledTimes(1);
  });
});
