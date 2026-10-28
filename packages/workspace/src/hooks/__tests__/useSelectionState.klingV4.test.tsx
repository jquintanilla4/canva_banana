import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFalSettings } from '../useFalSettings';
import { useSelectionState } from '../useSelectionState';
import { useKlingReferenceHelpers } from '../useKlingReferenceHelpers';
import { useKlingPromptMentions } from '../useKlingPromptMentions';
import type { CanvasImage, KlingV4Variant } from '../../types';
import { buildEffectiveSeedanceReferenceIds } from '../../utils/seedanceReferences';

const buildMedia = (id: string, mediaType: CanvasImage['mediaType'] = 'image'): CanvasImage => ({
  id, mediaType, element: document.createElement(mediaType === 'video' ? 'video' : 'img'),
  x: 0, y: 0, width: 320, height: 180, naturalWidth: 320, naturalHeight: 180, rotation: 0,
  file: new File(['test'], id, { type: mediaType === 'image' ? 'image/png' : `${mediaType}/mp4` }),
});

const renderSelection = (images: CanvasImage[], variant: KlingV4Variant = 'generate') => {
  const onError = vi.fn();
  const hook = renderHook(() => {
    const fal = useFalSettings({ apiProvider: 'fal' });
    const selection = useSelectionState({ images, apiProvider: 'fal', fal, onError, onReferenceLimit: onError });
    const references = buildEffectiveSeedanceReferenceIds({
      enabled: fal.klingV4Variant === 'generate', images,
      selectedImageIds: selection.selectedImageIds,
      referenceImageIds: selection.referenceImageIds,
      referenceVideoIds: selection.referenceVideoIds,
      referenceAudioIds: selection.referenceAudioIds,
      orderedReferenceIds: selection.seedanceReferenceOrderIds,
    });
    const { referenceOrderLabels } = useKlingReferenceHelpers({
      labelReferences: true, includePrimaryImageAsReference: false,
      referenceImageIds: references.referenceImageIds,
      referenceVideoIds: references.referenceVideoIds,
      isEditMode: fal.klingV4Variant === 'edit', sourceVideoId: selection.sourceVideoId,
      sourceVideoLabel: '@Video1',
    });
    const mentions = useKlingPromptMentions({
      isKlingO3VideoModel: false, isKlingO3EditMode: false, isKlingV4VideoModel: true,
      isMultimodalReferenceMode: fal.klingV4Variant === 'generate', referenceOrderLabels,
      elementOrderLabels: null, referenceImageIds: references.referenceImageIds,
      hasSingleImageSelected: selection.hasSingleImageSelected, primarySelectionMediaType: selection.primarySelectionMediaType,
    });
    return { fal, selection, references, mentions, referenceOrderLabels };
  });
  act(() => {
    hook.result.current.fal.handleModelModeChange('video');
    hook.result.current.fal.handleFalModelChange('kling/v4');
    hook.result.current.fal.handleKlingV4VariantChange(variant);
  });
  return { ...hook, onError };
};

describe('Kling v4 canvas selection', () => {
  it('keeps selected and tagged mixed references in the same order as autocomplete', () => {
    const { result } = renderSelection([buildMedia('first'), buildMedia('second'), buildMedia('clip', 'video')]);
    act(() => result.current.selection.handleImageSelection('second'));
    act(() => result.current.selection.handleImageSelection('clip', { reference: true }));
    act(() => result.current.selection.handleImageSelection('first', { reference: true }));
    expect(result.current.references.referenceImageIds).toEqual(['second', 'first']);
    expect(result.current.references.referenceVideoIds).toEqual(['clip']);
    expect(result.current.referenceOrderLabels).toEqual({ second: '@Image1', first: '@Image2', clip: '@Video1' });
    expect(result.current.mentions.klingPromptMentions).toEqual(['@Image1', '@Image2', '@Video1']);
  });

  it('supports ten images and five videos but rejects audio and overflow', () => {
    const images = Array.from({ length: 11 }, (_, index) => buildMedia(`image-${index}`));
    const videos = Array.from({ length: 6 }, (_, index) => buildMedia(`video-${index}`, 'video'));
    const { result, onError } = renderSelection([...images, ...videos, buildMedia('audio', 'audio')]);
    for (const media of [...images, ...videos]) {
      act(() => result.current.selection.handleImageSelection(media.id, { reference: true }));
    }
    act(() => result.current.selection.handleImageSelection('audio', { reference: true }));
    expect(result.current.references.referenceImageIds).toEqual(images.slice(0, 10).map(image => image.id));
    expect(result.current.references.referenceVideoIds).toEqual(videos.slice(0, 5).map(video => video.id));
    expect(result.current.references.referenceAudioIds).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });

  it('uses a native source-video mention in Edit and rejects reference videos', () => {
    const { result, onError } = renderSelection([buildMedia('source', 'video'), buildMedia('reference'), buildMedia('other', 'video')], 'edit');
    act(() => result.current.selection.setSelectedImageIds(['source'])); // Uploads select media before assigning a generation role.
    act(() => result.current.selection.handleImageSelection('reference', { reference: true }));
    act(() => result.current.selection.handleImageSelection('other', { reference: true }));
    expect(result.current.selection.sourceVideoId).toBe('source');
    expect(result.current.references.referenceImageIds).toEqual(['reference']);
    expect(result.current.references.referenceVideoIds).toEqual([]);
    expect(result.current.mentions.klingPromptMentions).toEqual(['@Image1', '@Video1']);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('still image references only'));
  });
});
