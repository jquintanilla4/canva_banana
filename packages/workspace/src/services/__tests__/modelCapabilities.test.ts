import { describe, expect, it } from 'vitest';
import { getModelUiCapabilities } from '../modelCapabilities';
import {
  FAL_IMAGE_MODEL_OPTIONS,
  FAL_VIDEO_MODEL_OPTIONS,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  CRYSTAL_UPSCALER_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  KREA_2_MAX_STYLE_REFERENCES,
  MINIMAX_H3_VIDEO_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SEEDREAM_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  GPT_IMAGE_2_EDIT_MODEL_ID,
  getMaxReferenceImages,
} from '../modelConfig';
import { SEEDANCE_REFERENCE_IMAGE_LIMIT } from '../../utils/seedanceReferences';
import { SEEDANCE25_REFERENCE_IMAGE_LIMIT } from '../../utils/seedance25References';

const ALL_MODEL_IDS = [
  ...FAL_IMAGE_MODEL_OPTIONS.map(option => option.value),
  ...FAL_VIDEO_MODEL_OPTIONS.map(option => option.value),
];

describe('getModelUiCapabilities', () => {
  it('resolves every registered model id without throwing', () => {
    for (const modelId of ALL_MODEL_IDS) {
      const caps = getModelUiCapabilities(modelId);
      expect(caps.id).toBe(modelId);
      expect(caps.maxReferenceImages).toBe(getMaxReferenceImages(modelId));
    }
  });

  it('routes backend-backed models to their provider', () => {
    expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID).provider).toBe('volcengine');
    expect(getModelUiCapabilities(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID).provider).toBe('jimeng');
    expect(getModelUiCapabilities(JIMENG_SEEDANCE_25_VIDEO_MODEL_ID).provider).toBe('jimeng');
    expect(getModelUiCapabilities(JIMENG_MULTIFRAME_VIDEO_MODEL_ID).provider).toBe('jimeng');
    expect(getModelUiCapabilities(FAL_SEEDANCE_2_VIDEO_MODEL_ID).provider).toBe('fal');
    expect(getModelUiCapabilities(SEEDREAM_MODEL_ID).provider).toBe('fal');
  });

  describe('supportsTailFrame truth table', () => {
    const cases: Array<[string, Parameters<typeof getModelUiCapabilities>[1], boolean]> = [
      [KLING_VIDEO_MODEL_ID, { klingVariant: 'standard' }, false],
      [KLING_VIDEO_MODEL_ID, { klingVariant: 'pro' }, true],
      [KLING_V3_VIDEO_MODEL_ID, {}, true],
      [KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'reference' }, true],
      [KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'edit' }, false],
      [VEO_31_IMAGE_TO_VIDEO_MODEL_ID, { veo31Variant: 'i2v-fflf' }, true],
      [VEO_31_IMAGE_TO_VIDEO_MODEL_ID, { veo31Variant: 'extend' }, false],
      [WAN_27_VIDEO_MODEL_ID, { wan27VideoVariant: 'smart' }, true],
      [WAN_27_VIDEO_MODEL_ID, { wan27VideoVariant: 'reference' }, false],
      [WAN_27_VIDEO_MODEL_ID, { wan27VideoVariant: 'edit' }, false],
      [SEEDANCE_15_VIDEO_MODEL_ID, {}, true],
      [MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'standard' }, true],
      [MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'reference' }, false],
      [FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'first-last-frame' }, true],
      [FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'smart' }, false],
      [FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'keyframes' }, false],
      [FAL_SEEDANCE_25_VIDEO_MODEL_ID, { seedance25Variant: 'smart' }, true],
      [FAL_SEEDANCE_25_VIDEO_MODEL_ID, { seedance25Variant: 'reference' }, false],
      [SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }, true],
      [SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference' }, false],
      [FAL_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }, true],
      [JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }, true],
      [SCAIL_VIDEO_MODEL_ID, {}, false],
      [INFINITALK_VIDEO_MODEL_ID, {}, false],
      [WAN_ANIMATE_MODEL_ID, {}, false],
      [JIMENG_MULTIFRAME_VIDEO_MODEL_ID, {}, false],
    ];
    it.each(cases)('%s %o -> %s', (modelId, ctx, expected) => {
      expect(getModelUiCapabilities(modelId, ctx).supportsTailFrame).toBe(expected);
    });
  });

  describe('reference limit toasts', () => {
    it('keeps the model-specific toast copy', () => {
      expect(getModelUiCapabilities(GROK_IMAGINE_IMAGE_MODEL_ID).referenceLimitToast?.(0)).toEqual({
        message: 'Grok Imagine supports only 1 image total. Shift-click reference images aren\'t supported.',
        durationMs: 4000,
      });
      expect(getModelUiCapabilities(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID).referenceLimitToast?.(3)).toEqual({
        message: 'Wan 2.7 Pro Image supports up to 4 images total (1 primary + 3 references). Use @Image1, @Image2, etc. in your prompt to reference them.',
        durationMs: 4000,
      });
      expect(getModelUiCapabilities(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID).referenceLimitToast?.(10)).toEqual({
        message: `Krea 2 Large supports up to ${KREA_2_MAX_STYLE_REFERENCES} style references.`,
        durationMs: 4000,
      });
    });

    it('varies Kling O3 copy by variant and reports remaining slots', () => {
      const referenceToast = getModelUiCapabilities(KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'reference' }).referenceLimitToast?.(2);
      expect(referenceToast).toEqual({
        message: 'Kling O3 Reference supports up to 5 images total (source + references + elements). Slots remaining: 2 for references/elements.',
        durationMs: 2000,
      });
      const editToast = getModelUiCapabilities(KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'edit' }).referenceLimitToast?.(-1);
      expect(editToast).toEqual({
        message: 'Kling O3 Edit supports up to 5 images total (source + references + elements). Slots remaining: 0 for references/elements.',
        durationMs: 2000,
      });
    });

    it('switches GPT Image 2 copy on the annotate slot offset', () => {
      const toast = getModelUiCapabilities(GPT_IMAGE_2_EDIT_MODEL_ID).referenceLimitToast;
      expect(toast?.(8)?.message).toBe('GPT Image 2 annotate supports up to 8 references because the annotation canvas counts as an input.');
      expect(toast?.(9)?.message).toBe('GPT Image 2 supports up to 10 images total (1 primary + 9 references).');
    });

    it('only claims the Seedream 4.5 cap when the limit is high enough', () => {
      const toast = getModelUiCapabilities(SEEDREAM_V45_MODEL_ID).referenceLimitToast;
      expect(toast?.(10)).toEqual({ message: 'Seedream 4.5 only accepts up to 10 reference images.', durationMs: 2000 });
      expect(toast?.(9)).toBeNull(); // Falls back to the generic copy.
    });

    it('warns that MiniMax H3 and Seedance smart modes drop tagged references', () => {
      expect(getModelUiCapabilities(MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'reference' }).referenceLimitToast?.(0)?.message)
        .toBe(`MiniMax H3 Reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} image references.`);
      expect(getModelUiCapabilities(MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'standard' }).referenceLimitToast?.(0)?.message)
        .toBe('MiniMax H3 Standard does not use references. Tagged references were cleared.');
      expect(getModelUiCapabilities(FAL_SEEDANCE_25_VIDEO_MODEL_ID, { seedance25Variant: 'reference' }).referenceLimitToast?.(0)?.message)
        .toBe(`Seedance 2.5 Reference supports up to ${SEEDANCE25_REFERENCE_IMAGE_LIMIT} image references.`);
      expect(getModelUiCapabilities(FAL_SEEDANCE_25_VIDEO_MODEL_ID, { seedance25Variant: 'smart' }).referenceLimitToast?.(0)?.message)
        .toBe('Seedance 2.5 Smart doesn\'t use references — tagged references were removed. Switch to Reference mode to use them.');
      expect(getModelUiCapabilities(FAL_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }).referenceLimitToast?.(0)?.message)
        .toBe('Seedance 2 Smart doesn\'t use references — tagged references were removed. Switch to Reference mode to use them.');
      // Non-smart FAL Seedance 2 and the Volcengine selector fall back to the generic copy.
      expect(getModelUiCapabilities(FAL_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference' }).referenceLimitToast).toBeNull();
      expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }).referenceLimitToast).toBeNull();
    });
  });

  describe('prompt placeholders', () => {
    it('covers the Flux 3 variants', () => {
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'extend' }).promptPlaceholder)
        .toBe('Flux 3 Extend: select one video as @Video1 and describe how it should continue... (Cmd/Ctrl + Enter to generate)');
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'first-last-frame' }).promptPlaceholder)
        .toBe('Flux 3 First & Last Frame: select a first image and shift-click a last image, then describe the transition... (Cmd/Ctrl + Enter to generate)');
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'smart', hasActivePrimaryImage: true }).promptPlaceholder)
        .toBe('Flux 3 Smart Mode: describe how @Image1 should move... (Cmd/Ctrl + Enter to generate)');
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'smart' }).promptPlaceholder)
        .toBe('Flux 3 Smart Mode: describe a video, or select one still image for image-to-video... (Cmd/Ctrl + Enter to generate)');
      // A selected-but-unusable primary defers to the guards' explanation.
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'smart', hasPrimarySelection: true, hasActivePrimaryImage: false }).promptPlaceholder)
        .toBeNull();
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'keyframes' }).promptPlaceholder)
        .toContain('Flux 3 Keyframes: select or shift-click up to ');
    });

    it('labels the Volcengine Seedance selector by sub-model', () => {
      expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference', seedance2VolcengineModel: 'seedance25' }).promptPlaceholder)
        .toContain('Seedance 2.5 Reference:');
      expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference', seedance2VolcengineModel: 'standard' }).promptPlaceholder)
        .toContain('Seedance 2 Reference:');
      expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'edit' }).promptPlaceholder)
        .toBe('Seedance 2 Edit: select a video to edit (@Video1), optionally tag @Image/@Audio replacement clips, then describe the changes... (Cmd/Ctrl + Enter to generate)');
      // The FAL selector never adopts the 2.5 label.
      expect(getModelUiCapabilities(FAL_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference', seedance2VolcengineModel: 'seedance25' }).promptPlaceholder)
        .toContain('Seedance 2 Reference:');
    });

    it('uses JM CLI labels for the Jimeng Seedance selector', () => {
      expect(getModelUiCapabilities(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference' }).promptPlaceholder)
        .toContain('Seedance 2 (JM CLI) Reference:');
      expect(getModelUiCapabilities(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }).promptPlaceholder)
        .toBe('Seedance 2 (JM CLI) Smart: write a prompt for text-to-video, select a first frame, or Shift-click a second still image for the ending frame... (Cmd/Ctrl + Enter to generate)');
    });

    it('falls back to the guards placeholder for models without bespoke copy', () => {
      expect(getModelUiCapabilities(KLING_V3_VIDEO_MODEL_ID).promptPlaceholder).toBeNull();
      expect(getModelUiCapabilities(SEEDREAM_MODEL_ID).promptPlaceholder).toBeNull();
    });
  });

  it('gates annotate mode for video, Flux 2 Max, and upscalers', () => {
    expect(getModelUiCapabilities(SEEDREAM_MODEL_ID).supportsAnnotate).toBe(true);
    expect(getModelUiCapabilities(FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID).supportsAnnotate).toBe(false);
    expect(getModelUiCapabilities(CRYSTAL_UPSCALER_MODEL_ID).supportsAnnotate).toBe(false);
    expect(getModelUiCapabilities(SEEDVR_UPSCALER_MODEL_ID).supportsAnnotate).toBe(false);
    for (const option of FAL_VIDEO_MODEL_OPTIONS) {
      expect(getModelUiCapabilities(option.value).supportsAnnotate).toBe(false);
    }
  });

  it('enables camera settings only for Seedream and Nano Banana', () => {
    expect(getModelUiCapabilities(SEEDREAM_MODEL_ID).supportsCameraSettings).toBe(true);
    expect(getModelUiCapabilities(SEEDREAM_V45_MODEL_ID).supportsCameraSettings).toBe(true);
    expect(getModelUiCapabilities(GROK_IMAGINE_IMAGE_MODEL_ID).supportsCameraSettings).toBe(false);
    expect(getModelUiCapabilities(WAN_27_VIDEO_MODEL_ID).supportsCameraSettings).toBe(false);
  });

  it('shows the negative prompt for exactly the models that use one', () => {
    for (const modelId of [WAN_VISION_ENHANCER_MODEL_ID, WAN_27_VIDEO_MODEL_ID, KLING_VIDEO_MODEL_ID, KLING_V3_VIDEO_MODEL_ID, VEO_31_IMAGE_TO_VIDEO_MODEL_ID, WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID]) {
      expect(getModelUiCapabilities(modelId).showNegativePrompt).toBe(true);
    }
    expect(getModelUiCapabilities(MINIMAX_H3_VIDEO_MODEL_ID).showNegativePrompt).toBe(false);
    expect(getModelUiCapabilities(SEEDREAM_MODEL_ID).showNegativePrompt).toBe(false);
  });

  it('enables kling suggestions for @-mention models including multimodal reference modes', () => {
    expect(getModelUiCapabilities(KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'edit' }).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'smart' }).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'reference' }).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'edit' }).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(FAL_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'smart' }).klingSuggestionsEnabled).toBe(false);
    expect(getModelUiCapabilities(MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'reference' }).klingSuggestionsEnabled).toBe(true);
    expect(getModelUiCapabilities(MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'standard' }).klingSuggestionsEnabled).toBe(false);
    expect(getModelUiCapabilities(KLING_V3_VIDEO_MODEL_ID).klingSuggestionsEnabled).toBe(false);
  });

  describe('selection affordance flags', () => {
    it('marks the canvas input modes per model', () => {
      expect(getModelUiCapabilities(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID).selection.krea2StyleReferenceMode).toBe(true);
      expect(getModelUiCapabilities(KLING_V3_CONTROL_VIDEO_MODEL_ID).selection.klingV3ControlVideoInputMode).toBe(true);
      expect(getModelUiCapabilities(SEEDANCE_15_VIDEO_MODEL_ID).selection.seedance15FflfMode).toBe(true);
      expect(getModelUiCapabilities(WAN_ANIMATE_MODEL_ID).selection.wanAnimateVideoInputMode).toBe(true);
      expect(getModelUiCapabilities(SCAIL_VIDEO_MODEL_ID).selection.wanAnimateVideoInputMode).toBe(true);
      expect(getModelUiCapabilities(WAN_27_VIDEO_MODEL_ID).selection.wan27VideoMode).toBe(true);
      expect(getModelUiCapabilities(VEO_31_IMAGE_TO_VIDEO_MODEL_ID, { veo31Variant: 'extend' }).selection.veo31ExtendMode).toBe(true);
      expect(getModelUiCapabilities(KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'edit' }).selection.klingO3VideoInputMode).toBe(true);
      expect(getModelUiCapabilities(KLING_O3_VIDEO_MODEL_ID, { klingO3Variant: 'reference' }).selection.klingO3ReferenceMode).toBe(true);
    });

    it('derives multimodal reference mode from the variant flags', () => {
      expect(getModelUiCapabilities(SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'extend' }).selection.multimodalReferenceMode).toBe(true);
      expect(getModelUiCapabilities(FAL_SEEDANCE_2_VIDEO_MODEL_ID, { seedance2Variant: 'edit' }).selection.multimodalReferenceMode).toBe(false); // Edit/Extend stay Volcengine-only.
      expect(getModelUiCapabilities(FAL_SEEDANCE_25_VIDEO_MODEL_ID, { seedance25Variant: 'reference' }).selection.multimodalReferenceMode).toBe(true);
      expect(getModelUiCapabilities(MINIMAX_H3_VIDEO_MODEL_ID, { miniMaxH3Variant: 'reference' }).selection.multimodalReferenceMode).toBe(true);
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'keyframes' }).selection.multimodalReferenceMode).toBe(true);
      expect(getModelUiCapabilities(FLUX_3_VIDEO_MODEL_ID, { flux3Variant: 'smart' }).selection.multimodalReferenceMode).toBe(false);
    });
  });
});
