export type CanvasColorOption = {
  label: string;
  value: string;
};

export const VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS: ReadonlyArray<CanvasColorOption> = [
  { label: 'Light gray', value: '#d1d5db' },
  { label: 'Dark gray blue', value: '#1f2937' },
  { label: 'Black', value: '#000000' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Mustard yellow', value: '#e1b927' },
  { label: 'Dark purple', value: '#4c1d95' },
  { label: 'Dark green', value: '#166534' },
  { label: 'Dark red', value: '#7f1d1d' },
] as const; // Areas add a neutral border swatch so users can get back to the default look.

export const DEFAULT_VIDEO_PROMPT_AREA_BORDER_COLOR = VIDEO_PROMPT_AREA_BORDER_COLOR_OPTIONS[0].value; // New prompt areas keep a light neutral border.
