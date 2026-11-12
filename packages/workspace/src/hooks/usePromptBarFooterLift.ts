import { useLayoutEffect, useState, type RefObject } from 'react';
import { getPromptBarFooterLiftPx } from '../utils/promptBarFooterLayout';

export const usePromptBarFooterLift = (
  footerRef: RefObject<HTMLElement | null>,
  layout: 'footer' | 'inline',
  updateWidth: () => void,
): number => {
  const [liftPx, setLiftPx] = useState(0);

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (layout !== 'footer' || !footer) return;

    const workspace = footer.closest('.canva-banana-workspace') ?? footer.parentElement;
    if (!workspace) return;

    const controls = workspace.querySelectorAll<HTMLElement>('[data-testid="provider-switcher-root"], [data-testid="view-toolbar-root"]');
    let active = true;
    const measure = () => {
      if (!active || !footer.isConnected) return;
      const previousBottom = footer.style.bottom;
      try {
        footer.style.bottom = '0px';
        const baseline = footer.getBoundingClientRect();
        if (baseline.width <= 0 || baseline.height <= 0) return;
        const scale = footer.offsetWidth > 0 ? baseline.width / footer.offsetWidth : 1;
        const gapPx = Number.parseFloat(window.getComputedStyle(footer).paddingBottom) * scale;
        const nextLiftPx = getPromptBarFooterLiftPx(
          baseline,
          Array.from(controls)
            .filter(control => window.getComputedStyle(control).visibility !== 'hidden')
            .map(control => control.getBoundingClientRect()),
          Number.isFinite(gapPx) ? gapPx : 0,
        ) / scale;
        setLiftPx(previous => Math.abs(previous - nextLiftPx) < 0.1 ? previous : nextLiftPx);
      } finally {
        footer.style.bottom = previousBottom;
      }
    };
    const handleResize = () => {
      if (!active) return;
      updateWidth();
      measure();
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(entries => {
      if (entries.some(entry => entry.target === workspace)) handleResize();
      else measure();
    });
    observer?.observe(footer);
    observer?.observe(workspace);
    controls.forEach(control => observer?.observe(control));
    window.addEventListener('resize', handleResize);

    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  });

  return layout === 'footer' ? liftPx : 0;
};
