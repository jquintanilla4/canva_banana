import { describe, expect, it } from 'vitest';
import { FLUX_3_VIDEO_MODEL_ID, FLUX_3_TEXT_TO_IMAGE_MODEL_ID, normalizeFalModelId } from '../../services/modelConfig';
import {
  getGenerationTransferOptionDefaults,
  resolveGenerationTransferOptions,
} from '../generationTransferSettings';

describe('generationTransferSettings (Flux 3 images)', () => {
  it.each([
    ['landscape_4_3', '4:3'],
    ['landscape_16_9', '16:9'],
    ['portrait_4_3', '3:4'],
    ['portrait_16_9', '9:16'],
    ['square', '1:1'],
    ['square_hd', '1:1'],
  ] as const)('migrates the legacy %s size to %s', (flux2MaxImageSize, expectedRatio) => {
    const modelId = normalizeFalModelId('fal-ai/flux-2-max');
    expect(modelId).toBe('blackforestlabs/flux-3/text-to-image');
    const restored = resolveGenerationTransferOptions({
      kind: 'text_to_image', prompt: 'Saved Flux image', provider: 'fal', modelId: 'fal-ai/flux-2-max',
      falOptions: { flux2MaxImageSize },
    }, modelId!);
    expect(restored).toMatchObject({ flux3ImageAspectRatio: expectedRatio, flux3ImageResolution: '1k', numImages: 1 });
  });

  it('keeps image and video dimensions separate when restoring explicit settings', () => {
    const restored = resolveGenerationTransferOptions({
      kind: 'image_edit', prompt: 'Saved Flux edit', provider: 'fal', modelId: 'blackforestlabs/flux-3/edit-image',
      falOptions: { flux3ImageAspectRatio: '5:7', flux3ImageResolution: '2k', flux3Resolution: '1080p', numImages: 4 },
    }, FLUX_3_TEXT_TO_IMAGE_MODEL_ID);
    expect(restored).toMatchObject({ flux3ImageAspectRatio: '5:7', flux3ImageResolution: '2k', numImages: 1 });
    expect(getGenerationTransferOptionDefaults(FLUX_3_TEXT_TO_IMAGE_MODEL_ID)).toMatchObject({
      flux3ImageAspectRatio: 'auto', flux3ImageResolution: '1k', numImages: 1,
    });
  });
});

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
