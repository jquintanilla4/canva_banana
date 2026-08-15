import { describe, expect, it, vi } from 'vitest';
import { buildPromptContextMenuTemplate, isTextEntryContextMenuTarget } from './prompt-context-menu.mjs';

const buildParams = (overrides = {}) => ({
  dictionarySuggestions: [],
  misspelledWord: '',
  editFlags: {
    canUndo: false,
    canRedo: false,
    canCut: false,
    canCopy: false,
    canPaste: false,
    canDelete: false,
    canSelectAll: true,
  },
  ...overrides,
});

describe('text entry context menu', () => {
  it('accepts every editable renderer target', () => {
    expect(isTextEntryContextMenuTarget({ isEditable: true, formControlType: 'text-area' })).toBe(true);
    expect(isTextEntryContextMenuTarget({ isEditable: true, formControlType: 'input-text' })).toBe(true);
    expect(isTextEntryContextMenuTarget({ isEditable: true, formControlType: 'none' })).toBe(true);
  });

  it('ignores non-editable targets such as the canvas', () => {
    expect(isTextEntryContextMenuTarget({ isEditable: false, formControlType: 'none' })).toBe(false);
    expect(isTextEntryContextMenuTarget()).toBe(false);
  });

  it('wires spelling suggestions and dictionary addition to their native actions', () => {
    const replaceMisspelling = vi.fn();
    const addWordToDictionary = vi.fn();
    const template = buildPromptContextMenuTemplate(buildParams({
      dictionarySuggestions: ['correct', 'correction'],
      misspelledWord: 'corect',
    }), { replaceMisspelling, addWordToDictionary });

    template.find(item => item.label === 'correct').click();
    template.find(item => item.label === 'Add to Dictionary').click();

    expect(replaceMisspelling).toHaveBeenCalledWith('correct');
    expect(addWordToDictionary).toHaveBeenCalledWith('corect');
    expect(template.slice(0, 4).map(item => item.label ?? item.type)).toEqual([
      'correct',
      'correction',
      'Add to Dictionary',
      'separator',
    ]);
  });

  it('builds the standard edit roles using Electron edit flags', () => {
    const template = buildPromptContextMenuTemplate(buildParams({
      editFlags: {
        canUndo: true,
        canRedo: false,
        canCut: true,
        canCopy: true,
        canPaste: false,
        canDelete: true,
        canSelectAll: true,
      },
    }), { replaceMisspelling: vi.fn(), addWordToDictionary: vi.fn() });

    expect(template.map(item => item.role ?? item.type)).toEqual([
      'undo',
      'redo',
      'separator',
      'cut',
      'copy',
      'paste',
      'delete',
      'separator',
      'selectAll',
    ]);
    expect(Object.fromEntries(template.filter(item => item.role).map(item => [item.role, item.enabled]))).toEqual({
      undo: true,
      redo: false,
      cut: true,
      copy: true,
      paste: false,
      delete: true,
      selectAll: true,
    });
  });

  it('omits spelling actions when the clicked word is not misspelled', () => {
    const template = buildPromptContextMenuTemplate(buildParams(), {
      replaceMisspelling: vi.fn(),
      addWordToDictionary: vi.fn(),
    });

    expect(template.some(item => item.label === 'Add to Dictionary')).toBe(false);
    expect(template[0]).toMatchObject({ role: 'undo' });
  });
});
