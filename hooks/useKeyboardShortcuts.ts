import { useEffect } from 'react';
import { AppMode, Tool } from '../types';

type KeyboardShortcutsArgs = {
  onGenerate: () => void;
  appMode: AppMode;
  setTool: (tool: Tool) => void;
  requestZoomIn: () => void;
  requestZoomOut: () => void;
  onDelete?: () => void;
  onRecordToggle?: () => void;
};

export function useKeyboardShortcuts({
  onGenerate,
  appMode,
  setTool,
  requestZoomIn,
  requestZoomOut,
  onDelete,
  onRecordToggle,
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
      if (!event.metaKey && !event.ctrlKey && (key === '-' || key === '_')) {
        event.preventDefault();
        requestZoomOut();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (key === '=' || key === '+')) {
        event.preventDefault();
        requestZoomIn();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [appMode, onGenerate, onRecordToggle, requestZoomIn, requestZoomOut, setTool]);
}
