import type {
  CanvasImage,
  CanvasRect,
  CanvasVideoPromptArea,
  GenerationFalOptions,
  GenerationInputs,
  Seedance2Variant,
  VideoPromptAreaMediaRole,
  VideoModelCapabilityProfile,
  VideoPromptAreaMembership,
} from '../types';
import {
  FAL_SEEDANCE_2_VIDEO_MODEL_ID,
  MINIMAX_H3_VIDEO_MODEL_ID,
  GROK_IMAGINE_VIDEO_MODEL_ID,
  HEYGEN_V3_LIPSYNC_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  JIMENG_SEEDANCE_2_VIDEO_MODEL_ID,
  KLING_V3_CONTROL_VIDEO_MODEL_ID,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  SCAIL_VIDEO_MODEL_ID,
  SEEDANCE_15_VIDEO_MODEL_ID,
  SEEDANCE_2_VIDEO_MODEL_ID,
  SYNC_LIPSYNC_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_27_VIDEO_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
  getMaxReferenceImages,
  isKlingO3VideoModelId,
} from '../services/modelConfig';
import {
  SEEDANCE_REFERENCE_AUDIO_LIMIT,
  SEEDANCE_REFERENCE_IMAGE_LIMIT,
  SEEDANCE_REFERENCE_VIDEO_LIMIT,
} from './seedanceReferences';

type CanvasPoint = { x: number; y: number };
export type EmbeddedVideoPromptBarSizeMode = 'full' | 'mini';

export const DEFAULT_VIDEO_PROMPT_BAR_SIZE = { width: 920, height: 190 } as const; // Embedded prompt bars keep the same visual weight as the global bar.
export const MINI_VIDEO_PROMPT_BAR_SIZE = { width: 420, height: 84 } as const; // Compact mode keeps the embedded shell readable when the full bar would dominate the area.
export const DEFAULT_VIDEO_PROMPT_BAR_DRAG_HANDLE_HEIGHT = 30; // Assigned bars reserve space for the draggable model badge above the prompt shell.
export const DEFAULT_VIDEO_PROMPT_BAR_BOTTOM_INSET = -46; // The rendered Seedance shell is shorter than its logical rect, so this keeps the visible bar aligned to the area bottom.
export const EMBEDDED_VIDEO_PROMPT_BAR_SCREEN_BOTTOM_PADDING = 20; // Keep the rendered shell inside the area with a fixed bottom breathing room.
export const MIN_VIDEO_PROMPT_AREA_WIDTH = 280; // Areas need enough width to fit one prompt bar comfortably.
export const MIN_VIDEO_PROMPT_AREA_HEIGHT = 220; // Areas need height for the prompt bar plus media staging room.
export const MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE = 0.8; // Embedded bars should stay readable instead of collapsing at far zoom levels.
export const FULL_VIDEO_PROMPT_BAR_SCALE_THRESHOLD = 0.5; // Assigned bars snap to the full shell once the canvas reaches 50 percent zoom.
export const MINI_VIDEO_PROMPT_BAR_SCALE_THRESHOLD = 0.3; // Mini mode should only kick in once the canvas is below 30% zoom.
export const MINI_VIDEO_PROMPT_BAR_MIN_WIDTH = 140; // Compact mode can squeeze further, but this keeps the shell usable.

export const SEEDANCE_2_VIDEO_PROMPT_PROFILE: VideoModelCapabilityProfile = {
  id: 'seedance-2-reference',
  defaultImageRole: 'reference',
  defaultVideoRole: 'reference',
  defaultAudioRole: 'reference',
  shiftImageRole: 'reference',
  altImageRole: null,
  supportedMediaTypes: ['image', 'video', 'audio'],
  maxImages: SEEDANCE_REFERENCE_IMAGE_LIMIT,
  maxVideos: SEEDANCE_REFERENCE_VIDEO_LIMIT,
  maxAudios: SEEDANCE_REFERENCE_AUDIO_LIMIT,
  maxElements: 0,
};

export const getEmbeddedVideoPromptBarModelId = (modelId: string | undefined): string =>
  modelId ?? SEEDANCE_2_VIDEO_MODEL_ID; // Missing model ids are legacy Volcengine Seedance bars.

export const isUsableVideoPromptAreaModel = (modelId: string): boolean =>
  modelId !== WAN_VISION_ENHANCER_MODEL_ID; // Enhancer/upscaler-style models should not appear in embedded generation.

const imageOnlyProfile = (
  id: string,
  options: Partial<VideoModelCapabilityProfile> = {},
): VideoModelCapabilityProfile => ({
  id,
  defaultImageRole: 'primary',
  defaultVideoRole: null,
  defaultAudioRole: null,
  shiftImageRole: null,
  altImageRole: null,
  supportedMediaTypes: ['image'],
  maxImages: 1,
  maxVideos: 0,
  maxAudios: 0,
  maxElements: 0,
  supportsTextOnly: false,
  ...options,
}); // Common profile for image-to-video models.

export const getVideoPromptAreaCapabilityProfile = (
  modelId: string | undefined,
  variant?: Seedance2Variant,
  falOptions?: GenerationFalOptions,
): VideoModelCapabilityProfile => {
  const resolvedModelId = getEmbeddedVideoPromptBarModelId(modelId);

  if (resolvedModelId === SEEDANCE_2_VIDEO_MODEL_ID || resolvedModelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID) {
    if (variant === 'smart') {
      return imageOnlyProfile(resolvedModelId, { shiftImageRole: 'tail', maxImages: 2, supportsTextOnly: resolvedModelId === FAL_SEEDANCE_2_VIDEO_MODEL_ID });
    }
    return { ...SEEDANCE_2_VIDEO_PROMPT_PROFILE, id: resolvedModelId };
  }

  if (resolvedModelId === MINIMAX_H3_VIDEO_MODEL_ID) {
    if (falOptions?.miniMaxH3Variant === 'standard') {
      return imageOnlyProfile(resolvedModelId, { shiftImageRole: 'tail', maxImages: 2, supportsTextOnly: true });
    }
    return { ...SEEDANCE_2_VIDEO_PROMPT_PROFILE, id: resolvedModelId }; // H3 Reference shares Seedance's multimodal limits.
  }

  if (resolvedModelId === JIMENG_SEEDANCE_2_VIDEO_MODEL_ID) {
    if (variant === 'smart') {
      return imageOnlyProfile(resolvedModelId, { supportsTextOnly: true });
    }
    return { ...SEEDANCE_2_VIDEO_PROMPT_PROFILE, id: resolvedModelId }; // CLI multimodal2video exposes all-around references.
  }

  if (isKlingO3VideoModelId(resolvedModelId)) {
    const isEditMode = falOptions?.klingO3Variant === 'edit';
    return imageOnlyProfile(resolvedModelId, {
      defaultImageRole: isEditMode ? 'reference' : 'primary',
      defaultVideoRole: isEditMode ? 'sourceVideo' : null,
      shiftImageRole: 'reference',
      altImageRole: 'element',
      supportedMediaTypes: ['image', 'video'],
      maxImages: getMaxReferenceImages(resolvedModelId),
      maxVideos: 1,
      maxElements: getMaxReferenceImages(resolvedModelId),
    });
  }

  if (resolvedModelId === WAN_27_VIDEO_MODEL_ID) {
    const wanVariant = falOptions?.wan27VideoVariant === 'reference'
      ? 'reference'
      : falOptions?.wan27VideoVariant === 'edit'
        ? 'edit'
        : 'smart';
    if (wanVariant === 'reference') {
      return imageOnlyProfile(resolvedModelId, {
        defaultImageRole: 'reference',
        defaultVideoRole: 'reference',
        supportedMediaTypes: ['image', 'video'],
        maxImages: 20,
        maxVideos: 20,
        supportsTextOnly: false,
      });
    }
    if (wanVariant === 'edit') {
      return imageOnlyProfile(resolvedModelId, {
        defaultImageRole: 'reference',
        defaultVideoRole: 'sourceVideo',
        supportedMediaTypes: ['image', 'video'],
        maxImages: 1,
        maxVideos: 1,
      });
    }
    return imageOnlyProfile(resolvedModelId, {
      defaultAudioRole: 'sourceAudio',
      shiftImageRole: 'tail',
      supportedMediaTypes: ['image', 'audio'],
      maxImages: 2,
      maxAudios: 1,
      supportsTextOnly: true,
    });
  }

  if (resolvedModelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID) {
    const isExtendMode = falOptions?.veo31Variant === 'extend';
    return imageOnlyProfile(resolvedModelId, {
      defaultVideoRole: isExtendMode ? 'sourceVideo' : null,
      shiftImageRole: isExtendMode ? null : 'tail',
      supportedMediaTypes: isExtendMode ? ['video'] : ['image'],
      maxImages: isExtendMode ? 0 : 2,
      maxVideos: isExtendMode ? 1 : 0,
    });
  }

  if (resolvedModelId === KLING_V3_VIDEO_MODEL_ID || resolvedModelId === KLING_VIDEO_MODEL_ID || resolvedModelId === SEEDANCE_15_VIDEO_MODEL_ID) {
    return imageOnlyProfile(resolvedModelId, {
      shiftImageRole: 'tail',
      maxImages: 2,
      supportsTextOnly: resolvedModelId === KLING_V3_VIDEO_MODEL_ID,
    });
  }

  if (resolvedModelId === GROK_IMAGINE_VIDEO_MODEL_ID) {
    return imageOnlyProfile(resolvedModelId);
  }

  if (resolvedModelId === WAN_ANIMATE_MODEL_ID || resolvedModelId === SCAIL_VIDEO_MODEL_ID || resolvedModelId === KLING_V3_CONTROL_VIDEO_MODEL_ID) {
    return imageOnlyProfile(resolvedModelId, {
      defaultVideoRole: 'sourceVideo',
      supportedMediaTypes: ['image', 'video'],
      maxVideos: 1,
    });
  }

  if (resolvedModelId === SYNC_LIPSYNC_MODEL_ID || resolvedModelId === HEYGEN_V3_LIPSYNC_MODEL_ID || resolvedModelId === INFINITALK_VIDEO_MODEL_ID) {
    return {
      id: resolvedModelId,
      defaultImageRole: null,
      defaultVideoRole: 'sourceVideo',
      defaultAudioRole: 'sourceAudio',
      shiftImageRole: null,
      altImageRole: null,
      supportedMediaTypes: ['video', 'audio'],
      maxImages: 0,
      maxVideos: 1,
      maxAudios: 1,
      maxElements: 0,
    };
  }

  return imageOnlyProfile(resolvedModelId, { supportsTextOnly: true });
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
  const maxScaleThatFitsArea = typeof areaScreenWidth === 'number'
    ? (areaScreenWidth - 48) / promptBarWidth
    : Number.POSITIVE_INFINITY; // Area-fit clamping only applies when the owner is known.

  if (canvasScale >= FULL_VIDEO_PROMPT_BAR_SCALE_THRESHOLD) {
    if (typeof areaScreenWidth !== 'number') {
      return 1;
    }
    return Math.max(0, Math.min(1, maxScaleThatFitsArea));
  }

  if (canvasScale >= MINI_VIDEO_PROMPT_BAR_SCALE_THRESHOLD) {
    const progressToFullScale = (canvasScale - MINI_VIDEO_PROMPT_BAR_SCALE_THRESHOLD)
      / (FULL_VIDEO_PROMPT_BAR_SCALE_THRESHOLD - MINI_VIDEO_PROMPT_BAR_SCALE_THRESHOLD); // The 30-50 percent range should ease into the full shell instead of snapping.
    const easedScale = MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE
      + (1 - MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE) * progressToFullScale;
    if (typeof areaScreenWidth !== 'number') {
      return easedScale;
    }
    if (maxScaleThatFitsArea < MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE) {
      return MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE;
    }
    return Math.min(easedScale, maxScaleThatFitsArea);
  }

  const minimumScale = Math.max(canvasScale, MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE);
  if (typeof areaScreenWidth !== 'number') {
    return minimumScale;
  }
  if (maxScaleThatFitsArea < MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE) {
    return MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE;
  }
  return Math.min(minimumScale, maxScaleThatFitsArea);
}; // Keeps prompt bars readable first and only uses the area fit when it still clears the floor.

export const getEmbeddedVideoPromptBarSizeMode = (
  canvasScale: number,
  _areaScreenWidth?: number,
): EmbeddedVideoPromptBarSizeMode => {
  if (canvasScale < MINI_VIDEO_PROMPT_BAR_SCALE_THRESHOLD) {
    return 'mini';
  }
  return 'full';
}; // Keep the full shell until the user zooms below the 30% threshold.

export const getEmbeddedVideoPromptBarRenderWidth = (
  sizeMode: EmbeddedVideoPromptBarSizeMode,
  areaScreenWidth?: number,
): number => {
  if (sizeMode === 'full' || typeof areaScreenWidth !== 'number') {
    return sizeMode === 'full' ? DEFAULT_VIDEO_PROMPT_BAR_SIZE.width : MINI_VIDEO_PROMPT_BAR_SIZE.width;
  }
  return Math.min(
    MINI_VIDEO_PROMPT_BAR_SIZE.width,
    Math.max(MINI_VIDEO_PROMPT_BAR_MIN_WIDTH, (areaScreenWidth - 24) / MIN_VIDEO_PROMPT_BAR_VISUAL_SCALE),
  );
}; // Compact bars size themselves against the visible area before the floor scale is applied.

const buildMembershipOrderLabels = (
  primaryImageId: string | undefined,
  acceptedImageIds: string[],
  acceptedVideoIds: string[],
  acceptedAudioIds: string[],
  elementImageIds: string[],
  tailImageId: string | undefined,
  sourceVideoId: string | undefined,
  sourceAudioId: string | undefined,
): Record<string, string> => {
  const orderLabels: Record<string, string> = {};
  if (primaryImageId) {
    orderLabels[primaryImageId] = '@Image1';
  }
  acceptedImageIds.forEach((id, index) => {
    orderLabels[id] = `@Image${index + (primaryImageId ? 2 : 1)}`;
  });
  acceptedVideoIds.forEach((id, index) => {
    orderLabels[id] = `@Video${index + 1}`;
  });
  acceptedAudioIds.forEach((id, index) => {
    orderLabels[id] = `@Audio${index + 1}`;
  });
  elementImageIds.forEach((id, index) => {
    orderLabels[id] = `@Element${index + 1}`;
  });
  if (tailImageId) {
    orderLabels[tailImageId] = '@LastFrame';
  }
  if (sourceVideoId) {
    orderLabels[sourceVideoId] = '@Video';
  }
  if (sourceAudioId) {
    orderLabels[sourceAudioId] = '@Audio';
  }
  return orderLabels; // Keep prompt mentions aligned with the accepted assets.
};

const getDefaultRoleForMedia = (
  media: CanvasImage,
  profile: VideoModelCapabilityProfile,
): VideoPromptAreaMediaRole | null => {
  if (media.mediaType === 'image') return profile.defaultImageRole;
  if (media.mediaType === 'video') return profile.defaultVideoRole;
  return profile.defaultAudioRole;
}; // Converts media type into the profile's normal drop role.

const isImageRoleSupported = (
  role: VideoPromptAreaMediaRole,
  profile: VideoModelCapabilityProfile,
): boolean =>
  role === profile.defaultImageRole
  || role === profile.shiftImageRole
  || role === profile.altImageRole; // A saved image role is valid only if the active model can assign it.

const getNormalizedRoleForMedia = (
  media: CanvasImage,
  profile: VideoModelCapabilityProfile,
  role: VideoPromptAreaMediaRole | undefined,
): VideoPromptAreaMediaRole | null => {
  if (!role) {
    return getDefaultRoleForMedia(media, profile);
  }
  if (media.mediaType === 'image' && isImageRoleSupported(role, profile)) {
    return role;
  }
  if (media.mediaType === 'video' && role === profile.defaultVideoRole) {
    return role;
  }
  if (media.mediaType === 'audio' && role === profile.defaultAudioRole) {
    return role;
  }
  return getDefaultRoleForMedia(media, profile);
}; // Re-maps stale saved roles after the embedded model changes.

export const getVideoPromptAreaDropRole = (
  media: CanvasImage,
  profile: VideoModelCapabilityProfile,
  modifiers: { shiftKey?: boolean; altKey?: boolean },
): VideoPromptAreaMediaRole | null => {
  if (media.mediaType !== 'image') {
    return getDefaultRoleForMedia(media, profile);
  }
  if (modifiers.altKey) {
    return profile.altImageRole;
  }
  if (modifiers.shiftKey) {
    return profile.shiftImageRole ?? profile.defaultImageRole;
  }
  return profile.defaultImageRole;
}; // Mirrors canvas modifier semantics for area membership.

export const buildVideoPromptAreaMembership = (
  area: CanvasVideoPromptArea,
  images: CanvasImage[],
  capabilityProfile: VideoModelCapabilityProfile = SEEDANCE_2_VIDEO_PROMPT_PROFILE,
): VideoPromptAreaMembership => {
  const mediaById = new Map(images.map(image => [image.id, image])); // Single lookup map keeps ordering passes cheap.
  let primaryImageId: string | undefined;
  let tailImageId: string | undefined;
  let sourceVideoId: string | undefined;
  let sourceAudioId: string | undefined;
  const acceptedImageIds: string[] = [];
  const acceptedVideoIds: string[] = [];
  const acceptedAudioIds: string[] = [];
  const elementImageIds: string[] = [];
  const ignoredMediaIds: string[] = [];

  area.orderedMediaIds.forEach(mediaId => {
    const media = mediaById.get(mediaId);
    if (!media) {
      return;
    }
    const role = getNormalizedRoleForMedia(media, capabilityProfile, area.mediaRoles?.[mediaId]);
    if (!role || !capabilityProfile.supportedMediaTypes.includes(media.mediaType)) {
      ignoredMediaIds.push(mediaId);
      return;
    }

    if (role === 'primary') {
      if (media.mediaType === 'image' && !primaryImageId) {
        primaryImageId = mediaId;
      } else if (media.mediaType === 'image' && capabilityProfile.shiftImageRole === 'tail' && !tailImageId) {
        tailImageId = mediaId;
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (role === 'tail') {
      if (media.mediaType === 'image' && !tailImageId) {
        tailImageId = mediaId;
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (role === 'element') {
      if (media.mediaType === 'image' && elementImageIds.length < capabilityProfile.maxElements) {
        elementImageIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (role === 'sourceVideo') {
      if (media.mediaType === 'video' && !sourceVideoId) {
        sourceVideoId = mediaId;
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (role === 'sourceAudio') {
      if (media.mediaType === 'audio' && !sourceAudioId) {
        sourceAudioId = mediaId;
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }

    if (role === 'reference' && media.mediaType === 'image') {
      if (acceptedImageIds.length < capabilityProfile.maxImages) {
        acceptedImageIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (role === 'reference' && media.mediaType === 'video') {
      if (acceptedVideoIds.length < capabilityProfile.maxVideos) {
        acceptedVideoIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }
    if (role === 'reference' && media.mediaType === 'audio') {
      if (acceptedAudioIds.length < capabilityProfile.maxAudios) {
        acceptedAudioIds.push(mediaId);
      } else {
        ignoredMediaIds.push(mediaId);
      }
      return;
    }

    ignoredMediaIds.push(mediaId);
  });

  return {
    orderedMediaIds: area.orderedMediaIds.filter(mediaId => mediaById.has(mediaId)),
    primaryImageId,
    acceptedImageIds,
    acceptedVideoIds,
    acceptedAudioIds,
    elementImageIds,
    tailImageId,
    sourceVideoId,
    sourceAudioId,
    ignoredMediaIds,
    orderLabels: buildMembershipOrderLabels(primaryImageId, acceptedImageIds, acceptedVideoIds, acceptedAudioIds, elementImageIds, tailImageId, sourceVideoId, sourceAudioId),
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
  options: {
    profileByAreaId?: Record<string, VideoModelCapabilityProfile>;
    modifiers?: { shiftKey?: boolean; altKey?: boolean };
  } = {},
): CanvasVideoPromptArea[] => {
  if (areas.length === 0) {
    return areas;
  }

  const imageIdSet = new Set(images.map(image => image.id));
  const mediaById = new Map(images.map(image => [image.id, image])); // Role assignment needs media type lookup.
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
    const nextMediaRoles = { ...(area.mediaRoles ?? {}) };
    const profile = options.profileByAreaId?.[area.id] ?? SEEDANCE_2_VIDEO_PROMPT_PROFILE;
    appendedIds.forEach(mediaId => {
      const media = mediaById.get(mediaId);
      if (!media) return;
      const role = getVideoPromptAreaDropRole(media, profile, options.modifiers ?? {});
      if (role) {
        nextMediaRoles[mediaId] = role;
      }
    });
    Object.keys(nextMediaRoles).forEach(mediaId => {
      const media = mediaById.get(mediaId);
      if (!nextOrderedMediaIds.includes(mediaId) || !media) {
        delete nextMediaRoles[mediaId];
        return;
      }
      const normalizedRole = getNormalizedRoleForMedia(media, profile, nextMediaRoles[mediaId]);
      if (normalizedRole) {
        nextMediaRoles[mediaId] = normalizedRole;
      } else {
        delete nextMediaRoles[mediaId];
      }
    });

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

    const didRolesChange = JSON.stringify(nextMediaRoles) !== JSON.stringify(area.mediaRoles ?? {});
    if (didRolesChange) {
      didChange = true;
    }

    return didChange ? { ...area, orderedMediaIds: nextOrderedMediaIds, mediaRoles: nextMediaRoles } : area;
  });

  return didChange ? nextAreas : areas;
};

export const getMentionOptionsFromMembership = (membership: VideoPromptAreaMembership): string[] => {
  const orderedOptions = membership.orderedMediaIds
    .map(mediaId => membership.orderLabels[mediaId])
    .filter((label): label is string => typeof label === 'string' && label.length > 0);
  return Array.from(new Set(orderedOptions)); // Preserve order while de-duping defensive duplicates.
};

export const buildEmbeddedSeedanceAreaMembership = (
  membership: VideoPromptAreaMembership,
  variant: Seedance2Variant,
): VideoPromptAreaMembership => {
  if (variant !== 'smart') {
    return membership; // Reference mode keeps the full multimodal membership visible.
  }

  const acceptedImageIds = membership.acceptedImageIds.slice(0, 2); // Smart only exposes the first and last still frames.
  const ignoredMediaIdSet = new Set([
    ...membership.ignoredMediaIds,
    ...membership.acceptedImageIds.slice(2),
    ...membership.acceptedVideoIds,
    ...membership.acceptedAudioIds,
  ]); // Smart treats every extra still and every non-image asset as ignored.

  return {
    orderedMediaIds: membership.orderedMediaIds,
    acceptedImageIds,
    acceptedVideoIds: [],
    acceptedAudioIds: [],
    elementImageIds: [],
    tailImageId: undefined,
    sourceVideoId: undefined,
    sourceAudioId: undefined,
    ignoredMediaIds: membership.orderedMediaIds.filter(mediaId => ignoredMediaIdSet.has(mediaId)),
    orderLabels: buildMembershipOrderLabels(undefined, acceptedImageIds, [], [], [], undefined, undefined, undefined),
  };
};

export const buildEmbeddedSeedanceGenerationOverrides = (
  membership: VideoPromptAreaMembership,
  variant: Seedance2Variant,
): Pick<GenerationInputs, 'primaryImageId' | 'videoLastFrameImageId' | 'referenceImageIds' | 'referenceVideoIds' | 'referenceAudioIds'> => {
  const effectiveMembership = buildEmbeddedSeedanceAreaMembership(membership, variant); // Keep submit payloads aligned with the visible embedded-area assets.

  if (variant === 'smart') {
    const [primaryImageId, videoLastFrameImageId] = effectiveMembership.acceptedImageIds; // Smart uses the first two stills in area order as first/last frames.
    return {
      primaryImageId,
      videoLastFrameImageId,
      referenceImageIds: [],
      referenceVideoIds: [],
      referenceAudioIds: [],
    };
  }

  return {
    primaryImageId: undefined,
    videoLastFrameImageId: undefined,
    referenceImageIds: effectiveMembership.acceptedImageIds,
    referenceVideoIds: effectiveMembership.acceptedVideoIds,
    referenceAudioIds: effectiveMembership.acceptedAudioIds,
  };
};

export const buildEmbeddedVideoGenerationOverrides = (
  membership: VideoPromptAreaMembership,
): Pick<GenerationInputs, 'primaryImageId' | 'videoLastFrameImageId' | 'referenceImageIds' | 'referenceVideoIds' | 'referenceAudioIds' | 'elementImageIds' | 'sourceVideoId' | 'sourceAudioId'> => ({
  primaryImageId: membership.primaryImageId,
  videoLastFrameImageId: membership.tailImageId,
  referenceImageIds: membership.acceptedImageIds,
  referenceVideoIds: membership.acceptedVideoIds,
  referenceAudioIds: membership.acceptedAudioIds,
  elementImageIds: membership.elementImageIds,
  sourceVideoId: membership.sourceVideoId,
  sourceAudioId: membership.sourceAudioId,
}); // Generic embedded submit payload.
