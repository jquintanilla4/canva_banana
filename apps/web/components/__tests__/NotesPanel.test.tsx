import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup); // The vitest config has no globals, so RTL auto-cleanup never runs.
import { NotesPanel } from '../NotesPanel';
import type { CanvasNote } from '../../types';

const buildNotes = (): CanvasNote[] => [
  { id: 'anchored-1', text: 'Pinned note', label: 1, anchor: { x: 10, y: 20 } },
  { id: 'floating-1', text: 'Floating note' },
];

const renderPanel = (overrides: Partial<Parameters<typeof NotesPanel>[0]> = {}) => {
  const props = {
    isOpen: true,
    isSuppressed: false,
    notes: buildNotes(),
    focusRequest: null,
    onToggle: vi.fn(),
    onTextChange: vi.fn(),
    onTextCommit: vi.fn(),
    onAddNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onJumpToAnchor: vi.fn(),
    ...overrides,
  };
  return { ...render(<NotesPanel {...props} />), props };
};

describe('NotesPanel', () => {
  it('renders a row per note with the anchor label as a clickable title', () => {
    const { props } = renderPanel();

    expect(screen.getByDisplayValue('Pinned note')).toBeTruthy();
    expect(screen.getByDisplayValue('Floating note')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go to pin 1 on canvas' }));
    expect(props.onJumpToAnchor).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  it('adds a note from the header icon button', () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(props.onAddNote).toHaveBeenCalledTimes(1);
  });

  it('deletes a note from its row icon button', () => {
    const { props } = renderPanel();

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete note' });
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[1]);
    expect(props.onDeleteNote).toHaveBeenCalledWith('floating-1');
  });

  it('stages text edits and commits them on blur', () => {
    const { props } = renderPanel();
    const textarea = screen.getByDisplayValue('Floating note');

    fireEvent.change(textarea, { target: { value: 'Updated text' } });
    expect(props.onTextChange).toHaveBeenCalledWith('floating-1', 'Updated text');

    fireEvent.blur(textarea);
    expect(props.onTextCommit).toHaveBeenCalledTimes(1);
  });

  it('resizes mounted textareas when controlled note text changes', () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.value.length * 2;
      },
    });

    try {
      const { rerender, props } = renderPanel({ notes: [{ id: 'note-1', text: 'Short' }] });
      const textarea = screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement;
      expect(textarea.style.height).toBe('10px');
      expect(textarea.style.maxHeight).toBe('none');
      expect(textarea.style.overflowY).toBe('hidden');

      rerender(<NotesPanel {...props} notes={[{ id: 'note-1', text: 'A much longer restored note' }]} />);
      expect(textarea.style.height).toBe('54px');
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', originalScrollHeight);
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
      }
    }
  });

  it('renders nothing while suppressed by a blocking overlay', () => {
    const { container } = renderPanel({ isSuppressed: true });
    expect(container.firstChild).toBeNull();
  });

  it('keeps panel content unmounted while closed', () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByDisplayValue('Pinned note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open notes' })).toBeTruthy();
  });
});
