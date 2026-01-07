import { useEffect } from 'react';
import { AppMode, Tool } from '../types';

type KeyboardShortcutsArgs = {
  onGenerate: () => void;
  appMode: AppMode;
  setTool: (tool: Tool) => void;
  requestZoomIn: () => void;
  requestZoomOut: () => void;
  onZoomToFit?: () => void;
  onZoomToSelection?: () => void;
  onDelete?: () => void;
  onRecordToggle?: () => void;
  onAdjustStrokeSize?: (delta: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

export function useKeyboardShortcuts({
  onGenerate,
  appMode,
  setTool,
  requestZoomIn,
  requestZoomOut,
  onZoomToFit,
  onZoomToSelection,
  onDelete,
  onRecordToggle,
  onAdjustStrokeSize,
  onUndo,
  onRedo,
}: KeyboardShortcutsArgs) {
  useEffect(() => {
    // Guard against hijacking shortcuts while typing in inputs.
    const isTextInput = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el || !(el instanceof HTMLElement)) {
        return false;
      }
      const tagName = el.tagName;
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest('input, textarea, [contenteditable="true"]');
    };

    const isCanvasFocused = (): boolean => {
      const activeElement = document.activeElement;
      if (!activeElement || !(activeElement instanceof HTMLElement)) {
        return false;
      }
      return Boolean(activeElement.closest('[data-canvas-root="true"]'));
    };

    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      const focusedInTextInput = isTextInput(event.target);

      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        // Prompt/negative prompt inputs handle Cmd/Ctrl+Enter themselves; skip here to avoid double submissions.
        if (!focusedInTextInput) {
          event.preventDefault();
          onGenerate();
        }
        return;
      }

      if (focusedInTextInput) {
        return;
      }

      const key = event.key.toLowerCase();
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey && isCanvasFocused()) {
        if (key === 'z' && onUndo) {
          event.preventDefault();
          onUndo();
          return;
        }
        if (key === 'y' && onRedo) {
          event.preventDefault();
          onRedo();
          return;
        }
      }
      if ((key === 'delete' || key === 'backspace') && onDelete) {
        event.preventDefault();
        onDelete();
        return;
      }
      if (key === 'v') {
        setTool(Tool.SELECTION);
        return;
      }
      if (key === 'f') {
        setTool(Tool.FREE_SELECTION);
        return;
      }
      if (key === 'h') {
        setTool(Tool.PAN);
        return;
      }
      if (key === 'n') {
        setTool(Tool.NOTE);
        return;
      }
      if (key === 'b') {
        if (appMode !== 'CANVAS') {
          setTool(Tool.BRUSH);
        }
        return;
      }
      if (key === 'e') {
        if (appMode !== 'CANVAS') {
          setTool(Tool.ERASE);
        }
        return;
      }
      if (key === 'm' && onRecordToggle) {
        event.preventDefault();
        onRecordToggle();
        return;
      }
      const isDecreaseStrokeKey = key === '[' || event.code === 'BracketLeft';
      const isIncreaseStrokeKey = key === ']' || event.code === 'BracketRight';
      if (!event.metaKey && !event.ctrlKey && !event.altKey && onAdjustStrokeSize && (isDecreaseStrokeKey || isIncreaseStrokeKey)) {
        event.preventDefault();
        onAdjustStrokeSize(isDecreaseStrokeKey ? -1 : 1);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (key === '-' || key === '_')) {
        event.preventDefault();
        requestZoomOut();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (key === '=' || key === '+')) {
        event.preventDefault();
        requestZoomIn();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && key === '.' && onZoomToFit) {
        event.preventDefault();
        onZoomToFit();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && key === ',' && onZoomToSelection) {
        event.preventDefault();
        onZoomToSelection();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [appMode, onAdjustStrokeSize, onDelete, onGenerate, onRecordToggle, onRedo, onUndo, onZoomToFit, onZoomToSelection, requestZoomIn, requestZoomOut, setTool]);
}
