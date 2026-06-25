import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCanvasHistory } from '../useCanvasHistory';
import type { CanvasVideoPromptBar } from '../../types';

const buildKlingV3PromptBar = (): CanvasVideoPromptBar => ({
  id: 'bar-1',
  assignedAreaId: 'area-1',
  modelId: 'fal-ai/kling-video/v3/pro',
  x: 0,
  y: 0,
  width: 920,
  height: 190,
  prompt: 'First shot',
  negativePrompt: '',
  klingV3MultiPrompt: '',
  klingV3Duration: '5',
  klingV3GenerateAudio: true,
  klingV3CfgScale: '0.5',
  klingV3MultiPromptEnabled: false,
  klingV3Shot1Duration: '5',
  klingV3Shot2Duration: '5',
  seedance2Variant: 'reference',
  seedance2AspectRatio: '16:9',
  seedance2Resolution: '720p',
  seedance2Duration: '5',
  seedance2GenerateAudio: false,
  seedance2CameraFixed: false,
});

describe('useCanvasHistory (Kling v3 prompt bars)', () => {
  it('commits live same-length Kling v3 multi prompt edits', () => {
    const initialBar = {
      ...buildKlingV3PromptBar(),
      klingV3MultiPrompt: 'shot A',
      klingV3MultiPromptEnabled: true,
    };
    const { result } = renderHook(() => useCanvasHistory({
      images: [],
      paths: [],
      notes: [],
      videoPromptAreas: [],
      videoPromptBars: [initialBar],
    }));

    act(() => {
      result.current.setLiveVideoPromptBars([{
        ...initialBar,
        klingV3MultiPrompt: 'shot B',
      }]);
    });
    act(() => {
      result.current.commit();
    });

    expect(result.current.videoPromptBars[0]).toMatchObject({
      klingV3MultiPrompt: 'shot B',
    });
  });

  it('commits live same-length Kling v3 negative prompt edits', () => {
    const initialBar = {
      ...buildKlingV3PromptBar(),
      negativePrompt: 'no blur',
    };
    const { result } = renderHook(() => useCanvasHistory({
      images: [],
      paths: [],
      notes: [],
      videoPromptAreas: [],
      videoPromptBars: [initialBar],
    }));

    act(() => {
      result.current.setLiveVideoPromptBars([{
        ...initialBar,
        negativePrompt: 'no haze',
      }]);
    });
    act(() => {
      result.current.commit();
    });

    expect(result.current.videoPromptBars[0]).toMatchObject({
      negativePrompt: 'no haze',
    });
  });
});
