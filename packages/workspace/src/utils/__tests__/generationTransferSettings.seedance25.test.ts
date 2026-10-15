import { describe, expect, it } from 'vitest';
import {
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import {
  getGenerationTransferOptionDefaults,
  resolveGenerationTransferModelId,
  resolveGenerationTransferOptions,
} from '../generationTransferSettings';

describe('generationTransferSettings (Seedance 2.5)', () => {
  it('uses provider defaults when saved metadata is absent', () => {
    expect(getGenerationTransferOptionDefaults(FAL_SEEDANCE_25_VIDEO_MODEL_ID)).toEqual({
      seedance25Variant: 'reference',
      seedance25AspectRatio: 'adaptive',
      seedance25Resolution: '720p',
      seedance25Duration: 'auto',
      seedance25GenerateAudio: true,
    });
  });

  it('restores all saved Seedance 2.5 settings over defaults', () => {
    expect(resolveGenerationTransferOptions({
      kind: 'video',
      prompt: 'Restore me',
      provider: 'fal',
      modelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID,
      modelLabel: 'Seedance 2.5 (FAL)',
      modelMode: 'video',
      falOptions: {
        seedance25Variant: 'smart',
        seedance25AspectRatio: '9:16',
        seedance25Resolution: '480p',
        seedance25Duration: '30',
        seedance25GenerateAudio: false,
      },
    }, FAL_SEEDANCE_25_VIDEO_MODEL_ID)).toMatchObject({
      seedance25Variant: 'smart',
      seedance25AspectRatio: '9:16',
      seedance25Resolution: '480p',
      seedance25Duration: '30',
      seedance25GenerateAudio: false,
    });
  });

  it.each([
    JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
    JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  ])('preserves the Jimeng selector %s during transfer', modelId => {
    expect(resolveGenerationTransferModelId({
      kind: 'video',
      prompt: 'Restore Jimeng settings',
      provider: 'jimeng',
      modelId,
      modelMode: 'video',
    })).toBe(modelId);
  });

  it('keeps the Seedance 2 selector as the legacy Jimeng fallback', () => {
    expect(resolveGenerationTransferModelId({
      kind: 'video',
      prompt: 'Restore legacy Jimeng settings',
      provider: 'jimeng',
      modelMode: 'video',
    })).toBe(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID);
  });

  it('defaults the output format for Volcengine Seedance 2 transfers', () => {
    expect(getGenerationTransferOptionDefaults(SEEDANCE_2_VIDEO_MODEL_ID)).toMatchObject({
      seedance2VolcengineModel: 'standard',
      seedance2Duration: '5',
      seedance2OutputFormat: 'mp4',
    });
  });

  it.each([
    FAL_SEEDANCE_2_VIDEO_MODEL_ID,
    JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  ])('does not apply Volcengine-only defaults to %s transfers', modelId => {
    const defaults = getGenerationTransferOptionDefaults(modelId);

    expect(defaults.seedance2VolcengineModel).toBeUndefined();
    expect(defaults.seedance2OutputFormat).toBeUndefined();
  });

  it('restores saved Volcengine Seedance 2.5 transfer settings', () => {
    expect(resolveGenerationTransferOptions({
      kind: 'video',
      prompt: 'Restore 2.5 settings',
      provider: 'volcengine',
      modelId: SEEDANCE_2_VIDEO_MODEL_ID,
      modelMode: 'video',
      volcengineOptions: {
        seedance2Variant: 'smart',
        seedance2VolcengineModel: 'seedance25',
        seedance2AspectRatio: 'adaptive',
        seedance2Duration: 'auto',
        seedance2OutputFormat: 'mov',
      },
    }, SEEDANCE_2_VIDEO_MODEL_ID)).toMatchObject({
      seedance2VolcengineModel: 'seedance25',
      seedance2AspectRatio: 'adaptive',
      seedance2Duration: 'auto',
      seedance2OutputFormat: 'mov',
    });
  });
});
