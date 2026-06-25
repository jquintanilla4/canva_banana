export type SeedanceReferenceMentionCounts = {
  imageCount: number;
  videoCount: number;
  audioCount: number;
};

const SEEDANCE_REFERENCE_MENTION_ALIAS_REGEX = /@\s*(image|video|audio)\s*(\d+)/gi; // Accept common manual typing variants like "@image 1".
const SEEDANCE_REFERENCE_MENTION_REGEX = /@(Image|Video|Audio)(\d+)/g; // Canonical Seedance mention tokens after normalization.

const getSeedanceReferenceMentionPrefix = (mediaKind: string): 'Image' | 'Video' | 'Audio' => {
  const normalizedMediaKind = mediaKind.trim().toLowerCase(); // Normalize manual input before we rebuild the token.
  if (normalizedMediaKind === 'video') {
    return 'Video';
  }
  if (normalizedMediaKind === 'audio') {
    return 'Audio';
  }
  return 'Image';
};

const getSeedanceReferenceMentionLimit = (
  mediaKind: 'Image' | 'Video' | 'Audio',
  counts: SeedanceReferenceMentionCounts,
): number => {
  if (mediaKind === 'Video') {
    return counts.videoCount;
  }
  if (mediaKind === 'Audio') {
    return counts.audioCount;
  }
  return counts.imageCount;
};

export const normalizeSeedanceReferencePromptMentions = (prompt: string): string => (
  prompt.replace(SEEDANCE_REFERENCE_MENTION_ALIAS_REGEX, (_, mediaKind: string, indexText: string) => (
    `@${getSeedanceReferenceMentionPrefix(mediaKind)}${indexText}`
  )) // Canonicalize typed mention aliases before they hit the provider.
);

export const getSeedanceReferencePromptMentionError = (
  prompt: string,
  counts: SeedanceReferenceMentionCounts,
): string | null => {
  const normalizedPrompt = normalizeSeedanceReferencePromptMentions(prompt);
  const invalidMentions: string[] = [];

  normalizedPrompt.replace(SEEDANCE_REFERENCE_MENTION_REGEX, (_, mediaKind: 'Image' | 'Video' | 'Audio', indexText: string) => {
    const mentionIndex = Number(indexText);
    const mentionLimit = getSeedanceReferenceMentionLimit(mediaKind, counts);
    if (!Number.isInteger(mentionIndex) || mentionIndex < 1 || mentionIndex > mentionLimit) {
      invalidMentions.push(`@${mediaKind}${indexText}`); // Capture each out-of-range mention for a clear local error.
    }
    return `@${mediaKind}${indexText}`;
  });

  if (invalidMentions.length === 0) {
    return null;
  }

  const invalidLabelList = invalidMentions.join(', ');
  return invalidMentions.length === 1
    ? `${invalidLabelList} does not match any selected Seedance reference. Check the canvas label and try again.`
    : `These Seedance mentions do not match the selected references: ${invalidLabelList}.`;
};
