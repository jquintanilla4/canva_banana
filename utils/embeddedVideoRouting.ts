import type { CanvasVideoPromptBar, GenerationInputs, GenerationProviderId } from '../types';
import {
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from '../services/modelConfig';

type EmbeddedVideoGenerationProviderInput = Pick<GenerationInputs, 'provider' | 'falOptions' | 'volcengineOptions' | 'jimengOptions'>;
type EmbeddedBarFalOptions = NonNullable<GenerationInputs['falOptions']> & {
  seedance2CameraFixed?: CanvasVideoPromptBar['seedance2CameraFixed'];
}; // Embedded legacy bars carry one extra Seedance flag outside Fal metadata.

export const getJimengSafeSeedance2Resolution = (
  resolution: CanvasVideoPromptBar['seedance2Resolution'],
  modelVersion: CanvasVideoPromptBar['seedance2JimengModelVersion'] | undefined,
): CanvasVideoPromptBar['seedance2Resolution'] => (
  modelVersion === 'seedance2.0_vip' || resolution !== '1080p' ? resolution : '720p'
); // Jimeng 1080p is only valid for seedance2.0_vip.

export const getEmbeddedBarFalOptions = (bar: CanvasVideoPromptBar): EmbeddedBarFalOptions => ({
  ...(bar.falOptions ?? {}),
  negativePrompt: bar.negativePrompt,
  seedance2Variant: bar.seedance2Variant,
  seedance2JimengModelVersion: bar.seedance2JimengModelVersion ?? bar.falOptions?.seedance2JimengModelVersion,
  seedance2AspectRatio: bar.seedance2AspectRatio,
  seedance2Resolution: bar.seedance2Resolution,
  seedance2Duration: bar.seedance2Duration,
  seedance2GenerateAudio: bar.seedance2GenerateAudio,
  seedance2CameraFixed: bar.seedance2CameraFixed,
  klingV3MultiPrompt: bar.klingV3MultiPrompt ?? bar.falOptions?.klingV3MultiPrompt,
  klingV3Duration: bar.klingV3Duration ?? bar.falOptions?.klingV3Duration,
  klingV3GenerateAudio: bar.klingV3GenerateAudio ?? bar.falOptions?.klingV3GenerateAudio,
  klingV3CfgScale: bar.klingV3CfgScale ?? bar.falOptions?.klingV3CfgScale,
  klingV3MultiPromptEnabled: bar.klingV3MultiPromptEnabled ?? bar.falOptions?.klingV3MultiPromptEnabled,
  klingV3Shot1Duration: bar.klingV3Shot1Duration ?? bar.falOptions?.klingV3Shot1Duration,
  klingV3Shot2Duration: bar.klingV3Shot2Duration ?? bar.falOptions?.klingV3Shot2Duration,
}); // Legacy top-level fields keep existing embedded bars compatible.

export const isJimengEmbeddedVideoModel = (modelId: string): boolean =>
  modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID; // Shared guard for setup checks and routing.

export const getEmbeddedVideoProvider = (modelId: string): GenerationProviderId => (
  modelId === SEEDANCE_2_VIDEO_MODEL_ID
    ? 'volcengine'
    : modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID
      ? 'jimeng'
      : 'fal'
); // Embedded bars route backend-backed Seedance models outside Fal.

export const buildEmbeddedVideoGenerationProviderInput = (
  bar: CanvasVideoPromptBar,
  modelId: string,
): EmbeddedVideoGenerationProviderInput => {
  const provider = getEmbeddedVideoProvider(modelId);
  if (modelId === SEEDANCE_2_VIDEO_MODEL_ID) {
    return {
      provider,
      volcengineOptions: {
        seedance2Variant: bar.seedance2Variant,
        seedance2AspectRatio: bar.seedance2AspectRatio,
        seedance2Resolution: bar.seedance2Resolution,
        seedance2Duration: bar.seedance2Duration,
        seedance2GenerateAudio: bar.seedance2GenerateAudio,
        seedance2CameraFixed: bar.seedance2CameraFixed,
      },
    };
  }
  if (modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID) {
    const modelVersion = bar.seedance2JimengModelVersion ?? bar.falOptions?.seedance2JimengModelVersion;
    return {
      provider,
      jimengOptions: {
        seedance2Variant: bar.seedance2Variant,
        seedance2JimengModelVersion: modelVersion,
        seedance2AspectRatio: bar.seedance2AspectRatio,
        seedance2Resolution: getJimengSafeSeedance2Resolution(bar.seedance2Resolution, modelVersion),
        seedance2Duration: bar.seedance2Duration,
        seedance2GenerateAudio: bar.seedance2GenerateAudio,
        seedance2CameraFixed: bar.seedance2CameraFixed,
      },
    };
  }
  return {
    provider,
    falOptions: getEmbeddedBarFalOptions(bar),
  };
};
