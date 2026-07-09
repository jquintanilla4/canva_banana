import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

type TooltipTargetProps = {
  'aria-describedby'?: string;
};

type TooltipPosition = {
  left: number;
  top: number;
};

interface TooltipProps {
  label: string;
  shortcut?: string;
  detail?: string;
  placement?: TooltipPlacement;
  wrapperClassName?: string;
  children: React.ReactElement<TooltipTargetProps>;
}

const TOOLTIP_VIEWPORT_MARGIN_PX = 8; // Keeps the bubble inside the app window.
const TOOLTIP_TARGET_GAP_PX = 8; // Leaves space between the target and bubble.

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  shortcut,
  detail,
  placement = 'top',
  wrapperClassName = 'relative inline-flex',
  children,
}) => {
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const describedBy = [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');
  const child = React.cloneElement(children, { 'aria-describedby': describedBy });
  const canRenderPortal = typeof document !== 'undefined';
  const updatePosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    const tooltip = tooltipRef.current;
    if (!wrapper || !tooltip) {
      return;
    }

    const targetRect = wrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;
    const hasTopRoom = targetRect.top - tooltipHeight - TOOLTIP_TARGET_GAP_PX >= TOOLTIP_VIEWPORT_MARGIN_PX;
    const hasBottomRoom = targetRect.bottom + tooltipHeight + TOOLTIP_TARGET_GAP_PX <= viewportHeight - TOOLTIP_VIEWPORT_MARGIN_PX;
    const hasLeftRoom = targetRect.left - tooltipWidth - TOOLTIP_TARGET_GAP_PX >= TOOLTIP_VIEWPORT_MARGIN_PX;
    const hasRightRoom = targetRect.right + tooltipWidth + TOOLTIP_TARGET_GAP_PX <= viewportWidth - TOOLTIP_VIEWPORT_MARGIN_PX;
    const resolvedPlacement =
      placement === 'top' && !hasTopRoom && hasBottomRoom ? 'bottom'
        : placement === 'bottom' && !hasBottomRoom && hasTopRoom ? 'top'
          : placement === 'left' && !hasLeftRoom && hasRightRoom ? 'right'
            : placement === 'right' && !hasRightRoom && hasLeftRoom ? 'left'
              : placement;

    const centeredLeft = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    const centeredTop = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
    const unclampedLeft = resolvedPlacement === 'left'
      ? targetRect.left - tooltipWidth - TOOLTIP_TARGET_GAP_PX
      : resolvedPlacement === 'right'
        ? targetRect.right + TOOLTIP_TARGET_GAP_PX
        : centeredLeft;
    const unclampedTop = resolvedPlacement === 'top'
      ? targetRect.top - tooltipHeight - TOOLTIP_TARGET_GAP_PX
      : resolvedPlacement === 'bottom'
        ? targetRect.bottom + TOOLTIP_TARGET_GAP_PX
        : centeredTop;
    const maxLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN_PX, viewportWidth - tooltipWidth - TOOLTIP_VIEWPORT_MARGIN_PX);
    const maxTop = Math.max(TOOLTIP_VIEWPORT_MARGIN_PX, viewportHeight - tooltipHeight - TOOLTIP_VIEWPORT_MARGIN_PX);
    const nextPosition = {
      left: clamp(unclampedLeft, TOOLTIP_VIEWPORT_MARGIN_PX, maxLeft),
      top: clamp(unclampedTop, TOOLTIP_VIEWPORT_MARGIN_PX, maxTop),
    };

    setPosition(prev => (
      prev?.left === nextPosition.left && prev.top === nextPosition.top ? prev : nextPosition
    ));
  }, [placement]);

  useLayoutEffect(() => {
    if (!isVisible) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [detail, isVisible, label, shortcut, updatePosition]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, updatePosition]);

  return (
    <span
      ref={wrapperRef}
      className={wrapperClassName}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocusCapture={() => setIsVisible(true)}
      onBlurCapture={() => setIsVisible(false)}
    >
      {child}
      {isVisible && canRenderPortal && createPortal(
        <span
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          className="pointer-events-none fixed z-[80] flex max-w-[min(18rem,calc(100vw-1rem))] items-center gap-2 rounded-md border border-white/10 bg-gray-950/95 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl shadow-black/35 backdrop-blur"
          style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
        >
          <span className="min-w-0 whitespace-normal break-words">{label}</span>
          {shortcut && (
            <kbd className="shrink-0 rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-gray-100">
              {shortcut}
            </kbd>
          )}
          {detail && <span className="min-w-0 whitespace-normal break-words text-gray-300">{detail}</span>}
        </span>,
        document.body,
      )}
    </span>
  );
};
