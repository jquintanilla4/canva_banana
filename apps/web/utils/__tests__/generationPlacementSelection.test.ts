import { describe, expect, it, vi } from 'vitest';
import { Tool } from '../../types';
import { applyGenerationPlacementSelection, type GenerationPlacementSelectionActions } from '../generationPlacementSelection';

const createActions = (): GenerationPlacementSelectionActions => ({
  setSelectedImageIds: vi.fn(),
  setSelectedNoteIds: vi.fn(),
  setReferenceImageIds: vi.fn(),
  setReferenceVideoIds: vi.fn(),
  setReferenceAudioIds: vi.fn(),
  setElementImageIds: vi.fn(),
  setVideoLastFrameImageId: vi.fn(),
  setSourceVideoId: vi.fn(),
  setSourceAudioId: vi.fn(),
  setSelectedVideoPromptAreaId: vi.fn(),
  setTool: vi.fn(),
});

describe('applyGenerationPlacementSelection', () => {
  it('selects placed image media, clears generation role selections, and switches to free selection', () => {
    const actions = createActions();

    applyGenerationPlacementSelection({ mediaIds: ['image-1', 'image-2'], mediaType: 'image', modelLabel: 'Model' }, actions);

    expect(actions.setSelectedImageIds).toHaveBeenCalledWith(['image-1', 'image-2']);
    expect(actions.setSelectedNoteIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceImageIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceVideoIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceAudioIds).toHaveBeenCalledWith([]);
    expect(actions.setElementImageIds).toHaveBeenCalledWith([]);
    expect(actions.setVideoLastFrameImageId).toHaveBeenCalledWith(null);
    expect(actions.setSourceVideoId).toHaveBeenCalledWith(null);
    expect(actions.setSourceAudioId).toHaveBeenCalledWith(null);
    expect(actions.setSelectedVideoPromptAreaId).toHaveBeenCalledWith(null);
    expect(actions.setTool).toHaveBeenCalledWith(Tool.FREE_SELECTION);
  });

  it('selects placed video media as the active source and switches to free selection', () => {
    const actions = createActions();

    applyGenerationPlacementSelection({ mediaIds: ['video-1'], mediaType: 'video', modelLabel: 'Model' }, actions);

    expect(actions.setSelectedImageIds).toHaveBeenCalledWith(['video-1']);
    expect(actions.setSelectedNoteIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceImageIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceVideoIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceAudioIds).toHaveBeenCalledWith([]);
    expect(actions.setElementImageIds).toHaveBeenCalledWith([]);
    expect(actions.setVideoLastFrameImageId).toHaveBeenCalledWith(null);
    expect(actions.setSourceVideoId).toHaveBeenCalledWith('video-1');
    expect(actions.setSourceAudioId).toHaveBeenCalledWith(null);
    expect(actions.setSelectedVideoPromptAreaId).toHaveBeenCalledWith(null);
    expect(actions.setTool).toHaveBeenCalledWith(Tool.FREE_SELECTION);
  });

  it('selects existing notification media while preserving video source state when requested', () => {
    const actions = createActions();

    applyGenerationPlacementSelection(
      { mediaIds: ['video-1', 'missing-video'], mediaType: 'video' },
      actions,
      { mediaIds: ['video-1'], preserveVideoSourceState: true },
    );

    expect(actions.setSelectedImageIds).toHaveBeenCalledWith(['video-1']);
    expect(actions.setSelectedNoteIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceImageIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceVideoIds).toHaveBeenCalledWith([]);
    expect(actions.setReferenceAudioIds).toHaveBeenCalledWith([]);
    expect(actions.setElementImageIds).toHaveBeenCalledWith([]);
    expect(actions.setVideoLastFrameImageId).not.toHaveBeenCalled();
    expect(actions.setSourceVideoId).not.toHaveBeenCalled();
    expect(actions.setSourceAudioId).not.toHaveBeenCalled();
    expect(actions.setSelectedVideoPromptAreaId).toHaveBeenCalledWith(null);
  });

  it('selects image notification media without clearing active video source state', () => {
    const actions = createActions();

    applyGenerationPlacementSelection(
      { mediaIds: ['image-1'], mediaType: 'image' },
      actions,
      { preserveVideoSourceState: true },
    );

    expect(actions.setSelectedImageIds).toHaveBeenCalledWith(['image-1']);
    expect(actions.setVideoLastFrameImageId).not.toHaveBeenCalled();
    expect(actions.setSourceVideoId).not.toHaveBeenCalled();
    expect(actions.setSourceAudioId).not.toHaveBeenCalled();
    expect(actions.setSelectedVideoPromptAreaId).toHaveBeenCalledWith(null);
  });
});
