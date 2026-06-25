import { useEffect } from 'react';
import { AppMode, Tool } from '../types';

type KeyboardShortcutsArgs = {
  onGenerate: () => void;
  appMode: AppMode;
  onToolChange: (tool: Tool) => void;
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
  onToolChange,
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
        onToolChange(Tool.SELECTION);
        return;
      }
      if (key === 'f') {
        onToolChange(Tool.FREE_SELECTION);
        return;
      }
      if (key === 'h') {
        onToolChange(Tool.PAN);
        return;
      }
      if (key === 'n') {
        onToolChange(Tool.NOTE);
        return;
      }
      if (key === 'g') {
        onToolChange(Tool.VIDEO_PROMPT_AREA);
        return;
      }
      if (key === 'b') {
        if (appMode !== 'CANVAS') {
          onToolChange(Tool.BRUSH);
        }
        return;
      }
      if (key === 'e') {
        if (appMode !== 'CANVAS') {
          onToolChange(Tool.ERASE);
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
  }, [appMode, onAdjustStrokeSize, onDelete, onGenerate, onRecordToggle, onRedo, onToolChange, onUndo, onZoomToFit, onZoomToSelection, requestZoomIn, requestZoomOut]);
}
