import { describe, expect, it } from 'vitest';
import { OVERLAY_LAYER_CLASS_NAMES } from '../overlayLayers';

const getLayerIndex = (className: string): number => {
  const match = /^z-(?:\[(\d+)\]|(\d+))$/.exec(className); // Supports fixed and arbitrary Tailwind z-index utilities.
  if (!match) {
    throw new Error(`Unsupported overlay layer class: ${className}`);
  }
  return Number(match[1] ?? match[2]);
};

describe('overlay layer ordering', () => {
  it('keeps anchored popovers above panels and below blocking dialogs', () => {
    const appBar = getLayerIndex(OVERLAY_LAYER_CLASS_NAMES.appBar);
    const floatingPanel = getLayerIndex(OVERLAY_LAYER_CLASS_NAMES.floatingPanel);
    const anchoredPopover = getLayerIndex(OVERLAY_LAYER_CLASS_NAMES.anchoredPopover);
    const blockingModal = getLayerIndex(OVERLAY_LAYER_CLASS_NAMES.blockingModal);

    expect(appBar).toBeLessThan(floatingPanel);
    expect(floatingPanel).toBeLessThan(anchoredPopover);
    expect(anchoredPopover).toBeLessThan(blockingModal);
  });
});
