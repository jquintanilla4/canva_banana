import { describe, expect, it } from 'vitest';
import { FAL_SEEDANCE_25_VIDEO_MODEL_ID } from '../../services/modelConfig';
import {
  getGenerationTransferOptionDefaults,
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
});
