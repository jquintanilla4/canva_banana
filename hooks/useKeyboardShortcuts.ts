import { useEffect } from 'react';
import { Tool } from '../types';

type KeyboardShortcutsArgs = {
  onGenerate: () => void;
  setTool: (tool: Tool) => void;
  requestZoomIn: () => void;
  requestZoomOut: () => void;
};

export function useKeyboardShortcuts({
  onGenerate,
  setTool,
  requestZoomIn,
  requestZoomOut,
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
        setTool(Tool.BRUSH);
        return;
      }
      if (key === 'e') {
        setTool(Tool.ERASE);
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
  }, [onGenerate, requestZoomIn, requestZoomOut, setTool]);
}
