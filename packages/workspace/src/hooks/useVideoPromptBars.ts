import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CanvasImage,
  CanvasVideoPromptArea,
  CanvasVideoPromptBar,
  VideoPromptAreaMembership,
} from '../types';
import { FAL_VIDEO_MODEL_OPTIONS, FLUX_3_VIDEO_MODEL_ID } from '../services/modelConfig';
import { buildPromptBarModelControls } from '../services/promptBarConfig';
import { buildEmbeddedPromptBarControlsInput } from '../services/promptBarSettingsView';
import {
  buildVideoPromptAreaMembership,
  getAreaPromptBarRect,
  getEmbeddedVideoPromptBarModelId,
  getVideoPromptAreaCapabilityProfile,
  isUsableVideoPromptAreaModel,
} from '../utils/videoPromptAreas';
import { buildEmbeddedFlux3PromptState } from '../utils/embeddedFlux3';
import { getEmbeddedBarFalOptions } from '../utils/embeddedVideoRouting';
import { getNewVideoPromptBarDefaults } from '../utils/videoPromptBarDefaults';
import type { UseFalSettingsResult } from './useFalSettings';
import type { AppState } from './useCanvasHistory';

type UseVideoPromptBarsArgs = {
  displayedImages: CanvasImage[];
  displayedVideoPromptAreas: CanvasVideoPromptArea[];
  displayedVideoPromptBars: CanvasVideoPromptBar[];
  setLiveVideoPromptAreas: (areas: CanvasVideoPromptArea[]) => void;
  setLiveVideoPromptBars: (bars: CanvasVideoPromptBar[]) => void;
  setState: (updater: (prevState: AppState) => AppState) => void;
  setError: (message: string | null) => void;
  fal: UseFalSettingsResult;
  isLoading: boolean;
};

// Everything the on-canvas video prompt areas/bars need from App: area selection,
// bar creation and edits, per-area capability profiles and media memberships, and
// the control builder for embedded prompt bars.
export function useVideoPromptBars({
  displayedImages,
  displayedVideoPromptAreas,
  displayedVideoPromptBars,
  setLiveVideoPromptAreas,
  setLiveVideoPromptBars,
  setState,
  setError,
  fal,
  isLoading,
}: UseVideoPromptBarsArgs) {
  const [selectedVideoPromptAreaId, setSelectedVideoPromptAreaId] = useState<string | null>(null);

  const handleVideoPromptAreasChange = useCallback((nextAreas: CanvasVideoPromptArea[]) => {
    setLiveVideoPromptAreas(nextAreas);
  }, [setLiveVideoPromptAreas]);

  const handleVideoPromptBarsChange = useCallback((nextBars: CanvasVideoPromptBar[]) => {
    setLiveVideoPromptBars(nextBars);
  }, [setLiveVideoPromptBars]);

  const handleCreateVideoPromptBar = useCallback(() => {
    if (displayedVideoPromptAreas.length === 0) {
      return;
    }
    const selectedArea = selectedVideoPromptAreaId
      ? displayedVideoPromptAreas.find(area => area.id === selectedVideoPromptAreaId) ?? null
      : null;
    const targetArea = selectedArea && !selectedArea.promptBarId
      ? selectedArea
      : [...displayedVideoPromptAreas].reverse().find(area => !area.promptBarId) ?? null;
    if (!targetArea) {
      setError('Each video prompt area already has a prompt bar.');
      return;
    }
    const newBar: CanvasVideoPromptBar = {
      id: crypto.randomUUID(),
      assignedAreaId: targetArea.id,
      ...getNewVideoPromptBarDefaults(fal),
      ...getAreaPromptBarRect(targetArea),
    };
    setState(prevState => ({
      ...prevState,
      videoPromptAreas: prevState.videoPromptAreas.map(area => (
        area.id === targetArea.id ? { ...area, promptBarId: newBar.id } : area
      )),
      videoPromptBars: [...prevState.videoPromptBars, newBar],
    }));
  }, [displayedVideoPromptAreas, fal, selectedVideoPromptAreaId, setError, setState]);

  const handleEmbeddedPromptBarUpdate = useCallback((barId: string, updater: (bar: CanvasVideoPromptBar) => CanvasVideoPromptBar) => {
    setLiveVideoPromptBars(displayedVideoPromptBars.map(bar => (
      bar.id === barId ? updater(bar) : bar
    )));
  }, [displayedVideoPromptBars, setLiveVideoPromptBars]);

  useEffect(() => {
    if (!selectedVideoPromptAreaId) {
      return;
    }
    const hasSelectedArea = displayedVideoPromptAreas.some(area => area.id === selectedVideoPromptAreaId);
    if (!hasSelectedArea) {
      setSelectedVideoPromptAreaId(null);
    }
  }, [displayedVideoPromptAreas, selectedVideoPromptAreaId]);

  const videoPromptAreaBarById = useMemo(() => (
    displayedVideoPromptBars.reduce<Record<string, CanvasVideoPromptBar>>((acc, bar) => {
      if (bar.assignedAreaId) {
        acc[bar.assignedAreaId] = bar;
      }
      return acc;
    }, {})
  ), [displayedVideoPromptBars]);
  const videoPromptAreaProfiles = useMemo(() => (
    displayedVideoPromptAreas.reduce<Record<string, ReturnType<typeof getVideoPromptAreaCapabilityProfile>>>((acc, area) => {
      const bar = videoPromptAreaBarById[area.id];
      acc[area.id] = getVideoPromptAreaCapabilityProfile(bar?.modelId, bar?.seedance2Variant, bar ? getEmbeddedBarFalOptions(bar) : undefined);
      return acc;
    }, {})
  ), [displayedVideoPromptAreas, videoPromptAreaBarById]);
  const videoPromptAreaMemberships = useMemo(() => (
    displayedVideoPromptAreas.reduce<Record<string, VideoPromptAreaMembership>>((acc, area) => {
      acc[area.id] = buildVideoPromptAreaMembership(area, displayedImages, videoPromptAreaProfiles[area.id]);
      return acc;
    }, {})
  ), [displayedImages, displayedVideoPromptAreas, videoPromptAreaProfiles]);
  const videoPromptAreaMembershipList = useMemo(() => (
    Object.values(videoPromptAreaMemberships) as VideoPromptAreaMembership[]
  ), [videoPromptAreaMemberships]);
  const videoPromptAreaLabelMap = useMemo(() => (
    videoPromptAreaMembershipList.reduce<Record<string, string>>((acc, membership) => {
      Object.entries(membership.orderLabels).forEach(([mediaId, label]) => {
        acc[mediaId] = label;
      });
      return acc;
    }, {})
  ), [videoPromptAreaMembershipList]);
  const ignoredVideoPromptMediaIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.ignoredMediaIds)
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptImageIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => [
      ...(membership.primaryImageId ? [membership.primaryImageId] : []),
      ...membership.acceptedImageIds,
      ...(membership.tailImageId ? [membership.tailImageId] : []),
    ])
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptVideoIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.acceptedVideoIds)
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptAudioIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.acceptedAudioIds)
  ), [videoPromptAreaMembershipList]);
  const acceptedVideoPromptElementIds = useMemo(() => (
    videoPromptAreaMembershipList.flatMap(membership => membership.elementImageIds)
  ), [videoPromptAreaMembershipList]);

  const embeddedVideoPromptBarModelOptions = useMemo(() => (
    FAL_VIDEO_MODEL_OPTIONS
      .filter(option => isUsableVideoPromptAreaModel(option.value))
      .map(option => ({ value: option.value, label: option.label }))
  ), []);

  const getEmbeddedVideoPromptBarSubmitError = useCallback((bar: CanvasVideoPromptBar): string | null => {
    if (getEmbeddedVideoPromptBarModelId(bar.modelId) !== FLUX_3_VIDEO_MODEL_ID) {
      return null;
    }
    const membership = bar.assignedAreaId ? videoPromptAreaMemberships[bar.assignedAreaId] : undefined;
    return buildEmbeddedFlux3PromptState(bar, membership).runPlan.error;
  }, [videoPromptAreaMemberships]);

  const buildEmbeddedVideoPromptBarControls = useCallback((bar: CanvasVideoPromptBar) => (
    buildPromptBarModelControls(buildEmbeddedPromptBarControlsInput({
      bar,
      barMembership: bar.assignedAreaId ? videoPromptAreaMemberships[bar.assignedAreaId] : undefined,
      fal,
      updateBar: handleEmbeddedPromptBarUpdate,
      isLoading,
    })) ?? []
  ), [fal, handleEmbeddedPromptBarUpdate, isLoading, videoPromptAreaMemberships]);

  const handleVideoPromptAreaBorderColorChange = useCallback((areaId: string, color: string) => {
    setState(prevState => {
      const areaIndex = prevState.videoPromptAreas.findIndex(area => area.id === areaId);
      if (areaIndex === -1) {
        return prevState;
      }
      const nextAreas = [...prevState.videoPromptAreas];
      nextAreas[areaIndex] = { ...nextAreas[areaIndex], borderColor: color };
      return { ...prevState, videoPromptAreas: nextAreas };
    });
  }, [setState]);

  return {
    selectedVideoPromptAreaId,
    setSelectedVideoPromptAreaId,
    handleVideoPromptAreasChange,
    handleVideoPromptBarsChange,
    handleCreateVideoPromptBar,
    handleEmbeddedPromptBarUpdate,
    handleVideoPromptAreaBorderColorChange,
    videoPromptAreaProfiles,
    videoPromptAreaMemberships,
    videoPromptAreaLabelMap,
    ignoredVideoPromptMediaIds,
    acceptedVideoPromptImageIds,
    acceptedVideoPromptVideoIds,
    acceptedVideoPromptAudioIds,
    acceptedVideoPromptElementIds,
    embeddedVideoPromptBarModelOptions,
    getEmbeddedVideoPromptBarSubmitError,
    buildEmbeddedVideoPromptBarControls,
  };
}
