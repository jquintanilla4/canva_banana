import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  KLING_O3_VIDEO_EDIT_MODEL_ID,
  KLING_O3_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  WAN_27_EDIT_VIDEO_MODEL_ID,
  WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
} from '../../services/modelConfig';
import type { GenerationInputs } from '../../types';
import { useFalSettings } from '../useFalSettings';

const buildGeneration = (overrides: Partial<GenerationInputs>): GenerationInputs => ({
  kind: 'text_to_image',
  prompt: 'Saved prompt',
  provider: 'fal',
  modelId: KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID,
  modelMode: 'image',
  ...overrides,
});

describe('useFalSettings generation transfer', () => {
  it('restores image model controls from saved metadata', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        falOptions: {
          aspectRatioSelection: '2.35:1',
          krea2Creativity: 'high',
          numImages: 2,
        },
      }))).toBe(true);
    });

    expect(result.current.falModelMode).toBe('image');
    expect(result.current.falImageModelId).toBe(KREA_2_LARGE_TEXT_TO_IMAGE_MODEL_ID);
    expect(result.current.krea2AspectRatio).toBe('2.35:1');
    expect(result.current.krea2Creativity).toBe('high');
    expect(result.current.falNumImages).toBe(2);
  });

  it('restores explicit false and empty video values', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: KLING_V3_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: {
          klingV3GenerateAudio: false,
          klingV3MultiPromptEnabled: false,
          klingV3MultiPrompt: '',
          klingV3Duration: '12',
        },
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(KLING_V3_VIDEO_MODEL_ID);
    expect(result.current.klingV3GenerateAudio).toBe(false);
    expect(result.current.klingV3MultiPromptEnabled).toBe(false);
    expect(result.current.klingV3MultiPrompt).toBe('');
    expect(result.current.klingV3Duration).toBe('12');
  });

  it('preserves a saved Kling duration while changing to the saved model', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: KLING_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: { videoDuration: '10', klingVariant: 'pro' },
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(KLING_VIDEO_MODEL_ID);
    expect(result.current.falVideoDuration).toBe('10');
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
        modelId: KLING_V3_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: {
          klingV3Duration: '12',
          klingV3GenerateAudio: false,
          klingV3CfgScale: '1',
          klingV3MultiPromptEnabled: true,
          klingV3MultiPrompt: 'Unrelated live second shot',
          klingV3Shot1Duration: '8',
          klingV3Shot2Duration: '4',
        },
      }));
    });
    expect(result.current.klingV3MultiPromptEnabled).toBe(true);

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: KLING_V3_VIDEO_MODEL_ID,
        modelMode: 'video',
        falOptions: {},
      }))).toBe(true);
    });

    expect(result.current.klingV3Duration).toBe('5');
    expect(result.current.klingV3GenerateAudio).toBe(true);
    expect(result.current.klingV3CfgScale).toBe('0.5');
    expect(result.current.klingV3MultiPromptEnabled).toBe(false);
    expect(result.current.klingV3MultiPrompt).toBe('');
    expect(result.current.klingV3Shot1Duration).toBe('5');
    expect(result.current.klingV3Shot2Duration).toBe('5');
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
        },
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID);
    expect(result.current.seedance2Variant).toBe('smart');
    expect(result.current.seedance2JimengModelVersion).toBe('seedance2.0_vip');
    expect(result.current.seedance2AspectRatio).toBe('9:16');
    expect(result.current.seedance2Resolution).toBe('1080p');
    expect(result.current.seedance2Duration).toBe('8');
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
  ])('blocks removed legacy model %s instead of migrating it', modelId => {
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
        modelId: KLING_O3_VIDEO_EDIT_MODEL_ID,
        modelMode: 'video',
      }))).toBe(true);
    });
    expect(result.current.falModelId).toBe(KLING_O3_VIDEO_MODEL_ID);
    expect(result.current.klingO3Variant).toBe('edit');

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: WAN_27_REFERENCE_TO_VIDEO_MODEL_ID,
        modelMode: 'video',
      }))).toBe(true);
    });
    expect(result.current.falModelId).toBe(WAN_27_VIDEO_MODEL_ID);
    expect(result.current.wan27VideoVariant).toBe('reference');
  });

  it('uses Wan edit defaults when endpoint metadata omits its controls', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      expect(result.current.applyGenerationSettings(buildGeneration({
        kind: 'video',
        modelId: WAN_27_EDIT_VIDEO_MODEL_ID,
        modelMode: 'video',
      }))).toBe(true);
    });

    expect(result.current.falVideoModelId).toBe(WAN_27_VIDEO_MODEL_ID);
    expect(result.current.wan27VideoVariant).toBe('edit');
    expect(result.current.wan27VideoDuration).toBe('0');
    expect(result.current.wan27VideoAspectRatio).toBe('source');
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
