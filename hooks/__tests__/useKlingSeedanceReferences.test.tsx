import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useKlingPromptMentions } from '../useKlingPromptMentions';
import { useKlingReferenceHelpers } from '../useKlingReferenceHelpers';

describe('Seedance 2 reference labels', () => {
  it('labels seedance references with image, video, and audio tokens', () => {
    const { result } = renderHook(() => useKlingReferenceHelpers({
      labelReferences: true,
      primaryImageId: null,
      primaryImageMediaType: null,
      referenceImageIds: ['image-1', 'image-2'],
      referenceVideoIds: ['video-1'],
      referenceAudioIds: ['audio-1'],
    }));

    expect(result.current.referenceOrderLabels).toEqual({
      'image-1': '@Image1',
      'image-2': '@Image2',
      'video-1': '@Video1',
      'audio-1': '@Audio1',
    });
  });

  it('skips the primary image label in seedance reference mode', () => {
    const { result } = renderHook(() => useKlingReferenceHelpers({
      labelReferences: true,
      primaryImageId: 'primary-image',
      primaryImageMediaType: 'image',
      includePrimaryImageAsReference: false,
      referenceImageIds: ['image-1'],
      referenceVideoIds: [],
      referenceAudioIds: [],
    }));

    expect(result.current.referenceOrderLabels).toEqual({
      'image-1': '@Image1',
    });
  });

  it('surfaces seedance reference labels in prompt mention suggestions', () => {
    const { result } = renderHook(() => useKlingPromptMentions({
      isKlingO1VideoModel: false,
      isKlingO1EditMode: false,
      isSeedance2ReferenceMode: true,
      referenceOrderLabels: {
        'image-1': '@Image1',
        'video-1': '@Video1',
        'audio-1': '@Audio1',
      },
      elementOrderLabels: null,
      referenceImageIds: ['image-1'],
      hasSingleImageSelected: false,
      primarySelectionMediaType: null,
    }));

    expect(result.current.klingPromptMentions).toEqual(['@Image1', '@Video1', '@Audio1']);
    expect(result.current.klingReferenceCount).toBe(3);
  });
});
