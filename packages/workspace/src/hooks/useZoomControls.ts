import { useCallback, useMemo, useState } from 'react';
import { createValueStore } from '../utils/valueStore';

type UseZoomControlsArgs = {
  hasSelection: boolean;
};

// Canvas zoom orchestration: trigger counters consumed by Canvas effects, the
// rAF-friendly scale store behind the zoom badge, and the badge visibility toggle.
export function useZoomControls({ hasSelection }: UseZoomControlsArgs) {
  // Triggers to control zoom-to-fit, zoom-to-selection, zoom-in, and zoom-out actions (increment to trigger effect)
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
  const [zoomToSelectionTrigger, setZoomToSelectionTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  // Wheel-zoom updates flow through this store so only subscribers re-render, not the App tree.
  const canvasScaleStore = useMemo(() => createValueStore(1), []);
  const [showZoomLevelBadge, setShowZoomLevelBadge] = useState(true);

  const requestZoomIn = useCallback(() => {
    setZoomInTrigger(prev => prev + 1);
  }, []);
  const requestZoomOut = useCallback(() => {
    setZoomOutTrigger(prev => prev + 1);
  }, []);
  const handleZoomToFit = useCallback(() => {
    setZoomToFitTrigger(c => c + 1);
  }, []);
  // Unguarded variant for flows that validate their own selection (e.g. generation notifications).
  const triggerZoomToSelection = useCallback(() => {
    setZoomToSelectionTrigger(prev => prev + 1);
  }, []);
  const requestZoomToSelection = useCallback(() => {
    if (!hasSelection) {
      return;
    }
    setZoomToSelectionTrigger(prev => prev + 1);
  }, [hasSelection]);

  const handleToggleZoomLevelBadge = useCallback(() => {
    setShowZoomLevelBadge(prev => !prev);
  }, []);

  return {
    zoomToFitTrigger,
    zoomToSelectionTrigger,
    zoomInTrigger,
    zoomOutTrigger,
    canvasScaleStore,
    showZoomLevelBadge,
    requestZoomIn,
    requestZoomOut,
    handleZoomToFit,
    triggerZoomToSelection,
    requestZoomToSelection,
    handleToggleZoomLevelBadge,
  };
}
