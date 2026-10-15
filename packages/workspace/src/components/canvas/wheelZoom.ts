import { TRACKPAD_ZOOM_SENSITIVITY, WHEEL_ZOOM_MULTIPLIER } from './constants';

const WHEEL_DELTA_LINE = 1; // WheelEvent.DOM_DELTA_LINE without requiring a browser global.
const WHEEL_DELTA_PAGE = 2; // WheelEvent.DOM_DELTA_PAGE without requiring a browser global.
const WHEEL_LINE_HEIGHT_PX = 16; // Approximate one browser text line in pixels.

export interface CanvasWheelZoomOptions {
  deltaY: number;
  deltaMode: number;
  pageHeight: number;
  trackpadMode: boolean;
}

const normalizeWheelDeltaY = ({ deltaY, deltaMode, pageHeight }: CanvasWheelZoomOptions): number => {
  if (deltaMode === WHEEL_DELTA_LINE) {
    return deltaY * WHEEL_LINE_HEIGHT_PX;
  }
  if (deltaMode === WHEEL_DELTA_PAGE) {
    return deltaY * Math.max(pageHeight, 1);
  }
  return deltaY; // Trackpads normally report pixel deltas.
};

export const getCanvasWheelZoomMultiplier = (options: CanvasWheelZoomOptions): number => {
  if (!options.trackpadMode) {
    return options.deltaY < 0 ? WHEEL_ZOOM_MULTIPLIER : 1 / WHEEL_ZOOM_MULTIPLIER;
  }
  return Math.exp(-normalizeWheelDeltaY(options) * TRACKPAD_ZOOM_SENSITIVITY); // Gesture distance controls continuous zoom.
};
