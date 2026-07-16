export const CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE = 'data-canvas-interaction-boundary'; // Marks detached UI that Canvas must not treat as its surface.
export const CANVAS_INTERACTION_BOUNDARY_SELECTOR = `[${CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE}]`; // Reuses the same marker in DOM guards.
const CANVAS_INTERACTIVE_TARGET_SELECTOR = `button,input,select,textarea,[contenteditable="true"],[role="button"],[role="combobox"],[role="listbox"],[role="option"],${CANVAS_INTERACTION_BOUNDARY_SELECTOR}`; // Covers native, custom, and portaled controls.
export const CANVAS_INTERACTION_BOUNDARY_PROPS = {
  [CANVAS_INTERACTION_BOUNDARY_ATTRIBUTE]: 'true',
} as const; // Lets portal roots opt into the shared Canvas boundary contract.

type CanvasClickSequenceEvent = Pick<MouseEvent, 'button' | 'detail' | 'target'>;

export interface CanvasInteractionGuard {
  shouldIgnoreMouseDown: (event: CanvasClickSequenceEvent) => boolean;
  shouldIgnoreDoubleClick: (event: CanvasClickSequenceEvent) => boolean;
}

export const isCanvasInteractionBoundaryTarget = (target: EventTarget | null): boolean => (
  target instanceof Element && Boolean(target.closest(CANVAS_INTERACTION_BOUNDARY_SELECTOR))
); // React portals retain their DOM target while bubbling through the Canvas component tree.

export const isCanvasInteractiveTarget = (target: EventTarget | null): boolean => (
  target instanceof Element && Boolean(target.closest(CANVAS_INTERACTIVE_TARGET_SELECTOR))
); // Interactive UI owns mouse input before Canvas gesture handling starts.

export const shouldIgnoreCanvasMouseDown = ({ target }: CanvasClickSequenceEvent): boolean => (
  isCanvasInteractiveTarget(target)
); // Interactive controls own their mouse input before Canvas gestures start.

export const createCanvasInteractionGuard = (): CanvasInteractionGuard => {
  let pendingBoundarySequence: Pick<MouseEvent, 'button' | 'detail'> | null = null; // Arms only after a detached control receives a press.
  let pendingSuppressedDoubleClick: Pick<MouseEvent, 'button' | 'detail'> | null = null; // Carries a suppressed retargeted press through its dblclick.
  const ignoredMouseDownEvents = new WeakSet<object>(); // Reuses one decision during React capture and bubble phases.

  return {
    shouldIgnoreMouseDown: (event) => {
      if (ignoredMouseDownEvents.has(event)) {
        return true;
      }

      pendingSuppressedDoubleClick = null; // A distinct later press ends any unmatched dblclick sequence.
      if (isCanvasInteractionBoundaryTarget(event.target)) {
        pendingBoundarySequence = event.detail > 0
          ? { button: event.button, detail: event.detail }
          : null; // Browser multi-click sequences always use a positive click count.
        ignoredMouseDownEvents.add(event);
        return true;
      }

      const previousBoundarySequence = pendingBoundarySequence;
      pendingBoundarySequence = null; // Only the next non-boundary press can be click-through.
      if (isCanvasInteractiveTarget(event.target)) {
        ignoredMouseDownEvents.add(event);
        return true;
      }

      const isBoundaryClickThrough = previousBoundarySequence !== null
        && event.button === previousBoundarySequence.button
        && event.detail === previousBoundarySequence.detail + 1; // The browser already validates timing and pointer proximity.
      if (isBoundaryClickThrough) {
        pendingSuppressedDoubleClick = { button: event.button, detail: event.detail }; // Suppresses the dblclick emitted after this retargeted press.
        ignoredMouseDownEvents.add(event);
        return true;
      }

      return false;
    },
    shouldIgnoreDoubleClick: (event) => {
      const suppressedSequence = pendingSuppressedDoubleClick;
      pendingSuppressedDoubleClick = null; // A dblclick can consume this sequence only once.
      return suppressedSequence !== null
        && event.button === suppressedSequence.button
        && event.detail === suppressedSequence.detail;
    },
  };
}; // Blocks the complete repeated-click sequence retargeted after a detached menu closes.
