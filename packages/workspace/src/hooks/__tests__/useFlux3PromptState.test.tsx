import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Flux3Duration, Flux3KeyframeTiming } from '../../types';
import { useFlux3PromptState } from '../useFlux3PromptState';

describe('useFlux3PromptState', () => {
  it('coordinates keyframe timings, labels, mentions, and duration changes', async () => {
    const { result } = renderHook(() => {
      const [duration, setDuration] = useState<Flux3Duration>('5');
      const [keyframeTimings, setKeyframeTimings] = useState<Flux3KeyframeTiming[]>([
        { imageId: 'image-1', timestampSeconds: 0 },
      ]);
      const promptState = useFlux3PromptState({
        settings: {
          isFlux3VideoModel: true,
          flux3Variant: 'keyframes',
          flux3Duration: duration,
          flux3KeyframeTimings: keyframeTimings,
          setFlux3KeyframeTimings: setKeyframeTimings,
          handleFlux3DurationChange: value => setDuration(value as Flux3Duration),
        },
        prompt: '@Image1 moves toward @Image2',
        primaryImageId: null,
        lastFrameImageId: null,
        referenceImageIds: ['image-1', 'image-2'],
        sourceVideoId: null,
      });
      return { duration, keyframeTimings, promptState };
    });

    await waitFor(() => expect(result.current.keyframeTimings).toEqual([
      { imageId: 'image-1', timestampSeconds: 0 },
      { imageId: 'image-2', timestampSeconds: 5 },
    ]));
    expect(result.current.promptState.canvasLabels).toEqual({
      'image-1': '@Image1',
      'image-2': '@Image2',
    });
    expect(result.current.promptState.promptMentions).toEqual(['@Image1', '@Image2']);

    act(() => result.current.promptState.handleKeyframeTimingChange('image-2', 4));
    act(() => result.current.promptState.handleDurationChange('10'));

    expect(result.current.duration).toBe('10');
    expect(result.current.keyframeTimings).toEqual([
      { imageId: 'image-1', timestampSeconds: 0 },
      { imageId: 'image-2', timestampSeconds: 8 },
    ]);
  });
});
