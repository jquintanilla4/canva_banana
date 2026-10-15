import { describe, expect, it } from 'vitest';
import { getNewVideoPromptBarDefaults } from '../videoPromptBarDefaults';
import {
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from '../../services/modelConfig';

const baseSettings = {
  falVideoModelId: SEEDANCE_2_VIDEO_MODEL_ID,
  isSeedance2VideoModel: true,
  isSeedance25VideoModel: false,
  jimengMultiframeDuration: '3',
  jimengMultiframeResolution: '720p',
  seedance25Variant: 'reference',
  seedance25AspectRatio: 'adaptive',
  seedance25Resolution: '720p',
  seedance25Duration: 'auto',
  seedance25GenerateAudio: true,
  seedance2JimengModelVersion: 'seedance2.0fast',
  seedance2VolcengineModel: 'seedance25',
  seedance2OutputFormat: 'mov',
} as Parameters<typeof getNewVideoPromptBarDefaults>[0];

describe('getNewVideoPromptBarDefaults', () => {
  it('adopts the footer Seedance model and carries the shared legacy defaults', () => {
    const defaults = getNewVideoPromptBarDefaults(baseSettings);
    expect(defaults.modelId).toBe(SEEDANCE_2_VIDEO_MODEL_ID);
    expect(defaults.falOptions).toBeUndefined();
    expect(defaults.seedance2Variant).toBe('reference');
    expect(defaults.seedance2VolcengineModel).toBe('seedance25');
    expect(defaults.seedance2OutputFormat).toBe('mov');
    expect(defaults.seedance2AspectRatio).toBe('16:9');
    expect(defaults.seedance2Resolution).toBe('720p');
    expect(defaults.seedance2Duration).toBe('5');
    expect(defaults.seedance2GenerateAudio).toBe(false);
    expect(defaults.seedance2CameraFixed).toBe(false);
    expect(defaults.klingV3Duration).toBe('5');
    expect(defaults.klingV3GenerateAudio).toBe(true);
    expect(defaults.klingV3CfgScale).toBe('0.5');
    expect(defaults.klingV3MultiPromptEnabled).toBe(false);
    expect(defaults.prompt).toBe('');
    expect(defaults.negativePrompt).toBe('');
  });

  it('seeds Jimeng multiframe bars with the footer multiframe options', () => {
    const defaults = getNewVideoPromptBarDefaults({
      ...baseSettings,
      falVideoModelId: JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
    });
    expect(defaults.modelId).toBe(JIMENG_MULTIFRAME_VIDEO_MODEL_ID);
    expect(defaults.falOptions).toEqual({ multiframeDuration: '3', multiframeResolution: '720p' });
  });

  it('seeds Seedance 2.5 bars with the footer 2.5 options', () => {
    const defaults = getNewVideoPromptBarDefaults({
      ...baseSettings,
      falVideoModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
      isSeedance25VideoModel: true,
      seedance25Variant: 'smart',
      seedance25Duration: '5',
    } as Parameters<typeof getNewVideoPromptBarDefaults>[0]);
    expect(defaults.modelId).toBe(FAL_SEEDANCE_25_VIDEO_MODEL_ID);
    expect(defaults.falOptions).toEqual({
      seedance25Variant: 'smart',
      seedance25AspectRatio: 'adaptive',
      seedance25Resolution: '720p',
      seedance25Duration: '5',
      seedance25GenerateAudio: true,
    });
  });

  it('falls back to the Volcengine Seedance 2 selector for non-embeddable footer models', () => {
    const defaults = getNewVideoPromptBarDefaults({
      ...baseSettings,
      falVideoModelId: KLING_V3_VIDEO_MODEL_ID,
      isSeedance2VideoModel: false,
    } as Parameters<typeof getNewVideoPromptBarDefaults>[0]);
    expect(defaults.modelId).toBe(SEEDANCE_2_VIDEO_MODEL_ID);
    expect(defaults.falOptions).toBeUndefined();
  });
});
