import { useEffect, type RefObject } from 'react';

interface AnchoredPortalTrackingOptions<TAnchor extends HTMLElement, TPortal extends HTMLElement> {
  active: boolean;
  anchorRef: RefObject<TAnchor | null>;
  portalRef: RefObject<TPortal | null>;
  updatePosition: () => void;
}

export const ANCHORED_PORTAL_TRACKING_IGNORE_ATTRIBUTE = 'data-anchored-portal-tracking-ignore'; // Marks temporary layout nodes that must not retrigger tracking.

const isInsideIgnoredTrackingSubtree = (node: Node): boolean => {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest(`[${ANCHORED_PORTAL_TRACKING_IGNORE_ATTRIBUTE}]`));
};

const isIgnoredTrackingMutation = (record: MutationRecord): boolean => {
  if (isInsideIgnoredTrackingSubtree(record.target)) {
    return true;
  }
  if (record.type !== 'childList') {
    return false;
  }
  const changedNodes = [...record.addedNodes, ...record.removedNodes];
  return changedNodes.length > 0 && changedNodes.every(isInsideIgnoredTrackingSubtree); // Ignores adding or removing marked measurement trees.
};

const getMotionKey = (event: Event): string => {
  const transitionProperty = (event as TransitionEvent).propertyName;
  if (typeof transitionProperty === 'string' && transitionProperty.length > 0) {
    return `transition:${transitionProperty}`;
  }
  const animationName = (event as AnimationEvent).animationName;
  return `animation:${typeof animationName === 'string' ? animationName : ''}`;
};

const collectLayoutInfluencers = (anchor: HTMLElement, portal: HTMLElement): Set<HTMLElement> => {
  const influencers = new Set<HTMLElement>([anchor, portal]);
  let branch: HTMLElement | null = anchor;
  while (branch) {
    influencers.add(branch);
    const parent = branch.parentElement;
    if (!parent) {
      break;
    }
    influencers.add(parent);
    for (const sibling of parent.children) {
      if (sibling instanceof HTMLElement) {
        influencers.add(sibling); // Sibling size changes can move this branch in flex and grid layouts.
      }
    }
    branch = parent;
  }
  return influencers;
};

const hasRunningLayoutMotion = (influencers: ReadonlySet<HTMLElement>): boolean => {
  for (const element of influencers) {
    const animations = typeof element.getAnimations === 'function' ? element.getAnimations() : [];
    if (animations.some(animation => animation.playState === 'running' || animation.pending)) {
      return true;
    }
  }
  return false;
};

export const useAnchoredPortalTracking = <TAnchor extends HTMLElement, TPortal extends HTMLElement>({
  active,
  anchorRef,
  portalRef,
  updatePosition,
}: AnchoredPortalTrackingOptions<TAnchor, TPortal>): void => { // Keeps detached menus aligned with moving DOM anchors.
  useEffect(() => {
    if (!active) {
      return;
    }

    const anchor = anchorRef.current;
    const portal = portalRef.current;
    if (!anchor || !portal) {
      return;
    }

    let scheduledFrameId = 0;
    let motionFrameId = 0;
    let layoutInfluencers = new Set<HTMLElement>();
    const activeMotions = new Map<Element, Set<string>>(); // Tracks overlapping transitions and animations by name.
    const schedulePositionUpdate = () => {
      if (scheduledFrameId !== 0) {
        return;
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = 0;
        updatePosition();
      });
    };
    const isLayoutMotion = (event: Event): event is Event & { target: HTMLElement } => (
      event.target instanceof HTMLElement && layoutInfluencers.has(event.target)
    );
    const shouldFollowLayoutMotion = () => (
      activeMotions.size > 0 || hasRunningLayoutMotion(layoutInfluencers)
    );
    const updateDuringMotion = () => {
      updatePosition();
      motionFrameId = shouldFollowLayoutMotion()
        ? window.requestAnimationFrame(updateDuringMotion)
        : 0; // Stops polling as soon as all relevant motion finishes.
    };
    const startFollowingActiveMotion = () => {
      if (motionFrameId === 0 && shouldFollowLayoutMotion()) {
        motionFrameId = window.requestAnimationFrame(updateDuringMotion);
      }
    };
    const startFollowingMotion = (event: Event) => {
      if (!isLayoutMotion(event)) {
        return;
      }
      const motionKeys = activeMotions.get(event.target) ?? new Set<string>();
      motionKeys.add(getMotionKey(event));
      activeMotions.set(event.target, motionKeys);
      startFollowingActiveMotion();
    };
    const stopFollowingMotion = (event: Event) => {
      if (!isLayoutMotion(event)) {
        return;
      }
      const motionKeys = activeMotions.get(event.target);
      motionKeys?.delete(getMotionKey(event));
      if (motionKeys?.size === 0) {
        activeMotions.delete(event.target);
      }
      if (!shouldFollowLayoutMotion() && motionFrameId !== 0) {
        window.cancelAnimationFrame(motionFrameId);
        motionFrameId = 0;
      }
      schedulePositionUpdate();
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(schedulePositionUpdate);
    const refreshLayoutInfluencers = () => {
      const nextInfluencers = collectLayoutInfluencers(anchor, portal);
      for (const element of layoutInfluencers) {
        if (!nextInfluencers.has(element)) {
          resizeObserver?.unobserve(element);
          activeMotions.delete(element);
        }
      }
      for (const element of nextInfluencers) {
        if (!layoutInfluencers.has(element)) {
          resizeObserver?.observe(element);
        }
      }
      layoutInfluencers = nextInfluencers;
      startFollowingActiveMotion(); // Newly added influencers may already be moving.
    };
    const handleMutations = (records: MutationRecord[]) => {
      const relevantRecords = records.filter(record => !isIgnoredTrackingMutation(record));
      if (relevantRecords.length === 0) {
        return;
      }
      if (relevantRecords.some(record => record.type === 'childList')) {
        refreshLayoutInfluencers(); // New siblings can become part of the anchor's layout chain.
      }
      schedulePositionUpdate();
    };
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(handleMutations);

    refreshLayoutInfluencers();
    document.addEventListener('transitionrun', startFollowingMotion, true);
    document.addEventListener('transitionend', stopFollowingMotion, true);
    document.addEventListener('transitioncancel', stopFollowingMotion, true);
    document.addEventListener('animationstart', startFollowingMotion, true);
    document.addEventListener('animationend', stopFollowingMotion, true);
    document.addEventListener('animationcancel', stopFollowingMotion, true);
    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    mutationObserver?.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    }); // Any DOM-driven reflow can move a fixed portal away from its anchor.
    startFollowingActiveMotion(); // Catches motion that started before the portal opened.
    schedulePositionUpdate();

    return () => {
      document.removeEventListener('transitionrun', startFollowingMotion, true);
      document.removeEventListener('transitionend', stopFollowingMotion, true);
      document.removeEventListener('transitioncancel', stopFollowingMotion, true);
      document.removeEventListener('animationstart', startFollowingMotion, true);
      document.removeEventListener('animationend', stopFollowingMotion, true);
      document.removeEventListener('animationcancel', stopFollowingMotion, true);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      activeMotions.clear();
      layoutInfluencers.clear();
      if (scheduledFrameId !== 0) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      if (motionFrameId !== 0) {
        window.cancelAnimationFrame(motionFrameId);
      }
    };
  }, [active, anchorRef, portalRef, updatePosition]);
};
