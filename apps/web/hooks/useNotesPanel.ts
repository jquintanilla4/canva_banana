import { useCallback, useRef, useState } from 'react';
import type { CanvasNote, Point } from '../types';
import type { NotesPanelFocusRequest } from '../components/NotesPanel';
import type { PanToAnchorRequest } from '../components/Canvas';
import type { CommitOverrides } from './useCanvasHistory';

type UseNotesPanelArgs = {
  displayedNotes: CanvasNote[];
  setLiveNotes: (notes: CanvasNote[]) => void;
  handleCommit: (overrides?: CommitOverrides) => void;
};

// Notes side panel: open/close, focus-a-note requests, canvas pan-to-pin requests,
// and note CRUD on top of the shared canvas history.
export function useNotesPanel({ displayedNotes, setLiveNotes, handleCommit }: UseNotesPanelArgs) {
  const [isNotesPanelOpen, setIsNotesPanelOpen] = useState(false);
  const [notesPanelFocusRequest, setNotesPanelFocusRequest] = useState<NotesPanelFocusRequest | null>(null);
  const [panToAnchorRequest, setPanToAnchorRequest] = useState<PanToAnchorRequest | null>(null);
  const noteLabelCounterRef = useRef(1); // Monotonic — labels are never reused after deletion.

  const handleNoteTextChange = useCallback((noteId: string, text: string) => {
    const targetNotes = displayedNotes;
    const noteIndex = targetNotes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;

    const newNotes = [...targetNotes];
    newNotes[noteIndex] = { ...newNotes[noteIndex], text };
    setLiveNotes(newNotes);
  }, [displayedNotes, setLiveNotes]);

  const focusNoteInPanel = useCallback((noteId: string) => {
    setIsNotesPanelOpen(true);
    setNotesPanelFocusRequest(prev => ({ noteId, token: (prev?.token ?? 0) + 1 }));
  }, []);

  // Creates a note and opens it in the panel. With an anchor (NOTE-tool canvas click) it
  // becomes a numbered pin; without one ("+" in the panel) it lives only in the panel.
  // Both mutations commit on top of displayedNotes so un-blurred textarea edits staged in
  // liveNotes land in the same history entry instead of overwriting the mutation later.
  const createNote = useCallback((anchor?: Point) => {
    const newNote: CanvasNote = {
      id: crypto.randomUUID(),
      text: '',
      ...(anchor ? { label: noteLabelCounterRef.current++, anchor: { ...anchor } } : {}),
    };
    handleCommit({ notes: [...displayedNotes, newNote] });
    focusNoteInPanel(newNote.id);
  }, [displayedNotes, focusNoteInPanel, handleCommit]);

  const handleAddPanelNote = useCallback(() => {
    createNote();
  }, [createNote]);

  const handleDeleteNote = useCallback((noteId: string) => {
    // Undoable; removes the canvas pin along with the note.
    handleCommit({ notes: displayedNotes.filter(note => note.id !== noteId) });
  }, [displayedNotes, handleCommit]);

  // Clicking a note's pin badge in the panel pans the canvas to its anchor.
  const handleJumpToAnchor = useCallback((anchor: Point) => {
    setPanToAnchorRequest(prev => ({ x: anchor.x, y: anchor.y, token: (prev?.token ?? 0) + 1 }));
  }, []);

  const toggleNotesPanel = useCallback(() => {
    setIsNotesPanelOpen(prev => !prev);
  }, []);

  return {
    isNotesPanelOpen,
    notesPanelFocusRequest,
    panToAnchorRequest,
    noteLabelCounterRef,
    handleNoteTextChange,
    focusNoteInPanel,
    createNote,
    handleAddPanelNote,
    handleDeleteNote,
    handleJumpToAnchor,
    toggleNotesPanel,
  };
}
