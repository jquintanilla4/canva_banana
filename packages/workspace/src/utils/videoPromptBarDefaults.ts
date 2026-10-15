import { JIMENG_MULTIFRAME_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../services/modelConfig';
import type { UseFalSettingsResult } from '../hooks/useFalSettings';
import type { CanvasVideoPromptBar } from '../types';

type NewVideoPromptBarSettingsSource = Pick<UseFalSettingsResult,
  | 'falVideoModelId'
  | 'isSeedance2VideoModel'
  | 'isSeedance25VideoModel'
  | 'jimengMultiframeDuration'
  | 'jimengMultiframeResolution'
  | 'seedance25Variant'
  | 'seedance25AspectRatio'
  | 'seedance25Resolution'
  | 'seedance25Duration'
  | 'seedance25GenerateAudio'
  | 'seedance2JimengModelVersion'
  | 'seedance2VolcengineModel'
  | 'seedance2OutputFormat'
>;

export type NewVideoPromptBarDefaults = Omit<CanvasVideoPromptBar, 'id' | 'assignedAreaId' | 'x' | 'y' | 'width' | 'height'>;

// Seed values for a freshly created embedded prompt bar. Bars adopt the footer's
// model only when it is embeddable (Seedance families + Jimeng multiframe); anything
// else falls back to the Volcengine Seedance 2 selector. Legacy Seedance 2 / Kling V3
// fields are always present because older snapshots and tests read them directly.
export const getNewVideoPromptBarDefaults = (fal: NewVideoPromptBarSettingsSource): NewVideoPromptBarDefaults => ({
  prompt: '',
  negativePrompt: '',
  modelId: fal.isSeedance2VideoModel || fal.isSeedance25VideoModel || fal.falVideoModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID
    ? fal.falVideoModelId
    : SEEDANCE_2_VIDEO_MODEL_ID,
  ...(fal.falVideoModelId === JIMENG_MULTIFRAME_VIDEO_MODEL_ID ? {
    falOptions: {
      multiframeDuration: fal.jimengMultiframeDuration,
      multiframeResolution: fal.jimengMultiframeResolution,
    },
  } : fal.isSeedance25VideoModel ? {
    falOptions: {
      seedance25Variant: fal.seedance25Variant,
      seedance25AspectRatio: fal.seedance25AspectRatio,
      seedance25Resolution: fal.seedance25Resolution,
      seedance25Duration: fal.seedance25Duration,
      seedance25GenerateAudio: fal.seedance25GenerateAudio,
    },
  } : {}),
  seedance2Variant: 'reference',
  seedance2JimengModelVersion: fal.seedance2JimengModelVersion,
  seedance2VolcengineModel: fal.seedance2VolcengineModel,
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  seedance2OutputFormat: fal.seedance2OutputFormat,
  klingV3MultiPrompt: '',
  klingV3Duration: '5',
  klingV3GenerateAudio: true,
  klingV3CfgScale: '0.5',
  klingV3MultiPromptEnabled: false,
  klingV3Shot1Duration: '5',
  klingV3Shot2Duration: '5',
});
