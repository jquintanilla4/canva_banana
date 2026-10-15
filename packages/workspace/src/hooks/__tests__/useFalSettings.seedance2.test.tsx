import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FAL_SEEDANCE_2_VIDEO_MODEL_ID, JIMENG_MULTIFRAME_VIDEO_MODEL_ID, JIMENG_SEEDANCE_2_VIDEO_MODEL_ID, SEEDANCE_2_VIDEO_MODEL_ID } from '../../services/modelConfig';
import { useFalSettings } from '../useFalSettings';

describe('useFalSettings (Seedance 2)', () => {
  it('defaults Seedance 2 to reference mode', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    expect(result.current.seedance2Variant).toBe('reference');
  });

  it('keeps Seedance 2.5 on its separate provider defaults', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    expect(result.current.seedance25Variant).toBe('reference');
    expect(result.current.seedance25AspectRatio).toBe('adaptive');
    expect(result.current.seedance25Resolution).toBe('720p');
    expect(result.current.seedance25Duration).toBe('auto');
    expect(result.current.seedance25GenerateAudio).toBe(true);
    expect(result.current.seedance2Duration).toBe('5');
    expect(result.current.seedance2GenerateAudio).toBe(false);
  });

  it('repairs Jimeng-only 4K state when the active provider changes', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2JimengModelVersionChange('seedance2.0_vip');
      result.current.setSeedance2Resolution('4k');
    });
    expect(result.current.seedance2Resolution).toBe('4k');

    act(() => result.current.setFalVideoModelId(FAL_SEEDANCE_2_VIDEO_MODEL_ID));

    expect(result.current.seedance2Resolution).toBe('1080p');
  });

  it('keeps 4K when switching from Jimeng VIP to the Volcengine standard model', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2JimengModelVersionChange('seedance2.0_vip');
      result.current.setSeedance2Resolution('4k');
    });
    expect(result.current.seedance2Resolution).toBe('4k');

    act(() => result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID));

    expect(result.current.seedance2VolcengineModel).toBe('standard');
    expect(result.current.seedance2Resolution).toBe('4k'); // Volcengine standard supports 4K.
  });

  it('clamps Volcengine Fast and Mini selections to 720p', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.setSeedance2Resolution('4k');
    });
    act(() => result.current.handleSeedance2VolcengineModelChange('fast'));

    expect(result.current.seedance2VolcengineModel).toBe('fast');
    expect(result.current.seedance2Resolution).toBe('720p');

    act(() => result.current.setSeedance2Resolution('1080p'));

    expect(result.current.seedance2Resolution).toBe('720p'); // The repair effect keeps Fast/Mini at 720p.

    act(() => result.current.handleSeedance2VolcengineModelChange('mini'));
    act(() => result.current.setSeedance2Resolution('4k'));

    expect(result.current.seedance2Resolution).toBe('720p');

    act(() => result.current.handleSeedance2VolcengineModelChange('standard'));
    act(() => result.current.setSeedance2Resolution('4k'));

    expect(result.current.seedance2Resolution).toBe('4k'); // Standard re-enables 1080p and 4K.
  });

  it('preserves Seedance 2 settings while an unrelated video model is selected', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.setSeedance2Duration('auto');
      result.current.setSeedance2Resolution('4k');
    });
    act(() => result.current.setFalVideoModelId(JIMENG_MULTIFRAME_VIDEO_MODEL_ID));

    expect(result.current.seedance2Duration).toBe('auto'); // Multi-frame reads only jimengMultiframe* state.
    expect(result.current.seedance2Resolution).toBe('4k');

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2VolcengineModelChange('seedance25');
      result.current.handleSeedance2DurationChange('30');
    });
    act(() => result.current.setFalVideoModelId(JIMENG_MULTIFRAME_VIDEO_MODEL_ID));

    expect(result.current.seedance2Duration).toBe('30');
  });

  it('clamps to 720p and accepts Auto and 30s durations on the Seedance 2.5 sub-model', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.setSeedance2Resolution('4k');
      result.current.setSeedance2Duration('15');
      result.current.setSeedance2CameraFixed(true);
    });
    act(() => result.current.handleSeedance2VolcengineModelChange('seedance25'));

    expect(result.current.seedance2VolcengineModel).toBe('seedance25');
    expect(result.current.seedance2Resolution).toBe('720p'); // 2.5 caps at 720p like Fast/Mini.
    expect(result.current.seedance2Duration).toBe('15'); // 15s stays valid on 2.5.
    expect(result.current.seedance2CameraFixed).toBe(false); // 2.5 drops the fixed-camera flag.
    expect(result.current.seedance2OutputFormat).toBe('mp4'); // Container picker defaults to MP4.

    act(() => result.current.handleSeedance2DurationChange('auto'));
    expect(result.current.seedance2Duration).toBe('auto');

    act(() => result.current.handleSeedance2DurationChange('30'));
    expect(result.current.seedance2Duration).toBe('30'); // 2.5 accepts up to 30s.

    act(() => result.current.handleSeedance2OutputFormatChange('mov'));
    expect(result.current.seedance2OutputFormat).toBe('mov');

    act(() => result.current.handleSeedance2OutputFormatChange('webm'));
    expect(result.current.seedance2OutputFormat).toBe('mov'); // Unknown containers are ignored.
  });

  it('keeps Auto but clamps over-15s durations when leaving the Seedance 2.5 sub-model', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2VolcengineModelChange('seedance25');
      result.current.handleSeedance2DurationChange('auto');
    });
    act(() => result.current.handleSeedance2VolcengineModelChange('standard'));

    expect(result.current.seedance2Duration).toBe('auto'); // Direct Volcengine 2.0 sub-models also support Auto.

    act(() => {
      result.current.handleSeedance2VolcengineModelChange('seedance25');
      result.current.handleSeedance2DurationChange('30');
    });
    act(() => result.current.handleSeedance2VolcengineModelChange('fast'));

    expect(result.current.seedance2Duration).toBe('15'); // 2.0 sub-models cap at 15s.
  });

  it('clamps Auto when switching from Volcengine to a provider that requires an explicit duration', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.setSeedance2Duration('auto');
    });
    act(() => result.current.setFalVideoModelId(FAL_SEEDANCE_2_VIDEO_MODEL_ID));

    expect(result.current.seedance2Duration).toBe('5'); // Fal keeps its existing explicit-duration contract.
  });

  it('forces Adaptive ratio for Seedance 2.5 Edit but preserves Smart ratios', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2VolcengineModelChange('seedance25');
      result.current.setSeedance2AspectRatio('16:9');
      result.current.handleSeedance2DurationChange('10');
    });
    act(() => result.current.handleSeedance2VariantChange('edit'));

    expect(result.current.seedance2AspectRatio).toBe('adaptive'); // 2.5 Edit requires the Adaptive ratio.
    expect(result.current.seedance2Duration).toBe('auto'); // 2.5 Edit requires Auto duration.

    act(() => {
      result.current.handleSeedance2VariantChange('smart');
      result.current.setSeedance2AspectRatio('9:16');
      result.current.handleSeedance2DurationChange('20');
    });

    expect(result.current.seedance2AspectRatio).toBe('9:16'); // Text-only Smart requests support explicit ratios.
    expect(result.current.seedance2Duration).toBe('20'); // Smart keeps any explicit 2.5 duration.

    act(() => {
      result.current.handleSeedance2VariantChange('reference');
      result.current.setSeedance2AspectRatio('16:9');
    });

    expect(result.current.seedance2AspectRatio).toBe('16:9'); // Reference stays free to pick any ratio.
  });

  it('falls back to Reference when a Volcengine Edit/Extend variant leaks to another Seedance 2 provider', () => {
    const { result } = renderHook(() => useFalSettings({ apiProvider: 'fal' }));

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2VariantChange('edit');
    });
    expect(result.current.seedance2Variant).toBe('edit'); // Volcengine keeps Edit.

    act(() => result.current.setFalVideoModelId(FAL_SEEDANCE_2_VIDEO_MODEL_ID));

    expect(result.current.seedance2Variant).toBe('reference'); // Fal has no Edit/Extend mode.

    act(() => {
      result.current.setFalVideoModelId(SEEDANCE_2_VIDEO_MODEL_ID);
      result.current.handleSeedance2VariantChange('extend');
    });
    act(() => result.current.setFalVideoModelId(JIMENG_SEEDANCE_2_VIDEO_MODEL_ID));

    expect(result.current.seedance2Variant).toBe('reference'); // Jimeng rejects Edit/Extend outright.
  });
});
