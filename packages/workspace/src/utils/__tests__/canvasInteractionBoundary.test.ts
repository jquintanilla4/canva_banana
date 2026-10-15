import { describe, expect, it } from 'vitest';
import {
  CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE,
  createCanvasInteractionGuard,
  shouldIgnoreCanvasMouseDown,
} from '../canvasInteractionBoundary';

const mouseDown = (target: EventTarget, detail: number, button = 0): Pick<MouseEvent, 'button' | 'detail' | 'target'> => ({
  button,
  detail,
  target,
}); // Builds the minimal native event contract used by Canvas guards.

describe('canvas interaction boundaries', () => {
  it('allows repeated clicks on the canvas surface without a preceding boundary press', () => {
    const guard = createCanvasInteractionGuard();
    const canvasSurface = document.createElement('div');

    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 1))).toBe(false);
    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 2))).toBe(false);
  });

  it('rejects first clicks from native and portaled interactive controls', () => {
    const nativeButton = document.createElement('button');
    const portalRoot = document.createElement('div');
    const portalOption = document.createElement('span');
    portalRoot.setAttribute(CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE, 'true');
    portalRoot.appendChild(portalOption);

    expect(shouldIgnoreCanvasMouseDown(mouseDown(nativeButton, 1))).toBe(true);
    expect(shouldIgnoreCanvasMouseDown(mouseDown(portalOption, 1))).toBe(true);
  });

  it('rejects only the next repeated canvas press after a boundary press', () => {
    const guard = createCanvasInteractionGuard();
    const canvasSurface = document.createElement('div');
    const portalRoot = document.createElement('div');
    const portalOption = document.createElement('span');
    portalRoot.setAttribute(CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE, 'true');
    portalRoot.appendChild(portalOption);
    const boundaryPress = mouseDown(portalOption, 1);
    const clickThroughPress = mouseDown(canvasSurface, 2);

    expect(guard.shouldIgnoreMouseDown(boundaryPress)).toBe(true);
    expect(guard.shouldIgnoreMouseDown(boundaryPress)).toBe(true); // Capture and bubble must share one decision.
    expect(guard.shouldIgnoreMouseDown(clickThroughPress)).toBe(true);
    expect(guard.shouldIgnoreMouseDown(clickThroughPress)).toBe(true); // The consumed event stays ignored while bubbling.
    expect(guard.shouldIgnoreDoubleClick(mouseDown(canvasSurface, 2))).toBe(true);
    expect(guard.shouldIgnoreDoubleClick(mouseDown(canvasSurface, 2))).toBe(false); // The matching dblclick is consumed only once.
    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 3))).toBe(false);
  });

  it('clears an armed boundary sequence when the next press is not repeated', () => {
    const guard = createCanvasInteractionGuard();
    const canvasSurface = document.createElement('div');
    const portalRoot = document.createElement('div');
    portalRoot.setAttribute(CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE, 'true');

    expect(guard.shouldIgnoreMouseDown(mouseDown(portalRoot, 1))).toBe(true);
    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 1))).toBe(false);
    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 2))).toBe(false);
  });

  it('expires unmatched dblclick suppression on the next distinct press', () => {
    const guard = createCanvasInteractionGuard();
    const canvasSurface = document.createElement('div');
    const portalRoot = document.createElement('div');
    portalRoot.setAttribute(CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE, 'true');

    expect(guard.shouldIgnoreMouseDown(mouseDown(portalRoot, 1))).toBe(true);
    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 2))).toBe(true);
    expect(guard.shouldIgnoreMouseDown(mouseDown(canvasSurface, 1))).toBe(false); // A later press cannot inherit stale suppression.
    expect(guard.shouldIgnoreDoubleClick(mouseDown(canvasSurface, 2))).toBe(false);
  });
});
