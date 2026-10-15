import { Tool, type GenerationPlacedPayload } from '../types';

type SetStringIds = (ids: string[]) => void;
type SetNullableId = (id: string | null) => void;
type SetTool = (tool: Tool) => void;

export type GenerationPlacementSelectionActions = {
  setSelectedImageIds: SetStringIds;
  setReferenceImageIds: SetStringIds;
  setReferenceVideoIds: SetStringIds;
  setReferenceAudioIds: SetStringIds;
  setElementImageIds: SetStringIds;
  setVideoLastFrameImageId: SetNullableId;
  setSourceVideoId: SetNullableId;
  setSourceAudioId: SetNullableId;
  setSelectedVideoPromptAreaId: SetNullableId;
  setTool?: SetTool;
};

type ApplyGenerationPlacementSelectionOptions = {
  mediaIds?: string[];
  preserveVideoSourceState?: boolean;
};

export const applyGenerationPlacementSelection = (
  payload: GenerationPlacedPayload,
  actions: GenerationPlacementSelectionActions,
  options: ApplyGenerationPlacementSelectionOptions = {},
) => {
  const selectedMediaIds = options.mediaIds ?? payload.mediaIds; // Allow notification activation to skip deleted media.
  actions.setSelectedImageIds(selectedMediaIds);
  actions.setReferenceImageIds([]);
  actions.setReferenceVideoIds([]);
  actions.setReferenceAudioIds([]);
  actions.setElementImageIds([]);
  if (options.preserveVideoSourceState) {
    actions.setSelectedVideoPromptAreaId(null);
  } else if (payload.mediaType === 'image') {
    actions.setVideoLastFrameImageId(null);
    actions.setSourceVideoId(null);
    actions.setSourceAudioId(null);
    actions.setSelectedVideoPromptAreaId(null);
  } else {
    actions.setVideoLastFrameImageId(null);
    actions.setSourceVideoId(selectedMediaIds[0] ?? null);
    actions.setSourceAudioId(null);
    actions.setSelectedVideoPromptAreaId(null);
  }
  actions.setTool?.(Tool.FREE_SELECTION);
};
