import { useCallback, useEffect, useMemo } from 'react';
import { isFlux3Duration } from '../services/modelConfig';
import type { UseFalSettingsResult } from './useFalSettings';
import {
  buildFlux3RunPlan,
  scaleFlux3KeyframeTimings,
  type Flux3ModePolicy,
  type Flux3RunPlan,
} from '../utils/flux3';

type Flux3PromptSettings = Pick<
  UseFalSettingsResult,
  | 'isFlux3VideoModel'
  | 'flux3Variant'
  | 'flux3Duration'
  | 'flux3KeyframeTimings'
  | 'setFlux3KeyframeTimings'
  | 'handleFlux3DurationChange'
>;

interface UseFlux3PromptStateArgs {
  settings: Flux3PromptSettings;
  prompt: string;
  primaryImageId: string | null;
  lastFrameImageId: string | null;
  referenceImageIds: readonly string[];
  sourceVideoId: string | null;
  selectedMediaIds?: readonly string[];
}

interface UseFlux3PromptStateResult {
  modePolicy: Flux3ModePolicy;
  runPlan: Flux3RunPlan;
  keyframeError: string | null;
  canvasLabels: Record<string, string>;
  promptMentions: string[];
  handleDurationChange: (value: string) => void;
  handleKeyframeTimingChange: (imageId: string, timestampSeconds: number) => void;
}

const areKeyframeTimingsEqual = (
  left: Flux3RunPlan['keyframeTimings'],
  right: Flux3RunPlan['keyframeTimings'],
): boolean => left.length === right.length && left.every((entry, index) => (
  entry.imageId === right[index]?.imageId && entry.timestampSeconds === right[index]?.timestampSeconds
));

export const useFlux3PromptState = ({
  settings,
  prompt,
  primaryImageId,
  lastFrameImageId,
  referenceImageIds,
  sourceVideoId,
  selectedMediaIds,
}: UseFlux3PromptStateArgs): UseFlux3PromptStateResult => {
  const runPlan = useMemo(() => buildFlux3RunPlan({
    prompt,
    variant: settings.flux3Variant,
    duration: settings.flux3Duration,
    primaryImageId,
    lastFrameImageId,
    referenceImageIds,
    sourceVideoId,
    selectedMediaIds,
    keyframeTimings: settings.flux3KeyframeTimings,
  }), [
    lastFrameImageId,
    primaryImageId,
    prompt,
    referenceImageIds,
    selectedMediaIds,
    settings.flux3Duration,
    settings.flux3KeyframeTimings,
    settings.flux3Variant,
    sourceVideoId,
  ]);

  useEffect(() => {
    if (!settings.isFlux3VideoModel || runPlan.policy.inputKind !== 'keyframe-images') return;
    if (!areKeyframeTimingsEqual(runPlan.keyframeTimings, settings.flux3KeyframeTimings)) {
      settings.setFlux3KeyframeTimings(runPlan.keyframeTimings);
    }
  }, [
    runPlan.keyframeTimings,
    runPlan.policy.inputKind,
    settings.flux3KeyframeTimings,
    settings.isFlux3VideoModel,
    settings.setFlux3KeyframeTimings,
  ]);

  const handleDurationChange = useCallback((value: string) => {
    if (!isFlux3Duration(value)) return;
    settings.setFlux3KeyframeTimings(current => (
      scaleFlux3KeyframeTimings(current, settings.flux3Duration, value)
    ));
    settings.handleFlux3DurationChange(value);
  }, [settings.flux3Duration, settings.handleFlux3DurationChange, settings.setFlux3KeyframeTimings]);

  const handleKeyframeTimingChange = useCallback((imageId: string, timestampSeconds: number) => {
    settings.setFlux3KeyframeTimings(current => current.map(entry => (
      entry.imageId === imageId ? { ...entry, timestampSeconds } : entry
    )));
  }, [settings.setFlux3KeyframeTimings]);

  const canvasLabels = useMemo<Record<string, string>>(() => {
    if (!settings.isFlux3VideoModel) return {};
    if (runPlan.policy.inputKind === 'source-video') return sourceVideoId ? { [sourceVideoId]: '@Video1' } : {};
    if (runPlan.policy.inputKind === 'keyframe-images') {
      return Object.fromEntries(referenceImageIds.map((id, index) => [id, `@Image${index + 1}`]));
    }
    const labels: Record<string, string> = {};
    if (primaryImageId) labels[primaryImageId] = '@Image1';
    if (runPlan.policy.inputKind === 'first-last-images' && lastFrameImageId) labels[lastFrameImageId] = '@Image2';
    return labels;
  }, [
    lastFrameImageId,
    primaryImageId,
    referenceImageIds,
    runPlan.policy.inputKind,
    settings.isFlux3VideoModel,
    sourceVideoId,
  ]);

  return {
    modePolicy: runPlan.policy,
    runPlan,
    keyframeError: runPlan.keyframeError,
    canvasLabels,
    promptMentions: settings.isFlux3VideoModel ? runPlan.mentionOptions : [],
    handleDurationChange,
    handleKeyframeTimingChange,
  };
};
