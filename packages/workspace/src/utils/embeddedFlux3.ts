import {
  isFlux3Duration,
  isFlux3Variant,
} from '../services/modelConfig';
import type {
  CanvasVideoPromptBar,
  GenerationInputs,
  VideoPromptAreaMembership,
} from '../types';
import {
  buildFlux3RunPlan,
  getFlux3ModePolicy,
  reconcileFlux3KeyframeTimings,
  resolveFlux3Settings,
  scaleFlux3KeyframeTimings,
  type Flux3RunPlan,
  type ResolvedFlux3Settings,
} from './flux3';
import {
  buildEmbeddedFlux3GenerationOverrides,
  buildEmbeddedVideoGenerationOverrides,
} from './videoPromptAreas';

type EmbeddedFlux3GenerationOverrides = Pick<
  GenerationInputs,
  | 'primaryImageId'
  | 'videoLastFrameImageId'
  | 'referenceImageIds'
  | 'referenceVideoIds'
  | 'referenceAudioIds'
  | 'elementImageIds'
  | 'sourceVideoId'
  | 'sourceAudioId'
>;

export interface EmbeddedFlux3PromptState {
  settings: ResolvedFlux3Settings;
  runPlan: Flux3RunPlan;
  generationOverrides: EmbeddedFlux3GenerationOverrides;
}

export const buildEmbeddedFlux3PromptState = (
  bar: CanvasVideoPromptBar,
  membership: VideoPromptAreaMembership | undefined,
): EmbeddedFlux3PromptState => {
  const settings = resolveFlux3Settings(bar.falOptions);
  const fluxOverrides = buildEmbeddedFlux3GenerationOverrides(membership, settings.flux3Variant);
  const generationOverrides = {
    ...buildEmbeddedVideoGenerationOverrides(membership),
    ...fluxOverrides,
  };
  const runPlan = buildFlux3RunPlan({
    prompt: bar.prompt,
    variant: settings.flux3Variant,
    duration: settings.flux3Duration,
    primaryImageId: fluxOverrides.primaryImageId,
    lastFrameImageId: fluxOverrides.videoLastFrameImageId,
    referenceImageIds: fluxOverrides.referenceImageIds ?? [],
    sourceVideoId: fluxOverrides.sourceVideoId,
    keyframeTimings: settings.flux3KeyframeTimings,
  });
  return { settings, runPlan, generationOverrides };
};

export const updateEmbeddedFlux3Variant = (
  bar: CanvasVideoPromptBar,
  value: string,
): CanvasVideoPromptBar => {
  if (!isFlux3Variant(value)) return bar;
  const currentDuration = bar.falOptions?.flux3Duration ?? 'auto';
  const requiresExplicitDuration = getFlux3ModePolicy(value).requiresExplicitDuration;
  return {
    ...bar,
    falOptions: {
      ...bar.falOptions,
      flux3Variant: value,
      flux3Duration: requiresExplicitDuration && currentDuration === 'auto' ? '5' : currentDuration,
    },
  };
};

export const updateEmbeddedFlux3Duration = (
  bar: CanvasVideoPromptBar,
  value: string,
): CanvasVideoPromptBar => {
  if (!isFlux3Duration(value)) return bar;
  const previousDuration = bar.falOptions?.flux3Duration ?? 'auto';
  return {
    ...bar,
    falOptions: {
      ...bar.falOptions,
      flux3Duration: value,
      flux3KeyframeTimings: scaleFlux3KeyframeTimings(
        bar.falOptions?.flux3KeyframeTimings ?? [],
        previousDuration,
        value,
      ),
    },
  };
};

export const updateEmbeddedFlux3KeyframeTiming = (
  bar: CanvasVideoPromptBar,
  membership: VideoPromptAreaMembership | undefined,
  imageId: string,
  timestampSeconds: number,
): CanvasVideoPromptBar => ({
  ...bar,
  falOptions: {
    ...bar.falOptions,
    flux3KeyframeTimings: reconcileFlux3KeyframeTimings(
      membership?.acceptedImageIds ?? [],
      bar.falOptions?.flux3KeyframeTimings ?? [],
      bar.falOptions?.flux3Duration ?? 'auto',
    ).map(entry => entry.imageId === imageId ? { ...entry, timestampSeconds } : entry),
  },
});
