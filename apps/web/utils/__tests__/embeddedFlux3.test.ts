import { describe, expect, it } from 'vitest';
import type { CanvasVideoPromptBar, VideoPromptAreaMembership } from '../../types';
import {
  buildEmbeddedFlux3PromptState,
  updateEmbeddedFlux3Duration,
  updateEmbeddedFlux3KeyframeTiming,
  updateEmbeddedFlux3Variant,
} from '../embeddedFlux3';

const buildBar = (overrides: Partial<CanvasVideoPromptBar> = {}): CanvasVideoPromptBar => ({
  id: 'bar-1',
  assignedAreaId: 'area-1',
  modelId: 'blackforestlabs/flux-3',
  x: 0,
  y: 0,
  width: 320,
  height: 72,
  prompt: '@Image1 becomes @Image2',
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

const buildMembership = (): VideoPromptAreaMembership => ({
  orderedMediaIds: ['image-1', 'image-2'],
  acceptedImageIds: ['image-1', 'image-2'],
  acceptedVideoIds: [],
  acceptedAudioIds: [],
  elementImageIds: [],
  ignoredMediaIds: [],
  orderLabels: { 'image-1': '@Image1', 'image-2': '@Image2' },
});

describe('embedded Flux 3 prompt state', () => {
  it('resolves keyframe inputs, defaults, and timings in one state object', () => {
    const state = buildEmbeddedFlux3PromptState(buildBar({
      falOptions: { flux3Variant: 'keyframes', flux3Duration: '10' },
    }), buildMembership());

    expect(state.settings).toMatchObject({ flux3Variant: 'keyframes', flux3Duration: '10' });
    expect(state.generationOverrides).toMatchObject({
      primaryImageId: undefined,
      referenceImageIds: ['image-1', 'image-2'],
    });
    expect(state.runPlan.keyframeTimings).toEqual([
      { imageId: 'image-1', timestampSeconds: 0 },
      { imageId: 'image-2', timestampSeconds: 10 },
    ]);
  });
  it('promotes the Extend video without retaining it as a reference', () => {
    const state = buildEmbeddedFlux3PromptState(buildBar({
      prompt: 'Continue @Video1',
      falOptions: { flux3Variant: 'extend' },
    }), {
      ...buildMembership(),
      orderedMediaIds: ['video-1'],
      acceptedImageIds: [],
      acceptedVideoIds: ['video-1'],
      orderLabels: { 'video-1': '@Video1' },
    });

    expect(state.generationOverrides.referenceVideoIds).toEqual([]);
    expect(state.generationOverrides.sourceVideoId).toBe('video-1');
  });


  it('normalizes explicit-duration variants and ignores invalid variants', () => {
    const bar = buildBar({ falOptions: { flux3Variant: 'smart', flux3Duration: 'auto' } });

    expect(updateEmbeddedFlux3Variant(bar, 'keyframes').falOptions).toMatchObject({
      flux3Variant: 'keyframes',
      flux3Duration: '5',
    });
    expect(updateEmbeddedFlux3Variant(bar, 'invalid')).toBe(bar);
  });

  it('scales saved keyframes when duration changes', () => {
    const bar = buildBar({
      falOptions: {
        flux3Variant: 'keyframes',
        flux3Duration: '5',
        flux3KeyframeTimings: [{ imageId: 'image-1', timestampSeconds: 2.5 }],
      },
    });

    expect(updateEmbeddedFlux3Duration(bar, '10').falOptions?.flux3KeyframeTimings).toEqual([
      { imageId: 'image-1', timestampSeconds: 5 },
    ]);
    expect(updateEmbeddedFlux3Duration(bar, 'invalid')).toBe(bar);
  });

  it('reconciles current membership before updating one keyframe', () => {
    const bar = buildBar({
      falOptions: { flux3Variant: 'keyframes', flux3Duration: '10' },
    });

    expect(updateEmbeddedFlux3KeyframeTiming(bar, buildMembership(), 'image-2', 8).falOptions?.flux3KeyframeTimings).toEqual([
      { imageId: 'image-1', timestampSeconds: 0 },
      { imageId: 'image-2', timestampSeconds: 8 },
    ]);
  });
});
