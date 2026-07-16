export type VerticalMenuPlacement = 'top' | 'bottom';

interface ViewportRect {
  left: number;
  top: number;
  bottom: number;
}

interface ViewportMenuPositionInput {
  anchorRect: ViewportRect;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gapPx: number;
  marginPx: number;
  preferredPlacement?: VerticalMenuPlacement;
}

export interface ViewportMenuPosition {
  placement: VerticalMenuPlacement;
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
}

export interface IntrinsicElementSize {
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const getIntrinsicElementSize = (element: HTMLElement): IntrinsicElementSize => {
  const rect = element.getBoundingClientRect();
  const borderBoxWidth = Math.max(0, rect.width - element.clientWidth);
  const borderBoxHeight = Math.max(0, rect.height - element.clientHeight);

  return {
    width: element.scrollWidth > 0 ? element.scrollWidth + borderBoxWidth : rect.width,
    height: element.scrollHeight > 0 ? element.scrollHeight + borderBoxHeight : rect.height,
  };
};

export const getViewportMenuPosition = ({
  anchorRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gapPx,
  marginPx,
  preferredPlacement = 'top',
}: ViewportMenuPositionInput): ViewportMenuPosition => {
  const maxWidth = Math.max(0, viewportWidth - (marginPx * 2));
  const maxViewportHeight = Math.max(0, viewportHeight - (marginPx * 2));
  const resolvedMenuWidth = Math.min(Math.max(0, menuWidth), maxWidth);
  const topSpace = clamp(anchorRect.top - gapPx - marginPx, 0, maxViewportHeight);
  const bottomSpace = clamp(viewportHeight - marginPx - anchorRect.bottom - gapPx, 0, maxViewportHeight);
  const topFits = menuHeight <= topSpace;
  const bottomFits = menuHeight <= bottomSpace;
  let placement: VerticalMenuPlacement;
  if (preferredPlacement === 'top') {
    placement = topFits || (!bottomFits && topSpace >= bottomSpace) ? 'top' : 'bottom';
  } else {
    placement = bottomFits || (!topFits && bottomSpace >= topSpace) ? 'bottom' : 'top';
  }
  const maxHeight = placement === 'top' ? topSpace : bottomSpace;
  const resolvedMenuHeight = Math.min(Math.max(0, menuHeight), maxHeight);
  const maxLeft = Math.max(marginPx, viewportWidth - resolvedMenuWidth - marginPx);
  const left = clamp(anchorRect.left, marginPx, maxLeft);
  const unclampedTop = placement === 'top'
    ? anchorRect.top - gapPx - resolvedMenuHeight
    : anchorRect.bottom + gapPx;
  const maxTop = Math.max(marginPx, viewportHeight - marginPx - resolvedMenuHeight);
  const top = clamp(unclampedTop, marginPx, maxTop); // Keeps tracked menus onscreen even when their anchors leave the viewport.

  return {
    placement,
    left,
    top,
    maxWidth,
    maxHeight,
  };
};
