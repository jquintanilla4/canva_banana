import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_V4_EDIT_VIDEO_MODEL_ID,
  KLING_V4_VIDEO_MODEL_ID,
  KREA_3_MODEL_ID,
  GROK_IMAGINE_IMAGE_MODEL_ID,
  RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID,
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import type { GenerationInputs } from '../../types';
import { useFalSettings } from '../useFalSettings';
import { normalizeSnapshotImageMetadata } from '../../services/snapshotService';

const buildGeneration = (overrides: Partial<GenerationInputs>): GenerationInputs => ({
  kind: 'text_to_image',
  prompt: 'Saved prompt',
  provider: 'fal',
  modelId: KREA_3_MODEL_ID,
  modelMode: 'image',
  ...overrides,
});

describe('useFalSettings generation transfer', () => {
  it('restores new Grok controls from snapshot metadata, then resets missing legacy fields instead of leaking live values', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    const falOptions = {
      grokImageAspectRatio: '5:2' as const, grokImageResolution: '1.5k' as const, grokImageQuality: 'auto' as const,
      grokImageOutputFormat: 'webp' as const, grokImagePassthrough: true, grokImageEnableSafetyChecker: false, numImages: 10,
    };
    const restored = normalizeSnapshotImageMetadata({ source: 'generated', generation: buildGeneration({
      modelId: GROK_IMAGINE_IMAGE_MODEL_ID, falOptions,
    }) })!.generation!;
    expect(restored.falOptions).toEqual(falOptions);
    act(() => { expect(result.current.applyGenerationSettings(restored)).toBe(true); });
    const { numImages, ...pickerOptions } = falOptions;
    expect(result.current).toMatchObject({ ...pickerOptions, falNumImages: numImages });

    act(() => { result.current.applyGenerationSettings(buildGeneration({
      kind: 'image_edit', modelId: 'xai/grok-imagine-image/edit', falOptions: { aspectRatioSelection: '16:9', numImages: 7 },
    })); });
    expect(result.current).toMatchObject({
      falImageModelId: GROK_IMAGINE_IMAGE_MODEL_ID, grokImageAspectRatio: '16:9', grokImageResolution: '1k',
      grokImageQuality: 'medium', grokImageOutputFormat: 'png', grokImagePassthrough: false,
      grokImageEnableSafetyChecker: true, falNumImages: 7,
    });
    act(() => { result.current.applyGenerationSettings(buildGeneration({ kind: 'image_edit', modelId: GROK_IMAGINE_IMAGE_MODEL_ID })); });
    expect(result.current.grokImageAspectRatio).toBe('auto');
    expect(result.current.falNumImages).toBe(1);
  });

  it('restores Recraft colors and size through the same defaults used for requests', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    const falOptions = { recraftImageSize: 'portrait_16_9' as const, recraftBackgroundColor: { r: 7, g: 130, b: 251 }, recraftColors: [{ r: 56, g: 78, b: 90 }] };
    act(() => { result.current.applyGenerationSettings(buildGeneration({ modelId: 'fal-ai/recraft/v4/pro/text-to-image', falOptions })); });
    expect(result.current).toMatchObject({ falImageModelId: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID, ...falOptions });
    act(() => { result.current.applyGenerationSettings(buildGeneration({ modelId: RECRAFT_V4_PRO_TEXT_TO_IMAGE_MODEL_ID })); });
    expect(result.current).toMatchObject({ recraftImageSize: 'square_hd', recraftBackgroundColor: { r: 255, g: 255, b: 255 }, recraftColors: [] });
  });

  it('rejects saved Krea 2 metadata without replacing the current model or controls', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    act(() => result.current.handleFalModelChange(KREA_3_MODEL_ID));
    act(() => result.current.handleKrea3VariantChange('jam'));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        modelId: 'krea/v2/large/text-to-image',
      }))).toBe(false);
    });

    expect(result.current.falModelMode).toBe('image');
    expect(result.current.falImageModelId).toBe(KREA_3_MODEL_ID);
    expect(result.current.krea3Variant).toBe('jam');
  });

  it('restores explicit false video values', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: {
          seedance2GenerateAudio: false,
          seedance2Duration: '12',
        },
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(FAL_SEEDANCE_2_VIDEO_MODEL_ID);
    expect(result.current.seedance2GenerateAudio).toBe(false);
    expect(result.current.seedance2Duration).toBe('12');
  });

  it('preserves a saved Kling v4 duration while changing to the saved model', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: KLING_V4_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: { klingV4Duration: '10' },
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(KLING_V4_VIDEO_MODEL_ID);
    expect(result.current.klingV4Duration).toBe('10');
  });

  it('still applies the Kling default during an ordinary model selection', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => result.current.handleFalModelChange(KLING_VIDEO_MODEL_ID));
    act(() => result.current.handleFalVideoDurationChange('10'));
    act(() => result.current.handleFalModelChange(KLING_V3_VIDEO_MODEL_ID));
    act(() => result.current.handleFalModelChange(KLING_VIDEO_MODEL_ID));

    expect(result.current.falVideoDuration).toBe('5');
  });

  it('uses model defaults for controls omitted from partial metadata', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: {
          miniMaxH3Variant: 'standard',
          miniMaxH3Duration: '12',
          miniMaxH3AspectRatio: '9:16',
        },
      }));
    });
    expect(result.current.miniMaxH3Variant).toBe('standard');
    expect(result.current.miniMaxH3Duration).toBe('12');
    expect(result.current.miniMaxH3AspectRatio).toBe('9:16');

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: {},
      }))).toBe(true);
    });

    expect(result.current.miniMaxH3Variant).toBe('reference');
    expect(result.current.miniMaxH3Duration).toBe('5');
    expect(result.current.miniMaxH3AspectRatio).toBe('adaptive');
  });

  it('maps Jimeng metadata into the shared Seedance controls', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        provider: 'jimeng',
        modelId: undefined,
        modelMode: 'video',
        jimengOptions: {
          seedance2Variant: 'smart',
          seedance2JimengModelVersion: 'seedance2.0_vip',
          seedance2AspectRatio: '9:16',
          seedance2Resolution: '1080p',
          seedance2Duration: '8',
          seedance2GenerateAudio: false,
          seedance2CameraFixed: false,
          sessionId: 17,
        },
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID);
    expect(result.current.seedance2Variant).toBe('smart');
    expect(result.current.seedance2JimengModelVersion).toBe('seedance2.0_vip');
    expect(result.current.seedance2AspectRatio).toBe('9:16');
    expect(result.current.seedance2Resolution).toBe('1080p');
    expect(result.current.seedance2Duration).toBe('8');
    expect(result.current.jimengSessionId).toBe(17);
  });

  it('resets legacy Jimeng metadata without a session to session zero', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => result.current.setJimengSessionId(17));
    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        provider: 'jimeng',
        modelId: undefined,
        modelMode: 'video',
        jimengOptions: {
          seedance2Variant: 'smart',
        },
      }))).toBe(true);
    });

    expect(result.current.jimengSessionId).toBe(0);
  });

  it('rejects unavailable models without changing the current selection', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    const initialModelId = result.current.falModelId;

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({ modelId: 'retired/model' }))).toBe(false);
    });

    expect(result.current.falModelId).toBe(initialModelId);
  });

  it.each([
    'fal-ai/kling-video/o1/video-to-video/edit',
    'wan/v2.6/image-to-video',
    KLING_VIDEO_MODEL_ID,
    KLING_V3_VIDEO_MODEL_ID,
    KLING_O3_VIDEO_EDIT_MODEL_ID,
    WAN_27_VIDEO_MODEL_ID,
    WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
    WAN_27_EDIT_VIDEO_MODEL_ID,
    'fal-ai/scail',
    'fal-ai/wan/v2.2-14b/animate/replace',
    'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    'fal-ai/veo3.1/image-to-video',
  ])('blocks retired video model %s without changing the selection', modelId => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));
    const initialModelId = result.current.falModelId;

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({ kind: 'video', modelId, modelMode: 'video' }))).toBe(false);
    });

    expect(result.current.falModelId).toBe(initialModelId);
  });

  it('infers modes still encoded by current shared-selector endpoints', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: KLING_V4_EDIT_VIDEO_MODEL_ID,
        modelMode: 'video',
      }))).toBe(true);
    });
    expect(result.current.falModelId).toBe(KLING_V4_VIDEO_MODEL_ID);
    expect(result.current.klingV4Variant).toBe('edit');
  });

  it('uses Kling v4 edit defaults when endpoint metadata omits its controls', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: KLING_V4_EDIT_VIDEO_MODEL_ID,
        modelMode: 'video',
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(KLING_V4_VIDEO_MODEL_ID);
    expect(result.current.klingV4Variant).toBe('edit');
    expect(result.current.klingV4Duration).toBe('source');
    expect(result.current.klingV4AspectRatio).toBe('16:9');
  });

  it('uses MiniMax Standard defaults when metadata only saves its variant', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: MINIMAX_H3_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: { miniMaxH3Variant: 'standard' },
      }))).toBe(true);
    });

    expect(result.current.miniMaxH3Variant).toBe('standard');
    expect(result.current.miniMaxH3AspectRatio).toBe('16:9');
    expect(result.current.miniMaxH3Duration).toBe('5');
  });
});
