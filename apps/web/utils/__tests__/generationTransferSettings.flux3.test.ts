import { describe, expect, it } from 'vitest';
import { FLUX_3_VIDEO_MODEL_ID } from '../../services/modelConfig';
import {
  getGenerationTransferOptionDefaults,
  resolveGenerationTransferOptions,
} from '../generationTransferSettings';

describe('generationTransferSettings (Flux 3)', () => {
  it.each([
    ['smart', 'auto'],
    ['first-last-frame', '5'],
    ['keyframes', '5'],
    ['extend', 'auto'],
  ] as const)('defaults %s transfers to a valid duration', (variant, expectedDuration) => {
    const defaults = getGenerationTransferOptionDefaults(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: variant });

    expect(defaults.flux3Variant).toBe(variant);
    expect(defaults.flux3Duration).toBe(expectedDuration);
  });
  it('normalizes a saved Auto duration when restoring Keyframes', () => {
    const options = resolveGenerationTransferOptions({
      kind: 'video',
      prompt: 'Restore Flux keyframes',
      provider: 'fal',
      modelId: FLUX_3_VIDEO_MODEL_ID,
      modelMode: 'video',
      falOptions: {
        flux3Variant: 'keyframes',
        flux3Duration: 'auto',
      },
    }, FLUX_3_VIDEO_MODEL_ID);

    expect(options.flux3Variant).toBe('keyframes');
    expect(options.flux3Duration).toBe('5');
  });


  it('preserves an explicit saved Keyframes duration over its mode default', () => {
    const options = resolveGenerationTransferOptions({
      kind: 'video',
      prompt: 'Restore Flux keyframes',
      provider: 'fal',
      modelId: FLUX_3_VIDEO_MODEL_ID,
      modelMode: 'video',
      falOptions: {
        flux3Variant: 'keyframes',
        flux3Duration: '10',
      },
    }, FLUX_3_VIDEO_MODEL_ID);

    expect(options.flux3Variant).toBe('keyframes');
    expect(options.flux3Duration).toBe('10');
  });
});
