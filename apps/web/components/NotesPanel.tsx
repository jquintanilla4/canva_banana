import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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

const NOTE_TEXTAREA_MAX_HEIGHT_PX = 240;

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
  // Ref callbacks are cached per note id so re-renders don't detach/reattach every row
  // (each reattach would rerun the textarea resize and force a layout reflow).
  const textareaRefCallbacks = useRef(new Map<string, (element: HTMLTextAreaElement | null) => void>());
  const rowRefCallbacks = useRef(new Map<string, (element: HTMLLIElement | null) => void>());
  const handledFocusTokenRef = useRef(0);

  useLayoutEffect(() => {
    notes.forEach(note => {
      const textarea = textareaRefs.current.get(note.id);
      if (textarea) {
        resizeTextareaToContent(textarea, NOTE_TEXTAREA_MAX_HEIGHT_PX); // Sync undo, redo, and imported text.
      }
    });
  }, [notes]);

  const getTextareaRef = useCallback((noteId: string) => {
    let callback = textareaRefCallbacks.current.get(noteId);
    if (!callback) {
      callback = (element: HTMLTextAreaElement | null) => {
        if (element) {
          textareaRefs.current.set(noteId, element);
          resizeTextareaToContent(element, NOTE_TEXTAREA_MAX_HEIGHT_PX);
        } else {
          textareaRefs.current.delete(noteId);
          textareaRefCallbacks.current.delete(noteId);
        }
      };
      textareaRefCallbacks.current.set(noteId, callback);
    }
    return callback;
  }, []);

  const getRowRef = useCallback((noteId: string) => {
    let callback = rowRefCallbacks.current.get(noteId);
    if (!callback) {
      callback = (element: HTMLLIElement | null) => {
        if (element) {
          rowRefs.current.set(noteId, element);
        } else {
          rowRefs.current.delete(noteId);
          rowRefCallbacks.current.delete(noteId);
        }
      };
      rowRefCallbacks.current.set(noteId, callback);
    }
    return callback;
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
        className={`fixed top-1/2 ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex -translate-y-1/2 items-center justify-center rounded-full border border-amber-300/25 bg-gray-950/92 text-amber-100 shadow-2xl shadow-black/40 backdrop-blur-md transition-[background-color,border-color,right] duration-200 hover:border-amber-200/60 hover:bg-amber-300/12`}
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
        className={`fixed ${OVERLAY_LAYER_CLASS_NAMES.floatingPanel} flex max-w-[calc(100vw-4.75rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#050917]/96 text-gray-100 shadow-[-10px_0_24px_rgba(0,0,0,0.18),0_10px_18px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-transform duration-200`}
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
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-200">Notes</h2>
              <button
                type="button"
                onClick={onAddNote}
                aria-label="Add note"
                title="Add note"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#080A16] text-gray-200 shadow-[0_6px_10px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors hover:bg-white/10"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {notes.length === 0 ? (
                <p className="px-1 text-sm leading-6 text-gray-400">
                  No notes yet. Use the Note tool to drop a pin on the canvas, or add a note here with the + button.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {notes.map(note => {
                    const anchor = note.anchor;
                    return (
                      <li
                        key={note.id}
                        ref={getRowRef(note.id)}
                        className="rounded-lg border border-white/10 bg-[#080A16]/80 p-3 shadow-[0_6px_10px_rgba(0,0,0,0.14)]"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          {anchor && note.label !== undefined ? (
                            <button
                              type="button"
                              onClick={() => onJumpToAnchor(anchor)}
                              title="Go to pin on canvas"
                              aria-label={`Go to pin ${note.label} on canvas`}
                              className="flex items-center gap-1.5 rounded-md border border-sky-300/30 bg-sky-300/10 px-2 py-1 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-300/25"
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
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent text-gray-400 transition-colors hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-300"
                          >
                            <DeleteIcon className="h-3 w-3" />
                          </button>
                        </div>
                        <textarea
                          ref={getTextareaRef(note.id)}
                          value={note.text}
                          placeholder="Write a note…"
                          aria-label={note.label !== undefined ? `Note for pin ${note.label}` : 'Note'}
                          onChange={event => {
                            onTextChange(note.id, event.target.value);
                            resizeTextareaToContent(event.currentTarget, NOTE_TEXTAREA_MAX_HEIGHT_PX);
                          }}
                          onBlur={onTextCommit}
                          rows={2}
                          className="w-full resize-none rounded-md border border-white/10 bg-[#01030a]/80 px-2.5 py-2 text-sm leading-6 text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-sky-300/40"
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
