import { describe, expect, it, vi } from 'vitest';
import { buildPromptContextMenuTemplate, isFooterPromptContextMenuTarget } from './prompt-context-menu.mjs';

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

describe('footer prompt context menu', () => {
  it('detects the marked footer textarea at the context-menu coordinates', async () => {
    const frame = { executeJavaScript: vi.fn().mockResolvedValue(true) };

    await expect(isFooterPromptContextMenuTarget({ frame, x: 12, y: 24, isEditable: true })).resolves.toBe(true);

    expect(frame.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(frame.executeJavaScript.mock.calls[0][0]).toContain('document.elementFromPoint(12, 24)');
    expect(frame.executeJavaScript.mock.calls[0][0]).toContain('data-footer-prompt-context-menu');
  });

  it('converts context-menu coordinates to CSS pixels at non-default zoom', async () => {
    const frame = { executeJavaScript: vi.fn().mockResolvedValue(true) };

    await expect(isFooterPromptContextMenuTarget({ frame, x: 18, y: 36, isEditable: true, zoomFactor: 1.5 })).resolves.toBe(true);

    expect(frame.executeJavaScript.mock.calls[0][0]).toContain('document.elementFromPoint(12, 24)');
  });

  it('ignores non-editable targets without evaluating the renderer', async () => {
    const frame = { executeJavaScript: vi.fn() };

    await expect(isFooterPromptContextMenuTarget({ frame, x: 12, y: 24, isEditable: false })).resolves.toBe(false);

    expect(frame.executeJavaScript).not.toHaveBeenCalled();
  });

  it('ignores a target when its frame detaches during hit testing', async () => {
    const frame = { executeJavaScript: vi.fn().mockRejectedValue(new Error('Frame was detached')) };

    await expect(isFooterPromptContextMenuTarget({ frame, x: 12, y: 24, isEditable: true })).resolves.toBe(false);
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
