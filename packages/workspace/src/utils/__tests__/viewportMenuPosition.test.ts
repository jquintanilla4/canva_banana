import { describe, expect, it } from 'vitest';
import { getViewportMenuPosition } from '../viewportMenuPosition';

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const positionMenu = ({
  anchorTop,
  anchorHeight = 30,
  menuHeight = 180,
}: {
  anchorTop: number;
  anchorHeight?: number;
  menuHeight?: number;
}) => getViewportMenuPosition({
  anchorRect: rect(100, anchorTop, 120, anchorHeight),
  menuWidth: 220,
  menuHeight,
  viewportWidth: 800,
  viewportHeight: 600,
  gapPx: 6,
  marginPx: 8,
  preferredPlacement: 'top',
});

describe('getViewportMenuPosition', () => {
  it('keeps the preferred top placement when the menu fits', () => {
    expect(positionMenu({ anchorTop: 500 })).toEqual({
      placement: 'top',
      left: 100,
      top: 314,
      maxWidth: 784,
      maxHeight: 486,
    });
  });

  it('falls back below when the trigger is near the viewport top', () => {
    expect(positionMenu({ anchorTop: 4 })).toEqual({
      placement: 'bottom',
      left: 100,
      top: 40,
      maxWidth: 784,
      maxHeight: 552,
    });
  });

  it('uses the larger side when neither side fits the full menu', () => {
    const position = positionMenu({ anchorTop: 220, menuHeight: 500 });

    expect(position.placement).toBe('bottom');
    expect(position.maxHeight).toBe(336);
    expect(position.top).toBe(256);
  });

  it('clamps wide menus inside the horizontal viewport margins', () => {
    const position = getViewportMenuPosition({
      anchorRect: rect(760, 500, 100, 30),
      menuWidth: 1000,
      menuHeight: 180,
      viewportWidth: 800,
      viewportHeight: 600,
      gapPx: 6,
      marginPx: 8,
    });

    expect(position.left).toBe(8);
    expect(position.maxWidth).toBe(784);
  });

  it('clamps a bottom-placed menu when its anchor moves above the viewport', () => {
    const position = getViewportMenuPosition({
      anchorRect: rect(100, -100, 120, 30),
      menuWidth: 220,
      menuHeight: 180,
      viewportWidth: 800,
      viewportHeight: 600,
      gapPx: 6,
      marginPx: 8,
      preferredPlacement: 'top',
    });

    expect(position.placement).toBe('bottom');
    expect(position.top).toBe(8);
    expect(position.maxHeight).toBe(584);
  });

  it('clamps an upward menu when its anchor moves below the viewport', () => {
    const position = getViewportMenuPosition({
      anchorRect: rect(100, 700, 120, 30),
      menuWidth: 220,
      menuHeight: 180,
      viewportWidth: 800,
      viewportHeight: 600,
      gapPx: 6,
      marginPx: 8,
      preferredPlacement: 'top',
    });

    expect(position.placement).toBe('top');
    expect(position.top).toBe(412);
    expect(position.top + 180).toBe(592);
    expect(position.maxHeight).toBe(584);
  });
});
