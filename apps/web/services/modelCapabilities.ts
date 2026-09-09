import {
  FAL_VIDEO_MODEL_OPTIONS,
  FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID,
  FLUX_3_VIDEO_MODEL_ID,
  CRYSTAL_UPSCALER_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  JIMENG_MULTIFRAME_MAX_IMAGES,
  JIMENG_MULTIFRAME_MIN_IMAGES,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KREA_2_MAX_STYLE_REFERENCES,
  MINIMAX_H3_VIDEO_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SEEDREAM_V45_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  getMaxReferenceImages,
  isGptImage2EditModelId,
  isGptImage25Model,
  isKlingO3VideoModelId,
  isKrea2LargeModel as isKrea2LargeModelId,
  isNanoBananaEditModelId,
  isSeedreamModelId,
  type FalModelId,
  type KlingO3Variant,
  type KlingVariant,
  type Veo31Variant,
} from './modelConfig';
import type {
  Flux3Variant,
  GenerationProviderId,
  MiniMaxH3Variant,
  Seedance25Variant,
  Seedance2Variant,
  Seedance2VolcengineModel,
  Wan27VideoVariant,
} from '../types';
import { getFlux3ModePolicy } from '../utils/flux3';
import { getEmbeddedVideoProvider } from '../utils/embeddedVideoRouting';
import {
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
  getSeedance2VolcengineReferenceLimits,
} from '../utils/seedanceReferences';
import {
  SEEDANCE25_REFERENCE_AUDIO_LIMIT,
  SEEDANCE25_REFERENCE_IMAGE_LIMIT,
  SEEDANCE25_REFERENCE_VIDEO_LIMIT,
} from '../utils/seedance25References';

// -----------------------------------------------------------------------------------
// Per-model UI capability registry.
//
// One rule per model (or model family) declares every model-conditional UI behavior
// that used to be special-cased across App.tsx: tail-frame support, reference-limit
// toast copy, prompt placeholder, annotate/camera gates, negative-prompt visibility,
// and the canvas selection affordance flags. Adding a model means adding ONE rule
// here instead of editing scattered if-chains.
//
// This registry covers the UI-affordance layer only. Media roles and per-area limits
// stay in VideoModelCapabilityProfile (utils/videoPromptAreas.ts) — compose, don't
// duplicate.
// -----------------------------------------------------------------------------------

// Mode/variant state that refines a model's capabilities, mirroring the falOptions
// argument of getVideoPromptAreaCapabilityProfile.
export type ModelUiCapabilityContext = {
  klingVariant?: KlingVariant;
  klingO3Variant?: KlingO3Variant;
  veo31Variant?: Veo31Variant;
  wan27VideoVariant?: Wan27VideoVariant;
  miniMaxH3Variant?: MiniMaxH3Variant;
  flux3Variant?: Flux3Variant;
  seedance2Variant?: Seedance2Variant;
  seedance25Variant?: Seedance25Variant;
  seedance2VolcengineModel?: Seedance2VolcengineModel;
  hasActivePrimaryImage?: boolean;
  hasPrimarySelection?: boolean; // A primary selection exists (any media type), even if it is not a usable start image.
};

// Canvas selection affordances plus the multimodal-reference derivation flags.
export type ModelUiSelectionFlags = {
  krea2StyleReferenceMode: boolean;
  klingO3VideoInputMode: boolean; // Kling O3 Edit takes a source video.
  klingO3ReferenceMode: boolean;
  seedance15FflfMode: boolean;
  klingV3ControlVideoInputMode: boolean;
  veo31ExtendMode: boolean;
  veo31TailCapable: boolean;
  wanAnimateVideoInputMode: boolean;
  wan27VideoMode: boolean;
  wan27ReferenceMode: boolean;
  wan27EditMode: boolean;
  seedance2ReferenceMode: boolean;
  seedance25ReferenceMode: boolean;
  miniMaxH3ReferenceMode: boolean;
  miniMaxH3StandardMode: boolean;
  flux3KeyframesMode: boolean;
  flux3FflfMode: boolean;
  multimodalReferenceMode: boolean; // Derived: any mode that merges selected + tagged refs under @-labels.
};

export type ModelReferenceLimitToast = { message: string; durationMs: number };

export type ModelUiCapabilities = {
  id: string;
  provider: GenerationProviderId; // Which backend serves this model ('fal' for everything Fal-hosted).
  supportsTailFrame: boolean;
  maxReferenceImages: number;
  // null → caller shows the generic reference-limit copy.
  referenceLimitToast: ((maxReferenceImages: number) => ModelReferenceLimitToast | null) | null;
  // null → caller falls back to the guards' placeholder text.
  promptPlaceholder: string | null;
  supportsAnnotate: boolean;
  supportsCameraSettings: boolean;
  klingSuggestionsEnabled: boolean;
  showNegativePrompt: boolean;
  selection: ModelUiSelectionFlags;
};

const DEFAULT_SELECTION: ModelUiSelectionFlags = {
  krea2StyleReferenceMode: false,
  klingO3VideoInputMode: false,
  klingO3ReferenceMode: false,
  seedance15FflfMode: false,
  klingV3ControlVideoInputMode: false,
  veo31ExtendMode: false,
  veo31TailCapable: false,
  wanAnimateVideoInputMode: false,
  wan27VideoMode: false,
  wan27ReferenceMode: false,
  wan27EditMode: false,
  seedance2ReferenceMode: false,
  seedance25ReferenceMode: false,
  miniMaxH3ReferenceMode: false,
  miniMaxH3StandardMode: false,
  flux3KeyframesMode: false,
  flux3FflfMode: false,
  multimodalReferenceMode: false,
};

type CapabilityPatch = Partial<Omit<ModelUiCapabilities, 'selection'>> & {
  selection?: Partial<ModelUiSelectionFlags>;
};

type ModelUiCapabilityRule = {
  // Which model ids this rule covers: an explicit list or an existing modelConfig predicate.
  matches: readonly string[] | ((modelId: string) => boolean);
  base?: CapabilityPatch;
  resolve?: (ctx: ModelUiCapabilityContext, modelId: string) => CapabilityPatch;
};

const GENERATE_SUFFIX = '(Cmd/Ctrl + Enter to generate)';

// Seedance reference-mode placeholder shared by every model that labels merged refs.
const referencePlaceholder = (modelLabel: string, images: number, videos: number, audios: number): string =>
  `${modelLabel} Reference: select or shift-click up to ${images} images, ${videos} videos, and ${audios} audio clips to label them as @Image1, @Video1, or @Audio1, then describe the scene... ${GENERATE_SUFFIX}`;

const MODEL_UI_CAPABILITY_RULES: readonly ModelUiCapabilityRule[] = [
  // ---- Image models -------------------------------------------------------------
  {
    matches: (modelId) => isSeedreamModelId(modelId as FalModelId) || isNanoBananaEditModelId(modelId),
    base: { supportsCameraSettings: true },
    resolve: (_ctx, modelId) => (
      modelId === SEEDREAM_V45_MODEL_ID
        ? {
          referenceLimitToast: (max) => (max >= 10
            ? { message: 'Seedream 4.5 only accepts up to 10 reference images.', durationMs: 2000 }
            : null),
        }
        : {}
    ),
  },
  {
    matches: [GROK_IMAGINE_IMAGE_MODEL_ID],
    base: {
      referenceLimitToast: () => ({
        message: 'Grok Imagine supports only 1 image total. Shift-click reference images aren\'t supported.',
        durationMs: 4000,
      }),
    },
  },
  {
    matches: [WAN_27_IMAGE_TEXT_TO_IMAGE_MODEL_ID],
    base: {
      klingSuggestionsEnabled: true,
      showNegativePrompt: true,
      promptPlaceholder: `Describe your generation, or your edit, or use @ to reference images (4 images in total)... ${GENERATE_SUFFIX}`,
      referenceLimitToast: () => ({
        message: 'Wan 2.7 Pro Image supports up to 4 images total (1 primary + 3 references). Use @Image1, @Image2, etc. in your prompt to reference them.',
        durationMs: 4000,
      }),
    },
  },
  {
    matches: (modelId) => isGptImage25Model(modelId),
    base: {
      referenceLimitToast: (max) => ({
        message: max <= 14
          ? 'GPT Image 2.5 annotate supports up to 14 references because the annotation canvas counts as an input.'
          : 'GPT Image 2.5 supports up to 16 images total (1 primary + 15 references).',
        durationMs: 4000,
      }),
    },
  },
  {
    matches: (modelId) => isGptImage2EditModelId(modelId),
    base: {
      referenceLimitToast: (max) => ({
        message: max <= 8
          ? 'GPT Image 2 annotate supports up to 8 references because the annotation canvas counts as an input.'
          : 'GPT Image 2 supports up to 10 images total (1 primary + 9 references).',
        durationMs: 4000,
      }),
    },
  },
  {
    matches: (modelId) => isKrea2LargeModelId(modelId),
    base: {
      selection: { krea2StyleReferenceMode: true },
      referenceLimitToast: () => ({
        message: `Krea 2 Large supports up to ${KREA_2_MAX_STYLE_REFERENCES} style references.`,
        durationMs: 4000,
      }),
    },
  },
  {
    matches: [FLUX2_MAX_TEXT_TO_IMAGE_MODEL_ID],
    base: {
      supportsAnnotate: false,
      klingSuggestionsEnabled: true,
      promptPlaceholder: `Describe your generation, use @ to reference images and elements(objects and characters)... ${GENERATE_SUFFIX}`,
    },
  },
  {
    matches: [CRYSTAL_UPSCALER_MODEL_ID, SEEDVR_UPSCALER_MODEL_ID],
    base: { supportsAnnotate: false },
  },
  // ---- Video models -------------------------------------------------------------
  {
    matches: [KLING_VIDEO_MODEL_ID],
    base: { showNegativePrompt: true },
    resolve: (ctx) => ({ supportsTailFrame: ctx.klingVariant === 'pro' }),
  },
  {
    matches: [KLING_V3_VIDEO_MODEL_ID],
    base: { supportsTailFrame: true, showNegativePrompt: true },
  },
  {
    matches: (modelId) => isKlingO3VideoModelId(modelId),
    base: { klingSuggestionsEnabled: true },
    resolve: (ctx) => {
      const isReferenceMode = ctx.klingO3Variant === 'reference';
      const variantLabel = ctx.klingO3Variant === 'edit' ? 'Kling O3 Edit' : 'Kling O3 Reference';
      return {
        supportsTailFrame: isReferenceMode,
        promptPlaceholder: isReferenceMode
          ? 'Kling O3 Reference: click a start image, Shift-click an end image, Option/Alt-click elements (@Element1), Option/Alt+Shift-click reference images (@Image1)...'
          : `Kling O3 Edit: click a source video, Option/Alt-click elements, Shift-click reference images, then describe the edit... ${GENERATE_SUFFIX}`,
        referenceLimitToast: (max) => ({
          message: `${variantLabel} supports up to 5 images total (source + references + elements). Slots remaining: ${Math.max(0, max)} for references/elements.`,
          durationMs: 2000,
        }),
        selection: {
          klingO3VideoInputMode: ctx.klingO3Variant === 'edit',
          klingO3ReferenceMode: isReferenceMode,
        },
      };
    },
  },
  {
    matches: [KLING_V3_CONTROL_VIDEO_MODEL_ID],
    base: { selection: { klingV3ControlVideoInputMode: true } },
  },
  {
    matches: [VEO_31_IMAGE_TO_VIDEO_MODEL_ID],
    base: { showNegativePrompt: true },
    resolve: (ctx) => ({
      supportsTailFrame: ctx.veo31Variant === 'i2v-fflf',
      selection: {
        veo31TailCapable: ctx.veo31Variant === 'i2v-fflf',
        veo31ExtendMode: ctx.veo31Variant === 'extend',
      },
    }),
  },
  {
    matches: [WAN_27_VIDEO_MODEL_ID],
    base: { showNegativePrompt: true, selection: { wan27VideoMode: true } },
    resolve: (ctx) => ({
      // Wan Reference labels tagged refs and Wan Edit takes a source video; neither takes an end frame.
      supportsTailFrame: ctx.wan27VideoVariant !== 'reference' && ctx.wan27VideoVariant !== 'edit',
      selection: {
        wan27ReferenceMode: ctx.wan27VideoVariant === 'reference',
        wan27EditMode: ctx.wan27VideoVariant === 'edit',
      },
    }),
  },
  {
    matches: [WAN_VISION_ENHANCER_MODEL_ID],
    base: { showNegativePrompt: true },
  },
  {
    matches: [WAN_ANIMATE_MODEL_ID, SCAIL_VIDEO_MODEL_ID],
    base: { selection: { wanAnimateVideoInputMode: true } },
  },
  {
    matches: [SEEDANCE_15_VIDEO_MODEL_ID],
    base: { supportsTailFrame: true, selection: { seedance15FflfMode: true } },
  },
  {
    matches: [MINIMAX_H3_VIDEO_MODEL_ID],
    resolve: (ctx) => {
      const isReferenceMode = ctx.miniMaxH3Variant === 'reference';
      return {
        supportsTailFrame: ctx.miniMaxH3Variant === 'standard',
        promptPlaceholder: isReferenceMode
          ? referencePlaceholder('MiniMax H3', SEEDANCE_REFERENCE_IMAGE_LIMIT, SEEDANCE_REFERENCE_VIDEO_LIMIT, SEEDANCE_REFERENCE_AUDIO_LIMIT)
          : ctx.hasActivePrimaryImage
            ? `MiniMax H3 Standard: describe the motion, or shift-click another still image to set the end frame... ${GENERATE_SUFFIX}`
            : `MiniMax H3 Standard: describe the video, or select an image for image-to-video... ${GENERATE_SUFFIX}`,
        referenceLimitToast: () => (isReferenceMode
          ? { message: `MiniMax H3 Reference supports up to ${SEEDANCE_REFERENCE_IMAGE_LIMIT} image references.`, durationMs: 4000 }
          : { message: 'MiniMax H3 Standard does not use references. Tagged references were cleared.', durationMs: 4000 }), // Standard runs drop them at submit, so say so up front.
        selection: {
          miniMaxH3ReferenceMode: isReferenceMode,
          miniMaxH3StandardMode: ctx.miniMaxH3Variant === 'standard',
        },
      };
    },
  },
  {
    matches: [FLUX_3_VIDEO_MODEL_ID],
    base: { klingSuggestionsEnabled: true },
    resolve: (ctx) => {
      const policy = getFlux3ModePolicy(ctx.flux3Variant ?? 'smart');
      const placeholder = policy.inputKind === 'optional-start-image' && ctx.hasPrimarySelection && !ctx.hasActivePrimaryImage
        ? null // A selected-but-unusable primary falls back to the guards' explanation text.
        : policy.inputKind === 'source-video'
          ? `Flux 3 Extend: select one video as @Video1 and describe how it should continue... ${GENERATE_SUFFIX}`
          : policy.inputKind === 'keyframe-images'
            ? `Flux 3 Keyframes: select or shift-click up to ${policy.maxImages} still images as @Image1, @Image2, and so on, set their timing, then describe the shot... ${GENERATE_SUFFIX}`
            : policy.inputKind === 'first-last-images'
              ? `Flux 3 First & Last Frame: select a first image and shift-click a last image, then describe the transition... ${GENERATE_SUFFIX}`
              : ctx.hasActivePrimaryImage
                ? `Flux 3 Smart Mode: describe how @Image1 should move... ${GENERATE_SUFFIX}`
                : `Flux 3 Smart Mode: describe a video, or select one still image for image-to-video... ${GENERATE_SUFFIX}`;
      return {
        supportsTailFrame: ctx.flux3Variant === 'first-last-frame',
        promptPlaceholder: placeholder,
        selection: {
          flux3KeyframesMode: ctx.flux3Variant === 'keyframes',
          flux3FflfMode: ctx.flux3Variant === 'first-last-frame',
        },
      };
    },
  },
  {
    matches: [JIMENG_MULTIFRAME_VIDEO_MODEL_ID],
    base: {
      promptPlaceholder: `Jimeng Multi-frame: select ${JIMENG_MULTIFRAME_MIN_IMAGES}–${JIMENG_MULTIFRAME_MAX_IMAGES} still images in story order. For 2 images, describe the transition; for 3+, separate each transition prompt with ||. ${GENERATE_SUFFIX}`,
    },
  },
  {
    matches: [FAL_SEEDANCE_25_VIDEO_MODEL_ID, JIMENG_SEEDANCE_25_VIDEO_MODEL_ID],
    resolve: (ctx) => {
      const isReferenceMode = ctx.seedance25Variant === 'reference';
      return {
        supportsTailFrame: ctx.seedance25Variant === 'smart',
        promptPlaceholder: isReferenceMode
          ? referencePlaceholder('Seedance 2.5', SEEDANCE25_REFERENCE_IMAGE_LIMIT, SEEDANCE25_REFERENCE_VIDEO_LIMIT, SEEDANCE25_REFERENCE_AUDIO_LIMIT)
          : `Seedance 2.5 Smart: write a prompt for text-to-video, or select an image to use as the first frame. Shift-click another still image to mark an end frame... ${GENERATE_SUFFIX}`,
        referenceLimitToast: () => (isReferenceMode
          ? { message: `Seedance 2.5 Reference supports up to ${SEEDANCE25_REFERENCE_IMAGE_LIMIT} image references.`, durationMs: 4000 }
          : { message: 'Seedance 2.5 Smart doesn\'t use references — tagged references were removed. Switch to Reference mode to use them.', durationMs: 4000 }), // Smart runs drop them at submit, so say so up front.
        selection: { seedance25ReferenceMode: isReferenceMode },
      };
    },
  },
  {
    matches: [JIMENG_SEEDANCE_2_VIDEO_MODEL_ID],
    resolve: (ctx) => ({
      supportsTailFrame: ctx.seedance2Variant === 'smart',
      promptPlaceholder: ctx.seedance2Variant === 'reference'
        ? referencePlaceholder('Seedance 2 (JM CLI)', SEEDANCE_REFERENCE_IMAGE_LIMIT, SEEDANCE_REFERENCE_VIDEO_LIMIT, SEEDANCE_REFERENCE_AUDIO_LIMIT)
        : `Seedance 2 (JM CLI) Smart: write a prompt for text-to-video, select a first frame, or Shift-click a second still image for the ending frame... ${GENERATE_SUFFIX}`,
      selection: { seedance2ReferenceMode: ctx.seedance2Variant === 'reference' },
    }),
  },
  {
    matches: [SEEDANCE_2_VIDEO_MODEL_ID, FAL_SEEDANCE_2_VIDEO_MODEL_ID],
    resolve: (ctx, modelId) => {
      const isVolcengineSelector = modelId === SEEDANCE_2_VIDEO_MODEL_ID;
      // Only the Volcengine selector can opt into the larger Seedance 2.5 reference envelope.
      const limits = getSeedance2VolcengineReferenceLimits(isVolcengineSelector ? (ctx.seedance2VolcengineModel ?? 'standard') : 'standard');
      const modelLabel = isVolcengineSelector && ctx.seedance2VolcengineModel === 'seedance25' ? 'Seedance 2.5' : 'Seedance 2';
      return {
        supportsTailFrame: ctx.seedance2Variant === 'smart',
        promptPlaceholder: ctx.seedance2Variant === 'edit'
          ? `Seedance 2 Edit: select a video to edit (@Video1), optionally tag @Image/@Audio replacement clips, then describe the changes... ${GENERATE_SUFFIX}`
          : ctx.seedance2Variant === 'extend'
            ? `${modelLabel} Extend: select up to ${limits.videos} video clips and describe how to chain them, e.g. "@Video1 followed by @Video2", or extend @Video1 forward or backward... ${GENERATE_SUFFIX}`
            : ctx.seedance2Variant === 'reference'
              ? referencePlaceholder(modelLabel, limits.images, limits.videos, limits.audios)
              : `Seedance 2 Smart: write a prompt for text-to-video, or select an image to use as the first frame. Shift-click another still image to mark an end frame... ${GENERATE_SUFFIX}`,
        referenceLimitToast: modelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID && ctx.seedance2Variant === 'smart'
          ? () => ({ message: 'Seedance 2 Smart doesn\'t use references — tagged references were removed. Switch to Reference mode to use them.', durationMs: 4000 }) // FAL Smart runs drop them at submit, so say so up front.
          : null,
        selection: {
          // Seedance multimodal modes label the merged selected and tagged refs; Edit/Extend stay Volcengine-only.
          seedance2ReferenceMode: ctx.seedance2Variant === 'reference'
            || (isVolcengineSelector && (ctx.seedance2Variant === 'edit' || ctx.seedance2Variant === 'extend')),
        },
      };
    },
  },
];

const isVideoModelId = (modelId: string): boolean =>
  FAL_VIDEO_MODEL_OPTIONS.some(option => option.value === modelId);

const ruleMatches = (rule: ModelUiCapabilityRule, modelId: string): boolean => (
  typeof rule.matches === 'function' ? rule.matches(modelId) : rule.matches.includes(modelId)
);

export const getModelUiCapabilities = (
  modelId: string,
  ctx: ModelUiCapabilityContext = {},
): ModelUiCapabilities => {
  const rule = MODEL_UI_CAPABILITY_RULES.find(candidate => ruleMatches(candidate, modelId));
  const base = rule?.base ?? {};
  const resolved = rule?.resolve?.(ctx, modelId) ?? {};
  const selection: ModelUiSelectionFlags = {
    ...DEFAULT_SELECTION,
    ...base.selection,
    ...resolved.selection,
  };
  selection.multimodalReferenceMode = selection.seedance2ReferenceMode
    || selection.seedance25ReferenceMode
    || selection.miniMaxH3ReferenceMode
    || selection.flux3KeyframesMode;
  const merged = {
    id: modelId,
    provider: getEmbeddedVideoProvider(modelId),
    supportsTailFrame: false,
    maxReferenceImages: getMaxReferenceImages(modelId as FalModelId),
    referenceLimitToast: null,
    promptPlaceholder: null,
    supportsAnnotate: !isVideoModelId(modelId), // Annotate is an image-editing workflow.
    supportsCameraSettings: false,
    klingSuggestionsEnabled: false,
    showNegativePrompt: false,
    ...base,
    ...resolved,
    selection,
  } satisfies ModelUiCapabilities;
  return {
    ...merged,
    // Models whose active mode merges refs under @-labels get mention suggestions too.
    klingSuggestionsEnabled: merged.klingSuggestionsEnabled || selection.multimodalReferenceMode,
  };
};
