export type CanvasColorOption = {
  label: string;
  value: string;
};

export const NOTE_COLOR_OPTIONS: ReadonlyArray<CanvasColorOption> = [
  { label: 'Dark gray blue', value: '#1f2937' },
  { label: 'Black', value: '#000000' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Mustard yellow', value: '#e1b927' },
  { label: 'Dark purple', value: '#4c1d95' },
  { label: 'Dark green', value: '#166534' },
  { label: 'Dark red', value: '#7f1d1d' },
] as const; // Notes keep their existing swatch set.

export const VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS: ReadonlyArray<CanvasColorOption> = [
  { label: 'Light gray', value: '#d1d5db' },
  ...NOTE_COLOR_OPTIONS,
] as const; // Areas add a neutral border swatch so users can get back to the default look.

export const DEFAULT_NOTE_BACKGROUND = NOTE_COLOR_OPTIONS[0].value; // New notes still start with the dark slate fill.
export const DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR = VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS[0].value; // New prompt areas keep a light neutral border.
export const LIGHT_CANVAS_COLOR_VALUES = new Set(['#d1d5db', '#f97316', '#e1b927']); // Light swatches need dark foreground text.
