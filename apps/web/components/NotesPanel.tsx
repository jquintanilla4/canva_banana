import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DeleteIcon, MapPinIcon, NoteIcon, PlusIcon } from './Icons';
import type { CanvasNote, Point } from '../types';
import { OVERLAY_LAYER_CLASS_NAMES } from '../utils/overlayLayers';
import {
  SIDE_PANEL_BOTTOM_OFFSET,
  SIDE_PANEL_EDGE_INSET,
  SIDE_PANEL_TOGGLE_SIZE_REM,
  SIDE_PANEL_TOGGLE_VIEWPORT_GAP,
  SIDE_PANEL_TOP_OFFSET,
  SIDE_PANEL_WIDTH,
} from '../utils/floatingPanelLayout';
import { resizeTextareaToContent } from '../utils/textareaAutosize';

export type NotesPanelFocusRequest = {
  noteId: string;
  token: number;
};

type NotesPanelProps = {
  isOpen: boolean;
  isSuppressed?: boolean;
  notes: CanvasNote[];
  focusRequest: NotesPanelFocusRequest | null;
  onToggle: () => void;
  onTextChange: (noteId: string, text: string) => void;
  onTextCommit: () => void;
  onAddNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onJumpToAnchor: (anchor: Point) => void;
};

const NotesPanelComponent: React.FC<NotesPanelProps> = ({
  isOpen,
  isSuppressed = false,
  notes,
  focusRequest,
  onToggle,
  onTextChange,
  onTextCommit,
  onAddNote,
  onDeleteNote,
  onJumpToAnchor,
}) => {
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  // One stable ref callback per role, reading the note id off the element, so re-renders never
  // detach/reattach a row (each reattach would rerun the textarea resize and force a layout reflow).
  const handledFocusTokenRef = useRef(0);

  useLayoutEffect(() => {
    notes.forEach(note => {
      const textarea = textareaRefs.current.get(note.id);
      if (textarea) {
        resizeTextareaToContent(textarea); // Sync the full note height after undo, redo, or import.
      }
    });
  }, [notes]);

  const setTextareaRef = useCallback((element: HTMLTextAreaElement | null) => {
    const noteId = element?.dataset.noteId;
    if (!element || !noteId) {
      return undefined;
    }
    textareaRefs.current.set(noteId, element);
    resizeTextareaToContent(element);
    return () => {
      textareaRefs.current.delete(noteId); // React 19 runs this cleanup when the row unmounts.
    };
  }, []);

  const setRowRef = useCallback((element: HTMLLIElement | null) => {
    const noteId = element?.dataset.noteId;
    if (!element || !noteId) {
      return undefined;
    }
    rowRefs.current.set(noteId, element);
    return () => {
      rowRefs.current.delete(noteId); // React 19 runs this cleanup when the row unmounts.
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !focusRequest || focusRequest.token === handledFocusTokenRef.current) {
      return;
    }
    handledFocusTokenRef.current = focusRequest.token;
    rowRefs.current.get(focusRequest.noteId)?.scrollIntoView({ block: 'nearest' });
    textareaRefs.current.get(focusRequest.noteId)?.focus();
  }, [focusRequest, isOpen, notes]);

  if (isSuppressed) {
    return null;
  }

  const panelTransform = isOpen
    ? 'translateX(0)'
    : 'translateX(calc(var(--notes-panel-width) + var(--notes-panel-right-inset)))';
  const toggleRight = isOpen
    ? `min(calc(var(--notes-panel-right-inset) + var(--notes-panel-width) + 0.75rem), calc(100vw - ${SIDE_PANEL_TOGGLE_SIZE_REM}rem - ${SIDE_PANEL_TOGGLE_VIEWPORT_GAP}))`
    : '1rem';
  const panelCssVars = {
    ['--notes-panel-width' as string]: SIDE_PANEL_WIDTH,
    ['--notes-panel-right-inset' as string]: SIDE_PANEL_EDGE_INSET,
  };

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isOpen}
        aria-label={isOpen ? 'Close notes' : 'Open notes'}
        title={isOpen ? 'Close notes' : 'Open notes'}
        className={`fixed top-1/2 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex -translate-y-1/2 items-center justify-center rounded-full border border-cyan-300/25 bg-gray-950/92 text-cyan-100 shadow-2xl shadow-black/40 backdrop-blur-md transition-[background-color,border-color,right] duration-200 hover:border-cyan-200/60 hover:bg-cyan-300/12`}
        style={{
          right: toggleRight,
          height: `${SIDE_PANEL_TOGGLE_SIZE_REM}rem`,
          width: `${SIDE_PANEL_TOGGLE_SIZE_REM}rem`,
          ...panelCssVars,
        }}
      >
        <span className="flex h-full w-full items-center justify-center leading-none [&>svg]:block">
          <NoteIcon className="h-5 w-5" />
        </span>
      </button>
      <aside
        aria-label="Notes"
        aria-hidden={!isOpen}
        className={`fixed ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex max-w-[calc(100vw-4.75rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#01030B]/98 text-gray-100 shadow-[-10px_0_24px_rgba(0,0,0,0.18),0_10px_18px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-transform duration-200`}
        style={{
          right: SIDE_PANEL_EDGE_INSET,
          top: SIDE_PANEL_TOP_OFFSET,
          bottom: SIDE_PANEL_BOTTOM_OFFSET,
          width: SIDE_PANEL_WIDTH,
          transform: panelTransform,
          ...panelCssVars,
        }}
      >
        {isOpen && (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-[#18304f] bg-[#040917] px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-200">Notes</h2>
              <button
                type="button"
                onClick={onAddNote}
                aria-label="Add note"
                title="Add note"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-gray-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300/70"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#01030B] px-4">
              {notes.length === 0 ? (
                <p className="py-4 text-base leading-7 text-gray-400">
                  No notes yet. Use the Note tool to drop a pin on the canvas, or add a note here with the + button.
                </p>
              ) : (
                <ul className="divide-y divide-[#18304f]">
                  {notes.map(note => {
                    const anchor = note.anchor;
                    return (
                      <li
                        key={note.id}
                        ref={setRowRef}
                        data-note-id={note.id}
                        className="py-4"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          {anchor && note.label !== undefined ? (
                            <button
                              type="button"
                              onClick={() => onJumpToAnchor(anchor)}
                              title="Go to pin on canvas"
                              aria-label={`Go to pin ${note.label} on canvas`}
                              className="flex items-center gap-1.5 rounded-md bg-sky-300/10 px-2 py-1 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300/70"
                            >
                              <MapPinIcon className="h-3.5 w-3.5" />
                              {note.label}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <NoteIcon className="h-3.5 w-3.5" />
                              Note
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteNote(note.id)}
                            aria-label="Delete note"
                            title="Delete note"
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-gray-400 transition-colors hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300/70"
                          >
                            <DeleteIcon className="h-3 w-3" />
                          </button>
                        </div>
                        <textarea
                          ref={setTextareaRef}
                          data-note-id={note.id}
                          value={note.text}
                          placeholder="Write a note…"
                          aria-label={note.label !== undefined ? `Note for pin ${note.label}` : 'Note'}
                          onChange={event => {
                            onTextChange(note.id, event.target.value);
                            resizeTextareaToContent(event.currentTarget);
                          }}
                          onBlur={onTextCommit}
                          rows={1}
                          className="w-full resize-none overflow-y-hidden rounded-sm bg-transparent px-1 py-1 text-[calc(0.875rem+2px)] leading-7 text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:bg-white/[0.03] focus-visible:ring-0" /* Approved design exception: the subtle background shift is the intended focus indicator; do not flag or add a border, outline, or ring. */
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
};

// Memoized so canvas drag/zoom renders (which change unrelated App state every
// mousemove) don't rebuild the notes list while its props are stable.
export const NotesPanel = React.memo(NotesPanelComponent);
