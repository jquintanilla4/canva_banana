import { act, cleanup, render } from '@testing-library/react';
import React, { useCallback, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANCHORED_PORTAL_TRACKING_IGNORE_ATTRIBUTE, useAnchoredPortalTracking } from '../useAnchoredPortalTracking';

const TrackingHarness = ({ onPositionUpdate }: { onPositionUpdate: () => void }) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const updatePosition = useCallback(() => {
    onPositionUpdate();
    const measurement = document.createElement('div');
    measurement.setAttribute(ANCHORED_PORTAL_TRACKING_IGNORE_ATTRIBUTE, ''); // Mirrors temporary caret measurement nodes.
    document.body.appendChild(measurement);
    document.body.removeChild(measurement);
  }, [onPositionUpdate]);

  useAnchoredPortalTracking({ active: true, anchorRef, portalRef, updatePosition });

  return (
    <div>
      <button ref={anchorRef} type="button">Anchor</button>
      <div ref={portalRef}>Portal</div>
    </div>
  );
};

describe('useAnchoredPortalTracking', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not schedule itself again for ignored measurement mutations', async () => {
    let nextFrameId = 1;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      frameCallbacks.delete(frameId);
    });
    const onPositionUpdate = vi.fn();

    render(<TrackingHarness onPositionUpdate={onPositionUpdate} />);
    expect(frameCallbacks.size).toBe(1);
    const initialFrame = [...frameCallbacks.entries()][0];
    expect(initialFrame).toBeTruthy();
    if (!initialFrame) {
      return;
    }

    frameCallbacks.delete(initialFrame[0]);
    await act(async () => {
      initialFrame[1](0);
      await Promise.resolve();
    });

    expect(onPositionUpdate).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it('starts following an influencer that is already animating when inserted', async () => {
    let nextFrameId = 1;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      frameCallbacks.delete(frameId);
    });
    const onPositionUpdate = vi.fn();

    render(<TrackingHarness onPositionUpdate={onPositionUpdate} />);
    const initialFrame = [...frameCallbacks.entries()][0];
    expect(initialFrame).toBeTruthy();
    if (!initialFrame) {
      return;
    }
    frameCallbacks.delete(initialFrame[0]);
    act(() => initialFrame[1](0));
    expect(frameCallbacks.size).toBe(0);

    const anchor = document.querySelector('button');
    const movingSibling = document.createElement('div');
    Object.defineProperty(movingSibling, 'getAnimations', {
      configurable: true,
      value: () => [{ playState: 'running', pending: false } as Animation],
    });
    await act(async () => {
      anchor?.parentElement?.insertBefore(movingSibling, anchor);
      await Promise.resolve();
    });

    expect(frameCallbacks.size).toBe(2); // One motion frame plus the mutation position update.
    const motionFrame = [...frameCallbacks.entries()][0];
    expect(motionFrame).toBeTruthy();
    if (!motionFrame) {
      return;
    }
    frameCallbacks.delete(motionFrame[0]);
    act(() => motionFrame[1](16));

    expect(onPositionUpdate).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(2); // Running motion schedules the next tracking frame.
  });
});
