import { describe, expect, it } from 'vitest';
import { FAL_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_SEEDANCE_25_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import type { CanvasVideoPromptBar } from '../../types';
import { buildEmbeddedVideoGenerationProviderInput, getEmbeddedBarFalOptions, isEmbeddedSeedanceEditMode } from '../embeddedVideoRouting';

const buildBar = (overrides: Partial<CanvasVideoPromptBar> = {}): CanvasVideoPromptBar => ({
  id: 'bar-1',
  assignedAreaId: 'area-1',
  x: 0,
  y: 0,
  width: 320,
  height: 72,
  prompt: '',
  negativePrompt: '',
  seedance2Variant: 'reference',
  seedance2VolcengineModel: 'standard',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
  ...overrides,
});

describe('embeddedVideoRouting', () => {
  it('exposes the top-level Volcengine sub-model to embedded capability consumers', () => {
    expect(getEmbeddedBarFalOptions(buildBar({ seedance2VolcengineModel: 'seedance25' })).seedance2VolcengineModel).toBe('seedance25');
  });

  it('normalizes stale Fal defaults when routing an embedded Jimeng Seedance 2.5 bar', () => {
    const input = buildEmbeddedVideoGenerationProviderInput(buildBar({
      modelId: JIMENG_SEEDANCE_25_VIDEO_MODEL_ID,
      falOptions: {
        seedance25Variant: 'reference',
        seedance25AspectRatio: 'adaptive',
        seedance25Resolution: '720p',
        seedance25Duration: 'auto',
        seedance25GenerateAudio: true,
      },
    }), JIMENG_SEEDANCE_25_VIDEO_MODEL_ID, 23);

    expect(input.jimengOptions).toEqual({
      seedance25Variant: 'reference',
      seedance25AspectRatio: '16:9',
      seedance25Resolution: '720p',
      seedance25Duration: '5',
      seedance25GenerateAudio: false,
      sessionId: 23,
    });
  });

  it('routes embedded Volcengine Seedance 2.5 bars with their duration and output format', () => {
    const input = buildEmbeddedVideoGenerationProviderInput(buildBar({
      modelId: SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'edit',
      seedance2VolcengineModel: 'seedance25',
      seedance2AspectRatio: '16:9',
      seedance2Resolution: '1080p',
      seedance2Duration: '10',
      seedance2CameraFixed: true,
      seedance2OutputFormat: 'mov',
    }), SEEDANCE_2_VIDEO_MODEL_ID, 0);

    expect(input.provider).toBe('volcengine');
    expect(input.volcengineOptions).toEqual({
      seedance2Variant: 'edit',
      seedance2VolcengineModel: 'seedance25',
      seedance2AspectRatio: 'adaptive',
      seedance2Resolution: '720p',
      seedance2Duration: 'auto',
      seedance2GenerateAudio: false,
      seedance2CameraFixed: false,
      seedance2OutputFormat: 'mov',
    });
  });

  it('normalizes embedded Seedance 2.5 Smart first-frame bars to Adaptive', () => {
    const input = buildEmbeddedVideoGenerationProviderInput(buildBar({
      modelId: SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'smart',
      seedance2VolcengineModel: 'seedance25',
      seedance2AspectRatio: '16:9',
    }), SEEDANCE_2_VIDEO_MODEL_ID, 0, true);

    expect(input.volcengineOptions?.seedance2AspectRatio).toBe('adaptive');
  });

  it('clamps a stale Edit/Extend variant when routing to Jimeng or Fal Seedance 2', () => {
    const jimeng = buildEmbeddedVideoGenerationProviderInput(buildBar({
      modelId: JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'edit',
    }), JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, 7);

    expect(jimeng.jimengOptions?.seedance2Variant).toBe('reference'); // Jimeng rejects Edit/Extend outright.

    const fal = buildEmbeddedVideoGenerationProviderInput(buildBar({
      modelId: FAL_SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'extend',
    }), FAL_SEEDANCE_2_VIDEO_MODEL_ID, 0);

    expect(fal.falOptions?.seedance2Variant).toBe('reference'); // Fal has no Edit/Extend mode.
  });

  it('identifies only Volcengine Seedance Edit bars as edit mode', () => {
    expect(isEmbeddedSeedanceEditMode(buildBar({ seedance2Variant: 'edit' }), SEEDANCE_2_VIDEO_MODEL_ID)).toBe(true);
    expect(isEmbeddedSeedanceEditMode(buildBar({ seedance2Variant: 'extend' }), SEEDANCE_2_VIDEO_MODEL_ID)).toBe(false);
    expect(isEmbeddedSeedanceEditMode(buildBar({ seedance2Variant: 'edit' }), FAL_SEEDANCE_2_VIDEO_MODEL_ID)).toBe(false);
  });

  it('keeps Edit/Extend variants on Volcengine Seedance 2 bars', () => {
    const input = buildEmbeddedVideoGenerationProviderInput(buildBar({
      modelId: SEEDANCE_2_VIDEO_MODEL_ID,
      seedance2Variant: 'edit',
    }), SEEDANCE_2_VIDEO_MODEL_ID, 0);

    expect(input.volcengineOptions?.seedance2Variant).toBe('edit');
  });
});
