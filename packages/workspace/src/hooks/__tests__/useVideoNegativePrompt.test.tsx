import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  KLING_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  type FalVideoModelId,
} from '../../services/modelConfig';
import { useVideoNegativePrompt } from '../useVideoNegativePrompt';

describe('useVideoNegativePrompt', () => {
  it('updates the saved model bucket even when another model is active', () => {
    const { result, rerender } = renderHook(
      ({ falVideoModelId }: { falVideoModelId: FalVideoModelId }) => useVideoNegativePrompt({ isVideoMode: true, falVideoModelId }),
      { initialProps: { falVideoModelId: KLING_VIDEO_MODEL_ID as FalVideoModelId } },
    );

    act(() => result.current.setVideoNegativePromptForModel(WAN_27_VIDEO_MODEL_ID, 'Saved Wan prompt'));
    rerender({ falVideoModelId: WAN_27_VIDEO_MODEL_ID });

    expect(result.current.videoNegativePrompt).toBe('Saved Wan prompt');
  });

  it('keeps Veo and Kling prompts in separate buckets', () => {
    const { result, rerender } = renderHook(
      ({ falVideoModelId }: { falVideoModelId: FalVideoModelId }) => useVideoNegativePrompt({ isVideoMode: true, falVideoModelId }),
      { initialProps: { falVideoModelId: KLING_VIDEO_MODEL_ID as FalVideoModelId } },
    );

    act(() => result.current.setVideoNegativePromptForModel(VEO_31_IMAGE_TO_VIDEO_MODEL_ID, 'Saved Veo prompt'));
    rerender({ falVideoModelId: VEO_31_IMAGE_TO_VIDEO_MODEL_ID });
    expect(result.current.videoNegativePrompt).toBe('Saved Veo prompt');

    rerender({ falVideoModelId: KLING_VIDEO_MODEL_ID });
    expect(result.current.videoNegativePrompt).not.toBe('Saved Veo prompt');
  });
});
