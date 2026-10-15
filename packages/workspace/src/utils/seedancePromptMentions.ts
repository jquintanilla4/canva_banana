export type SeedanceReferenceMentionCounts = {
  imageCount: number;
  videoCount: number;
  audioCount: number;
};

const SEEDANCE_REFERENCE_MENTION_ALIAS_REGEX = /(?<![A-Za-z0-9_@])@\s*(image|video|audio)\s*(\d+)(?![A-Za-z0-9_])/gi; // Match complete tokens without rewriting email addresses or longer handles.
const SEEDANCE_REFERENCE_MENTION_REGEX = /(?<![A-Za-z0-9_@])@(Image|Video|Audio)(\d+)(?![A-Za-z0-9_])/g; // Canonical tokens use the same boundaries as typed aliases.

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

export const convertReferencePromptMentionsToOrderedLabels = (prompt: string): string => (
  normalizeSeedanceReferencePromptMentions(prompt)
    .replace(SEEDANCE_REFERENCE_MENTION_REGEX, (_, mediaKind: 'Image' | 'Video' | 'Audio', indexText: string) => (
      `${mediaKind} ${indexText}`
    ))
); // H3 expects "Image 1" instead of the UI's @Image1 token.

const SEEDANCE_VOLCENGINE_MENTION_TOKENS: Record<'Image' | 'Video' | 'Audio', string> = {
  Image: '图片',
  Video: '视频',
  Audio: '音频',
}; // Volcengine Ark mandates the Chinese 素材类型+序号 mention format.

export const convertReferencePromptMentionsToVolcengineTokens = (prompt: string): string => (
  normalizeSeedanceReferencePromptMentions(prompt)
    .replace(SEEDANCE_REFERENCE_MENTION_REGEX, (_, mediaKind: 'Image' | 'Video' | 'Audio', indexText: string) => (
      `${SEEDANCE_VOLCENGINE_MENTION_TOKENS[mediaKind]}${indexText}`
    ))
); // Ark resolves 图片1/视频1/音频1 by position within each media type, never the @ tokens.

export const getSeedanceReferencePromptMentionError = (
  prompt: string,
  counts: SeedanceReferenceMentionCounts,
  modelLabel = 'Seedance',
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
    ? `${invalidLabelList} does not match any selected ${modelLabel} reference. Check the canvas label and try again.`
    : `These ${modelLabel} mentions do not match the selected references: ${invalidLabelList}.`;
};
