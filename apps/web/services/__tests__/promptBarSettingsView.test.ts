import { describe, expect, it, vi } from 'vitest';
import {
  buildEmbeddedPromptBarControlsInput,
  buildFooterPromptBarControlsInput,
  derivePromptBarModelFlags,
} from '../promptBarSettingsView';
import {
  FAL_SEEDANCE_25_VIDEO_MODEL_ID,
  JIMENG_MULTIFRAME_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SEEDREAM_MODEL_ID,
} from '../modelConfig';
import type { UseFalSettingsResult } from '../../hooks/useFalSettings';
import type { CanvasVideoPromptBar, VideoPromptAreaMembership } from '../../types';

const createMembership = (overrides: Partial<VideoPromptAreaMembership> = {}): VideoPromptAreaMembership => ({
  areaId: 'area-1',
  primaryImageId: undefined,
  tailImageId: undefined,
  acceptedImageIds: [],
  acceptedVideoIds: [],
  acceptedAudioIds: [],
  elementImageIds: [],
  ignoredMediaIds: [],
  orderLabels: {},
  sourceVideoId: undefined,
  sourceAudioId: undefined,
  ...overrides,
} as unknown as VideoPromptAreaMembership);

// A fal-state stand-in with distinctive values so pass-through and overlay
// precedence are observable. Only the fields the assertions touch need real values.
const createFalStub = (overrides: Record<string, unknown> = {}): UseFalSettingsResult => {
  const handlers = Object.fromEntries([
    'handleFalVideoDurationChange', 'handleKlingVariantChange', 'handleKlingV3DurationChange',
    'handleKlingV3GenerateAudioChange', 'handleMiniMaxH3VariantChange', 'handleSeedance25VariantChange',
    'handleFlux3VariantChange', 'handleWanTargetResolutionChange', 'handleFalNumImagesChange',
  ].map(name => [name, vi.fn()]));
  return {
    falModelId: KLING_V3_VIDEO_MODEL_ID,
    falModelMode: 'video',
    falVideoDuration: 'fal-video-duration',
    klingVariant: 'pro',
    klingV3Duration: '10',
    klingV3GenerateAudio: false,
    klingV3CfgScale: '0.7',
    klingV3MultiPromptEnabled: true,
    klingV3Shot1Duration: '7',
    klingV3Shot2Duration: '8',
    klingO3Variant: 'edit',
    wanTargetResolution: 'fal-wan-resolution',
    wanCreativity: 3,
    miniMaxH3Variant: 'standard',
    miniMaxH3AspectRatio: '16:9',
    miniMaxH3Duration: '10',
    flux3Variant: 'smart',
    flux3KeyframeTimings: [],
    seedance2Variant: 'smart',
    seedance2JimengModelVersion: 'seedance2.0fast',
    seedance2VolcengineModel: 'seedance25',
    seedance2OutputFormat: 'mov',
    seedance25Variant: 'smart',
    jimengMultiframeDuration: 'fal-mf-duration',
    jimengMultiframeResolution: 'fal-mf-resolution',
    falNumImages: 4,
    ...handlers,
    ...overrides,
  } as unknown as UseFalSettingsResult;
};

const createBar = (overrides: Partial<CanvasVideoPromptBar> = {}): CanvasVideoPromptBar => ({
  id: 'bar-1',
  assignedAreaId: 'area-1',
  prompt: '',
  negativePrompt: '',
  modelId: SEEDANCE_2_VIDEO_MODEL_ID,
  seedance2Variant: 'reference',
  seedance2JimengModelVersion: 'seedance2.0fast',
  seedance2VolcengineModel: 'standard',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  seedance2OutputFormat: 'mp4',
  klingV3MultiPrompt: '',
  klingV3Duration: '5',
  klingV3GenerateAudio: true,
  klingV3CfgScale: '0.5',
  klingV3MultiPromptEnabled: false,
  klingV3Shot1Duration: '5',
  klingV3Shot2Duration: '5',
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  ...overrides,
} as CanvasVideoPromptBar);

describe('derivePromptBarModelFlags', () => {
  it('derives video flags from the model id in video mode', () => {
    const flags = derivePromptBarModelFlags('fal', KLING_V3_VIDEO_MODEL_ID, 'video');
    expect(flags.isKlingV3VideoModel).toBe(true);
    expect(flags.isVideoMode).toBe(true);
    expect(flags.usingFal).toBe(true);
    expect(flags.isKlingVideoModel).toBe(false);
    expect(flags.isSeedreamModel).toBe(false);
  });

  it('keeps a stale video selection from leaking into image mode', () => {
    const flags = derivePromptBarModelFlags('fal', SEEDREAM_MODEL_ID, 'image');
    expect(flags.isSeedreamModel).toBe(true);
    expect(flags.isJimengMultiframeVideoModel).toBe(false);
    expect(flags.isKlingV3VideoModel).toBe(false);
  });

  it('covers Seedance family ids and the Jimeng umbrella flag', () => {
    const flags = derivePromptBarModelFlags('fal', JIMENG_MULTIFRAME_VIDEO_MODEL_ID, 'video');
    expect(flags.isJimengSeedance2VideoModel).toBe(true);
    expect(flags.isJimengMultiframeVideoModel).toBe(true);
    expect(flags.isSeedance2VideoModel).toBe(false);
  });

  it('gates Krea 2 Large on the active provider', () => {
    expect(derivePromptBarModelFlags('fal', KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID, 'image').isKrea2LargeModel).toBe(true);
    expect(derivePromptBarModelFlags('google', KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID, 'image').isKrea2LargeModel).toBe(false);
  });
});

describe('buildFooterPromptBarControlsInput', () => {
  const build = (falOverrides: Record<string, unknown> = {}, hasFirstFrameImage = false) => buildFooterPromptBarControlsInput({
    apiProvider: 'fal',
    fal: createFalStub(falOverrides),
    flux3: { keyframeError: 'kf-error', onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
    hasFirstFrameImage,
    isLoading: true,
    shouldValidateFalOptions: true,
    isNumImagesInvalid: true,
  });

  it('passes fal values through one-to-one', () => {
    const input = build();
    expect(input.falVideoDuration).toBe('fal-video-duration');
    expect(input.klingV3Duration).toBe('10');
    expect(input.wanTargetResolution).toBe('fal-wan-resolution');
    expect(input.miniMaxH3Variant).toBe('standard');
    expect(input.falNumImages).toBe(4);
    expect(input.flux3KeyframeError).toBe('kf-error');
    expect(input.isLoading).toBe(true);
    expect(input.shouldValidateFalOptions).toBe(true);
    expect(input.isNumImagesInvalid).toBe(true);
  });

  it('wires handlers to the fal settings surface', () => {
    const fal = createFalStub();
    const input = buildFooterPromptBarControlsInput({
      apiProvider: 'fal',
      fal,
      flux3: { onFlux3DurationChange: vi.fn(), onFlux3KeyframeTimingChange: vi.fn() },
      hasFirstFrameImage: false,
      isLoading: false,
      shouldValidateFalOptions: false,
      isNumImagesInvalid: false,
    });
    input.onKlingV3DurationChange('10');
    expect(fal.handleKlingV3DurationChange).toHaveBeenCalledWith('10');
    input.onFalVideoDurationChange('5');
    expect(fal.handleFalVideoDurationChange).toHaveBeenCalledWith('5');
  });

  it('requires the Volcengine 2.5 sub-model for the footer Seedance 2 first-frame flag', () => {
    const withVolc25 = build({ falModelId: SEEDANCE_2_VIDEO_MODEL_ID, seedance2Variant: 'smart', seedance2VolcengineModel: 'seedance25' }, true);
    expect(withVolc25.seedance2HasFirstFrame).toBe(true);
    const withStandard = build({ falModelId: SEEDANCE_2_VIDEO_MODEL_ID, seedance2Variant: 'smart', seedance2VolcengineModel: 'standard' }, true);
    expect(withStandard.seedance2HasFirstFrame).toBe(false);
  });

  it('derives the MiniMax H3 and Seedance 2.5 source-aspect flags', () => {
    const miniMax = build({ falModelId: MINIMAX_H3_VIDEO_MODEL_ID, miniMaxH3Variant: 'standard' }, true);
    expect(miniMax.miniMaxH3UsesSourceAspectRatio).toBe(true);
    const seedance25 = build({ falModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID, seedance25Variant: 'smart' }, true);
    expect(seedance25.seedance25UsesSourceAspectRatio).toBe(true);
    const seedance25Ref = build({ falModelId: FAL_SEEDANCE_25_VIDEO_MODEL_ID, seedance25Variant: 'reference' }, true);
    expect(seedance25Ref.seedance25UsesSourceAspectRatio).toBe(false);
  });
});

describe('buildEmbeddedPromptBarControlsInput', () => {
  const build = (bar: CanvasVideoPromptBar, updateBar = vi.fn()) => buildEmbeddedPromptBarControlsInput({
    bar,
    barMembership: createMembership(),
    fal: createFalStub(),
    updateBar,
    isLoading: false,
  });

  it('derives flags from the bar model id, not the footer selection', () => {
    const input = build(createBar({ modelId: MINIMAX_H3_VIDEO_MODEL_ID }));
    expect(input.isMiniMaxH3VideoModel).toBe(true);
    expect(input.isKlingV3VideoModel).toBe(false);
    expect(input.controlIdPrefix).toBe('bar-1');
    expect(input.apiProvider).toBe('fal');
    expect(input.falModelMode).toBe('video');
  });

  it('resolves values with legacy > falOptions > default precedence', () => {
    const bar = createBar({
      klingV3Duration: '10',
      klingV3CfgScale: undefined, // No legacy value, so the falOptions entry should win.
      falOptions: { klingV3Duration: '5', klingV3CfgScale: '0.75', wanTargetResolution: '1080p', videoDuration: '10' },
    });
    const input = build(bar);
    expect(input.klingV3Duration).toBe('10'); // Legacy bar field wins.
    expect(input.klingV3CfgScale).toBe('0.75'); // falOptions beats the literal default.
    expect(input.wanTargetResolution).toBe('1080p'); // falOptions beats live fal state ('fal-wan-resolution').
    expect(input.falVideoDuration).toBe('10'); // Mapped 'videoDuration' option key beats live fal state.
  });

  it('uses embedded defaults instead of live fal state for MiniMax and Seedance 2.5', () => {
    const input = build(createBar({ falOptions: {} }));
    expect(input.miniMaxH3Variant).toBe('reference'); // fal stub says 'standard'.
    expect(input.miniMaxH3AspectRatio).toBe('adaptive');
    expect(input.seedance25Variant).toBe('reference'); // fal stub says 'smart'.
    expect(input.seedance25Duration).toBe('auto');
    expect(input.seedance2AspectRatio).toBe('16:9'); // Legacy field, options never consulted.
    expect(input.seedance2Variant).toBe('reference'); // Straight from the bar.
  });

  it('does not require the Volcengine 2.5 sub-model for the embedded first-frame flag', () => {
    const input = buildEmbeddedPromptBarControlsInput({
      bar: createBar({ modelId: SEEDANCE_2_VIDEO_MODEL_ID, seedance2Variant: 'smart', seedance2VolcengineModel: 'standard' }),
      barMembership: createMembership({ primaryImageId: 'img-1' }),
      fal: createFalStub(),
      updateBar: vi.fn(),
      isLoading: false,
    });
    expect(input.seedance2HasFirstFrame).toBe(true);
  });

  it('writes simple control edits into bar.falOptions', () => {
    const bar = createBar();
    let updated: CanvasVideoPromptBar | null = null;
    const input = build(bar, vi.fn((barId, updater) => {
      expect(barId).toBe('bar-1');
      updated = updater(bar);
    }));
    input.onWanTargetResolutionChange('1080p');
    expect(updated?.falOptions?.wanTargetResolution).toBe('1080p');
    input.onFalVideoDurationChange('10');
    expect(updated?.falOptions?.videoDuration).toBe('10');
  });

  it('dual-writes legacy Kling V3 and Seedance 2 fields', () => {
    const bar = createBar();
    let updated: CanvasVideoPromptBar | null = null;
    const input = build(bar, vi.fn((_barId, updater) => {
      updated = updater(bar);
    }));
    input.onKlingV3DurationChange('10');
    expect(updated?.klingV3Duration).toBe('10');
    expect(updated?.falOptions?.klingV3Duration).toBe('10');
    input.onSeedance2VariantChange('smart');
    expect(updated?.seedance2Variant).toBe('smart');
    expect(updated?.falOptions?.seedance2Variant).toBe('smart');
  });

  it('keeps image-model handlers inert except the shared aspect-ratio control', () => {
    const bar = createBar();
    const updateBar = vi.fn();
    const input = build(bar, updateBar);
    input.onRecraftImageSizeChange('big');
    input.onFalNumImagesChange(3);
    expect(updateBar).not.toHaveBeenCalled();
    input.onFalAspectRatioChange('1:1');
    expect(updateBar).toHaveBeenCalledTimes(1);
  });

  it('normalizes the MiniMax aspect ratio when the variant changes', () => {
    const bar = createBar({ modelId: MINIMAX_H3_VIDEO_MODEL_ID, falOptions: { miniMaxH3Variant: 'reference', miniMaxH3AspectRatio: 'adaptive' } });
    let updated: CanvasVideoPromptBar | null = null;
    const input = build(bar, vi.fn((_barId, updater) => {
      updated = updater(bar);
    }));
    input.onMiniMaxH3VariantChange('standard');
    expect(updated?.falOptions?.miniMaxH3Variant).toBe('standard');
    expect(updated?.falOptions?.miniMaxH3AspectRatio).not.toBe('adaptive'); // Standard mode cannot use Adaptive.
  });

  it('flags Kling O3 embedded bars through the shared derivation', () => {
    const input = build(createBar({ modelId: KLING_O3_VIDEO_MODEL_ID }));
    expect(input.isKlingO3VideoModel).toBe(true);
  });
});
