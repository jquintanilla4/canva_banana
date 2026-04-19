import type {
  CanvasImage,
  CanvasRect,
  CanvasVideoPromptArea,
  VideoModelCapabilityProfile,
  VideoPromptAreaMembership,
} from '../types';
import {
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
} from './seedanceReferences';

type CanvasPoint = { x: number; y: number };

export const DEFAULT_VIDEO_PROMPT_BAR_SIZE = { width: 920, height: 190 } as const; // Embedded prompt bars keep the same visual weight as the global bar.
export const DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT = 30; // Assigned bars reserve space for the draggable model badge above the prompt shell.
export const DEFAULT_VIDEO_PROMPT_BAR_BOTTOM_INSET = -46; // The rendered Seedance shell is shorter than its logical rect, so this keeps the visible bar aligned to the area bottom.
export const MIN_VIDEO_PROMPT_AREA_WIDTH = 280; // Areas need enough width to fit one prompt bar comfortably.
export const MIN_VIDEO_PROMPT_AREA_HEIGHT = 220; // Areas need height for the prompt bar plus media staging room.
export const MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE = 0.5; // Embedded bars should stay legible even when the canvas is heavily zoomed out.

export const SEEDANCE_2_VIDEO_PROMPT_PROFILE: VideoModelCapabilityProfile = {
  id: 'seedance-2-reference',
  supportedMediaTypes: ['image', 'video', 'audio'],
  maxImages: SEEDANCE_REFERENCE_IMAGE_LIMIT,
  maxVideos: SEEDANCE_REFERENCE_VIDEO_LIMIT,
  maxAudios: SEEDANCE_REFERENCE_AUDIO_LIMIT,
};

export const buildVideoPromptAreaLabel = (sequence: number): string =>
  `Video prompt area ${String(sequence).padStart(2, '0')}`; // Match the requested canvas label format.

export const clampAreaRect = (rect: CanvasRect): CanvasRect => ({
  x: rect.width >= 0 ? rect.x : rect.x + rect.width,
  y: rect.height >= 0 ? rect.y : rect.y + rect.height,
  width: Math.max(MIN_VIDEO_PROMPT_AREA_WIDTH, Math.abs(rect.width)),
  height: Math.max(MIN_VIDEO_PROMPT_AREA_HEIGHT, Math.abs(rect.height)),
}); // Normalizes drag direction and enforces a usable minimum size.

export const isPointInRect = (point: CanvasPoint, rect: CanvasRect): boolean =>
  point.x >= rect.x
  && point.x <= rect.x + rect.width
  && point.y >= rect.y
  && point.y <= rect.y + rect.height;

export const getCanvasImageCenter = (image: CanvasImage): CanvasPoint => ({
  x: image.x + image.width / 2,
  y: image.y + image.height / 2,
}); // Membership uses the media center so drag/drop is deterministic.

export const getAreaPromptBarRect = (area: CanvasVideoPromptArea): CanvasRect => ({
  x: area.x + (area.width - Math.max(320, Math.min(DEFAULT_VIDEO_PROMPT_BAR_SIZE.width, area.width - 48))) / 2,
  y: area.y + area.height - DEFAULT_VIDEO_PROMPT_BAR_SIZE.height - DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT - DEFAULT_VIDEO_PROMPT_BAR_BOTTOM_INSET,
  width: Math.max(320, Math.min(DEFAULT_VIDEO_PROMPT_BAR_SIZE.width, area.width - 48)),
  height: DEFAULT_VIDEO_PROMPT_BAR_SIZE.height,
}); // Embedded bars stay centered near the bottom so media can stack above them in the area.

export const getVideoPromptBarVisualScale = (
  canvasScale: number,
  promptBarWidth: number,
  areaScreenWidth?: number,
): number => {
  const minimumScale = Math.max(canvasScale, MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE);
  if (!areaScreenWidth) {
    return minimumScale;
  }
  const maxScaleThatFitsArea = Math.max(0.28, (areaScreenWidth - 48) / promptBarWidth);
  return Math.min(minimumScale, maxScaleThatFitsArea);
}; // Keeps prompt bars readable while respecting the visible width of their owning area.

export const buildVideoPromptAreaMembership = (
  area: CanvasVideoPromptArea,
  images: CanvasImage[],
  capabilityProfile: VideoModelCapabilityProfile = SEEDANCE_2_VIDEO_PROMPT_PROFILE,
): VideoPromptAreaMembership => {
  const mediaById = new Map(images.map(image => [image.id, image])); // Single lookup map keeps ordering passes cheap.
  const acceptedImageIds: string[] = [];
  const acceptedVideoIds: string[] = [];
  const acceptedAudioIds: string[] = [];
  const ignoredMediaIds: string[] = [];

  area.orderedMediaIds.forEach(mediaId => {
    const media = mediaById.get(mediaId);
    if (!media) {
      return;
    }
    if (!capabilityProfile.supportedMediaTypes.includes(media.mediaType)) {
      ignoredMediaIds.push(mediaId);
      return;
    }
    if (media.mediaType === 'image') {
      if (acceptedImageIds.length < capabilityProfile.maxImages) {
        acceptedImageIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (media.mediaType === 'video') {
      if (acceptedVideoIds.length < capabilityProfile.maxVideos) {
        acceptedVideoIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (media.mediaType === 'audio') {
      if (acceptedAudioIds.length < capabilityProfile.maxAudios) {
        acceptedAudioIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
    }
  });

  const orderLabels: Record<string, string> = {};
  acceptedImageIds.forEach((id, index) => {
    orderLabels[id] = `@Image${index + 1}`;
  });
  acceptedVideoIds.forEach((id, index) => {
    orderLabels[id] = `@Video${index + 1}`;
  });
  acceptedAudioIds.forEach((id, index) => {
    orderLabels[id] = `@Audio${index + 1}`;
  });

  return {
    orderedMediaIds: area.orderedMediaIds.filter(mediaId => mediaById.has(mediaId)),
    acceptedImageIds,
    acceptedVideoIds,
    acceptedAudioIds,
    ignoredMediaIds,
    orderLabels,
  };
};

const getAreaOwnerByMediaId = (areas: CanvasVideoPromptArea[]): Map<string, string> => {
  const ownerByMediaId = new Map<string, string>();
  areas.forEach(area => {
    area.orderedMediaIds.forEach(mediaId => {
      if (!ownerByMediaId.has(mediaId)) {
        ownerByMediaId.set(mediaId, area.id);
      }
    });
  });
  return ownerByMediaId;
};

export const syncVideoPromptAreaMembership = (
  areas: CanvasVideoPromptArea[],
  images: CanvasImage[],
): CanvasVideoPromptArea[] => {
  if (areas.length === 0) {
    return areas;
  }

  const imageIdSet = new Set(images.map(image => image.id));
  const previousOwnerByMediaId = getAreaOwnerByMediaId(areas);
  const nextOwnerByMediaId = new Map<string, string>();

  images.forEach(image => {
    const center = getCanvasImageCenter(image);
    const containingArea = [...areas].reverse().find(area => isPointInRect(center, area)); // Newer areas win when rectangles overlap.
    if (containingArea) {
      nextOwnerByMediaId.set(image.id, containingArea.id);
    }
  });

  let didChange = false;
  const nextAreas = areas.map(area => {
    const preservedIds = area.orderedMediaIds.filter(mediaId => (
      imageIdSet.has(mediaId) && nextOwnerByMediaId.get(mediaId) === area.id
    ));
    const preservedIdSet = new Set(preservedIds);
    const appendedIds = images
      .filter(image => nextOwnerByMediaId.get(image.id) === area.id && !preservedIdSet.has(image.id))
      .map(image => image.id);
    const nextOrderedMediaIds = [...preservedIds, ...appendedIds];

    if (
      nextOrderedMediaIds.length !== area.orderedMediaIds.length
      || nextOrderedMediaIds.some((mediaId, index) => mediaId !== area.orderedMediaIds[index])
    ) {
      didChange = true;
    } else {
      area.orderedMediaIds.forEach(mediaId => {
        if (previousOwnerByMediaId.get(mediaId) !== nextOwnerByMediaId.get(mediaId)) {
          didChange = true;
        }
      });
    }

    return didChange ? { ...area, orderedMediaIds: nextOrderedMediaIds } : area;
  });

  return didChange ? nextAreas : areas;
};

export const getMentionOptionsFromMembership = (membership: VideoPromptAreaMembership): string[] => {
  const orderedOptions = membership.orderedMediaIds
    .map(mediaId => membership.orderLabels[mediaId])
    .filter((label): label is string => typeof label === 'string' && label.length > 0);
  return Array.from(new Set(orderedOptions)); // Preserve order while de-duping defensive duplicates.
};
