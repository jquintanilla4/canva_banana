const EDIT_MENU_ITEMS = Object.freeze([
  { role: 'undo', flag: 'canUndo' },
  { role: 'redo', flag: 'canRedo' },
  { type: 'separator' },
  { role: 'cut', flag: 'canCut' },
  { role: 'copy', flag: 'canCopy' },
  { role: 'paste', flag: 'canPaste' },
  { role: 'delete', flag: 'canDelete' },
  { type: 'separator' },
  { role: 'selectAll', flag: 'canSelectAll' },
]);

export const isTextEntryContextMenuTarget = ({ isEditable } = {}) => isEditable === true;

export const buildPromptContextMenuTemplate = (params, { replaceMisspelling, addWordToDictionary }) => {
  const template = [];
  const suggestions = Array.isArray(params.dictionarySuggestions)
    ? params.dictionarySuggestions.filter(suggestion => typeof suggestion === 'string' && suggestion.length > 0)
    : [];
  const misspelledWord = typeof params.misspelledWord === 'string' ? params.misspelledWord : '';

  suggestions.forEach(suggestion => {
    template.push({
      label: suggestion,
      click: () => replaceMisspelling(suggestion),
    });
  });

  if (misspelledWord) {
    template.push({
      label: 'Add to Dictionary',
      click: () => addWordToDictionary(misspelledWord),
    });
  }

  if (template.length > 0) {
    template.push({ type: 'separator' });
  }

  EDIT_MENU_ITEMS.forEach(item => {
    if (item.type === 'separator') {
      template.push(item);
      return;
    }
    template.push({
      role: item.role,
      enabled: Boolean(params.editFlags?.[item.flag]),
    });
  });

  return template;
};
