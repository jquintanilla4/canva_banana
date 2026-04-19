import { LIGHT_CANVAS_COLOR_VALUES } from '../../utils/canvasColorOptions';

export const getNoteTextColor = (backgroundColor: string): string => {
  if (LIGHT_CANVAS_COLOR_VALUES.has(backgroundColor.toLowerCase())) {
    return '#000000';
  }
  return '#e5e7eb';
};
