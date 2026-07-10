import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it('keeps presentation mode shortcut global but not from a text input', () => {
    const onTogglePresentationMode = vi.fn();
    const onGenerate = vi.fn();
    const onToolChange = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      onToolChange,
      requestZoomIn,
      requestZoomOut,
      onTogglePresentationMode,
    }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', metaKey: true, shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', metaKey: true, shiftKey: true }));
    });

    expect(onTogglePresentationMode).toHaveBeenCalledTimes(2);

    input.remove();
  });

  it('suppresses edit shortcuts but keeps zoom shortcuts in presentation mode', () => {
    const onGenerate = vi.fn();
    const onToolChange = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();
    const onZoomToFit = vi.fn();
    const onZoomToSelection = vi.fn();
    const onDelete = vi.fn();
    const onRecordToggle = vi.fn();
    const onAdjustStrokeSize = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      onToolChange,
      requestZoomIn,
      requestZoomOut,
      onZoomToFit,
      onZoomToSelection,
      onDelete,
      onRecordToggle,
      onAdjustStrokeSize,
      isPresentationMode: true,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '-' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',' }));
    });

    expect(onGenerate).not.toHaveBeenCalled();
    expect(onToolChange).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onRecordToggle).not.toHaveBeenCalled();
    expect(onAdjustStrokeSize).not.toHaveBeenCalled();
    expect(requestZoomOut).toHaveBeenCalledTimes(1);
    expect(requestZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomToFit).toHaveBeenCalledTimes(1);
    expect(onZoomToSelection).toHaveBeenCalledTimes(1);
  });

  it('triggers zoom to fit on "."', () => {
    const onZoomToFit = vi.fn();
    const onGenerate = vi.fn();
    const onToolChange = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      onToolChange,
      requestZoomIn,
      requestZoomOut,
      onZoomToFit,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
    });

    expect(onZoomToFit).toHaveBeenCalledTimes(1);
  });

  it('adjusts stroke size on bracket shortcuts', () => {
    const onAdjustStrokeSize = vi.fn();
    const onGenerate = vi.fn();
    const onToolChange = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'ANNOTATE',
      onToolChange,
      requestZoomIn,
      requestZoomOut,
      onAdjustStrokeSize,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));
    });

    expect(onAdjustStrokeSize).toHaveBeenCalledTimes(2);
    expect(onAdjustStrokeSize).toHaveBeenNthCalledWith(1, -1);
    expect(onAdjustStrokeSize).toHaveBeenNthCalledWith(2, 1);
  });

  it('triggers undo/redo on shift shortcuts when canvas is focused', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onGenerate = vi.fn();
    const onToolChange = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      onToolChange,
      requestZoomIn,
      requestZoomOut,
      onUndo,
      onRedo,
    }));

    const canvasRoot = document.createElement('div');
    canvasRoot.setAttribute('data-canvas-root', 'true');
    canvasRoot.tabIndex = 0;
    document.body.appendChild(canvasRoot);
    canvasRoot.focus();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', shiftKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Y', shiftKey: true }));
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);

    canvasRoot.remove();
  });

  it('does not trigger undo when focus is outside the canvas', () => {
    const onUndo = vi.fn();
    const onGenerate = vi.fn();
    const onToolChange = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      onToolChange,
      requestZoomIn,
      requestZoomOut,
      onUndo,
    }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', shiftKey: true }));
    });

    expect(onUndo).not.toHaveBeenCalled();

    textarea.remove();
  });

  it('does not activate the video prompt area shortcut when the gated handler blocks it', () => {
    const toolChanges: string[] = [];
    const onGenerate = vi.fn();
    const requestZoomIn = vi.fn();
    const requestZoomOut = vi.fn();
    let canCreateVideoPromptAreas = false;

    renderHook(() => useKeyboardShortcuts({
      onGenerate,
      appMode: 'CANVAS',
      onToolChange: (tool) => {
        if (tool === 'VIDEO_PROMPT_AREA' && !canCreateVideoPromptAreas) {
          return;
        }
        toolChanges.push(tool);
      },
      requestZoomIn,
      requestZoomOut,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    });

    expect(toolChanges).toEqual([]);

    canCreateVideoPromptAreas = true;

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    });

    expect(toolChanges).toEqual(['VIDEO_PROMPT_AREA']);
  });
});
