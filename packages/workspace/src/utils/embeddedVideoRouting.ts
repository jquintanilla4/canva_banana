import type { CanvasVideoPromptBar, GenerationInputs, GenerationProviderId } from '../types';
import {
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  normalizeJimengSeedance25AspectRatio,
  normalizeJimengSeedance25Duration,
  SEEDANCE_2_VIDEO_MODEL_ID,
  getProviderSafeSeedance2Variant,
  getVolcengineSafeSeedance2Settings,
} from '../services/modelConfig';
import { resolveFlux3Settings } from './flux3';

type EmbeddedVideoGenerationProviderInput = Pick<GenerationInputs, 'provider' | 'falOptions' | 'volcengineOptions' | 'jimengOptions'>;
type EmbeddedBarFalOptions = NonNullable<GenerationInputs['falOptions']> & {
  seedance2CameraFixed?: CanvasVideoPromptBar['seedance2CameraFixed'];
}; // Embedded legacy bars carry one extra Seedance flag outside Fal metadata.

export const getJimengSafeSeedance2Resolution = (
  resolution: CanvasVideoPromptBar['seedance2Resolution'],
  modelVersion: CanvasVideoPromptBar['seedance2JimengModelVersion'] | undefined,
): CanvasVideoPromptBar['seedance2Resolution'] => (
  resolution === '480p' || ((resolution === '1080p' || resolution === '4k') && modelVersion !== 'seedance2.0_vip') ? '720p' : resolution
); // Jimeng Seedance 2 is 720p except for VIP 1080p/4K.

export const getEmbeddedBarFalOptions = (bar: CanvasVideoPromptBar): EmbeddedBarFalOptions => ({
  ...(bar.falOptions ?? {}),
  negativePrompt: bar.negativePrompt,
  seedance2Variant: bar.seedance2Variant,
  seedance2JimengModelVersion: bar.seedance2JimengModelVersion ?? bar.falOptions?.seedance2JimengModelVersion,
  seedance2VolcengineModel: bar.seedance2VolcengineModel,
  seedance2AspectRatio: bar.seedance2AspectRatio,
  seedance2Resolution: bar.seedance2Resolution,
  seedance2Duration: bar.seedance2Duration,
  seedance2GenerateAudio: bar.seedance2GenerateAudio,
  seedance2CameraFixed: bar.seedance2CameraFixed,
  seedance2OutputFormat: bar.seedance2OutputFormat,
  klingV3MultiPrompt: bar.klingV3MultiPrompt ?? bar.falOptions?.klingV3MultiPrompt,
  klingV3Duration: bar.klingV3Duration ?? bar.falOptions?.klingV3Duration,
  klingV3GenerateAudio: bar.klingV3GenerateAudio ?? bar.falOptions?.klingV3GenerateAudio,
  klingV3CfgScale: bar.klingV3CfgScale ?? bar.falOptions?.klingV3CfgScale,
  klingV3MultiPromptEnabled: bar.klingV3MultiPromptEnabled ?? bar.falOptions?.klingV3MultiPromptEnabled,
  klingV3Shot1Duration: bar.klingV3Shot1Duration ?? bar.falOptions?.klingV3Shot1Duration,
  klingV3Shot2Duration: bar.klingV3Shot2Duration ?? bar.falOptions?.klingV3Shot2Duration,
}); // Legacy top-level fields keep existing embedded bars compatible.

export const isJimengEmbeddedVideoModel = (modelId: string): boolean =>
  modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID || modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID; // Shared guard for setup checks and routing.

export const isEmbeddedSeedanceEditMode = (
  bar: CanvasVideoPromptBar,
  modelId: string,
): boolean => modelId === SEEDANCE_2_VIDEO_MODEL_ID && bar.seedance2Variant === 'edit'; // Edit is Volcengine-only and always requires a source video.

export const isEmbeddedSeedanceReferenceMode = (
  bar: CanvasVideoPromptBar,
  modelId: string,
): boolean => {
  if (modelId === FAL_SEEDANCE_25_VIDEO_MODEL_ID || modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID) {
    return (bar.falOptions?.seedance25Variant ?? 'reference') === 'reference';
  }
  return (
    modelId === SEEDANCE_2_VIDEO_MODEL_ID
    || modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID
    || modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID
  ) && bar.seedance2Variant !== 'smart';
}; // Each Seedance family reads its own variant state when gating empty embedded submits; Edit/Extend also need media.

export const getEmbeddedVideoProvider = (modelId: string): GenerationProviderId => (
  modelId === SEEDANCE_2_VIDEO_MODEL_ID
    ? 'volcengine'
    : isJimengEmbeddedVideoModel(modelId)
      ? 'jimeng'
      : 'fal'
); // Embedded bars route backend-backed Seedance models outside Fal.

export const buildEmbeddedVideoGenerationProviderInput = (
  bar: CanvasVideoPromptBar,
  modelId: string,
  jimengSessionId: number,
  hasFirstFrame = false,
): EmbeddedVideoGenerationProviderInput => {
  const provider = getEmbeddedVideoProvider(modelId);
  if (modelId === SEEDANCE_2_VIDEO_MODEL_ID) {
    const safe = getVolcengineSafeSeedance2Settings(bar.seedance2VolcengineModel, bar, hasFirstFrame);
    return {
      provider,
      volcengineOptions: {
        seedance2Variant: safe.seedance2Variant,
        seedance2VolcengineModel: bar.seedance2VolcengineModel,
        seedance2AspectRatio: safe.seedance2AspectRatio,
        seedance2Resolution: safe.seedance2Resolution,
        seedance2Duration: safe.seedance2Duration,
        seedance2GenerateAudio: bar.seedance2GenerateAudio,
        seedance2CameraFixed: safe.seedance2CameraFixed,
        seedance2OutputFormat: bar.seedance2OutputFormat,
      },
    };
  }
  if (modelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID) {
    const modelVersion = bar.seedance2JimengModelVersion ?? bar.falOptions?.seedance2JimengModelVersion;
    return {
      provider,
      jimengOptions: {
        seedance2Variant: getProviderSafeSeedance2Variant(modelId, bar.seedance2Variant), // Bars can carry a stale Edit/Extend pick from Volcengine.
        seedance2JimengModelVersion: modelVersion,
        seedance2AspectRatio: bar.seedance2AspectRatio,
        seedance2Resolution: getJimengSafeSeedance2Resolution(bar.seedance2Resolution, modelVersion),
        seedance2Duration: bar.seedance2Duration,
        seedance2GenerateAudio: bar.seedance2GenerateAudio,
        seedance2CameraFixed: bar.seedance2CameraFixed,
        sessionId: jimengSessionId,
      },
    };
  }
  if (modelId === JIMENG_SEEDANCE_25_VIDEO_MODEL_ID) {
    return {
      provider,
      jimengOptions: {
        seedance25Variant: bar.falOptions?.seedance25Variant ?? 'reference',
        seedance25AspectRatio: normalizeJimengSeedance25AspectRatio(bar.falOptions?.seedance25AspectRatio ?? '16:9'),
        seedance25Resolution: bar.falOptions?.seedance25Resolution ?? '720p',
        seedance25Duration: normalizeJimengSeedance25Duration(bar.falOptions?.seedance25Duration ?? '5'),
        seedance25GenerateAudio: false,
        sessionId: jimengSessionId,
      },
    };
  }
  if (modelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID) {
    return {
      provider,
      jimengOptions: {
        multiframeDuration: bar.falOptions?.multiframeDuration ?? '3',
        multiframeResolution: bar.falOptions?.multiframeResolution ?? '720p',
        sessionId: jimengSessionId,
      },
    };
  }
  if (modelId === FLUX_3_VIDEO_MODEL_ID) {
    const falOptions = getEmbeddedBarFalOptions(bar);
    const flux3Settings = resolveFlux3Settings(falOptions);
    return {
      provider,
      falOptions: {
        ...falOptions,
        ...flux3Settings,
      },
    };
  }
  return {
    provider,
    falOptions: {
      ...getEmbeddedBarFalOptions(bar),
      seedance2Variant: getProviderSafeSeedance2Variant(modelId, bar.seedance2Variant), // Fal rejects Edit/Extend; fall back to Reference.
    },
  };
};
