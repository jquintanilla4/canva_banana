import { describe, expect, it } from 'vitest';
import { TRACKPAD_ZOOM_SENSITIVITY, WHEEL_ZOOM_MULTIPLIER } from '../constants';
import { getCanvasWheelZoomMultiplier } from '../wheelZoom';

describe('getCanvasWheelZoomMultiplier', () => {
  it('preserves fixed mouse-wheel steps while trackpad mode is off', () => {
    expect(getCanvasWheelZoomMultiplier({ deltaY: -1, deltaMode: 0, pageHeight: 800, trackpadMode: false })).toBe(WHEEL_ZOOM_MULTIPLIER);
    expect(getCanvasWheelZoomMultiplier({ deltaY: 500, deltaMode: 0, pageHeight: 800, trackpadMode: false })).toBe(1 / WHEEL_ZOOM_MULTIPLIER);
  });

  it('uses small reciprocal changes for pixel deltas in trackpad mode', () => {
    const zoomOut = getCanvasWheelZoomMultiplier({ deltaY: 1, deltaMode: 0, pageHeight: 800, trackpadMode: true });
    const zoomIn = getCanvasWheelZoomMultiplier({ deltaY: -1, deltaMode: 0, pageHeight: 800, trackpadMode: true });

    expect(zoomOut).toBeCloseTo(Math.exp(-TRACKPAD_ZOOM_SENSITIVITY));
    expect(zoomIn).toBeCloseTo(1 / zoomOut);
    expect(zoomOut).toBeGreaterThan(0.99);
  });

  it('normalizes line and page deltas before calculating trackpad zoom', () => {
    expect(getCanvasWheelZoomMultiplier({ deltaY: 2, deltaMode: 1, pageHeight: 800, trackpadMode: true }))
      .toBeCloseTo(Math.exp(-32 * TRACKPAD_ZOOM_SENSITIVITY));
    expect(getCanvasWheelZoomMultiplier({ deltaY: 1, deltaMode: 2, pageHeight: 800, trackpadMode: true }))
      .toBeCloseTo(Math.exp(-800 * TRACKPAD_ZOOM_SENSITIVITY));
  });
});
