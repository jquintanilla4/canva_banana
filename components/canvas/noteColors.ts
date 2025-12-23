const LIGHT_NOTE_COLORS = new Set(['#f97316', '#e1b927']);

export const getNoteTextColor = (backgroundColor: string): string => {
  if (LIGHT_NOTE_COLORS.has(backgroundColor.toLowerCase())) {
    return '#000000';
  }
  return '#e5e7eb';
};
