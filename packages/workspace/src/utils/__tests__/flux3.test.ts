import { describe, expect, it } from 'vitest';
import {
  buildFlux3RunPlan,
  buildEvenFlux3KeyframeTimings,
  flux3TimingsToFrameIndexes,
  getFlux3KeyframeTimingError,
  getFlux3ExtendVideoFileError,
  getFlux3MentionOptions,
  getFlux3ModePolicy,
  getInvalidFlux3Mentions,
  normalizeFlux3PromptMentions,
  parseFlux3KeyframeTimings,
  reconcileFlux3KeyframeTimings,
  resolveFlux3Settings,
  scaleFlux3KeyframeTimings,
} from '../flux3';

describe('Flux 3 helpers', () => {
  it('resolves shared defaults and normalizes Auto for explicit-duration modes', () => {
    expect(resolveFlux3Settings()).toMatchObject({
      flux3Variant: 'smart',
      flux3Duration: 'auto',
      flux3Resolution: '720p',
    });
    expect(resolveFlux3Settings({ flux3Variant: 'keyframes', flux3Duration: 'auto' }).flux3Duration).toBe('5');
    expect(resolveFlux3Settings({ flux3Variant: 'keyframes', flux3Duration: '10' }).flux3Duration).toBe('10');
  });

  it('spaces keyframes evenly from zero through the selected duration', () => {
    expect(buildEvenFlux3KeyframeTimings(['a', 'b', 'c'], '10')).toEqual([
      { imageId: 'a', timestampSeconds: 0 },
      { imageId: 'b', timestampSeconds: 5 },
      { imageId: 'c', timestampSeconds: 10 },
    ]);
    expect(buildEvenFlux3KeyframeTimings(['a'], '10')).toEqual([{ imageId: 'a', timestampSeconds: 0 }]);
  });

  it('keeps timings attached to media IDs while ordered selections change', () => {
    expect(reconcileFlux3KeyframeTimings([
      'c', 'a', 'd',
    ], [
      { imageId: 'a', timestampSeconds: 1 },
      { imageId: 'c', timestampSeconds: 7 },
    ], '12')).toEqual([
      { imageId: 'c', timestampSeconds: 7 },
      { imageId: 'a', timestampSeconds: 1 },
      { imageId: 'd', timestampSeconds: 12 },
    ]);
  });

  it('scales timing proportionally when duration changes', () => {
    expect(scaleFlux3KeyframeTimings([
      { imageId: 'a', timestampSeconds: 0 },
      { imageId: 'b', timestampSeconds: 2.5 },
      { imageId: 'c', timestampSeconds: 5 },
    ], '5', '20')).toEqual([
      { imageId: 'a', timestampSeconds: 0 },
      { imageId: 'b', timestampSeconds: 10 },
      { imageId: 'c', timestampSeconds: 20 },
    ]);
    expect(scaleFlux3KeyframeTimings([{ imageId: 'a', timestampSeconds: 2.5 }], 'auto', '10')).toEqual([
      { imageId: 'a', timestampSeconds: 5 },
    ]);
  });

  it('converts seconds to 24 fps indexes and validates range and uniqueness', () => {
    const valid = [
      { imageId: 'a', timestampSeconds: 0 },
      { imageId: 'b', timestampSeconds: 2.5 },
      { imageId: 'c', timestampSeconds: 5 },
    ];
    expect(flux3TimingsToFrameIndexes(valid)).toEqual([
      { imageId: 'a', frameIndex: 0 },
      { imageId: 'b', frameIndex: 60 },
      { imageId: 'c', frameIndex: 120 },
    ]);
    expect(getFlux3KeyframeTimingError(valid, '5')).toBeNull();
    expect(getFlux3KeyframeTimingError(valid, 'auto')).toContain('explicit duration');
    expect(getFlux3KeyframeTimingError([{ imageId: 'a', timestampSeconds: 6 }], '5')).toContain('between 0 and 5');
    expect(getFlux3KeyframeTimingError([
      { imageId: 'a', timestampSeconds: 1 },
      { imageId: 'b', timestampSeconds: 1.01 },
    ], '5')).toContain('unique frames');
  });

  it('builds, validates, and semantically translates variant mentions', () => {
    expect(getFlux3MentionOptions('keyframes', 12)).toHaveLength(10);
    expect(getFlux3MentionOptions('first-last-frame', 2)).toEqual(['@Image1', '@Image2']);
    expect(getFlux3MentionOptions('extend', 0)).toEqual([]);
    expect(getFlux3MentionOptions('extend', 1)).toEqual(['@Video1']);
    expect(getInvalidFlux3Mentions('@Image1 then @Image3', ['@Image1', '@Image2'])).toEqual(['@Image3']);
    expect(normalizeFlux3PromptMentions('@Image1 becomes @Image2', 'first-last-frame')).toBe('the first frame becomes the last frame');
    expect(normalizeFlux3PromptMentions('Continue @Video1', 'extend')).toBe('Continue the source video');
    expect(normalizeFlux3PromptMentions('Cut (@Image1), then @Image2.', 'first-last-frame')).toBe('Cut (the first frame), then the last frame.');
  });

  it('parses persisted keyframe timings without trusting array entries', () => {
    expect(parseFlux3KeyframeTimings([
      null,
      { imageId: 'image-1', timestampSeconds: 0 },
      { imageId: 'image-1', timestampSeconds: 2 },
      { imageId: '', timestampSeconds: 1 },
      { imageId: 'negative', timestampSeconds: -1 },
      { imageId: 'nan', timestampSeconds: Number.NaN },
      { imageId: 'string-time', timestampSeconds: '5' },
      ...Array.from({ length: 12 }, (_, index) => ({
        imageId: `valid-${index}`,
        timestampSeconds: index + 1,
      })),
    ])).toEqual([
      { imageId: 'image-1', timestampSeconds: 0 },
      ...Array.from({ length: 9 }, (_, index) => ({
        imageId: `valid-${index}`,
        timestampSeconds: index + 1,
      })),
    ]);
    expect(parseFlux3KeyframeTimings({ imageId: 'image-1', timestampSeconds: 0 })).toEqual([]);
  });

  it('keeps the four mode contracts in one policy table', () => {
    expect(getFlux3ModePolicy('smart')).toEqual(expect.objectContaining({
      inputKind: 'optional-start-image', maxImages: 1, maxVideos: 0, supportsTextOnly: true,
    }));
    expect(getFlux3ModePolicy('first-last-frame')).toEqual(expect.objectContaining({
      inputKind: 'first-last-images', maxImages: 2, requiresExplicitDuration: true,
    }));
    expect(getFlux3ModePolicy('keyframes')).toEqual(expect.objectContaining({
      inputKind: 'keyframe-images', maxImages: 10, requiresExplicitDuration: true,
    }));
    expect(getFlux3ModePolicy('extend')).toEqual(expect.objectContaining({
      inputKind: 'source-video', maxImages: 0, maxVideos: 1,
    }));
  });

  it('accepts only MP4 files below the Flux Extend size limit', () => {
    expect(getFlux3ExtendVideoFileError(new File(['video'], 'source.mp4', { type: 'video/mp4' }))).toBeNull();
    expect(getFlux3ExtendVideoFileError({ type: 'video/mp4; codecs=avc1', size: 1 })).toBeNull();
    expect(getFlux3ExtendVideoFileError(new File(['video'], 'source.mov', { type: 'video/quicktime' }))).toContain('MP4');
    expect(getFlux3ExtendVideoFileError({ type: 'video/mp4', size: 50_000_000 })).toContain('under 50 MB');
  });

  it('builds one validated run plan for each Flux mode', () => {
    expect(buildFlux3RunPlan({
      prompt: '   ', variant: 'smart', duration: 'auto', referenceImageIds: [], keyframeTimings: [],
    }).error).toBe('Flux 3 requires a prompt.');

    expect(buildFlux3RunPlan({
      prompt: 'A quiet landscape', variant: 'smart', duration: 'auto', referenceImageIds: [], keyframeTimings: [],
    }).error).toBeNull();

    const firstLast = buildFlux3RunPlan({
      prompt: '@Image1 becomes @Image2', variant: 'first-last-frame', duration: '5',
      primaryImageId: 'first', lastFrameImageId: 'last', referenceImageIds: [], keyframeTimings: [],
    });
    expect(firstLast.error).toBeNull();
    expect(firstLast.mentionOptions).toEqual(['@Image1', '@Image2']);
    expect(buildFlux3RunPlan({
      prompt: 'Missing last frame', variant: 'first-last-frame', duration: '5',
      primaryImageId: 'first', referenceImageIds: [], keyframeTimings: [],
    }).inputError).toContain('exactly two still images');
    expect(buildFlux3RunPlan({
      prompt: 'Ignore the extra image', variant: 'first-last-frame', duration: '5',
      primaryImageId: 'first', lastFrameImageId: 'last', selectedMediaIds: ['first', 'extra'],
      referenceImageIds: [], keyframeTimings: [],
    }).inputError).toContain('exactly two still images');

    const keyframes = buildFlux3RunPlan({
      prompt: '@Image1 to @Image2', variant: 'keyframes', duration: '10', referenceImageIds: ['one', 'two'],
      keyframeTimings: [{ imageId: 'one', timestampSeconds: 1 }],
    });
    expect(keyframes.error).toBeNull();
    expect(keyframes.keyframeTimings).toEqual([
      { imageId: 'one', timestampSeconds: 1 },
      { imageId: 'two', timestampSeconds: 10 },
    ]);
    expect(buildFlux3RunPlan({
      prompt: 'Animate', variant: 'keyframes', duration: 'auto', referenceImageIds: ['one'], keyframeTimings: [],
    }).inputError).toContain('explicit duration');

    expect(buildFlux3RunPlan({
      prompt: 'Continue @Video1', variant: 'extend', duration: 'auto', sourceVideoId: 'video',
      referenceImageIds: [], keyframeTimings: [],
    }).error).toBeNull();
    expect(buildFlux3RunPlan({
      prompt: 'Continue', variant: 'extend', duration: 'auto', referenceImageIds: [], keyframeTimings: [],
    }).inputError).toContain('exactly one source video');
    expect(buildFlux3RunPlan({
      prompt: 'Continue', variant: 'extend', duration: 'auto', sourceVideoId: 'source',
      selectedMediaIds: ['source', 'extra'], referenceImageIds: [], keyframeTimings: [],
    }).inputError).toContain('exactly one source video');
  });
});
